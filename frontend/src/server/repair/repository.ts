import { appPath } from "@/lib/app-path";
import "server-only";
import { rows, one, ref, camel, type Row, type DB } from "../platform/query";
import type { User } from "../platform/service";
export const photo = (id:string)=>({id,thumbUrl:appPath(`/api/v1/repair/photos/${id}?size=thumb`),url:appPath(`/api/v1/repair/photos/${id}?size=full`)});
export const staff=(r:Row,p:string)=>r[`${p}_id`]?{...ref(r,p),roleName:r[`${p}_role_name`]}:null;
export const person=(r:Row,p:string)=>r[`${p}_id`]?{...ref(r,p),department:r[`${p}_department`]??null}:null;
export function step(r:Row) {return r.status==="closed"?"closed":r.status==="resolved"?"awaiting_rating":!r.expected_done_on?"awaiting_assessment":r.send_back_count>0?"reworking":"in_repair";}
export async function summary(r:Row,u:User,db?:DB) {
 const symptoms=await rows("repair.ListSymptomsForTickets",{ticket_ids:[r.id]},db);
 const photos=await rows("repair.FirstReportPhotos",{ticket_ids:[r.id]},db);
 const types=r.contractor_id?await rows("repair.ListTypesForContractors",{contractor_ids:[r.contractor_id]},db):[];
 return {id:r.id,ticketNo:r.ticket_no,status:r.status,step:step(r),closedReason:r.closed_reason,priority:r.priority,prioritySource:r.priority_source,
 category:r.category_id?{...ref(r,"category"),icon:r.category_icon??"wrench"}:null,categoryOther:r.category_other,symptoms:symptoms.map(s=>({id:s.id,name:s.name})),symptomOther:r.symptom_other,
 building:ref(r,"building"),floor:ref(r,"floor"),room:ref(r,"room"),locationDetail:r.location_detail,
 thumbUrl:photos[0]?photo(photos[0].photo_id).thumbUrl:null,reporter:person(r,"reporter"),technician:person(r,"holder"),
 viewerRelation:r.reporter_id===u.id?"reporter":r.viewer_subscribed?"subscriber":u.permissions.includes("repair.ticket.work")?"technician":"none",
 awaitingMyConfirmation:r.status==="resolved"&&r.reporter_id===u.id,expectedDoneOn:r.expected_done_on,workBy:r.work_by,
 contractor:u.permissions.includes("repair.ticket.view_all")?ref(r,"contractor"):null,contractorTypes:types.map(t=>t.name),assignee:staff(r,"assignee"),
 autoCloseAt:r.auto_close_at,sendBackCount:r.send_back_count,rating:r.rating,createdAt:r.created_at,assessedAt:r.assessed_at,resolvedAt:r.resolved_at,closedAt:r.closed_at,updatedAt:r.updated_at};
}
export async function detail(id:string,u:User,db?:DB) {
 const r=await one("repair.GetTicket",{id,viewer_id:u.id},db,"TICKET_NOT_FOUND");
 const s=await summary(r,u,db),photos=await rows("repair.ListTicketPhotos",{ticket_id:id},db),events=await rows("repair.ListTicketEvents",{ticket_id:id},db);
 const byEvent=(eventId:string)=>photos.filter(p=>p.event_id===eventId).map(p=>photo(p.photo_id));
 const actions:string[]=[],blocked:Record<string,string>={};
 if(r.status==="in_progress"&&u.permissions.includes("repair.ticket.work")){actions.push("assess");if(r.expected_done_on&&r.work_by)actions.push("resolve");else blocked.resolve="ASSESSMENT_REQUIRED";}
 // CR-059: progress updates while in repair or reworking (assessed, not yet resolved).
 if(r.status==="in_progress"&&r.expected_done_on&&u.permissions.includes("repair.ticket.update_progress"))actions.push("update_progress");
 if(r.status==="resolved"&&r.reporter_id===u.id)actions.push("confirm","send_back");
 if(r.status!=="closed"&&u.permissions.includes("repair.ticket.close_any"))actions.push("close");
 if(r.closed_reason==="team_handled"&&(u.permissions.includes("repair.ticket.handover_any")||(r.reporter_id===u.id&&u.permissions.includes("repair.ticket.team_handle"))))actions.push("handover");
 return {...s,details:r.details,asset:r.linked_asset_code?{code:r.linked_asset_code,name:r.linked_asset_name}:null,
 photos:photos.filter(p=>p.kind==="report").map(p=>photo(p.photo_id)),subscriberCount:Number(r.subscriber_count),ratingComment:r.rating_comment,
 result:r.result_note==null?null:{note:r.result_note,photos:byEvent(events.find(e=>e.type==="resolved")?.id),by:person(r,"resolved_by"),at:r.resolved_at,
 contractorRating:u.permissions.includes("repair.ticket.view_all")?r.contractor_rating:null,contractorRatingComment:u.permissions.includes("repair.ticket.view_all")?r.contractor_rating_comment:null},
 timeline:events.map(e=>({id:e.id,type:e.type,actor:person(e,"actor"),at:e.created_at,note:e.note,photos:byEvent(e.id),data:e.data??{}})),allowedActions:actions,blockedActions:blocked};
}
export async function buildings() {
 const [b,f,r]=await Promise.all([rows("repair.ListActiveBuildings"),rows("repair.ListActiveFloors"),rows("repair.ListActiveRooms")]);
 return b.map(b=>({id:b.id,name:b.name,buildingType:ref(b,"building_type"),floors:f.filter(f=>f.building_id===b.id).map(f=>({id:f.id,name:f.name,level:f.level,rooms:r.filter(r=>r.floor_id===f.id).map(r=>({id:r.id,name:r.name,areaType:r.area_type}))}))}));
}
export async function categories() {
 const [cats,syms,links]=await Promise.all([rows("repair.ListActiveCategories"),rows("repair.ListActiveSymptoms"),rows("repair.ListCategoryBuildingTypes")]);
 return cats.filter(c=>c.is_other||syms.some(s=>s.category_id===c.id)).map(c=>({...camel(c),buildingTypeIds:links.filter(l=>l.category_id===c.id).map(l=>l.building_type_id),symptoms:syms.filter(s=>s.category_id===c.id).map(s=>({id:s.id,name:s.name,priority:s.priority}))}));
}
export async function contractor(r:Row,db?:DB) {
 const types=await rows("repair.ListTypesForContractors",{contractor_ids:[r.id]},db);
 return {...camel(r),types:types.map(t=>({id:t.id,name:t.name})),avgRating:Number(r.rated_count)>0?Number(r.avg_rating):null};
}
