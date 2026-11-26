import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { stripBasePath } from "@/lib/app-path";
import { isAok, isLoopback } from "@/lib/aok-mode";
import { matchesRoute } from "./routes";

export const AOK_HEADER = "x-bambam-api-key";
// Keep this snapshot explicit: adding a GET route must not automatically expose it
// to development credentials without reviewing its side effects and visibility.
const readPatterns: Record<string, string[]> = {
  repair: ["categories", "buildings", "me/recent-places", "photos/:id", "tickets", "tickets/:id",
    "technicians", "contractor-types", "contractors", "contractors/:id", "contractors/:id/jobs",
    "admin/overview", "asset-types", "floors/:id/plan", "floors/:id/room-plan", "assets/:code"],
  settings: ["roles", "permissions", "users", "users/:id", "audit", "audit/actors", "buildings",
    "rooms/:id/assets", "building-types", "assets/labels", "assets/suggest-code", "asset-types",
    "categories", "categories/:id/symptoms", "contractor-types"],
};
export function aokConfig(source: Record<string, string | undefined> = process.env) {
  if (!isAok(source)) return null;
  let url: URL;
  try { url = new URL(source.aok_api_url ?? "https://rmc.cipcloud.net/bambam/api/v1"); }
  catch { throw new Error("Invalid aok_api_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !url.pathname.replace(/\/$/, "").endsWith("/api/v1")) throw new Error("Invalid aok_api_url");
  if (!source.secret_key || !/^[A-Za-z0-9_-]{43,128}$/.test(source.secret_key)) throw new Error("Invalid secret_key");
  return { url: url.toString().replace(/\/$/, ""), key: source.secret_key };
}

// Only the existing reviewed read surface is available. Auth, dev and maintenance
// endpoints never accept this credential, even if a valid session is also sent.
export function aokReadPath(pathname: string): boolean {
  if (pathname === "/api/v1/me") return true;
  if (!pathname.startsWith("/api/v1/")) return false;
  let parts: string[];
  try { parts = pathname.slice(8).split("/").map(decodeURIComponent); } catch { return false; }
  if (parts.some(part => !part || part === "." || part === ".." || /[/\\%\u0000-\u0020]/.test(part))) return false;
  const moduleKey = parts.shift()!;
  return matchesRoute(moduleKey, "GET", parts) && (readPatterns[moduleKey] ?? []).some(pattern => {
    const segments = pattern.split("/");
    return segments.length === parts.length && segments.every((segment, i) => segment.startsWith(":") || segment === parts[i]);
  });
}

export function validAokKey(key: string, expectedHash: string | undefined): boolean {
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash) || !/^[A-Za-z0-9_-]{43,128}$/.test(key)) return false;
  return timingSafeEqual(createHash("sha256").update(key).digest(), Buffer.from(expectedHash, "hex"));
}

function error(code: string, status: number) {
  return NextResponse.json({ error: { code, message: code } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function forwardAok(request: NextRequest, fetcher: typeof fetch = fetch): Promise<NextResponse> {
  const c = aokConfig()!;
  if (!isLoopback(request.nextUrl.hostname)) return error("AOK_LOCAL_ONLY", 403);
  // Do not let a page on another origin use the local credential through CORS.
  const origin = request.headers.get("origin");
  if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") return error("FORBIDDEN", 403);
  const path = stripBasePath(request.nextUrl.pathname);
  if (request.method !== "GET") return error("AOK_READ_ONLY", 403);
  if (!aokReadPath(path)) return error("NOT_FOUND", 404);
  const target = new URL(c.url + path.slice("/api/v1".length) + request.nextUrl.search);
  let upstream: Response;
  const abort = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
  try {
    upstream = await fetcher(target, {
      method: "GET", headers: { Accept: "application/json, image/*", [AOK_HEADER]: c.key },
      cache: "no-store", redirect: "manual", signal: abort,
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return error("AOK_UPSTREAM_REDIRECT", 502);
    }
    if (upstream.status === 401) {
      await upstream.body?.cancel();
      // A rejected server credential is not an expired browser SSO session.
      return error("AOK_CREDENTIAL_REJECTED", 502);
    }
    // Buffer within the timeout, so response streams cannot keep a local request open indefinitely.
    const body = await upstream.arrayBuffer();
    const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "content-disposition", "x-request-id"]) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value);
    }
    return new NextResponse(upstream.status === 204 ? null : body, { status: upstream.status, headers });
  } catch { return error("AOK_UPSTREAM_UNAVAILABLE", 502); }
}
