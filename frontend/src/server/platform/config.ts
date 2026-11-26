import "server-only";
import { z } from "zod";
import { isAok } from "@/lib/aok-mode";

export function duration(value: string): number {
  // Existing Go duration env values remain valid (including compound values).
  const units: Record<string, number> = { h: 3600, m: 60, s: 1, ms: .001, us: .000001, ns: .000000001 };
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|us|ns|h|m|s)/g)];
  if (value === "0") return 0;
  if (!parts.length || parts.map(p => p[0]).join("") !== value) throw new Error("Invalid duration");
  return parts.reduce((sum, p) => sum + Number(p[1]) * units[p[2]], 0);
}
const schema = z.object({
  APP_ENV: z.enum(["development", "uat", "production"]),
  DATABASE_URL: z.string().url(),
  AOK_SECRET_KEY_HASH: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  AOK_EMPLOYEE_CODE: z.string().min(1).optional(),
  APP_SESSION_SECRET: z.string().min(32),
  APP_SESSION_TTL: z.string().default("12h"),
  SSO_CLOCK_SKEW: z.string().default("60s"),
  SSO_ISSUER: z.literal("https://rmc-sso.cipcloud.net"),
  SSO_AUTHORIZE_URL: z.string().url(), SSO_TOKEN_URL: z.string().url(),
  SSO_USERINFO_URL: z.string().url(), SSO_END_SESSION_URL: z.string().url(),
  SSO_CLIENT_ID: z.literal("bam"), SSO_CLIENT_SECRET: z.string().min(1),
  SSO_REDIRECT_URI: z.string().url(), SSO_POST_LOGOUT_REDIRECT_URI: z.string().url(),
  SSO_SCOPE: z.string().default("openid profile email offline_access"),
  ROLE_SWITCHER_ENABLED: z.enum(["true", "false"]).default("false"),
  PHOTO_STORAGE_DIR: z.string().optional(),
  MAINTENANCE_SCHEDULER: z.enum(["interval", "external"]).default("interval"),
  MAINTENANCE_JOB_SECRET: z.string().min(32).optional(),
  // How often the in-process scheduler runs maintenance (auto-close, expired sessions, orphan photos). Nothing in it
  // needs minute precision; dev uses `1m` so a shortened auto-close window shows up quickly.
  MAINTENANCE_INTERVAL: z.string().default("10m"),
  // How long a resolved ticket waits for the reporter before maintenance closes it (repair BR, 72 h). Dev / UAT may
  // shorten it to test auto-close (e.g. `5m`); production always uses 72 h.
  REPAIR_AUTO_CLOSE_AFTER: z.string().default("72h"),
  SUPER_ADMIN_EMPLOYEE_CODES: z.string().default(""),
});
export function parseConfig(source: Record<string, string | undefined>) {
  if (isAok(source)) throw new Error("Database configuration is unavailable in API mode");
  const parsed = schema.safeParse(source);
  // Never include input values in configuration errors.
  if (!parsed.success) throw new Error(`Invalid server configuration: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}`);
  const c = parsed.data;
  if (!!c.AOK_SECRET_KEY_HASH !== !!c.AOK_EMPLOYEE_CODE) throw new Error("AOK_SECRET_KEY_HASH and AOK_EMPLOYEE_CODE must be configured together");
  if (c.APP_ENV !== "development" && !c.PHOTO_STORAGE_DIR) throw new Error("PHOTO_STORAGE_DIR is required outside development");
  const sessionTTL = duration(c.APP_SESSION_TTL), clockSkew = duration(c.SSO_CLOCK_SKEW);
  const autoClose = duration(c.REPAIR_AUTO_CLOSE_AFTER);
  if (autoClose <= 0) throw new Error("Invalid REPAIR_AUTO_CLOSE_AFTER");
  const maintenanceInterval = duration(c.MAINTENANCE_INTERVAL);
  if (maintenanceInterval < 10 || maintenanceInterval > 24 * 3600) throw new Error("Invalid MAINTENANCE_INTERVAL");
  if (sessionTTL <= 0 || clockSkew > 600) throw new Error("Invalid session TTL or clock skew");
  if (c.APP_SESSION_SECRET === c.SSO_CLIENT_SECRET) throw new Error("Session and SSO secrets must differ");
  for (const key of ["SSO_AUTHORIZE_URL", "SSO_TOKEN_URL", "SSO_USERINFO_URL", "SSO_END_SESSION_URL"] as const) {
    if (new URL(c[key]).origin !== c.SSO_ISSUER) throw new Error(`Invalid provider origin: ${key}`);
  }
  return { ...c, sessionTTL, clockSkew,
    roleSwitcher: c.APP_ENV !== "production" && c.ROLE_SWITCHER_ENABLED === "true",
    maintenanceIntervalMs: Math.round(maintenanceInterval * 1000),
    repairAutoCloseMs: c.APP_ENV === "production" ? 72 * 3600_000 : Math.round(autoClose * 1000),
    superAdmins: [...new Set(c.SUPER_ADMIN_EMPLOYEE_CODES.split(",").map(s => s.trim()).filter(Boolean))],
    environment: c.APP_ENV === "production" ? null : c.APP_ENV === "uat" ? "UAT" : "DEV",
  };
}
export const config = () => parseConfig(process.env);
