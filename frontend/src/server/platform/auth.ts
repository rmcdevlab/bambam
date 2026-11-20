import { appPath, basePath } from "@/lib/app-path";
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "./config";
import { challenge, equal, randomToken, safeNext, signFlow, validateIDToken, verifyFlow } from "./crypto";
import { createSession, deleteSession, upsertSSO } from "./service";
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: basePath || "/" };
export function setSession(response: NextResponse, session: { token: string; expires: Date }) {
  response.cookies.set("bam_session", session.token, { ...cookieOptions, expires: session.expires, maxAge: Math.floor((session.expires.getTime() - Date.now()) / 1000) });
  response.cookies.set("bam_seen", "1", { ...cookieOptions, maxAge: 30 * 86400 });
}
function redirect(url: string) { return new NextResponse(null, { status: 302, headers: { Location: appPath(url) } }); }
function clearFlow(response: NextResponse) { response.cookies.set("bam_oidc", "", { ...cookieOptions, path: appPath("/api/auth"), maxAge: 0 }); return response; }
export async function login(request: NextRequest) {
  const c = config(), state = randomToken(), verifier = randomToken(48);
  const flow = { s: state, v: verifier, n: safeNext(request.nextUrl.searchParams.get("next")), e: Math.floor(Date.now() / 1000) + 600 };
  const url = new URL(c.SSO_AUTHORIZE_URL);
  for (const [key, value] of Object.entries({ response_type: "code", client_id: c.SSO_CLIENT_ID,
    redirect_uri: c.SSO_REDIRECT_URI, scope: c.SSO_SCOPE, state, code_challenge: challenge(verifier), code_challenge_method: "S256" })) url.searchParams.set(key, value);
  const response = redirect(url.toString());
  response.cookies.set("bam_oidc", signFlow(c.APP_SESSION_SECRET, flow), { ...cookieOptions, path: appPath("/api/auth"), maxAge: 600 });
  return response;
}
async function providerJSON(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error" });
  if (response.status !== 200) throw new Error("Provider request failed");
  // Bound decoded response size, including chunked bodies.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty provider response");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 1024 * 1024) throw new Error("Provider response too large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString());
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Invalid provider response");
  return value as Record<string, unknown>;
}
export async function callback(request: NextRequest) {
  const c = config(), params = request.nextUrl.searchParams;
  let reason = "state_invalid";
  const fail = () => {
    console.warn(JSON.stringify({ event: "sso_login_failed", reason }));
    return clearFlow(redirect(`/login?error=${reason}`));
  };
  if (params.get("error")) { reason = "sso_denied"; return fail(); }
  const raw = request.cookies.get("bam_oidc")?.value;
  if (!raw) { reason = "state_missing"; return fail(); }
  try {
    const flow = verifyFlow(c.APP_SESSION_SECRET, raw);
    reason = "state_mismatch";
    if (!equal(flow.s, params.get("state") ?? "")) return fail();
    reason = "code_missing";
    const code = params.get("code"); if (!code) return fail();
    reason = "token_exchange";
    const tokens = await providerJSON(c.SSO_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: c.SSO_REDIRECT_URI,
        client_id: c.SSO_CLIENT_ID, client_secret: c.SSO_CLIENT_SECRET, code_verifier: flow.v }) });
    if (typeof tokens.access_token !== "string" || !tokens.access_token || typeof tokens.id_token !== "string" || !tokens.id_token) return fail();
    reason = "id_token_invalid";
    const { payload, missingIssuer } = await validateIDToken(tokens.id_token, c);
    if (missingIssuer) console.warn(JSON.stringify({ event: "rmc_id_token_missing_iss_compatibility" }));
    reason = "userinfo";
    const info = await providerJSON(c.SSO_USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } });
    reason = "sub_mismatch";
    if (info.sub !== payload.sub) return fail();
    reason = "user_upsert";
    const user = await upsertSSO(payload.sub!, info, payload);
    reason = "session_create";
    const session = await createSession(user.id);
    const response = clearFlow(redirect(flow.n));
    setSession(response, session);
    return response;
  } catch { return fail(); }
}
export async function logout(request: NextRequest) {
  const c = config(), token = request.cookies.get("bam_session")?.value;
  if (token) {
    try { await deleteSession(token); }
    catch { console.error(JSON.stringify({ event: "session_delete_failed" })); }
  }
  const url = new URL(c.SSO_END_SESSION_URL);
  url.searchParams.set("client_id", c.SSO_CLIENT_ID);
  url.searchParams.set("post_logout_redirect_uri", c.SSO_POST_LOGOUT_REDIRECT_URI);
  url.searchParams.set("state", randomToken(16));
  const response = new NextResponse(null, { status: 303, headers: { Location: url.toString() } });
  for (const name of ["bam_session", "bam_seen"]) response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
