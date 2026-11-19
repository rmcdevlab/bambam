import "server-only";
import { randomUUID } from "node:crypto";
import { one,rows,query,uuid,ids,text,invalid,fail,ref,type Row } from "../platform/query";
import { transaction } from "../platform/db";
import { requirePermission as permit } from "../platform/permissions";
import type { User } from "../platform/service";
import { mapped,version,audit,diff } from "../platform/audit";
import { nil } from "../repair/service";
import { suggest } from "../repair/dashboard";
export async function buildings(u:User) {
 permit(u.permissions,"settings.locations.manage","settings.assets.manage");const [b,f,r]=await Promise.all([rows("platform.ListPlanBuildings"),rows("platform.ListPlanFloors"),rows("platform.ListPlanRooms")]);
 return b.map(b=>({id:b.id,name:b.name,buildingType:ref(b,"building_type"),updatedAt:b.updated_at,updatedBy:mapped(b).updatedBy,floors:f.filter(f=>f.building_id===b.id).map(f=>({id:f.id,name:f.name,level:f.level,rooms:r.filter(r=>r.floor_id===f.id).map(r=>mapped(r))}))}));
}
export async function rename(u:User,kind:"building"|"room",id:string,b:Row) {
 permit(u.permissions,"settings.locations.manage");await transaction(async db=>{
 const old=await one(kind==="building"?"platform.LockBuilding":"platform.LockRoom",{id},db,kind==="building"?"BUILDING_NOT_FOUND":"ROOM_NOT_FOUND");version(old,b);
 const name=text(b.name,"name",100,true);
 if(Object.values(await one(kind==="building"?"platform.BuildingNameTaken":"platform.RoomNameTaken",{name,self_id:id,floor_id:old.floor_id},db))[0])fail("NAME_TAKEN","conflict");
 const buildingTypeId=b.buildingTypeId?uuid(b.buildingTypeId,"buildingTypeId"):old.building_type_id;
 if(kind==="building")await one("platform.GetActiveBuildingType",{id:buildingTypeId},db,"BUILDING_TYPE_NOT_FOUND");
 await query(kind==="building"?"platform.UpdateBuilding":"platform.RenameRoom",{id,name,building_type_id:buildingTypeId,actor_id:u.id},db);
 await audit(db,u,"update",kind,id,name,[...diff(old,{name}),...(kind==="building"&&buildingTypeId!==old.building_type_id?[{field:"buildingType",before:old.building_type_name,after:(await one("platform.GetActiveBuildingType",{id:buildingTypeId},db)).name}]:[])],old.building_name);
 });const tree=await buildings(u);return kind==="building"?tree.find(r=>r.id===id):tree.flatMap(b=>b.floors.flatMap(f=>f.rooms)).find(r=>r.id===id);
}
export async function buildingTypes(u:User):Promise<Row[]> {
 permit(u.permissions,"settings.locations.manage","settings.categories.manage");const links=await rows("repair.AdminListBuildingTypeCategories");return (await rows("platform.ListBuildingTypes")).map(r=>({...mapped(r),categoryIds:links.filter(l=>l.building_type_id===r.id).map(l=>l.category_id)}));
}
export async function saveBuildingType(u:User,id:string|null,b:Row) {
 permit(u.permissions,"settings.locations.manage");const resultId=id??randomUUID();await transaction(async db=>{
 const old=id?await one("platform.LockBuildingType",{id},db,"BUILDING_TYPE_NOT_FOUND"):null;if(old)version(old,b);
 const name=text(b.name??old?.name,"name",100,true),active=b.isActive??old?.is_active??true;
 if(old?.in_use&&!active)fail("IN_USE","conflict");if(Object.values(await one("platform.BuildingTypeNameTaken",{name,self_id:id??nil},db))[0])fail("NAME_TAKEN","conflict");
 const categoryIds=b.categoryIds===undefined?null:ids(b.categoryIds,"categoryIds");if(categoryIds){const cats=await rows("repair.AdminListCategories",{},db);if(categoryIds.some(id=>!cats.some(c=>c.id===id&&!c.is_other)))invalid({categoryIds:"INVALID"});}
 await query(old?"platform.UpdateBuildingType":"platform.InsertBuildingType",{id:resultId,name,is_active:active,actor_id:u.id},db);
 if(categoryIds)await query("repair.AdminLinkBuildingTypeCategories",{building_type_id:resultId,category_ids:categoryIds},db);
 await audit(db,u,!old?"create":old.is_active!==active?active?"activate":"deactivate":"update","building_type",resultId,name,diff(old??{},{name,isActive:active}));
 });return (await buildingTypes(u)).find(r=>r.id===resultId);
}
const snapshot=(r:Row)=>({code:r.code,name:r.name,buildingId:r.building_id,buildingName:r.building_name,floorId:r.floor_id,floorName:r.floor_name,roomId:r.room_id,roomName:r.room_name});
export function labelStatus(r:Row) {
 const s=r.label_snapshot;if(!s)return "never";
 if(s.roomId!==r.room_id)return "moved";
 return ["code","name","buildingName","floorName","roomName"].some(k=>s[k]!==snapshot(r)[k as keyof ReturnType<typeof snapshot>])?"changed":"current";
}
export async function assetAdmin(r:Row) {
 const count=await rows("repair.CountOpenTicketsByAsset",{asset_ids:[r.id]});
 return {id:r.id,code:r.code,name:r.name,isActive:r.is_active,type:{id:r.type_id,key:r.type_key,name:r.type_name,icon:r.type_icon},roomId:r.room_id,placed:r.placed,openTicketCount:Number(count[0]?.count??count[0]?.open_count??0),labelStatus:labelStatus(r),labelPrintedAt:r.label_printed_at,updatedAt:r.updated_at,updatedBy:mapped(r).updatedBy};
}
export async function roomAssets(u:User,roomId:string,url:URL) {
 permit(u.permissions,"settings.assets.manage");await one("platform.GetRoomPlace",{id:roomId},undefined,"ROOM_NOT_FOUND");
 return Promise.all((await rows("platform.ListRoomAssets",{room_id:roomId,include_inactive:url.searchParams.get("includeInactive")==="true",asset_type_id:url.searchParams.get("assetTypeId"),q:url.searchParams.get("q")})).map(assetAdmin));
}
export async function saveAsset(u:User,id:string|null,b:Row) {
 permit(u.permissions,"settings.assets.manage");const resultId=id??randomUUID();await transaction(async db=>{
 const old=id?await one("platform.LockAssetAdmin",{id},db,"ASSET_NOT_FOUND"):null;if(old)version(old,b);
 const code=text(b.code??old?.code,"code",50,true),name=text(b.name??old?.name,"name",100,true),roomId=uuid(b.roomId??old?.room_id,"roomId"),typeId=old?.asset_type_id??uuid(b.assetTypeId,"assetTypeId");
 if(!/^[A-Za-z0-9_-]+$/.test(code))invalid({code:"INVALID"});if(old?.label_printed&&code!==old.code)fail("ASSET_CODE_LOCKED");
 if(Object.values(await one("platform.AssetCodeInUse",{code,self_id:id??nil},db))[0])fail("ASSET_CODE_TAKEN","conflict");
 await one("platform.GetRoomPlace",{id:roomId},db,"ROOM_NOT_FOUND");await one("platform.GetActiveAssetType",{id:typeId},db,"ASSET_TYPE_NOT_FOUND");
 const active=b.isActive??old?.is_active??true;
 await query(old?"platform.UpdateAssetAdmin":"platform.InsertAssetAdmin",{id:resultId,code,name,room_id:roomId,asset_type_id:typeId,is_active:active,actor_id:u.id},db);
 await audit(db,u,!old?"create":old.is_active!==active?active?"activate":"deactivate":"update","asset",resultId,name,diff(old??{},{code,name,roomId,isActive:active}));
 });return assetAdmin(await one("platform.GetAssetAdmin",{id:resultId}));
}
export async function assetTypes(u:User):Promise<Row[]> {permit(u.permissions,"settings.assets.manage");return (await rows("platform.ListAssetTypesAdmin")).map(mapped);}
export async function saveAssetType(u:User,id:string|null,b:Row) {
 permit(u.permissions,"settings.assets.manage");const resultId=id??randomUUID();await transaction(async db=>{
 const old=id?await one("platform.LockAssetType",{id},db,"ASSET_TYPE_NOT_FOUND"):null;if(old)version(old,b);
 const name=text(b.name??old?.name,"name",100,true),codePrefix=text(b.codePrefix??old?.code_prefix,"codePrefix",10,true).toUpperCase(),icon=text(b.icon??old?.icon??"box","icon",50,true),mount=b.mount??old?.mount??"floor";
 if(!/^[A-Z0-9]{2,5}$/.test(codePrefix))invalid({codePrefix:"INVALID"});if(!["floor","wall","ceiling"].includes(mount))invalid({mount:"INVALID"});if(!["box","air-vent","mic","speaker","tv","plug","droplets","armchair"].includes(icon))invalid({icon:"INVALID"});
 if(Object.values(await one("platform.AssetTypeNameInUse",{name,self_id:id??nil},db))[0])fail("NAME_TAKEN","conflict");if(Object.values(await one("platform.AssetTypePrefixInUse",{code_prefix:codePrefix,self_id:id??nil},db))[0])fail("CODE_PREFIX_TAKEN","conflict");
 await query(old?"platform.UpdateAssetType":"platform.InsertAssetType",{id:resultId,key:"t_"+resultId.replace(/-/g,"").slice(0,8),name,code_prefix:codePrefix,icon,mount,actor_id:u.id},db);
 await audit(db,u,old?"update":"create","asset_type",resultId,name,diff(old??{},{name,codePrefix,icon,mount}));
 });return (await assetTypes(u)).find(r=>r.id===resultId);
}
export async function labels(u:User,url:URL) {
 permit(u.permissions,"settings.assets.manage");const buildingId=uuid(url.searchParams.get("buildingId"),"buildingId");
 if(!Object.values(await one("platform.ActiveBuildingExists",{id:buildingId}))[0])fail("BUILDING_NOT_FOUND","not_found");
 return (await rows("platform.ListLabelAssets",{building_id:buildingId,floor_id:url.searchParams.get("floorId"),room_id:url.searchParams.get("roomId")})).map(r=>({id:r.id,code:r.code,name:r.name,building:ref(r,"building"),floor:{...ref(r,"floor"),level:r.floor_level},room:ref(r,"room"),labelStatus:labelStatus(r),labelPrintedAt:r.label_printed_at}));
}
export async function printed(u:User,b:Row) {
 permit(u.permissions,"settings.assets.manage");if(!Array.isArray(b.assetIds)||!b.assetIds.length)invalid({assetIds:"REQUIRED"});if(b.assetIds.length>500)invalid({assetIds:"TOO_MANY"});const assetIds=ids(b.assetIds,"assetIds",1,500);
 await transaction(async db=>{const locked=await rows("platform.LockLabelAssets",{ids:assetIds},db);if(locked.length!==assetIds.length)fail("ASSET_NOT_ACTIVE");for(const r of locked)await query("platform.MarkLabelPrinted",{id:r.id,snapshot:JSON.stringify(snapshot(r)),actor_id:u.id},db);await query("platform.InsertAuditLog",{actor_user_id:u.id,action:"asset.label_printed",target_type:"asset",target_id:null,data:JSON.stringify({count:assetIds.length,assetIds})},db);});
 return Promise.all(assetIds.map(async id=>assetAdmin(await one("platform.GetAssetAdmin",{id}))));
}
export async function suggestCode(u:User,url:URL) {
 const place=await one("platform.GetRoomPlace",{id:uuid(url.searchParams.get("roomId"),"roomId")},undefined,"ROOM_NOT_FOUND");return suggest(uuid(url.searchParams.get("assetTypeId"),"assetTypeId"),place.floor_id,u);
}
