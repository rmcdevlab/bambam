import "server-only";
import { pool } from "./db";
import { query,rows } from "./query";
import { deleteFile } from "../repair/photos";
const globalJobs=globalThis as typeof globalThis & {bambamJobs?:ReturnType<typeof setInterval>};
export async function maintenance() {
 const db=await pool().connect();let locked=false;
 try{
  locked=(await db.query("SELECT pg_try_advisory_lock(56004) AS locked")).rows[0].locked;
  if(!locked)return {skipped:true};
  await db.query("BEGIN");
  let closed;
  try{closed=await rows("repair.AutoCloseDueTickets",{now:new Date()},db);await query("repair.InsertAutoClosedEvents",{ticket_ids:closed.map(t=>t.id),now:new Date()},db);await db.query("COMMIT");}
  catch(error){await db.query("ROLLBACK");throw error;}
  const expired=await query("platform.DeleteExpiredSessions",{},db);
  const orphaned=await rows("repair.DeleteUnattachedPhotos",{older_than:new Date(Date.now()-24*3600000)},db);
  for(const p of orphaned)for(const key of new Set([p.storage_key,p.thumb_key]))await deleteFile(key);
  return {closed:closed.length,expiredSessions:expired.rowCount,orphanedPhotos:orphaned.length};
 }finally{if(locked)await db.query("SELECT pg_advisory_unlock(56004)");db.release();}
}
export function startJobs() {
 const mode=process.env.MAINTENANCE_SCHEDULER??"interval";
 if(!["interval","external"].includes(mode))throw new Error("Invalid MAINTENANCE_SCHEDULER");
 if(mode==="external"||globalJobs.bambamJobs)return;
 let running=false;
 const tick=async()=>{if(running)return;running=true;try{await maintenance();}catch{console.error(JSON.stringify({event:"maintenance_failed"}));}finally{running=false;}};
 globalJobs.bambamJobs=setInterval(tick,60000);globalJobs.bambamJobs.unref();void tick();
}
