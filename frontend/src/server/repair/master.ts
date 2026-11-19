import "server-only";
import { randomUUID } from "node:crypto";
import { rows,one,query,ids,text,invalid,fail,type Row,type DB } from "../platform/query";
import { transaction } from "../platform/db";
import type { User } from "../platform/service";
import { mapped,version,audit,diff,actor } from "../platform/audit";
export type MasterKind="category"|"symptom"|"contractor_type";
const config={category:{table:"repair.categories",lock:"repair.AdminLockCategory",list:"repair.AdminListCategories",insert:"repair.AdminInsertCategory",update:"repair.AdminUpdateCategory",remove:"repair.AdminDeleteCategory",name:"repair.AdminCategoryNameTaken",code:"CATEGORY_NOT_FOUND"},symptom:{table:"repair.symptoms",lock:"repair.AdminLockSymptom",list:"repair.AdminListSymptoms",insert:"repair.AdminInsertSymptom",update:"repair.AdminUpdateSymptom",remove:"repair.AdminDeleteSymptom",name:"repair.AdminSymptomNameTaken",code:"SYMPTOM_NOT_FOUND"},contractor_type:{table:"repair.contractor_types",lock:"repair.AdminLockContractorType",list:"repair.AdminListContractorTypes",insert:"repair.AdminInsertContractorType",update:"repair.AdminUpdateContractorType",remove:"repair.AdminDeleteContractorType",name:"repair.AdminContractorTypeNameTaken",code:"CONTRACTOR_TYPE_NOT_FOUND"}} as const;
export async function masters(kind:MasterKind,parent?:string,db?:DB):Promise<Row[]> {
 if(kind==="symptom")await one("repair.AdminLockCategory",{id:parent},db,"CATEGORY_NOT_FOUND");
 const rs=await rows(config[kind].list,{category_id:parent},db),links=kind==="category"?await rows("repair.AdminListBuildingTypeCategories",{},db):[];
 return rs.map(r=>({...mapped(r),...(kind==="category"?{buildingTypeIds:links.filter(l=>l.category_id===r.id).map(l=>l.building_type_id)}:{}),...(kind==="contractor_type"?{createdBy:actor(r,"created_by"),createdByTechnician:r.created_by_technician,inUse:Number(r.contractor_count)>0}:{})}));
}
export async function masterSave(kind:MasterKind,u:User,id:string|null,b:Row,parent?:string,remove=false) {
 const c=config[kind],resultId=id??randomUUID();
 await transaction(async db=>{
  const old=id?await one(c.lock,{id},db,c.code):null;
  if(remove){if(old!.in_use||old!.is_other)fail("IN_USE","conflict");
   if(kind==="category"){
    if(Object.values(await one("repair.AdminCategoryHasUsedSymptom",{category_id:id},db))[0])fail("IN_USE","conflict");
    await query("repair.AdminDeleteCategoryChildren",{category_id:id},db);await query("repair.AdminDeleteCategoryLinks",{category_id:id},db);await query("repair.AdminClearCategoryBuildingTypes",{category_id:id},db);
   }
   await query(c.remove,{id},db);await audit(db,u,"delete",kind,id!,old!.name);return;
  }
  if(old)version(old,b);
  const name=text(b.name??old?.name,"name",kind==="contractor_type"?50:100,true),isActive=b.isActive??old?.is_active??true;
  if(typeof isActive!=="boolean")invalid({isActive:"INVALID"});
  if(old?.is_other&&!isActive)fail("IN_USE","conflict");if(old?.is_other&&b.buildingTypeIds!=null)invalid({buildingTypeIds:"NOT_ALLOWED"});
  const categoryId=parent??old?.category_id;
  if(Object.values(await one(c.name,{name,self_id:id??"00000000-0000-0000-0000-000000000000",category_id:categoryId},db))[0])fail("NAME_TAKEN","conflict");
  const args:Row={id:resultId,name,is_active:isActive,actor_id:u.id,category_id:categoryId};
  if(kind==="category"){
   args.icon=text(b.icon??old?.icon,"icon",50,true);if(!/^[a-z0-9-]+$/.test(args.icon))invalid({icon:"INVALID"});
   args.default_priority=b.defaultPriority??old?.default_priority??"medium";
   if(!["critical","high","medium","low"].includes(args.default_priority))invalid({defaultPriority:"INVALID"});
   if(!old?.is_other&&(b.buildingTypeIds!==undefined||!old)){
    const typeIds=ids(b.buildingTypeIds,"buildingTypeIds",1),active=await rows("repair.AdminActiveBuildingTypes",{},db);if(typeIds.some(id=>!active.some(a=>a.id===id)))invalid({buildingTypeIds:"INVALID"});
    args.building_type_ids=typeIds;
   }
  }
  if(kind==="symptom"){
   await one("repair.AdminLockCategory",{id:categoryId},db,"CATEGORY_NOT_FOUND");args.priority=b.priority??old?.priority??"medium";
   if(!["critical","high","medium","low"].includes(args.priority))invalid({priority:"INVALID"});
  }
  await query(old?c.update:c.insert,args,db);
  if(args.building_type_ids){await query("repair.AdminClearCategoryActiveBuildingTypes",{category_id:resultId},db);await query("repair.AdminInsertCategoryBuildingTypes",{category_id:resultId,building_type_ids:args.building_type_ids},db);}
  const action=!old?"create":old.is_active!==isActive?isActive?"activate":"deactivate":"update";
  await audit(db,u,action,kind,resultId,name,diff(old??{},args),old?.category_name);
 });return remove?null:(await masters(kind,parent??(kind==="symptom"?(await one("repair.AdminLockSymptom",{id:resultId})).category_id:undefined))).find(r=>r.id===resultId);
}
export async function reorder(kind:"category"|"symptom",u:User,b:Row,parent?:string) {
 const order=ids(b.ids,"ids",1);await transaction(async db=>{
  await db.query("SELECT pg_advisory_xact_lock(56003)");const all=await rows(config[kind].list,{category_id:parent},db);
  if(all.length!==order.length||order.some(id=>!all.some(r=>r.id===id)))fail("VERSION_CONFLICT","conflict");
  const latest=Math.max(...all.map(r=>new Date(r.updated_at).getTime()));if(!b.version)invalid({version:"REQUIRED"});if(latest!==new Date(b.version).getTime())fail("VERSION_CONFLICT","conflict");
  for(let i=0;i<order.length;i++)await query(kind==="category"?"repair.AdminSetCategoryOrder":"repair.AdminSetSymptomOrder",{id:order[i],sort_order:i,actor_id:u.id},db);
  await audit(db,u,"reorder",kind,parent??order[0],kind,[{field:"order",before:all.map(r=>r.id).join(","),after:order.join(",")}]);
 });return masters(kind,parent);
}
