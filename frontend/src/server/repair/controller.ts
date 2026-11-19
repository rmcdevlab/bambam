import "server-only";
import { NextResponse,type NextRequest } from "next/server";
import { uuid,fail,type Row } from "../platform/query";
import type { User } from "../platform/service";
import * as svc from "./service";
import * as dash from "./dashboard";
import * as photos from "./photos";
import * as contractors from "./contractors";
export async function repair(request:NextRequest,u:User,path:string[],body:Row) {
 const [resource,id,op]=path,url=request.nextUrl,method=request.method;
 if(resource==="photos"){
  if(method==="POST"&&!id)return NextResponse.json({data:await photos.upload(request,u)},{status:201});
  if(method==="GET"&&id)return photos.open(uuid(id),url.searchParams.get("size")==="thumb",u);
 }
 if(method==="GET"){
  if(resource==="categories"&&!id)return svc.categories();if(resource==="buildings"&&!id)return svc.buildings();
  if(resource==="me"&&id==="recent-places")return svc.recentPlaces(u);
  if(resource==="technicians")return svc.technicians(u);
  if(resource==="tickets"){
   if(!id)return svc.tickets(url,u);if(id==="mine")return svc.tickets(url,u,true);if(id==="counts")return svc.counts(url,u);
   if(id==="duplicates")return svc.duplicateSummaries(u,Object.fromEntries(url.searchParams));
   return svc.getTicket(uuid(id),u);
  }
  if(resource==="contractor-types"){return contractors.types(u);}
  if(resource==="contractors")return contractors.getContractors(u,url,id?uuid(id):undefined,op==="jobs");
  if(resource==="admin"&&id==="overview")return dash.overview(u);
  if(resource==="asset-types"){return dash.assetTypes(u);}
  if(resource==="floors"&&id&&(op==="plan"||op==="room-plan"))return dash.floorPlan(uuid(id),u,op==="room-plan");
  if(resource==="assets"&&id==="suggest-code")return dash.suggest(uuid(url.searchParams.get("assetTypeId"),"assetTypeId"),uuid(url.searchParams.get("floorId"),"floorId"),u);
  if(resource==="assets"&&id)return dash.lookup(id,u);
 }
 if(method==="POST"){
  if(resource==="tickets"){if(!id)return NextResponse.json({data:await svc.create(u,body)},{status:201});if(op)return svc.action(uuid(id),op,u,body);}
  if(resource==="contractor-types"&&!id)return contractors.createType(u,body);
  if(resource==="contractors"&&!id)return NextResponse.json({data:await contractors.saveContractor(u,null,body)},{status:201});
  if(resource==="assets"&&!id)return NextResponse.json({data:await dash.saveAsset(u,null,body)},{status:201});
  if(resource==="assets"&&id&&op==="deactivate"){await dash.saveAsset(u,uuid(id),{},true);return new NextResponse(null,{status:204});}
 }
 if(method==="PUT"&&id&&!op){if(resource==="contractors")return contractors.saveContractor(u,uuid(id),body);if(resource==="assets")return dash.saveAsset(u,uuid(id),body);}
 fail("NOT_FOUND","not_found");
}
