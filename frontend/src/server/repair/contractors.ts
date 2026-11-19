import "server-only";
import { randomUUID } from "node:crypto";
import { rows,one,query,ids,text,nullable,fail,page,escapeLike,type Row } from "../platform/query";
import { transaction } from "../platform/db";
import type { User } from "../platform/service";
import { requirePermission as permit } from "../platform/permissions";
import { contractor } from "./repository";
import { audit } from "../platform/audit";
import { list,nil } from "./service";
export const staff=(u:User)=>permit(u.permissions,"repair.ticket.view_all");
export async function getContractors(u:User,url:URL,id?:string,jobs=false) {
 staff(u);if(id&&!jobs)return contractor(await one("repair.GetContractor",{id},undefined,"CONTRACTOR_NOT_FOUND"));
 const args={...page(url),contractor_id:id,include_inactive:url.searchParams.get("includeInactive")==="true",q:url.searchParams.get("q")?escapeLike(url.searchParams.get("q")!):null,type_id:url.searchParams.get("typeId")};
 if(id)await one("repair.GetContractor",{id},undefined,"CONTRACTOR_NOT_FOUND");
 const rs=await rows(jobs?"repair.ListContractorJobs":"repair.ListContractors",args),count=await one(jobs?"repair.CountContractorJobs":"repair.CountContractors",args);
 return list(jobs?rs.map(r=>({ticketId:r.id,ticketNo:r.ticket_no,status:r.status,category:{id:r.category_id??nil,name:r.category_name},resolvedAt:r.resolved_at,contractorRating:r.contractor_rating,contractorRatingComment:r.contractor_rating_comment,reporterRating:r.rating})):await Promise.all(rs.map(r=>contractor(r))),args,count.count);
}
export async function saveContractor(u:User,id:string|null,b:Row) {
 permit(u.permissions,"repair.contractor.manage");const resultId=id??randomUUID(),name=text(b.name,"name",100,true).replace(/\s+/g," "),typeIds=ids(b.typeIds,"typeIds",1),contact=text(b.contactName,"contactName",100),phone=text(b.phone,"phone",30),note=text(b.note,"note",500);
 await transaction(async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["contractor:"+name.toLowerCase()]);
  if(id)await one("repair.GetContractor",{id},db,"CONTRACTOR_NOT_FOUND");
  const duplicate=(await rows("repair.ContractorWithName",{name,exclude_id:id??nil},db))[0];if(duplicate)fail("CONTRACTOR_NAME_TAKEN","conflict",{contractorId:duplicate.id,isActive:duplicate.is_active});
  if(Number((await one("repair.CountContractorTypes",{ids:typeIds},db)).count)!==typeIds.length)fail("CONTRACTOR_TYPE_NOT_FOUND");
  await query(id?"repair.UpdateContractor":"repair.InsertContractor",{id:resultId,name,contact_name:nullable(contact),phone:nullable(phone),note:nullable(note),is_active:b.isActive??true,created_by_id:u.id},db);
  await query("repair.DeleteContractorTypeLinks",{contractor_id:resultId},db);await query("repair.InsertContractorTypeLinks",{contractor_id:resultId,type_ids:typeIds},db);
 });return contractor(await one("repair.GetContractor",{id:resultId}));
}
export async function createType(u:User,b:Row) {
 permit(u.permissions,"repair.ticket.work","repair.contractor.manage");const name=text(b.name,"name",50,true).replace(/\s+/g," ");return transaction(async db=>{
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["contractor_type:"+name.toLowerCase()]);
 const found=(await rows("repair.GetContractorTypeByName",{name},db))[0];if(found){if(!found.is_active){await query("repair.ReactivateContractorType",{id:found.id,actor_id:u.id},db);await audit(db,u,"activate","contractor_type",found.id,found.name); }return {id:found.id,name:found.name};}
 const created=await one("repair.InsertContractorType",{name,created_by_id:u.id},db);await audit(db,u,"create","contractor_type",created.id,created.name);return created;
 });
}

export async function types(u:User) {staff(u);return rows("repair.ListContractorTypes");}
