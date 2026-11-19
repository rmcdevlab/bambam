import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, connection } from "next/server";
import { ApiError } from "./errors";
const statuses = { invalid: 400, unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409, business_rule: 422, internal: 500 };
export function ok(data: unknown) { return NextResponse.json({ data }); }
export function endpoint(handler: (request: import("next/server").NextRequest) => Promise<NextResponse>) {
  return async (request: import("next/server").NextRequest) => {
    const id = randomUUID();
    let response: NextResponse;
    try { response = await handler(request); }
    catch (error) {
      const e = error instanceof ApiError ? error : new ApiError("internal", "INTERNAL", "internal error");
      if (!(error instanceof ApiError)) console.error(JSON.stringify({ event: "api_failed", request_id: id }));
      response = NextResponse.json({ error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}), ...(e.details !== undefined ? { details: e.details } : {}) } }, { status: statuses[e.kind] });
      if (e.kind === "unauthenticated") response.cookies.set("bam_session", "", { path: "/", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" });
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-ID", id);
    return response;
  };
}
// Keep framework prerender control flow outside the domain error boundary.
export function live(handler: (request: import("next/server").NextRequest) => Promise<NextResponse>) {
  return async (request: import("next/server").NextRequest) => {
    await connection();
    return handler(request);
  };
}

export function list(data:unknown,p:{page:number;pageSize:number},total:number) {
 return NextResponse.json({data,meta:{page:p.page,pageSize:p.pageSize,total:Number(total)}});
}
