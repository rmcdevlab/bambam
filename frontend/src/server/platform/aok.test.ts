import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { aokConfig, aokReadPath, AOK_HEADER, forwardAok, validAokKey } from "./aok";
import { isAok } from "@/lib/aok-mode";
import { parseConfig } from "./config";
import { pool } from "./db";
import { resolveRequest } from "./service";
import { testConfig } from "./test-config";

const key = "a".repeat(64), hash = createHash("sha256").update(key).digest("hex");
const original = { ...process.env };
test.afterEach(() => { process.env = { ...original }; });
const mode = () => {
  process.env = { NODE_ENV: "test", is_aok: "true", APP_ENV: "development", secret_key: key };
};

test("API mode validates independently of database and SSO config and fails closed", () => {
  assert.equal(isAok({}), false);
  assert.equal(isAok({ is_aok: "false" }), false);
  assert.ok(aokConfig({ is_aok: "true", APP_ENV: "development", secret_key: key }));
  for (const patch of [{ is_aok: "TRUE" }, { APP_ENV: "production" }, { NEXT_PUBLIC_USE_MOCKS: "true" }, { secret_key: "short" },
    { aok_api_url: "http://prod.test/api/v1" }, { aok_api_url: "https://user:pass@prod.test/api/v1" }, { aok_api_url: "https://prod.test/api/v1?key=x" },
    { aok_api_url: "https://prod.test/api/v1#fragment" }, { aok_api_url: "https://prod.test/elsewhere" }]) {
    assert.throws(() => aokConfig({ is_aok: "true", APP_ENV: "development", secret_key: key, ...patch }));
  }
  mode();
  assert.throws(() => pool(), /disabled in API mode/);
  assert.throws(() => parseConfig({ ...testConfig, is_aok: "true" }), /unavailable in API mode/);
  assert.throws(() => parseConfig({ ...testConfig, AOK_SECRET_KEY_HASH: hash }), /configured together/);
  assert.equal(parseConfig(testConfig).DATABASE_URL, testConfig.DATABASE_URL);
});

test("key verification accepts only the configured digest and supports revocation", () => {
  assert.ok(validAokKey(key, hash));
  assert.ok(!validAokKey("b".repeat(64), hash));
  assert.ok(!validAokKey(key, undefined));
  assert.ok(!validAokKey(key, "invalid"));
  assert.ok(!validAokKey("", hash));
});

test("read allowlist rejects auth, dev, internal, unknown and encoded path escapes", () => {
  for (const path of ["/api/v1/me", "/api/v1/repair/tickets", "/api/v1/repair/photos/photo-id", "/api/v1/settings/roles"]) assert.ok(aokReadPath(path));
  for (const path of ["/api/auth/login", "/api/v1/dev/role-switch", "/api/internal/maintenance", "/api/v1/repair/missing",
    "/api/v1/repair/tickets/x/progress", "/api/v1/repair/photos/%2f", "/api/v1/repair/photos/%252e%252e", "/api/v1/repair/photos/%ZZ", "/api/v1/repair/photos/.."]) assert.ok(!aokReadPath(path));
});

test("forwarder preserves query/binary response and isolates credentials and response headers", async () => {
  mode();
  const request = new NextRequest("http://127.0.0.1:3000/api/v1/repair/photos/id?size=thumb", {
    headers: { cookie: "bam_session=private", authorization: "Bearer hostile", [AOK_HEADER]: "hostile", "x-forwarded-host": "evil.test" },
  });
  const response = await forwardAok(request, async (input, init) => {
    assert.equal(String(input), "https://rmc.cipcloud.net/bambam/api/v1/repair/photos/id?size=thumb");
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get(AOK_HEADER), key);
    for (const name of ["cookie", "authorization", "x-forwarded-host"]) assert.equal(headers.get(name), null);
    return new Response(new Uint8Array([0, 255, 17]), { headers: { "content-type": "image/png", "set-cookie": "secret=value", location: "https://evil.test" } });
  });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0, 255, 17]));
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("forwarder blocks writes, external clients, cross-origin callers and internal paths before fetching", async () => {
  mode();
  let fetched = false;
  const fetcher: typeof fetch = async () => { fetched = true; throw new Error("must not fetch"); };
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal((await forwardAok(new NextRequest("http://localhost:3000/api/v1/repair/tickets", { method }), fetcher)).status, 403);
  }
  assert.equal((await forwardAok(new NextRequest("http://external.test/api/v1/me"), fetcher)).status, 403);
  assert.equal((await forwardAok(new NextRequest("http://localhost:3000/api/v1/me", { headers: { origin: "https://evil.test" } }), fetcher)).status, 403);
  assert.equal((await forwardAok(new NextRequest("http://localhost:3000/api/v1/me", { headers: { "sec-fetch-site": "cross-site" } }), fetcher)).status, 403);
  assert.equal((await forwardAok(new NextRequest("http://localhost:3000/api/internal/maintenance"), fetcher)).status, 404);
  assert.equal(fetched, false);
});

test("upstream errors are preserved; redirects and network errors do not fall back to DB", async () => {
  mode();
  const request = new NextRequest("http://localhost:3000/api/v1/me");
  for (const status of [403, 404, 500]) {
    const response = await forwardAok(request, async () => Response.json({ error: { code: "EXPECTED" } }, { status }));
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, "EXPECTED");
  }
  const rejected = await forwardAok(request, async () => Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
  assert.equal(rejected.status, 502);
  assert.equal((await rejected.json()).error.code, "AOK_CREDENTIAL_REJECTED");
  assert.equal((await forwardAok(request, async () => new Response(null, { status: 302, headers: { location: "https://evil.test" } }))).status, 502);
  const unavailable = await forwardAok(request, async () => { throw new Error(key); });
  assert.equal(unavailable.status, 502);
  assert.ok(!(await unavailable.text()).includes(key));
  assert.throws(() => pool(), /disabled in API mode/);
});

test("API principal reloads permissions per request and cannot override identity with cookies or headers", async () => {
  process.env = { ...testConfig, NODE_ENV: "test", AOK_SECRET_KEY_HASH: hash, AOK_EMPLOYEE_CODE: "READ-USER" };
  const db = pool(), originalQuery = db.query;
  let permissions = ["repair.ticket.view_all"], calls = 0;
  // Only the principal SELECT is stubbed; the real permission registry and request resolver run.
  db.query = (async (sql: string, args: unknown[]) => {
    calls++;
    assert.ok(sql.includes("WHERE u.employee_code=$1 AND NOT u.is_demo"));
    assert.deepEqual(args, ["READ-USER"]);
    return { rows: [{ id: "principal", employee_code: "READ-USER", role: "admin", permissions }] };
  }) as typeof db.query;
  try {
    const request = new NextRequest("https://prod.test/api/v1/me", { headers: { [AOK_HEADER]: key, cookie: "bam_session=other-user", "x-employee-code": "OTHER" } });
    assert.deepEqual((await resolveRequest(request)).user.permissions, permissions);
    permissions = [];
    assert.deepEqual((await resolveRequest(request)).user.permissions, []);
    assert.equal(calls, 2);
    process.env.AOK_SECRET_KEY_HASH = "b".repeat(64);
    await assert.rejects(resolveRequest(request), /invalid API credential/);
    assert.equal(calls, 2);
    await assert.rejects(resolveRequest(new NextRequest("https://prod.test/api/v1/repair/tickets", { method: "POST", headers: { [AOK_HEADER]: key } })), /read-only/);
    assert.equal(calls, 2);
  } finally { db.query = originalQuery; }
});
