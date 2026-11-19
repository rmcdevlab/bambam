import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { migrate } from "../../../scripts/migrations";
import { testConfig } from "./test-config";
import { pool, transaction } from "./db";
import { createSession, getUser, upsertSSO, resolveSession, switchRole } from "./service";
import { initialize } from "./initialize";
import { currentUser, roleSwitch, demoUsers, ready } from "./controllers";
import { callback, login, logout } from "./auth";
import { signFlow } from "./crypto";

const databaseUrl = process.env.CR056_TEST_DATABASE_URL;
test("CR-056 real PostgreSQL migration, session and auth parity", async () => {
  test.skip(!databaseUrl, "Set CR056_TEST_DATABASE_URL to run PostgreSQL integration tests");
  const url = new URL(databaseUrl!);
  if (!/^\/bambam_cr056_test(?:_\w+)?$/.test(url.pathname)) throw new Error("Use a dedicated bambam_cr056_test database");
  Object.assign(process.env, testConfig, { DATABASE_URL: databaseUrl, SUPER_ADMIN_EMPLOYEE_CODES: "CR056-SUPER" });
  const db = pool();
  const ids: string[] = [];
  const directory = await mkdtemp(resolve(tmpdir(), "cr056-migrations-"));
  try {
    await test.step("all existing Goose migrations apply; rerun preserves history and data", async () => {
      await migrate(db);
      const before = await db.query("SELECT * FROM public.goose_db_version ORDER BY id");
      assert.ok(before.rows.length > 20);
      assert.deepEqual(await migrate(db), []);
      assert.deepEqual((await db.query("SELECT * FROM public.goose_db_version ORDER BY id")).rows, before.rows);
    });
    await test.step("migration SQL and version insert roll back together", async () => {
      await cp(resolve(process.cwd(), "db/migrations"), directory, { recursive: true });
      await writeFile(resolve(directory, "20990101000000_cr056_failure.sql"), "-- +goose Up\nCREATE TABLE public.cr056_should_rollback(id int); SELECT * FROM cr056_missing_table;\n-- +goose Down\nDROP TABLE public.cr056_should_rollback;");
      await assert.rejects(migrate(db, directory));
      assert.equal((await db.query("SELECT to_regclass('public.cr056_should_rollback') AS relation")).rows[0].relation, null);
      assert.equal((await db.query("SELECT 1 FROM public.goose_db_version WHERE version_id=20990101000000")).rowCount, 0);
    });
    await initialize();
    await test.step("Node migration and demo-session CLIs work without Go or Goose", async () => {
      execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/migrate.mts"], { env: process.env });
      const token = execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/session.mts", "employee"], { env: process.env, encoding: "utf8" }).trim();
      assert.equal((await resolveSession(token)).user.role, "employee");
    });
    const employee = await upsertSSO("cr056-person", { USER: "CR056-EMP", FIRSTNAME_TH: " ทดสอบ ", LASTNAME_TH: "ระบบ", LINE_USER_ID: "must-not-store" }, {}); ids.push(employee.id);
    const admin = await upsertSSO("cr056-super", { USER: "CR056-SUPER" }, {}); ids.push(admin.id);
    await test.step("first login defaults employee; env superadmin and claim refresh preserve identity", async () => {
      assert.equal(employee.role, "employee"); assert.equal(admin.role, "super_admin");
      const updated = await upsertSSO("cr056-person", { USER: "CR056-EMP", FIRSTNAME_TH: "ใหม่" }, {});
      assert.equal(updated.id, employee.id); assert.equal(updated.first_name_th, "ใหม่");
      await assert.rejects(upsertSSO("missing-employee", {}, {}));
    });
    await test.step("Go SHA256 session format resolves and request reloads role changes", async () => {
      const token = randomBytes(32).toString("base64url");
      await db.query("INSERT INTO platform.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [createHash("sha256").update(token).digest(), employee.id]);
      assert.equal((await resolveSession(token)).user.id, employee.id);
      await db.query("INSERT INTO platform.user_roles(employee_code,role_id) SELECT $1,id FROM platform.roles WHERE key='technician' ON CONFLICT(employee_code) DO UPDATE SET role_id=EXCLUDED.role_id", ["CR056-EMP"]);
      assert.equal((await resolveSession(token)).user.role, "technician");
      assert.equal((await currentUser(new NextRequest("http://localhost/api/v1/me", { headers: { Cookie: `bam_session=${token}` } }))).status, 200);
    });
    await test.step("expired, unknown and missing sessions return 401 and clear stale cookies", async () => {
      const session = await createSession(employee.id);
      await db.query("UPDATE platform.sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [employee.id]);
      for (const token of [undefined, "unknown", session.token]) {
        const response = await currentUser(new NextRequest("http://localhost/api/v1/me", { headers: token ? { Cookie: `bam_session=${token}` } : {} }));
        assert.equal(response.status, 401); assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
        assert.equal(response.cookies.get("bam_session")?.value, "");
      }
    });
    await test.step("role switching replaces session with demo identity and writes origin audit atomically", async () => {
      const session = await createSession(employee.id), switched = await switchRole(session.token, "admin");
      assert.ok(switched.user.is_demo); assert.equal(switched.user.role, "admin");
      assert.equal((await resolveSession(switched.token)).origin, employee.id);
      await assert.rejects(resolveSession(session.token));
      const audit = await db.query("SELECT * FROM platform.audit_log WHERE actor_user_id=$1 AND action='dev.role_switch'", [employee.id]);
      assert.equal(audit.rows[0].data.fromUserId, employee.id);
      assert.equal((await getUser(employee.id)).role, "technician");
      const invalid = await roleSwitch(new NextRequest("http://localhost/api/v1/dev/role-switch", { method: "POST", headers: { Cookie: `bam_session=${switched.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ role: "unknown" }) }));
      assert.equal(invalid.status, 400);
      assert.equal((await demoUsers(new NextRequest("http://localhost/api/v1/dev/demo-users", { headers: { Cookie: `bam_session=${switched.token}` } }))).status, 200);
      await assert.rejects(transaction(async client => { await client.query("SELECT 1"); throw new Error("rollback"); }));
    });
    await test.step("production gates demo routes before session checks", async () => {
      process.env.APP_ENV = "production";
      assert.equal((await roleSwitch(new NextRequest("http://localhost/api/v1/dev/role-switch", { method: "POST" }))).status, 404);
      assert.equal((await demoUsers(new NextRequest("http://localhost/api/v1/dev/demo-users"))).status, 404);
      process.env.APP_ENV = "development";
    });
    await test.step("readiness requires secret and checks the actual database", async () => {
      assert.equal((await ready(new NextRequest("http://localhost/health/ready"))).status, 401);
      assert.deepEqual(await (await ready(new NextRequest("http://localhost/health/ready", { headers: { Authorization: `Bearer ${testConfig.SSO_CLIENT_SECRET}` } }))).json(), { ready: true });
    });
    await test.step("login sets secure signed PKCE flow and rejects callback without state", async () => {
      const response = await login(new NextRequest("http://localhost/api/auth/login?next=//evil.test"));
      const location = new URL(response.headers.get("location")!);
      assert.equal(location.searchParams.get("code_challenge_method"), "S256");
      assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
      assert.match(response.headers.get("set-cookie")!, /Secure/);
      assert.equal((await callback(new NextRequest("http://localhost/api/auth/callback/rmc-sso?code=never-exchanged"))).headers.get("location"), "/login?error=state_missing");
    });
    await test.step("callback verifies provider tokens/userinfo, upserts user and creates session; logout revokes it", async () => {
      const originalFetch = globalThis.fetch;
      const providerAccessToken = randomBytes(32).toString("base64url");
      const token = await new SignJWT({ sub: "cr056-person", aud: "bam", exp: Math.floor(Date.now()/1000)+600 }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(testConfig.SSO_CLIENT_SECRET));
      let mismatched = false;
      globalThis.fetch = async (input, init) => {
        if (String(input) === testConfig.SSO_TOKEN_URL) {
          assert.equal(new URLSearchParams(String(init?.body)).get("code_verifier"), "pkce-verifier");
          return Response.json({ access_token: providerAccessToken, id_token: token });
        }
        assert.equal((init?.headers as Record<string,string>).Authorization, `Bearer ${providerAccessToken}`);
        return Response.json({ sub: mismatched ? "another-person" : "cr056-person", USER: "CR056-EMP" });
      };
      try {
        const flow = signFlow(testConfig.APP_SESSION_SECRET, { s: "state", v: "pkce-verifier", n: "/repair/my", e: Math.floor(Date.now()/1000)+600 });
        const request = () => new NextRequest("http://localhost/api/auth/callback/rmc-sso?state=state&code=code", { headers: { Cookie: `bam_oidc=${flow}` } });
        const response = await callback(request());
        assert.equal(response.headers.get("location"), "/repair/my");
        const sessionToken = response.cookies.get("bam_session")!.value;
        assert.equal((await resolveSession(sessionToken)).user.id, employee.id);
        mismatched = true;
        assert.equal((await callback(request())).headers.get("location"), "/login?error=sub_mismatch");
        const signedOut = await logout(new NextRequest("http://localhost/api/auth/logout", { method: "POST", headers: { Cookie: `bam_session=${sessionToken}` } }));
        assert.equal(signedOut.status, 303); assert.equal(new URL(signedOut.headers.get("location")!).origin, testConfig.SSO_ISSUER);
        await assert.rejects(resolveSession(sessionToken));
      } finally { globalThis.fetch = originalFetch; }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
    for (const id of ids) {
      await db.query("DELETE FROM platform.sessions WHERE user_id=$1 OR origin_user_id=$1", [id]);
      await db.query("DELETE FROM platform.audit_log WHERE actor_user_id=$1", [id]);
      await db.query("DELETE FROM platform.users WHERE id=$1", [id]);
    }
    await db.query("DELETE FROM platform.user_roles WHERE employee_code IN ('CR056-EMP','CR056-SUPER')");
    await db.end();
  }
});
