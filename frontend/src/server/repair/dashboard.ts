import "server-only";
import { randomUUID } from "node:crypto";
import { one,rows,query,camel,ref,uuid,text,fail,invalid,type Row,type DB } from "../platform/query";
import { transaction } from "../platform/db";
import type { User } from "../platform/service";
import { requirePermission as permit } from "../platform/permissions";
import { can,today,nil } from "./service";
import { detail } from "./repository";
const priorities=["critical","high","medium","low"];
export function priorityCounts(r:Row) {return {openCount:priorities.reduce((n,p)=>n+Number(r[p+"_count"]??0),0),highestPriority:priorities.find(p=>Number(r[p+"_count"])>0)??null};}
function asset(r:Row) {return {id:r.id,code:r.code,name:r.name,type:{id:r.type_id,key:r.type_key,name:r.type_name},room:ref(r,"room"),x:r.placed?r.pos_x:null,z:r.placed?r.pos_z:null,rotationDeg:r.rotation_deg,openTickets:Number(r.open_tickets)};}
export async function overviewBuildings(u:User) {
 const [buildings,floors,plans]=await Promise.all([rows("repair.ListActiveBuildings"),rows("repair.OverviewFloors"),rows("repair.BuildingsWithPlans")]);
 return buildings.map(b=>{const plan=plans.find(p=>p.building_id===b.id);return {id:b.id,name:b.name,hasModel:!!plan&&can(u,"repair.building3d.view"),widthM:plan?.width_m??null,depthM:plan?.depth_m??null,modelKey:can(u,"repair.building3d.view")?b.model_key:null,
 floors:floors.filter(f=>f.building_id===b.id).map(f=>({id:f.id,name:f.name,level:f.level,...priorityCounts(f),criticalCount:Number(f.critical_count),steps:{awaitingAssessment:Number(f.awaiting_assessment_count),inRepair:Number(f.in_repair_count),awaitingRating:Number(f.awaiting_rating_count)}}))};});
}
export async function overview(u:User) {
 permit(u.permissions,"repair.overview.view");const day=today(),start=new Date(`${day}T00:00:00+07:00`),week=new Date(start.getTime()-6*86400000);
 const [r,old,next,buildings,site,attention]=await Promise.all([one("repair.OverviewCounts",{today:day,day_start:start,week_start:week}),rows("repair.OldestAwaitingAssessment"),rows("repair.NextAutoClose"),overviewBuildings(u),rows("repair.ListSiteBlocks"),rows("repair.AttentionTicketIDs",{today:day,row_limit:5})]);
 const counts={open:Number(r.open_count),awaitingAssessment:Number(r.awaiting_assessment_count),inRepair:Number(r.in_repair_count),reworking:Number(r.reworking_count),awaitingRating:Number(r.awaiting_rating_count),overdue:Number(r.overdue_count),reportedToday:Number(r.reported_today_count),closedToday:Number(r.closed_today_count),closedLast7Days:Number(r.closed_last7_count),ratingAvgLast7Days:Number(r.rated_last7_count)?Math.round(Number(r.rating_sum_last7)/Number(r.rated_last7_count)*10)/10:null,oldestAwaitingAssessmentAt:old[0]?.created_at??null,nextAutoCloseAt:next[0]?.auto_close_at??null};
 return {counts,buildings,site:can(u,"repair.building3d.view")?site.map(s=>({...camel(s),x:s.x_m,z:s.z_m})):[],attention:await Promise.all(attention.map(t=>detail(t.id,u)))};
}
export async function floorPlan(id:string,u:User,roomOnly=false) {
 permit(u.permissions,...(roomOnly?["repair.ticket.report","repair.ticket.team_handle","repair.ticket.view_all"]:["repair.overview.view"]));
 const [f,rooms,assets]=await Promise.all([one("repair.GetFloorPlan",{id},undefined,"FLOOR_NOT_FOUND"),rows("repair.ListFloorRooms",{floor_id:id}),roomOnly?Promise.resolve([]):rows("repair.ListFloorAssets",{floor_id:id})]);
 const p:Row={floor:{id:f.id,name:f.name,level:f.level},building:ref(f,"building"),widthM:f.has_plan?f.width_m:null,depthM:f.has_plan?f.depth_m:null,modelUrl:f.model_file,rooms:rooms.map(r=>({id:r.id,name:r.name,areaType:r.area_type,shape:r.plan_shape,...(roomOnly?{openCount:0,highestPriority:null}:priorityCounts(r))})),assets:assets.map(asset)};
 if(roomOnly){const b=(await overviewBuildings({...u,permissions:[...u.permissions,"repair.building3d.view"]})).find(b=>b.id===f.building_id);p.model=b?.hasModel&&b.modelKey?{key:b.modelKey,widthM:b.widthM,depthM:b.depthM,floors:Math.max(...b.floors.map(f=>f.level))}:null;}
 return p;
}
export async function lookup(code:string,u:User) {
 permit(u.permissions,"repair.ticket.report");const r=await one("repair.LookupAssetByCode",{code},undefined,"ASSET_NOT_FOUND");
 const categories=await rows("repair.ListAssetTypeCategories",{asset_type_id:r.asset_type_id,building_id:r.building_id});const c=categories.find(c=>c.is_other||c.used_in_building);
 return {code:r.code,name:r.name,category:c?{id:c.id,name:c.name}:null,building:ref(r,"building"),floor:ref(r,"floor"),room:ref(r,"room"),locationDetail:null};
}
export async function suggest(typeId:string,floorId:string,u:User) {
 permit(u.permissions,"settings.assets.manage");const t=await one("repair.GetActiveAssetType",{id:typeId},undefined,"MASTER_DATA_CHANGED"),f=await one("repair.GetActiveFloorName",{id:floorId},undefined,"FLOOR_NOT_FOUND"),prefix=`${t.code_prefix}-${f.name}-`,taken=await rows("repair.ListAssetCodesWithPrefix",{prefix});
 let n=1;while(taken.some(r=>r.code.toLowerCase()===(prefix+String(n).padStart(3,"0")).toLowerCase()))n++;return {code:prefix+String(n).padStart(3,"0")};
}
export function inside(x:number,z:number,shape:number[][]) {
 let hit=false;
 for(let i=0,j=shape.length-1;i<shape.length;j=i++) {const [xi,zi]=shape[i],[xj,zj]=shape[j];const cross=(x-xj)*(zi-zj)-(z-zj)*(xi-xj);
 if(Math.abs(cross)<1e-9&&x>=Math.min(xi,xj)-1e-9&&x<=Math.max(xi,xj)+1e-9&&z>=Math.min(zi,zj)-1e-9&&z<=Math.max(zi,zj)+1e-9)return true;
 if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)hit=!hit;}return hit;
}
const area=(s:number[][])=>Math.abs(s.reduce((a,p,i)=>{const n=s[(i+1)%s.length];return a+p[0]*n[1]-n[0]*p[1];},0)/2);
export async function placement(db:DB,roomId:string,x:unknown,z:unknown) {
 if((x==null)!==(z==null))invalid({[x==null?"x":"z"]:"REQUIRED"});
 const room=await one("repair.GetPlacementRoom",{id:roomId},db,"MASTER_DATA_CHANGED");if(x==null)return;
 if(typeof x!=="number"||typeof z!=="number"||!Number.isFinite(x)||!Number.isFinite(z)||!room.has_plan||x<0||z<0||x>room.width_m||z>room.depth_m)invalid({x:"INVALID",z:"INVALID"});
 const shapes=await rows("repair.ListRoomShapesOnFloor",{floor_id:room.floor_id},db),matched=shapes.filter(r=>r.plan_shape?.length>=3&&inside(x as number,z as number,r.plan_shape)).sort((a,b)=>area(a.plan_shape)-area(b.plan_shape));
 if(matched[0]?.id!==roomId)fail("POINT_OUTSIDE_ROOM");
}
export async function saveAsset(u:User,id:string|null,b:Row,deactivate=false) {
 permit(u.permissions,"settings.assets.manage");const resultId=id??randomUUID();
 await transaction(async db=>{
 const old=id?await one("repair.LockAsset",{id},db,"ASSET_NOT_FOUND"):null;
 if(deactivate){await query("repair.DeactivateAsset",{id,actor_id:u.id},db);}else{
 const code=text(b.code,"code",50,true),name=text(b.name,"name",100,true),roomId=uuid(b.roomId,"roomId"),typeId=old?.asset_type_id??uuid(b.assetTypeId,"assetTypeId");
 if(!/^[A-Za-z0-9_-]+$/.test(code))invalid({code:"INVALID"});if(old?.label_printed&&code!==old.code)fail("ASSET_CODE_LOCKED");
 if(Object.values(await one("repair.AssetCodeTaken",{code,exclude_id:id??nil},db))[0])fail("ASSET_CODE_TAKEN","conflict");
 await one("repair.GetActiveAssetType",{id:typeId},db,"MASTER_DATA_CHANGED");await placement(db,roomId,b.x,b.z);
 const rotation=b.rotationDeg??old?.rotation_deg??0;if(!Number.isInteger(rotation)||rotation<0||rotation>359)invalid({rotationDeg:"INVALID"});
 await query(id?"repair.UpdateAsset":"repair.InsertAsset",{id:resultId,code,name,asset_type_id:typeId,room_id:roomId,pos_x:b.x??null,pos_z:b.z??null,rotation_deg:rotation,actor_id:u.id},db);
 }
 await query("repair.InsertAssetAudit",{actor_id:u.id,action:deactivate?"asset.deactivated":id?"asset.updated":"asset.created",target_id:resultId,data:JSON.stringify({before:old,after:b})},db);
 });return deactivate?null:asset(await one("repair.GetAsset",{id:resultId}));
}

export async function assetTypes(u:User) {permit(u.permissions,"repair.overview.view");return (await rows("repair.ListActiveAssetTypes")).map(camel);}
