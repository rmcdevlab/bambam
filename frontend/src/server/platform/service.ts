import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "./db";
import { config } from "./config";
import type { User } from "./repository";
import { ApiError } from "./errors";
import { effectivePermissions } from "./permissions";
import * as repo from "./repository";
export { createSession, deleteSession, assignSuperAdmins } from "./repository";
export type { User } from "./repository";
function effective(user: repo.User): repo.User {
  return { ...user, permissions: effectivePermissions(user.role, user.permissions) };
}
export async function getUser(id: string, db?: Pick<PoolClient, "query">) { return effective(await repo.findUser(id, db)); }
export async function resolveSession(token: string | undefined) {
  const principal = await repo.findSession(token);
  return { ...principal, user: effective(principal.user) };
}
export async function demoUser(role: string, db: PoolClient) { return effective(await repo.demoUser(role, db)); }
export async function upsertSSO(subject: string, info: Record<string, unknown>, claims: Record<string, unknown>) {
  const get = (key: string) => {
    for (const source of [info, claims]) {
      const v = source[key];
      if ((typeof v === "string" && v.trim()) || typeof v === "number") return String(v).trim();
    }
    return "";
  };
  const code = get("USER");
  if (!code) throw new ApiError("invalid", "SSO_CLAIM_MISSING", "USER claim missing");
  return transaction(async db => {
    const id = await repo.saveSSOUser([code, subject, ...["FIRSTNAME_TH", "LASTNAME_TH", "FIRSTNAME_EN", "LASTNAME_EN", "EMAIL", "DEPARTMENT", "DIVISION", "POSITION_TH"].map(k => get(k) || null)], db);
    await repo.assignSuperAdmins(db);
    return getUser(id, db);
  });
}
export async function switchRole(oldToken: string, role: string) {
  const principal = await resolveSession(oldToken);
  return transaction(async db => {
    const demo = await demoUser(role, db), origin = principal.origin ?? principal.user.id;
    const session = await repo.createSession(demo.id, origin, db);
    await repo.deleteSession(oldToken, db);
    await repo.recordRoleSwitch(origin, demo.id, demo.role, principal.user.id, db);
    return { ...session, user: demo };
  });
}

export function displayName(u: User): string {
  return [u.first_name_th, u.last_name_th].map(s => s?.trim()).filter(Boolean).join(" ")
    || [u.first_name_en, u.last_name_en].map(s => s?.trim()).filter(Boolean).join(" ") || u.employee_code;
}
export function me(u: User) {
  return { id: u.id, employeeCode: u.employee_code, name: displayName(u), position: u.position_th,
    department: u.department, division: u.division, email: u.email, role: u.role, roleName: u.role_name,
    permissions: u.permissions, technicianCategories: [], isDemoUser: u.is_demo, environment: config().environment };
}
export async function listDemoUsers() {
  return (await repo.findDemoUsers()).map(r => ({ role: r.role, roleName: r.role_name,
    name: r.employee_code ? displayName(r as User) : `ผู้ใช้ตัวอย่าง ${r.role_name}` }));
}
