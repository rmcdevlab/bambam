import "server-only";
import { query,camel,invalid,fail,timestamp,type Row,type DB } from "./query";
import { displayName,type User } from "./service";
export function actor(r:Row,p="updated_by") {
 const id=r[p+"_user_id"];if(!id)return null;
 return {id,name:displayName({employee_code:r[p+"_employee_code"],first_name_th:r[p+"_first_name_th"],last_name_th:r[p+"_last_name_th"],first_name_en:r[p+"_first_name_en"],last_name_en:r[p+"_last_name_en"]} as User),department:r[p+"_department"]??null};
}
export function mapped(r:Row):Row {
 const data=camel(Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith("updated_by_")&&!k.startsWith("created_by_")&&!k.endsWith("_by_id"))));
 return {...data,updatedBy:actor(r)};
}
export function version(old:Row,b:Row) {if(!b.updatedAt)invalid({updatedAt:"REQUIRED"});if(typeof b.updatedAt!=="string"||!Number.isFinite(Date.parse(b.updatedAt)))invalid({updatedAt:"INVALID"});if(timestamp(b.updatedAt)!==timestamp(old.updated_at))fail("VERSION_CONFLICT","conflict");}
export async function audit(db:DB,u:User,action:string,type:string,id:string,name:string,changes:Row[]=[],parentName?:string) {
 await query("platform.InsertAuditLog",{actor_user_id:u.id,action,target_type:type,target_id:id,data:JSON.stringify({entityName:name,changes,...(parentName?{parentName}:{})})},db);
}
export function diff(before:Row,after:Row):Row[] {return Object.keys(after).filter(k=>String(before[k]??"")!==String(after[k]??"")).map(k=>({field:k,before:String(before[k]??""),after:String(after[k]??"")}));}
