import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify } from "jose";
import type { parseConfig } from "./config";
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest();
export const challenge = (verifier: string) => hashToken(verifier).toString("base64url");
export function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\r\n\\]/.test(next) || /^\/(api\/|login|signed-out)/.test(next)) return "/";
  return next;
}
export interface Flow { s: string; v: string; n: string; e: number }
export function signFlow(secret: string, flow: Flow): string {
  const payload = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return payload + "." + createHmac("sha256", secret).update(payload).digest("base64url");
}
export function verifyFlow(secret: string, value: string, now = Date.now() / 1000): Flow {
  const [payload, signature, extra] = value.split(".");
  const want = createHmac("sha256", secret).update(payload ?? "").digest("base64url");
  if (extra !== undefined || !signature || !equal(signature, want)) throw new Error("Invalid flow");
  const f: Flow = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (!f || typeof f.s !== "string" || !f.s || typeof f.v !== "string" || !f.v || typeof f.n !== "string" || !Number.isFinite(f.e) || f.e < now) throw new Error("Invalid flow");
  return { ...f, n: safeNext(f.n) };
}
export async function validateIDToken(raw: string, c: ReturnType<typeof parseConfig>, now = new Date()) {
  const { payload } = await jwtVerify(raw, new TextEncoder().encode(c.SSO_CLIENT_SECRET), {
    algorithms: ["HS256"], audience: c.SSO_CLIENT_ID, requiredClaims: ["exp", "sub"],
    clockTolerance: c.clockSkew, currentDate: now,
  });
  if (typeof payload.sub !== "string" || !payload.sub.trim()) throw new Error("Missing subject");
  if (payload.iat !== undefined && (typeof payload.iat !== "number" || payload.iat > now.getTime() / 1000 + c.clockSkew)) throw new Error("Invalid issued time");
  const missingIssuer = !Object.hasOwn(payload, "iss");
  if (!missingIssuer && (typeof payload.iss !== "string" || payload.iss.trim().replace(/\/+$/, "") !== c.SSO_ISSUER)) throw new Error("Invalid issuer");
  return { payload, missingIssuer };
}
