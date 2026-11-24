import catalog from "./catalog.json";
import { randomBytes } from "node:crypto";
import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { parseConfig, duration } from "./config";
import { challenge, equal, safeNext, signFlow, validateIDToken, verifyFlow } from "./crypto";
import { effectivePermissions, permissionKeys } from "./permissions";
import { testConfig } from "./test-config";
const c = parseConfig(testConfig), now = new Date("2026-11-19T00:00:00Z"), time = now.getTime() / 1000;
async function token(claims: Record<string, unknown> = {}, algorithm = "HS256", secret = c.SSO_CLIENT_SECRET) {
  return new SignJWT({ sub: "person-1", aud: "bam", exp: time + 600, iat: time, ...claims })
    .setProtectedHeader({ alg: algorithm }).sign(new TextEncoder().encode(secret));
}
test("PKCE RFC7636 S256 vector and constant-time comparison", () => {
  assert.equal(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.ok(equal("same", "same")); assert.ok(!equal("same", "other"));
});
test("safe redirect keeps local paths and rejects open redirects", () => {
  assert.equal(safeNext("/repair/my?x=1"), "/repair/my?x=1");
  for (const path of [null, "https://evil.test", "//evil.test", "/\\evil.test", "/\nevil", "/api/auth/login", "/login?next=/", "/signed-out"]) assert.equal(safeNext(path), "/");
});
test("signed Go-compatible flow rejects tampering, expiration and malformed claims", () => {
  const f = { s: "state", v: "verifier", n: "/repair/my", e: time + 600 }, signed = signFlow(c.APP_SESSION_SECRET, f);
  assert.deepEqual(verifyFlow(c.APP_SESSION_SECRET, signed, time), f);
  for (const value of [signed + "x", signed + ".extra", "invalid", signFlow(c.APP_SESSION_SECRET, { ...f, e: time - 1 }), signFlow(c.APP_SESSION_SECRET, { ...f, v: "" })]) assert.throws(() => verifyFlow(c.APP_SESSION_SECRET, value, time));
});
test("SSO accepts valid HS256 with provider issuer or provider-specific missing issuer", async () => {
  assert.equal((await validateIDToken(await token(), c, now)).missingIssuer, true);
  assert.equal((await validateIDToken(await token({ iss: c.SSO_ISSUER + "/" }), c, now)).missingIssuer, false);
});
for (const [name, claims] of Object.entries({ issuer: { iss: "https://evil.test" }, nullIssuer: { iss: null }, audience: { aud: "other" }, expired: { exp: time - 61 }, missingExp: { exp: undefined }, missingSub: { sub: "" }, futureIssued: { iat: time + 61 }, notBefore: { nbf: time + 61 } })) {
  test(`SSO rejects ${name}`, async () => assert.rejects(validateIDToken(await token(claims), c, now)));
}
test("SSO rejects wrong signature and algorithm", async () => {
  await assert.rejects(validateIDToken(await token({}, "HS256", randomBytes(48).toString("base64url")), c, now));
  await assert.rejects(validateIDToken(await token({}, "HS384", c.SSO_CLIENT_SECRET.repeat(2)), c, now));
});
test("permissions match live CR-006 registry: unknown filtered, settings editable, superadmin all", () => {
  assert.deepEqual(effectivePermissions("admin", []), []);
  assert.deepEqual(effectivePermissions("employee", ["unknown", "settings.assets.manage", "repair.ticket.report", "repair.ticket.report"]), ["repair.ticket.report", "settings.assets.manage"]);
  assert.deepEqual(effectivePermissions("super_admin", []), [...permissionKeys]);
});
test("config gates demo access in production and rejects invalid secrets/durations without values", () => {
  assert.equal(parseConfig({ ...testConfig, APP_ENV: "production" }).roleSwitcher, false);
  assert.equal(duration("1h30m"), 5400); assert.equal(duration("500ms"), .5);
  for (const patch of [{ APP_SESSION_SECRET: "short" }, { APP_SESSION_TTL: "0" }, { SSO_CLOCK_SKEW: "11m" }, { SSO_CLIENT_SECRET: c.APP_SESSION_SECRET }, { SSO_TOKEN_URL: "https://evil.test" }]) assert.throws(() => parseConfig({ ...testConfig, ...patch }));
  assert.throws(() => parseConfig({ ...testConfig, DATABASE_URL: "very-secret-invalid-value" }), error => error instanceof Error && !error.message.includes("very-secret"));
});
test("maintenance interval: 10 min by default, configurable within 10 s - 24 h", () => {
  assert.equal(c.maintenanceIntervalMs, 600_000);
  assert.equal(parseConfig({ ...testConfig, MAINTENANCE_INTERVAL: "1m" }).maintenanceIntervalMs, 60_000);
  for (const value of ["5s", "25h", "often"]) assert.throws(() => parseConfig({ ...testConfig, MAINTENANCE_INTERVAL: value }));
});
test("auto-close window: 72 h by default, shortened outside production only", () => {
  assert.equal(c.repairAutoCloseMs, 72 * 3600_000);
  assert.equal(parseConfig({ ...testConfig, REPAIR_AUTO_CLOSE_AFTER: "5m" }).repairAutoCloseMs, 300_000);
  assert.equal(parseConfig({ ...testConfig, APP_ENV: "production", PHOTO_STORAGE_DIR: "/data", REPAIR_AUTO_CLOSE_AFTER: "5m" }).repairAutoCloseMs, 72 * 3600_000);
  for (const value of ["0", "soon"]) assert.throws(() => parseConfig({ ...testConfig, REPAIR_AUTO_CLOSE_AFTER: value }));
});

test("permission registry matches the complete matrix catalog", () => {
  assert.deepEqual(catalog.flatMap(system=>system.groups.flatMap(group=>group.permissions.map(p=>p.key))),[...permissionKeys]);
});
