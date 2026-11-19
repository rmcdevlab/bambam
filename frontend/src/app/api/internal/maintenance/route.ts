import { NextResponse } from "next/server";
import { endpoint,live } from "@/server/platform/http";
import { config } from "@/server/platform/config";
import { equal } from "@/server/platform/crypto";
import { maintenance } from "@/server/platform/jobs";
export const POST=live(endpoint(async request=>{
 const secret=process.env.MAINTENANCE_JOB_SECRET??config().APP_SESSION_SECRET;
 if(!equal(request.headers.get("authorization")??"",`Bearer ${secret}`))return NextResponse.json({error:{code:"UNAUTHENTICATED",message:"not authorized"}},{status:401});
 return NextResponse.json({data:await maintenance()});
}));
