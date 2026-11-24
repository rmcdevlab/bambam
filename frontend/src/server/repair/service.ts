import "server-only";
import { randomUUID } from "node:crypto";
export { list } from "../platform/http";
import { list } from "../platform/http";
import { transaction } from "../platform/db";
import { one,rows,query,ref,page,uuid,ids,text,nullable,invalid,fail,escapeLike,type Row,type DB } from "../platform/query";
import { requirePermission as permit } from "../platform/permissions";
import type { User } from "../platform/service";
import * as repo from "./repository";
export const can=(u:User,p:string)=>u.permissions.includes(p);
const report=(u:User)=>permit(u.permissions,"repair.ticket.report");
export const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export const nil="00000000-0000-0000-0000-000000000000";

export async function visible(id:string,u:User,db?:DB) {
 const r=await one("repair.GetTicketAccess",{id,viewer_id:u.id},db,"TICKET_NOT_FOUND");
 if(r.reporter_id!==u.id&&!r.viewer_subscribed&&!can(u,"repair.ticket.view_all")&&!can(u,"repair.ticket.work"))fail("FORBIDDEN","forbidden");return r;
}
export async function getTicket(id:string,u:User) {await visible(id,u);return repo.detail(id,u);}
function filter(url:URL,u:User,mine=false,withStatus=true) {
 const p=url.searchParams,scope=p.get("scope")==="all"&&!mine;
 if(p.has("scope")&&!["all","mine"].includes(p.get("scope")!))invalid({scope:"INVALID"});
 if(p.has("relation")&&!["all","reported","following"].includes(p.get("relation")!))invalid({relation:"INVALID"});
 if(page(url).page>10000)invalid({page:"INVALID"});
 if(p.has("priority")&&!["critical","high","medium","low"].includes(p.get("priority")!))invalid({priority:"INVALID"});
 if(p.has("closedReason")&&!["confirmed","auto_closed","admin_closed","team_handled"].includes(p.get("closedReason")!))invalid({closedReason:"INVALID"});
 for(const key of ["createdFrom","createdTo"])if(p.has(key)&&(!/^\d{4}-\d{2}-\d{2}T/.test(p.get(key)!)||!Number.isFinite(Date.parse(p.get(key)!))))invalid({[key]:"INVALID"});
 if(scope)permit(u.permissions,"repair.ticket.view_all");if(mine)report(u);
 const statuses=withStatus?(p.get("status")??"").split(",").filter(Boolean):[],steps=withStatus?(p.get("step")??"").split(",").filter(Boolean):[];
 for(const s of statuses)if(!["in_progress","resolved","closed"].includes(s))invalid({status:"INVALID"});
 for(const s of steps)if(!["awaiting_assessment","in_repair","reworking","awaiting_rating","closed"].includes(s))invalid({step:"INVALID"});
 let sort=p.get("sort")??(statuses.length===1&&statuses[0]==="closed"?"closedAt:desc":"updatedAt:desc");if(!["createdAt:asc","createdAt:desc","closedAt:desc","updatedAt:desc"].includes(sort))invalid({sort:"INVALID"});
 if(mine&&sort==="updatedAt:desc")sort="updatedAt:desc";
 return {...page(url),viewer_id:u.id,scope_all:scope,relation:p.get("relation")??"all",statuses,steps,closed_reason:p.get("closedReason"),q:p.get("q")?escapeLike(p.get("q")!):null,
 category_id:p.get("categoryId")?uuid(p.get("categoryId"),"categoryId"):null,building_ids:(p.get("buildingId")??"").split(",").filter(Boolean).map(id=>uuid(id,"buildingId")),floor_id:p.get("floorId")?uuid(p.get("floorId"),"floorId"):null,
 priority:p.get("priority"),created_from:p.get("createdFrom"),created_to:p.get("createdTo"),awaiting_first:!scope,sort};
}
export async function tickets(url:URL,u:User,mine=false) {
 const f=filter(url,u,mine),rs=await rows(mine?"repair.ListMyTickets":"repair.ListTickets",f),count=await one("repair.CountTickets",f);
 const data=mine?rs.map(r=>({id:r.id,ticketNo:r.ticket_no,status:r.status,step:repo.step(r),closedReason:r.closed_reason,priority:r.priority,
 category:r.category_id?{...ref(r,"category"),icon:r.category_icon??"wrench"}:null,categoryOther:r.category_other,title:r.title,building:ref(r,"building"),floor:ref(r,"floor"),room:ref(r,"room"),locationDetail:r.location_detail,viewerRelation:r.is_reporter?"reporter":"subscriber",awaitingMyConfirmation:r.is_reporter&&r.status==="resolved",rating:r.rating,sendBackCount:r.send_back_count,expectedDoneOn:r.expected_done_on,assignee:repo.staff(r,"assignee"),autoCloseAt:r.auto_close_at,resolvedAt:r.resolved_at,updatedAt:r.updated_at})):await Promise.all(rs.map(r=>repo.summary(r,u)));
 return list(data,f,Number(count.count));
}
export async function counts(url:URL,u:User) {
 const r=await one("repair.CountTicketsByStatus",filter(url,u,false,false));return Object.fromEntries(Object.entries(r).map(([k,v])=>[k.replace(/_count$/,"").replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),Number(v)]));
}
export async function attach(db:DB,id:string,u:User,photoIds:string[],kind:string,eventId:string|null) {
 if(!photoIds.length)return;
 const owned=await rows("repair.LockAttachablePhotos",{ids:photoIds,uploader_id:u.id,not_before:new Date(Date.now()-24*3600000)},db);
 if(owned.length!==photoIds.length)fail("PHOTO_NOT_FOUND");
 await query("repair.MarkPhotosAttached",{ids:photoIds},db);await query("repair.InsertTicketPhotos",{photo_ids:photoIds,ticket_id:id,kind,event_id:eventId},db);
}
export async function event(db:DB,id:string,u:User,type:string,note:string|null=null,data:Row={},photos:string[]=[],kind:string|null=null) {
 const eventId=randomUUID();await query("repair.InsertTicketEvent",{id:eventId,ticket_id:id,type,actor_id:u.id,note,data:JSON.stringify(data),created_at:new Date()},db);
 if(kind)await attach(db,id,u,photos,kind,eventId);
}
const normalize=(s:string)=>s.trim().replace(/\s+/g," ").toLowerCase();
export async function duplicates(u:User,b:Row,db?:DB) {
 permit(u.permissions,"repair.ticket.report","repair.ticket.team_handle");
 return rows("repair.ListDuplicateTickets",{category_id:uuid(b.categoryId,"categoryId"),floor_id:uuid(b.floorId,"floorId"),room_id:uuid(b.roomId,"roomId"),spot:normalize(text(b.locationDetail,"locationDetail",100)),max_rows:10},db);
}
export async function create(u:User,b:Row) {
 const team=b.teamHandled;
 if(!team)report(u);
 if(team&&!can(u,"repair.ticket.team_handle"))fail("TEAM_HANDLED_NOT_ALLOWED","forbidden");
 const categoryId=uuid(b.categoryId,"categoryId"),floorId=uuid(b.floorId,"floorId"),buildingId=uuid(b.buildingId,"buildingId"),roomId=uuid(b.roomId,"roomId");
 const symptoms=ids(b.symptomIds,"symptomIds"),photos=ids(b.photoIds,"photoIds",1,5),symptomOther=text(b.symptomOther,"symptomOther",100),categoryOther=text(b.categoryOther,"categoryOther",100),location=text(b.locationDetail,"locationDetail",100),details=text(b.details,"details",500),assetCode=text(b.assetCode,"assetCode",50);
 if(!symptoms.length&&!symptomOther)invalid({symptomIds:"MIN_ITEMS"});
 const teamPhotos=team?ids(team.photoIds,"teamHandled.photoIds",1,5):[],teamNote=team?text(team.note,"teamHandled.note",500,true):"";
 if(teamPhotos.some(id=>photos.includes(id)))invalid({"teamHandled.photoIds":"INVALID"});
 const id=randomUUID();
 await transaction(async db=>{
  const cat=await one("repair.LockActiveCategory",{id:categoryId},db,"MASTER_DATA_CHANGED");
  if(categoryOther&&!cat.is_other)invalid({categoryOther:"NOT_ALLOWED"});
  for(const [name,args]of [["repair.ActiveFloorInBuilding",{floor_id:floorId,building_id:buildingId}],["repair.ActiveRoomOnFloor",{room_id:roomId,floor_id:floorId}]] as const){if(!Object.values(await one(name,args,db))[0])fail("MASTER_DATA_CHANGED");}
  if(!cat.is_other&&!Object.values(await one("repair.CategoryUsedInBuilding",{category_id:categoryId,building_id:buildingId},db))[0])fail("CATEGORY_NOT_FOR_BUILDING");
  const priorities=await rows("repair.ActiveSymptomPriorities",{category_id:categoryId,ids:symptoms},db);if(priorities.length!==symptoms.length)fail("MASTER_DATA_CHANGED");
  await query("repair.LockDuplicateKey",{key:`${categoryId}:${floorId}:${roomId}`},db);
  const matches=(await duplicates(u,b,db)).filter(r=>r.blocks_report);
  const own=matches.find(m=>m.reporter_id===u.id&&m.status==="resolved");if(own)fail("OWN_TICKET_AWAITING_RATING","conflict",{ticketId:own.id});
  if(matches.length)fail("DUPLICATE_FOUND","conflict",{tickets:await Promise.all(matches.map(async m=>({...await repo.summary(await one("repair.GetTicket",{id:m.id,viewer_id:u.id},db),u,db),subscriberCount:0,blocksReport:true})))});
  const fmt=await one("repair.GetSettings",{},db),year=Number(today().slice(0,4)),counter=await one("repair.NextTicketCounter",{year},db);
  const ticketNo=`${fmt.ticket_prefix}-${fmt.ticket_year_format==="be"?year+543:year}-${String(counter.last_no).padStart(fmt.ticket_digits,"0")}`;
  const rank=["critical","high","medium","low"],priority=priorities.length?priorities.map(p=>p.priority).sort((a,b)=>rank.indexOf(a)-rank.indexOf(b))[0]:cat.default_priority;
  const assets=assetCode?await rows("repair.ActiveAssetIDByCode",{code:assetCode},db):[];
  await query("repair.InsertTicket",{id,ticket_no:ticketNo,status:team?"closed":"in_progress",closed_reason:team?"team_handled":null,closed_at:team?new Date():null,priority,priority_source:priorities.length?"symptom":"category",category_id:categoryId,category_other:nullable(categoryOther),symptom_other:nullable(symptomOther),building_id:buildingId,floor_id:floorId,room_id:roomId,location_detail:nullable(location),details:nullable(details),asset_code:nullable(assetCode),asset_id:assets[0]?.id??null,reporter_id:u.id,created_at:new Date()},db);
  await query("repair.InsertTicketSymptoms",{ticket_id:id,symptom_ids:symptoms},db);
  await event(db,id,u,"created");await attach(db,id,u,photos,"report",null);
  if(team)await event(db,id,u,"team_handled",teamNote,{},teamPhotos,"team");
 });return repo.detail(id,u);
}
export async function action(id:string,action:string,u:User,b:Row) {
 if((action==="assess"||action==="resolve")&&!can(u,"repair.ticket.work"))fail("NOT_TECHNICIAN","forbidden");
 if(action==="follow")report(u);
 if(action==="close")permit(u.permissions,"repair.ticket.close_any");
 if(action==="progress")permit(u.permissions,"repair.ticket.update_progress");
 if(action==="handover")permit(u.permissions,"repair.ticket.handover_any","repair.ticket.team_handle");
 await transaction(async db=>{
  const t=await one("repair.LockTicket",{id},db,"TICKET_NOT_FOUND"),now=new Date();
  if(action==="handover"){
   if(t.status!=="closed"||t.closed_reason!=="team_handled")fail("NOT_TEAM_HANDLED");
   if(!can(u,"repair.ticket.handover_any")&&!(t.reporter_id===u.id&&can(u,"repair.ticket.team_handle")))fail("FORBIDDEN","forbidden");
   const reason=text(b.reason,"reason",500,true);await query("repair.HandOverTicket",{id,now},db);await event(db,id,u,"handed_over",reason);return;
  }
  if(t.status==="closed")fail("TICKET_CLOSED","conflict");
  const state=(want:string)=>{if(t.status!==want)fail("INVALID_STATE","conflict");};
  if((action==="assess"||action==="resolve")&&!can(u,"repair.ticket.work"))fail("NOT_TECHNICIAN","forbidden");
  if(action==="assess"){
   state("in_progress");const date=text(b.expectedDoneOn,"expectedDoneOn",10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)invalid({expectedDoneOn:"INVALID"});if(date<today())invalid({expectedDoneOn:"PAST"});
   const workBy=b.workBy;if(!["in_house","contractor"].includes(workBy))invalid({workBy:workBy?"INVALID":"REQUIRED"});
   const reason=text(b.reason,"reason",100);if(t.expected_done_on&&t.send_back_count===0&&date!==t.expected_done_on&&!reason)invalid({reason:"REQUIRED"});
   const contractorId=workBy==="contractor"?uuid(b.contractorId,"contractorId"):null,assigneeId=workBy==="in_house"?uuid(b.assigneeId,"assigneeId"):null;
   if(contractorId&&!Object.values(await one("repair.ActiveContractorExists",{id:contractorId},db))[0])fail("CONTRACTOR_NOT_FOUND");
   if(assigneeId&&!Object.values(await one("repair.IsTechnician",{id:assigneeId},db))[0])fail("ASSIGNEE_INVALID");
   await query("repair.AssessTicket",{id,technician_id:u.id,expected_done_on:date,work_by:workBy,contractor_id:contractorId,assignee_id:assigneeId,now},db);
   await event(db,id,u,t.expected_done_on?"assessment_changed":"assessed",null,{expectedDoneOn:date,workBy,...(t.expected_done_on&&reason?{reason}:{})});
  }else if(action==="resolve"){
   state("in_progress");if(!t.expected_done_on||!t.work_by)fail("ASSESSMENT_REQUIRED");
   const note=text(b.note,"note",500,true),photos=ids(b.photoIds,"photoIds",1,5),rating=t.work_by==="contractor"?b.contractorRating??null:null;
   if(t.work_by==="contractor"&&!t.contractor_rating&&rating==null)invalid({contractorRating:"REQUIRED"});if(rating!=null&&(!Number.isInteger(rating)||rating<1||rating>5))invalid({contractorRating:"INVALID"});
   await query("repair.ResolveTicket",{id,technician_id:u.id,note,contractor_rating:rating,contractor_rating_comment:nullable(text(b.contractorRatingComment,"contractorRatingComment",500)),now,auto_close_at:new Date(Date.now()+72*3600000)},db);
   await event(db,id,u,"resolved",note,{},photos,"result");
  }else if(action==="confirm"||action==="send-back"){
   if(t.reporter_id!==u.id)fail("NOT_REPORTER","forbidden");state("resolved");
   if(action==="confirm"){
    if(b.rating==null)invalid({rating:"REQUIRED"});if(!Number.isInteger(b.rating)||b.rating<1||b.rating>5)invalid({rating:"INVALID"});const comment=text(b.comment,"comment",500);
    await query("repair.ConfirmTicket",{id,rating:b.rating,rating_comment:nullable(comment),now},db);await event(db,id,u,"confirmed",nullable(comment),{rating:b.rating});
   }else{const reason=text(b.reason,"reason",500,true);await query("repair.SendBackTicket",{id,now},db);await event(db,id,u,"sent_back",reason,{},ids(b.photoIds,"photoIds",0,5),"send_back");}
  }else if(action==="progress"){
   // CR-059: a progress update (message 1–500 + 0–5 photos) while the job is in repair or reworking — after เริ่มดำเนินการ, before the result.
   await visible(id,u,db);state("in_progress");if(!t.expected_done_on)fail("INVALID_STATE","conflict");
   const note=text(b.note,"note",500,true),photos=ids(b.photoIds,"photoIds",0,5);
   await query("repair.TouchTicket",{id,now},db);await event(db,id,u,"progress_updated",note,{},photos,"progress");
  }else if(action==="close"){
   permit(u.permissions,"repair.ticket.close_any");const reason=text(b.reason,"reason",500,true);await query("repair.AdminCloseTicket",{id,now},db);await event(db,id,u,"admin_closed",reason);
  }else if(action==="follow"){
   report(u);if(t.reporter_id===u.id)fail("ALREADY_FOLLOWING","conflict");const inserted=await query("repair.InsertSubscriber",{ticket_id:id,user_id:u.id,now},db);if(!inserted.rowCount)fail("ALREADY_FOLLOWING","conflict");await event(db,id,u,"subscribed",nullable(text(b.note,"note",500)),{},ids(b.photoIds,"photoIds",0,5),"follow");
  }else fail("NOT_FOUND","not_found");
 });return getTicket(id,u);
}

export const categories=repo.categories;
export const buildings=repo.buildings;
export async function recentPlaces(u:User) {
 return (await rows("repair.ListRecentPlaces",{reporter_id:u.id})).map(r=>({building:ref(r,"building"),floor:ref(r,"floor"),room:ref(r,"room"),locationDetail:r.location_detail,lastReportedAt:r.last_reported_at}));
}
export async function technicians(u:User) {
 if(!can(u,"repair.ticket.work"))fail("NOT_TECHNICIAN","forbidden");
 return (await rows("repair.ListTechnicians")).map(r=>({id:r.id,name:r.name,roleName:r.role_name}));
}
export async function duplicateSummaries(u:User,b:Row) {
 return Promise.all((await duplicates(u,b)).map(async r=>{
  const raw=await one("repair.GetTicket",{id:r.id,viewer_id:u.id});
  return {...await repo.summary(raw,u),subscriberCount:Number(raw.subscriber_count),blocksReport:r.blocks_report};
 }));
}
