import "server-only";
import { NextResponse,type NextRequest } from "next/server";
import { requirePermission as permit } from "../platform/permissions";
import { uuid,fail,type Row } from "../platform/query";
import type { User } from "../platform/service";
import * as access from "./access";
import * as place from "./places";
import * as master from "../repair/master";
export async function settings(request:NextRequest,u:User,path:string[],body:Row) {
 const [resource,id,op,last]=path,method=request.method,url=request.nextUrl;
 const perms:Record<string,string[]>={roles:["settings.roles.manage","settings.users.manage","settings.users.view"],permissions:["settings.roles.manage"],users:["settings.users.manage","settings.users.view"],audit:["settings.audit.view"],buildings:["settings.locations.manage","settings.assets.manage"],rooms:[op==="assets"?"settings.assets.manage":"settings.locations.manage"],"building-types":["settings.locations.manage","settings.categories.manage"],assets:["settings.assets.manage"],"asset-types":["settings.assets.manage"],categories:["settings.categories.manage"],symptoms:["settings.categories.manage"],"contractor-types":["settings.contractor_types.manage"]};
 if(!perms[resource])fail("NOT_FOUND","not_found");permit(u.permissions,...perms[resource]);
 if(method==="GET"){
  if(resource==="roles"&&!id)return access.roles(u);if(resource==="permissions"&&!id)return access.matrix(u);
  if(resource==="users")return access.users(u,url,id?uuid(id):undefined);if(resource==="audit")return access.history(u,url,id==="actors");
  if(resource==="buildings"&&!id)return place.buildings(u);if(resource==="building-types"&&!id)return place.buildingTypes(u);
  if(resource==="rooms"&&op==="assets")return place.roomAssets(u,uuid(id),url);
  if(resource==="assets"&&id==="labels")return place.labels(u,url);if(resource==="assets"&&id==="suggest-code")return place.suggestCode(u,url);
  if(resource==="asset-types"&&!id)return place.assetTypes(u);
  if(resource==="categories"&&id&&op==="symptoms")return master.masters("symptom",uuid(id));
  if(resource==="categories"&&!id)return master.masters("category");if(resource==="contractor-types"&&!id)return master.masters("contractor_type");
 }
 if(resource==="roles"&&["POST","PATCH","DELETE"].includes(method)){const out=await access.saveRole(u,id?uuid(id):null,body,method==="DELETE");return method==="DELETE"?new NextResponse(null,{status:204}):NextResponse.json({data:out},{status:method==="POST"?201:200});}
 if(resource==="permissions"&&method==="PUT")return access.saveMatrix(u,body);
 if(resource==="users"&&id&&op==="role"&&method==="PUT")return access.setUserRole(u,uuid(id),body);
 if((resource==="buildings"||resource==="rooms")&&id&&method==="PATCH")return place.rename(u,resource==="buildings"?"building":"room",uuid(id),body);
 if(resource==="assets"&&id==="labels"&&op==="printed"&&method==="POST")return place.printed(u,body);
 if(resource==="building-types"&&(method==="POST"||method==="PATCH")){const out=await place.saveBuildingType(u,id?uuid(id):null,body);return NextResponse.json({data:out},{status:method==="POST"?201:200});}
 if(resource==="assets"&&(method==="POST"||method==="PATCH")){const out=await place.saveAsset(u,id?uuid(id):null,body);return NextResponse.json({data:out},{status:method==="POST"?201:200});}
 if(resource==="asset-types"&&(method==="POST"||method==="PATCH")){const out=await place.saveAssetType(u,id?uuid(id):null,body);return NextResponse.json({data:out},{status:method==="POST"?201:200});}
 if(resource==="categories"&&id==="order"&&method==="PUT")return master.reorder("category",u,body);
 if(resource==="categories"&&id&&op==="symptoms"&&last==="order"&&method==="PUT")return master.reorder("symptom",u,body,uuid(id));
 if((resource==="categories"||resource==="symptoms"||resource==="contractor-types")&&["POST","PATCH","DELETE"].includes(method)){
 const kind=resource==="symptoms"||op==="symptoms"?"symptom":resource==="categories"?"category":"contractor_type";
 const parent=op==="symptoms"?uuid(id):undefined,target=op==="symptoms"?null:id?uuid(id):null;
 const out=await master.masterSave(kind,u,target,body,parent,method==="DELETE");return method==="DELETE"?new NextResponse(null,{status:204}):NextResponse.json({data:out},{status:method==="POST"?201:200});
 }
 fail("NOT_FOUND","not_found");
}
