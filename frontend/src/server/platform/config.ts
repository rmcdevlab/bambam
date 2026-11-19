import "server-only";
import { z } from "zod";

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
  SUPER_ADMIN_EMPLOYEE_CODES: z.string().default(""),
});
export function parseConfig(source: Record<string, string | undefined>) {
  const parsed = schema.safeParse(source);
  // Never include input values in configuration errors.
  if (!parsed.success) throw new Error(`Invalid server configuration: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}`);
  const c = parsed.data;
  if (c.APP_ENV !== "development" && !c.PHOTO_STORAGE_DIR) throw new Error("PHOTO_STORAGE_DIR is required outside development");
  const sessionTTL = duration(c.APP_SESSION_TTL), clockSkew = duration(c.SSO_CLOCK_SKEW);
  if (sessionTTL <= 0 || clockSkew > 600) throw new Error("Invalid session TTL or clock skew");
  if (c.APP_SESSION_SECRET === c.SSO_CLIENT_SECRET) throw new Error("Session and SSO secrets must differ");
  for (const key of ["SSO_AUTHORIZE_URL", "SSO_TOKEN_URL", "SSO_USERINFO_URL", "SSO_END_SESSION_URL"] as const) {
    if (new URL(c[key]).origin !== c.SSO_ISSUER) throw new Error(`Invalid provider origin: ${key}`);
  }
  return { ...c, sessionTTL, clockSkew,
    roleSwitcher: c.APP_ENV !== "production" && c.ROLE_SWITCHER_ENABLED === "true",
    superAdmins: [...new Set(c.SUPER_ADMIN_EMPLOYEE_CODES.split(",").map(s => s.trim()).filter(Boolean))],
    environment: c.APP_ENV === "production" ? null : c.APP_ENV === "uat" ? "UAT" : "DEV",
  };
}
export const config = () => parseConfig(process.env);
