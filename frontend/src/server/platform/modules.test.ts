import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { NextRequest,NextResponse } from "next/server";
import { migrate } from "../../../scripts/migrations";
import { pool,transaction } from "./db";
import { testConfig } from "./test-config";
import { initialize } from "./initialize";
import { demoUser,upsertSSO,type User } from "./service";
import { endpoint } from "./http";
import type { Row } from "./query";
import { repair } from "../repair/controller";
import { settings } from "../settings/controller";
import { maintenance } from "./jobs";
const databaseUrl=process.env.MODULE_TEST_DATABASE_URL;
test("all native backend modules against PostgreSQL",{skip:!databaseUrl},async t=>{
 if(!/^\/bambam_cr056_test_modules$/.test(new URL(databaseUrl!).pathname))throw new Error("Use the dedicated module-test database");
 const photoDir=await mkdtemp(join(tmpdir(),"cr056-photos-"));
 Object.assign(process.env,testConfig,{DATABASE_URL:databaseUrl,PHOTO_STORAGE_DIR:photoDir,MAINTENANCE_SCHEDULER:"external"});
 const db=pool();
 async function call(u:User,path:string,method="GET",body:Row={}) {
  const url=new URL("http://localhost/api/v1/"+path),parts=url.pathname.slice("/api/v1/".length).split("/"),moduleKey=parts.shift();
  const response=await endpoint(async req=>{const data=await(moduleKey==="repair"?repair:settings)(req,u,parts,body);return data instanceof NextResponse?data:NextResponse.json({data});})(new NextRequest(url,{method}));
  return {status:response.status,...(response.status!==204?await response.json():{})};
 }
 const ok=async(u:User,path:string,method="GET",body:Row={})=>{const r=await call(u,path,method,body);assert.ok(r.status<300,`${method} ${path}: ${JSON.stringify(r)}`);return r.data;};
 const upload=async(u:User)=>{
  const form=new FormData();form.set("file",new File([new Uint8Array(await sharp({create:{width:8,height:8,channels:3,background:"white"}}).png().toBuffer())],"test.png",{type:"image/png"}));
  const req=new NextRequest("http://localhost/api/v1/repair/photos",{method:"POST",body:form});
  const result=await repair(req,u,["photos"],{});assert.ok(result instanceof NextResponse);return (await result.json()).data.id as string;
 };
 try{
 await db.query("DROP SCHEMA IF EXISTS repair CASCADE; DROP SCHEMA IF EXISTS platform CASCADE; DROP TABLE IF EXISTS public.goose_db_version");
 await migrate(db);await initialize();
 const demos=await transaction(async c=>({employee:await demoUser("employee",c),admin:await demoUser("admin",c),tech:await demoUser("technician",c),lead:await demoUser("housekeeper_lead",c),super:await demoUser("super_admin",c)}));
 const e=demos.employee,a=demos.admin,w=demos.tech,s=demos.super,l=demos.lead;
 let buildings:Row[]=[],categories:Row[]=[],floorId="",roomId="",buildingId="",categoryId="",symptomId="",ticketId="",assetId="",contractorId="",newRole:Row={};
 await t.test("read endpoints return contract-shaped master, dashboard and administration data",async()=>{
  buildings=await ok(e,"repair/buildings");categories=await ok(e,"repair/categories");
  const building=buildings.find(b=>b.floors.some((f:Row)=>f.rooms.length));assert.ok(building);
  buildingId=building.id;const floor=building.floors.find((f:Row)=>f.rooms.length);floorId=floor.id;roomId=floor.rooms[0].id;
  const category=categories.find(c=>c.symptoms.length&&(c.isOther||c.buildingTypeIds.includes(building.buildingType.id)));assert.ok(category);categoryId=category.id;symptomId=category.symptoms[0].id;
  for(const path of ["repair/tickets/mine","repair/tickets/counts","repair/me/recent-places"])await ok(e,path);
  for(const path of ["repair/tickets?scope=all","repair/technicians","repair/contractor-types","repair/contractors"])await ok(w,path);
  const overview=await ok(a,"repair/admin/overview");assert.ok(Array.isArray(overview.buildings));assert.equal(typeof overview.counts.open,"number");
  const plan=await ok(a,`repair/floors/${floorId}/plan`);assert.equal(plan.floor.id,floorId);assert.ok(Array.isArray(plan.rooms));
  await ok(e,`repair/floors/${floorId}/room-plan`);
  for(const path of ["settings/roles","settings/permissions","settings/buildings","settings/building-types","settings/asset-types","settings/categories","settings/contractor-types","settings/users","settings/audit","settings/audit/actors",`settings/rooms/${roomId}/assets`,`settings/categories/${categoryId}/symptoms`,`settings/assets/labels?buildingId=${buildingId}`])await ok(s,path);
 });
 const base=()=>({categoryId,symptomIds:[symptomId],buildingId,floorId,roomId,locationDetail:"Native module test "+Date.now()});
 await t.test("ticket creation enforces attachments, priority, duplicate locks and ownership",async()=>{
  const photoId=await upload(e),input={...base(),photoIds:[photoId]};
  const created=await ok(e,"repair/tickets","POST",input);ticketId=created.id;
  assert.equal(created.status,"in_progress");assert.equal(created.photos.length,1);assert.match(created.ticketNo,/\d{4}/);
  assert.equal((await call(e,"repair/tickets","POST",{...input,photoIds:[await upload(e)]})).error.code,"DUPLICATE_FOUND");
  assert.equal((await call(e,`repair/tickets/${ticketId}/assess`,"POST",{})).status,403);
  const mine=await ok(e,"repair/tickets/mine");assert.ok(mine.some((r:Row)=>r.id===ticketId));
  const ownPhoto=await repair(new NextRequest(`http://localhost/api/v1/repair/photos/${photoId}`),e,["photos",photoId],{});assert.ok(ownPhoto instanceof NextResponse);assert.equal(ownPhoto.status,200);
 });
 await t.test("technician assessment, rescheduling, resolve/send-back, confirmation preserve workflow",async()=>{
  const assessed=await ok(w,`repair/tickets/${ticketId}/assess`,"POST",{expectedDoneOn:"2099-01-01",workBy:"in_house",assigneeId:w.id});assert.equal(assessed.step,"in_repair");
  const rescheduled=await call(w,`repair/tickets/${ticketId}/assess`,"POST",{expectedDoneOn:"2099-01-02",workBy:"in_house",assigneeId:w.id});assert.equal(rescheduled.error.fields.reason,"REQUIRED");
  await ok(w,`repair/tickets/${ticketId}/resolve`,"POST",{note:"fixed",photoIds:[await upload(w)]});
  await ok(e,`repair/tickets/${ticketId}/send-back`,"POST",{reason:"still broken",photoIds:[]});
  await ok(w,`repair/tickets/${ticketId}/resolve`,"POST",{note:"fixed again",photoIds:[await upload(w)]});
  const closed=await ok(e,`repair/tickets/${ticketId}/confirm`,"POST",{rating:5});assert.equal(closed.closedReason,"confirmed");
  assert.equal((await call(w,`repair/tickets/${ticketId}/resolve`,"POST",{})).error.code,"TICKET_CLOSED");
 });
 await t.test("contractors, types and privacy work on contractor jobs",async()=>{
  const type=await ok(w,"repair/contractor-types","POST",{name:"Native contractor type"});
  const c=await ok(w,"repair/contractors","POST",{name:"Native contractor",typeIds:[type.id],phone:"0123456789"});contractorId=c.id;assert.equal(c.types[0].id,type.id);
  assert.equal((await call(w,"repair/contractors","POST",{name:"native contractor",typeIds:[type.id]})).error.code,"CONTRACTOR_NAME_TAKEN");
  const created=await ok(e,"repair/tickets","POST",{...base(),photoIds:[await upload(e)]});
  await ok(w,`repair/tickets/${created.id}/assess`,"POST",{expectedDoneOn:"2099-01-01",workBy:"contractor",contractorId});
  await ok(w,`repair/tickets/${created.id}/resolve`,"POST",{note:"done",photoIds:[await upload(w)],contractorRating:4});
  const reporter=await ok(e,`repair/tickets/${created.id}`);assert.equal(reporter.contractor,null);assert.equal(reporter.result.contractorRating,null);
  const technician=await ok(w,`repair/tickets/${created.id}`);assert.equal(technician.result.contractorRating,4);await ok(w,`repair/contractors/${contractorId}/jobs`);
 });
 await t.test("team-handled ticket handover and follower permissions",async()=>{
  const created=await ok(l,"repair/tickets","POST",{...base(),photoIds:[await upload(l)],teamHandled:{note:"team fixed",photoIds:[await upload(l)]}});
  assert.equal(created.closedReason,"team_handled");await ok(l,`repair/tickets/${created.id}/handover`,"POST",{reason:"needs technician"});
  await ok(e,`repair/tickets/${created.id}/follow`,"POST",{});const following=await ok(e,`repair/tickets/${created.id}`);assert.equal(following.viewerRelation,"subscriber");
  assert.equal((await call(e,`repair/tickets/${created.id}/follow`,"POST",{})).error.code,"ALREADY_FOLLOWING");
 });
 await t.test("role matrix versioning, guard rules, custom role and user assignment",async()=>{
  newRole=await ok(s,"settings/roles","POST",{name:"Native custom role",description:"test"});
  const matrix=await ok(s,"settings/permissions"),changed=await ok(s,"settings/permissions","PUT",{version:matrix.version,changes:[{roleId:newRole.id,permission:"repair.ticket.report",granted:true}]});assert.equal(changed.version,matrix.version+1);
  assert.equal((await call(s,"settings/permissions","PUT",{version:matrix.version,changes:[]})).error.code,"VERSION_CONFLICT");
  const adminRole=(await ok(s,"settings/roles")).find((r:Row)=>r.key==="admin");assert.equal((await call(a,`settings/roles/${adminRole.id}`,"PATCH",{name:"bad",updatedAt:adminRole.updatedAt})).error.details.rule,"OWN_ROLE");
  const real=await upsertSSO("native-real-sub",{USER:"NATIVE-REAL",FIRSTNAME_TH:"ทดสอบ"},{});await ok(s,`settings/users/${real.id}/role`,"PUT",{roleId:newRole.id});const profile=await ok(s,`settings/users/${real.id}`);assert.equal(profile.role.id,newRole.id);assert.equal(profile.roleHistory.length,1);
  assert.equal((await call(s,`settings/roles/${newRole.id}`,"DELETE")).error.code,"ROLE_IN_USE");
 });
 await t.test("category/symptom CRUD, optimistic versions and in-use protection",async()=>{
  const type=buildingTypesFromBuildings(buildings);
  const cat=await ok(s,"settings/categories","POST",{name:"Native category",icon:"wrench",defaultPriority:"high",buildingTypeIds:[type]});
  const symptom=await ok(s,`settings/categories/${cat.id}/symptoms`,"POST",{name:"Native symptom",priority:"critical"});assert.equal(symptom.priority,"critical");
  const changed=await ok(s,`settings/categories/${cat.id}`,"PATCH",{name:"Native category changed",updatedAt:cat.updatedAt});assert.equal(changed.name,"Native category changed");
  assert.equal((await call(s,`settings/categories/${cat.id}`,"PATCH",{name:"stale",updatedAt:cat.updatedAt})).error.code,"VERSION_CONFLICT");
  await ok(s,`settings/symptoms/${symptom.id}`,"DELETE");await ok(s,`settings/categories/${cat.id}`,"DELETE");assert.equal((await call(s,`settings/categories/${categoryId}`,"DELETE")).error.code,"IN_USE");
 });
 await t.test("assets, labels, printed-code lock and location versioning",async()=>{
  const types=await ok(s,"settings/asset-types"),type=types[0];const suggestion=await ok(s,`settings/assets/suggest-code?assetTypeId=${type.id}&roomId=${roomId}`);assert.ok(suggestion.code);
  const asset=await ok(s,"settings/assets","POST",{roomId,assetTypeId:type.id,code:"NATIVE-ASSET",name:"Native equipment"});assetId=asset.id;assert.equal(asset.labelStatus,"never");
  const printed=await ok(s,"settings/assets/labels/printed","POST",{assetIds:[assetId]});assert.equal(printed[0].labelStatus,"current");
  assert.equal((await call(s,`settings/assets/${assetId}`,"PATCH",{code:"NEW-CODE",updatedAt:asset.updatedAt})).error.code,"ASSET_CODE_LOCKED");
  await ok(e,"repair/assets/NATIVE-ASSET");
  const tree=await ok(s,"settings/buildings"),building=tree.find((b:Row)=>b.id===buildingId);const renamed=await ok(s,`settings/buildings/${buildingId}`,"PATCH",{name:building.name+" test",updatedAt:building.updatedAt});assert.ok(renamed.name.endsWith(" test"));
  const labels=await ok(s,`settings/assets/labels?buildingId=${buildingId}`);assert.equal(labels.find((r:Row)=>r.id===assetId).labelStatus,"changed");
  await ok(s,`settings/buildings/${buildingId}`,"PATCH",{name:building.name,updatedAt:renamed.updatedAt});
  await ok(a,`repair/assets/${assetId}/deactivate`,"POST");
 });
 await t.test("automatic closure and session/photo cleanup run without Go",async()=>{
  await db.query("UPDATE repair.tickets SET auto_close_at=now()-interval '1 hour' WHERE status='resolved'");
  const result=await maintenance();assert.ok(!result.skipped);assert.equal((await db.query("SELECT count(*) FROM repair.tickets WHERE status='resolved' AND auto_close_at<=now()")).rows[0].count,0);
  const audits=await ok(s,"settings/audit?type=permissions");assert.ok(audits.length);
 });
 }finally{await db.end();await rm(photoDir,{recursive:true,force:true});}
});
function buildingTypesFromBuildings(buildings:Row[]) {return buildings[0].buildingType.id;}
