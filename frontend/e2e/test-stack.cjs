// CR-056: one Next.js server with an isolated PostgreSQL database; shared by Playwright and Atlas.
/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const { env: testEnv, required } = require("../scripts/test-env.cjs");
const DATABASE_URL = required("E2E_DATABASE_URL");
const WEB_PORT = Number(testEnv.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${WEB_PORT}`;
const API_URL = BASE_URL;

/** Isolated Next.js server and Node demo-session CLI environment. */
const apiEnv = {
  APP_ENV: "development", DATABASE_URL, ROLE_SWITCHER_ENABLED: "true", SUPER_ADMIN_EMPLOYEE_CODES: testEnv.E2E_SUPER_ADMIN_EMPLOYEE_CODES ?? "",
  APP_SESSION_SECRET: required("E2E_APP_SESSION_SECRET"), APP_SESSION_TTL: "12h",
  SSO_ISSUER: required("E2E_SSO_ISSUER"), SSO_CLIENT_ID: required("E2E_SSO_CLIENT_ID"), SSO_CLIENT_SECRET: required("E2E_SSO_CLIENT_SECRET"),
  SSO_AUTHORIZE_URL: required("E2E_SSO_AUTHORIZE_URL"),
  SSO_TOKEN_URL: required("E2E_SSO_TOKEN_URL"),
  SSO_USERINFO_URL: required("E2E_SSO_USERINFO_URL"),
  SSO_END_SESSION_URL: required("E2E_SSO_END_SESSION_URL"),
  SSO_REDIRECT_URI: required("E2E_SSO_REDIRECT_URI"), SSO_POST_LOGOUT_REDIRECT_URI: required("E2E_SSO_POST_LOGOUT_REDIRECT_URI"),
  MAINTENANCE_SCHEDULER: "external", PHOTO_STORAGE_DIR: path.join(ROOT,"frontend","data","e2e-photos"),
  REPAIR_AUTO_CLOSE_AFTER: "72h", // pinned: a shortened local value in frontend/.env must not leak into F21
};
const webEnv = { ...apiEnv, NEXT_PUBLIC_USE_MOCKS: "false", NEXT_PUBLIC_ROLE_SWITCHER: "true", NEXT_DIST_DIR: testEnv.E2E_DIST_DIR ?? ".next-e2e" };

const PREPARE = `node "${path.join(__dirname, "test-stack.cjs")}" prepare`;

/** One Next.js server; prepare migrates only the isolated database. */
const servers = [
  { command: `${PREPARE} && npx next dev --port ${WEB_PORT}`, cwd: path.join(ROOT,"frontend"), url: `${BASE_URL}/api/v1/health`, env: webEnv, timeout: 240_000 },
];

/** Readable target without the password, e.g. "bambam_e2e @ localhost:5433". */
const mask = (url) => { const u = new URL(url); return `${decodeURIComponent(u.pathname.slice(1))} @ ${u.hostname}:${u.port || "5432"}`; };
const DATABASE_LABEL = mask(DATABASE_URL);

/** Development DATABASE_URL from the ignored local environment; never printed. */
function devDatabaseUrl() {
  try {
    const line = require("node:fs").readFileSync(path.join(ROOT,"frontend",".env.local"),"utf8").split(/\r?\n/).find(l=>/^\s*DATABASE_URL\s*=/.test(l));
    return line ? line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g,"") : null;
  } catch { return null; }
}

/** Guard 1: the test database must not be the dev database (same host, port and database name). */
function assertNotDevDb() {
  const dev = devDatabaseUrl();
  if (dev && mask(dev) === DATABASE_LABEL) {
    throw new Error(`E2E_DATABASE_URL points at the dev database (${DATABASE_LABEL}) — use a separate database, e.g. bambam_e2e`);
  }
}

/** Guard 2: the API under test really uses the test database — a session created there must be accepted by it. */
async function assertApiUsesTestDb() {
  const token = sessionToken("employee");
  const res = await fetch(`${API_URL}/api/v1/me`, { headers: { cookie: `bam_session=${token}` } }).catch((e) => ({ status: 0, e }));
  if (res.status !== 200) {
    throw new Error(`the API at ${API_URL} does not accept a session from ${DATABASE_LABEL} (HTTP ${res.status}) — it is running on another database; stop it and run again`);
  }
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

/** Create a missing local test database and apply the native migration runner. */
function prepare() {
  assertNotDevDb();
  run(process.execPath,["--conditions=react-server","--import","tsx","scripts/test-db.mts"],{
    cwd:path.join(ROOT,"frontend"),env:{...process.env,E2E_DATABASE_URL:DATABASE_URL,DATABASE_URL:devDatabaseUrl()??""},
  });
}
function sessionToken(role) {
  assertNotDevDb();
  return run(process.execPath,["--conditions=react-server","--import","tsx","scripts/session.mts",role],{
    cwd:path.join(ROOT,"frontend"),env:{...process.env,...apiEnv},
  }).trim();
}

/** One line that says where a run goes; printed by e2e and shown in the Atlas header. */
const describe = () => `web ${BASE_URL} · API ${API_URL} · DB ${DATABASE_LABEL}`;

module.exports = { DATABASE_URL, DATABASE_LABEL, API_URL, WEB_PORT, BASE_URL, apiEnv, webEnv, servers, prepare, sessionToken, assertNotDevDb, assertApiUsesTestDb, describe };

// node frontend/e2e/test-stack.cjs browse [role]  — a Chromium window on the test web, signed in as the demo user
// of `role` (default admin). Real SSO cannot sign in on the test stack; this is the manual way in.
if (require.main === module && process.argv[2] === "browse") {
  const role = process.argv[3] ?? "admin";
  (async () => {
    const { chromium } = require("@playwright/test");
    assertNotDevDb();
    const token = sessionToken(role);
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: null, locale: "th-TH", timezoneId: "Asia/Bangkok" });
    await ctx.addCookies([{ name: "bam_session", value: token, domain: "localhost", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { timeout: 180_000 });
    console.log(`signed in as demo ${role} → ${describe()} (close the window to stop; switch roles with the role switcher)`);
    browser.on("disconnected", () => process.exit(0));
  })().catch((e) => { console.error(`browse failed: ${String(e.stderr || e.message).trim()}`); process.exit(1); });
}

if (require.main === module && process.argv[2] === "prepare") {
  try {
    prepare();
    console.log(`test database ready: ${DATABASE_LABEL}`);
  } catch (e) {
    console.error(`test-stack prepare failed: ${String(e.stderr || e.message).trim()}`);
    console.error("Start PostgreSQL (from repo root: docker compose --env-file frontend/.env.local up -d db), then retry.");
    process.exit(1);
  }
}
