import { NextResponse,type NextRequest } from "next/server";
import { endpoint,live } from "@/server/platform/http";
import { matchesRoute } from "@/server/platform/routes";
import { resolveSession } from "@/server/platform/service";
import { invalid,fail,type Row } from "@/server/platform/query";
import { repair } from "@/server/repair/controller";
import { settings } from "@/server/settings/controller";
const handle=live(endpoint(async(request:NextRequest)=>{
 const parts=request.nextUrl.pathname.slice("/api/v1/".length).split("/").map(decodeURIComponent),moduleKey=parts.shift();
 if(!matchesRoute(moduleKey??"",request.method,parts))fail("NOT_FOUND","not_found");
 const {user}=await resolveSession(request.cookies.get("bam_session")?.value);
 let body:Row={};
 if(["POST","PUT","PATCH"].includes(request.method)&&request.headers.get("content-type")?.startsWith("application/json")){
  if(Number(request.headers.get("content-length"))>1024*1024)invalid({body:"TOO_LARGE"});
  try{const value:unknown=await request.json();if(!value||Array.isArray(value)||typeof value!=="object")invalid({body:"INVALID"});body=value as Row;}catch{invalid({body:"INVALID"});}
 }
 const result=await (moduleKey==="repair"?repair:settings)(request,user,parts,body);
 return result instanceof NextResponse?result:NextResponse.json({data:result});
}));
export const GET=handle;export const POST=handle;export const PUT=handle;export const PATCH=handle;export const DELETE=handle;
