import "server-only";
import { randomBytes } from "node:crypto";
import { one,rows,query,uuid,text,invalid,fail,page,escapeLike,type Row,type DB } from "../platform/query";
import { transaction } from "../platform/db";
import { config } from "../platform/config";
import { effectivePermissions, permissionKeys, requirePermission as permit } from "../platform/permissions";
import { displayName,type User } from "../platform/service";
import catalog from "../platform/catalog.json";
import { list } from "../platform/http";
import { actor,mapped,version,audit,diff } from "../platform/audit";
const permissionLabels=Object.fromEntries(catalog.flatMap(s=>s.groups.flatMap(g=>g.permissions.map(p=>[p.key,p.label]))));
const guard=(u:User,key:string)=>u.role==="super_admin"?null:key==="super_admin"?"SUPER_ADMIN":key===u.role?"OWN_ROLE":null;
function guardFail(rule:string):never {fail("PERMISSION_GUARD","forbidden",{rule});}
function holds(u:User,keys:string[]) {return u.role==="super_admin"||keys.every(k=>!k.startsWith("settings.")||u.permissions.includes(k));}
async function rolePermissions(id:string,key:string,db?:DB) {return effectivePermissions(key,(await rows("platform.ListRolePermissions",{role_id:id},db)).map(r=>r.permission));}
export async function roles(u:User,db?:DB):Promise<Row[]> {
 permit(u.permissions,"settings.roles.manage","settings.users.manage","settings.users.view");
 return Promise.all((await rows("platform.ListRoles",{},db)).map(async r=>({...mapped(r),guard:guard(u,r.key),assignable:u.role==="super_admin"||(r.key!=="super_admin"&&holds(u,await rolePermissions(r.id,r.key,db)))})));
}
export async function matrix(u:User,db?:DB) {
 permit(u.permissions,"settings.roles.manage");const meta=await one("platform.GetPermissionMatrix",{},db);
 const roleRows=await roles(u,db);
 return {...mapped(meta),systems:catalog,grantable:permissionKeys.filter(k=>holds(u,[k])),roles:await Promise.all(roleRows.map(async r=>({id:r.id,key:r.key,name:r.name,userCount:r.userCount,isLocked:r.isLocked,guard:r.guard,permissions:await rolePermissions(r.id,r.key,db)})))};
}
export async function saveMatrix(u:User,b:Row) {
 permit(u.permissions,"settings.roles.manage");if(!Array.isArray(b.changes)||!Number.isInteger(b.version))invalid({changes:"INVALID"});
 await transaction(async db=>{
 const meta=await one("platform.LockPermissionMatrix",{},db);if(meta.version!==b.version)fail("VERSION_CONFLICT","conflict");
 const roleRows=await rows("platform.ListRoles",{},db);
 for(const c of b.changes){uuid(c.roleId,"roleId");if(typeof c.granted!=="boolean")invalid({granted:"INVALID"});const r=roleRows.find(r=>r.id===c.roleId);if(!r)fail("ROLE_NOT_FOUND","not_found");
 if(!permissionKeys.includes(c.permission))fail("UNKNOWN_PERMISSION","invalid");const g=guard(u,r.key);if(g==="SUPER_ADMIN"||(g==="OWN_ROLE"&&c.permission.startsWith("settings.")))guardFail(g);
 if(r.is_locked)fail("SYSTEM_ROLE");if(!holds(u,[c.permission]))guardFail("ESCALATION");
 const before=await rolePermissions(r.id,r.key,db);await query(c.granted?"platform.GrantRolePermission":"platform.RevokeRolePermission",{role_id:r.id,permission:c.permission},db);
 if(before.includes(c.permission)!==c.granted)await audit(db,u,"permissions_change","role",r.id,r.name,[{field:"permissions",added:c.granted?[permissionLabels[c.permission]]:[],removed:c.granted?[]:[permissionLabels[c.permission]]}]);
 }
 await query("platform.BumpPermissionMatrix",{actor_id:u.id},db);
 });return matrix(u);
}
export async function saveRole(u:User,id:string|null,b:Row,remove=false) {
 permit(u.permissions,"settings.roles.manage");let result=id;
 await transaction(async db=>{
 const old=id?await one("platform.LockRole",{id},db,"ROLE_NOT_FOUND"):null;
 if(old){const g=guard(u,old.key);if(g)guardFail(g);if(old.is_locked)fail("SYSTEM_ROLE");}
 if(remove){if(old!.is_system)fail("SYSTEM_ROLE");if(Number((await one("platform.CountRealUsersInRole",{role_id:id,role_key:old!.key},db)).count))fail("ROLE_IN_USE","conflict");
 const demos=await rows("platform.DeleteDemoUserRoles",{role_id:id},db);for(const d of demos){await db.query(`DELETE FROM platform.users u WHERE employee_code=$1 AND is_demo AND NOT EXISTS(SELECT 1 FROM repair.tickets WHERE reporter_id=u.id OR holder_id=u.id OR assignee_id=u.id OR resolved_by_id=u.id) AND NOT EXISTS(SELECT 1 FROM repair.photos WHERE uploader_id=u.id)`,[d.employee_code]);}
 await query("platform.DeleteRole",{id},db);await audit(db,u,"delete","role",id!,old!.name);return;
 }
 if(old)version(old,b);
 const name=text(b.name??old?.name,"name",50,true),description=text(b.description??old?.description,"description",200);
 if((await rows("platform.ListRoles",{},db)).some(r=>r.id!==id&&r.name.toLowerCase()===name.toLowerCase()))fail("NAME_TAKEN","conflict");
 let copy:string[]=[];if(b.copyFromRoleId){const source=await one("platform.LockRole",{id:uuid(b.copyFromRoleId,"copyFromRoleId")},db,"ROLE_NOT_FOUND");copy=await rolePermissions(source.id,source.key,db);if(u.role!=="super_admin"&&source.key==="super_admin")guardFail("SUPER_ADMIN");if(!holds(u,copy))guardFail("ESCALATION");}
 const saved=await one(old?"platform.UpdateRole":"platform.InsertRole",{id,key:"r_"+randomBytes(4).toString("hex"),name,description,actor_id:u.id},db);result=saved.id;
 for(const permission of copy)await query("platform.GrantRolePermission",{role_id:result,permission},db);
 await audit(db,u,old?"update":"create","role",result!,name,diff(old??{},{name,description}));
 });return remove?null:(await roles(u)).find(r=>r.id===result);
}
const userSummary=(r:Row)=>({id:r.id,employeeCode:r.employee_code,name:displayName(r as User),email:r.email,department:r.department,position:r.position_th,role:{id:r.role_id,key:r.role_key,name:r.role_name},roleLockedByEnv:config().superAdmins.includes(r.employee_code),lastLoginAt:r.last_login_at});
export async function users(u:User,url:URL,id?:string) {
 permit(u.permissions,"settings.users.view","settings.users.manage");
 if(!id){const p=page(url),args={...p,role_id:url.searchParams.get("roleId"),q:url.searchParams.get("q")?escapeLike(url.searchParams.get("q")!):null};return list((await rows("platform.SearchUsers",args)).map(userSummary),p,Number((await one("platform.CountUsers",args)).count));}
 const r=await one("platform.GetUserAdmin",{id},undefined,"USER_NOT_FOUND"),summary=userSummary(r);
 const history=await rows("platform.ListUserRoleHistory",{target_id:id});
 const why=summary.roleLockedByEnv?"LOCKED_BY_ENV":id===u.id?"SELF":!canManage(u)?"READ_ONLY":u.role!=="super_admin"&&r.role_key==="super_admin"?"SUPER_ADMIN":null;
 return {...summary,division:r.division,firstLoginAt:r.created_at,canChangeRole:!why,cannotChangeReason:why,roleHistory:history.map(h=>{const c=h.data?.changes?.find((c:Row)=>c.field==="role");return {createdAt:h.created_at,from:c?.before??"",to:c?.after??"",actor:actor(h,"actor")};})};
}
function canManage(u:User){return u.permissions.includes("settings.users.manage");}
export async function setUserRole(u:User,id:string,b:Row) {
 permit(u.permissions,"settings.users.manage");if(id===u.id)fail("CANNOT_CHANGE_SELF");
 await transaction(async db=>{
 const target=await one("platform.GetUserAdmin",{id},db,"USER_NOT_FOUND");if(config().superAdmins.includes(target.employee_code))fail("ROLE_LOCKED");
 if(u.role!=="super_admin"&&target.role_key==="super_admin")guardFail("SUPER_ADMIN");const role=await one("platform.GetRoleForUpdate",{id:uuid(b.roleId,"roleId")},db,"ROLE_NOT_FOUND");
 if(u.role!=="super_admin"&&role.key==="super_admin")guardFail("SUPER_ADMIN");if(!holds(u,await rolePermissions(role.id,role.key,db)))guardFail("ESCALATION");
 await query("platform.SetUserRole",{employee_code:target.employee_code,role_id:role.id},db);await audit(db,u,"role_change","user",id,displayName(target as User),[{field:"role",before:target.role_name,after:role.name}]);
 });return userSummary(await one("platform.GetUserAdmin",{id}));
}
export async function history(u:User,url:URL,actors=false) {
 permit(u.permissions,"settings.audit.view");const types=["role","user","building","floor","room","asset","asset_type","category","symptom","contractor_type","building_type"],entity=url.searchParams.get("entityType"),type=url.searchParams.get("type");
 if(type&&!["master","permissions","users"].includes(type))invalid({type:"INVALID"});
 const filtered=type==="permissions"?["role"]:type==="users"?["user"]:type==="master"?types.filter(t=>!["role","user"].includes(t)):types;
 const args={...page(url),types:entity?[entity]:filtered,actions:["create","update","delete","activate","deactivate","reorder","permissions_change","role_change"],actor_id:url.searchParams.get("actorId"),from_time:url.searchParams.get("from"),to_time:url.searchParams.get("to"),q:url.searchParams.get("q")?escapeLike(url.searchParams.get("q")!):null};
 if(actors)return (await rows("platform.ListAuditActors",args)).map(r=>({id:r.id,name:displayName(r as User),department:r.department}));
 return list((await rows("platform.ListAudit",args)).map(r=>({id:r.id,createdAt:r.created_at,actor:actor(r,"actor"),action:r.action,entityType:r.target_type,entityId:r.target_id,entityName:r.data?.entityName??"",parentName:r.data?.parentName??null,exists:r.entity_exists,changes:r.data?.changes??[]})),args,Number((await one("platform.CountAudit",args)).count));
}
