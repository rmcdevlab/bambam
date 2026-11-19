import "server-only";
import { types, type PoolClient } from "pg";
import queries from "../sql/queries.json";
import { pool } from "./db";
import { ApiError } from "./errors";
// SQL rows are checked/mapped at the module boundary; the catalog is migrated from sqlc input.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type DB = Pick<PoolClient, "query">;
types.setTypeParser(20, Number);
types.setTypeParser(1082, value => value);
// Preserve PostgreSQL microseconds for optimistic concurrency tokens.
export function timestamp(value: string | Date): string {
  const raw=value instanceof Date?value.toISOString():value;
  const fraction=raw.match(/\.(\d+)(?:Z|[+-]\d)/)?.[1]??"";
  return new Date(raw).toISOString().replace(/\.\d{3}Z$/, "."+fraction.padEnd(6,"0")+"Z");
}
types.setTypeParser(1184, timestamp);
export async function query(name: keyof typeof queries, args: Row = {}, db: DB = pool()) {
  const entry = queries[name];
  return db.query<Row>(entry.sql, entry.params.map(p => args[p] ?? null));
}
export async function rows(name: keyof typeof queries, args: Row = {}, db?: DB) { return (await query(name,args,db)).rows; }
export async function one(name: keyof typeof queries, args: Row = {}, db?: DB, code = "NOT_FOUND") {
  const result = await rows(name,args,db);
  if (!result[0]) throw new ApiError("not_found",code,code.toLowerCase());
  return result[0];
}
export function camel(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z0-9])/g,(_,s)=>s.toUpperCase()),v]));
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: unknown, field="id"): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) invalid({[field]:value ? "INVALID":"REQUIRED"});
  return value as string;
}
export function invalid(fields: Record<string,string>): never { throw new ApiError("invalid","VALIDATION_FAILED","validation failed",fields); }
export function fail(code:string,kind:ConstructorParameters<typeof ApiError>[0]="business_rule", details?:unknown):never {
  throw new ApiError(kind,code,code.toLowerCase(),undefined,details);
}
export function text(value:unknown,field:string,max:number,required=false):string {
  if(value!=null && typeof value!=="string") invalid({[field]:"INVALID"});
  const s=typeof value==="string"?value.trim():"";
  if(required&&!s) invalid({[field]:"REQUIRED"});
  if([...s].length>max) invalid({[field]:"TOO_LONG"});return s;
}
export function ids(value:unknown,field:string,min=0,max=100):string[] {
  if(value!=null&&!Array.isArray(value)) invalid({[field]:"INVALID"});
  const result=[...new Set((value as unknown[]??[]).map(v=>uuid(v,field)))];
  if(result.length<min)invalid({[field]:"MIN_ITEMS"});if(result.length>max)invalid({[field]:"MAX_ITEMS"});return result;
}
export const nullable = (s:string)=>s||null;
export const ref=(row:Row,prefix:string)=>row[`${prefix}_id`]?{id:row[`${prefix}_id`],name:row[`${prefix}_name`]}:null;
export function page(url:URL) {
 const n=(key:string,d:number)=>Math.max(1,Number.parseInt(url.searchParams.get(key)??"",10)||d);
 const p=n("page",1),size=Math.min(n("pageSize",20),100);
 return {page:p,pageSize:size,page_limit:size,page_offset:(p-1)*size,lim:size,off:(p-1)*size};
}
export const escapeLike=(s:string)=>s.replace(/[\\%_]/g,c=>"\\"+c);
