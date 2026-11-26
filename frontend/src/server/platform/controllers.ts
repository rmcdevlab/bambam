import "server-only";
import type { QueryConfig } from "pg";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "./config";
import { equal } from "./crypto";
import { pool } from "./db";
import { ApiError } from "./errors";
import { endpoint, ok } from "./http";
import { listDemoUsers, me, resolveSession, resolveRequest, switchRole } from "./service";
import { setSession } from "./auth";

export const currentUser = endpoint(async request => ok(me((await resolveRequest(request)).user)));
function requireDev() {
  if (!config().roleSwitcher) throw new ApiError("not_found", "NOT_FOUND", "not found");
}
export const demoUsers = endpoint(async request => {
  requireDev();
  await resolveSession(request.cookies.get("bam_session")?.value);
  return ok(await listDemoUsers());
});
export const roleSwitch = endpoint(async request => {
  requireDev();
  const token = request.cookies.get("bam_session")?.value;
  await resolveSession(token);
  const invalid = () => new ApiError("invalid", "VALIDATION_FAILED", "validation failed", { role: "INVALID" });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw invalid();
  let body: unknown;
  try { body = await request.json(); } catch { throw invalid(); }
  if (!body || typeof body !== "object" || !("role" in body) || typeof body.role !== "string") throw invalid();
  const result = await switchRole(token!, body.role);
  const response = ok(me(result.user)); setSession(response, result); return response;
});
export async function ready(request: NextRequest) {
  if (!equal(request.headers.get("authorization") ?? "", `Bearer ${config().SSO_CLIENT_SECRET}`)) return NextResponse.json({ ready: false }, { status: 401 });
  try { await pool().query({ text: "SELECT 1", query_timeout: 3000 } as QueryConfig & { query_timeout: number }); return NextResponse.json({ ready: true }); }
  catch { return NextResponse.json({ ready: false }, { status: 503 }); }
}
