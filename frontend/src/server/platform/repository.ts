import "server-only";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { config } from "./config";
import { ApiError, unauthenticated } from "./errors";
import { hashToken, randomToken } from "./crypto";

export interface User {
  id: string; employee_code: string; first_name_th: string | null; last_name_th: string | null;
  first_name_en: string | null; last_name_en: string | null; position_th: string | null;
  department: string | null; division: string | null; email: string | null; is_demo: boolean;
  role: string; role_name: string; permissions: string[];
}
const userQuery = `SELECT u.*, r.key AS role, r.name AS role_name,
  ARRAY(SELECT permission FROM platform.role_permissions WHERE role_id=r.id ORDER BY permission) AS permissions
  FROM platform.users u LEFT JOIN platform.user_roles ur ON ur.employee_code=u.employee_code
  JOIN platform.roles r ON r.id=ur.role_id OR (ur.role_id IS NULL AND r.key='employee')`;
export async function findUser(id: string, db: Pick<PoolClient, "query"> = pool()): Promise<User> {
  const { rows } = await db.query<User>(`${userQuery} WHERE u.id=$1`, [id]);
  if (!rows[0]) throw new ApiError("not_found", "USER_NOT_FOUND", "user not found");
  return rows[0];
}
export async function findSession(token: string | undefined) {
  if (!token) throw unauthenticated();
  const { rows } = await pool().query<{ user_id: string; origin_user_id: string | null }>(
    "SELECT user_id, origin_user_id FROM platform.sessions WHERE token_hash=$1 AND expires_at>now()", [hashToken(token)]);
  if (!rows[0]) throw unauthenticated();
  return { user: await findUser(rows[0].user_id), origin: rows[0].origin_user_id };
}
export async function createSession(userId: string, origin: string | null = null, db: Pick<PoolClient, "query"> = pool()) {
  const token = randomToken(), expires = new Date(Date.now() + config().sessionTTL * 1000);
  await db.query("INSERT INTO platform.sessions(token_hash,user_id,origin_user_id,expires_at) VALUES($1,$2,$3,$4)", [hashToken(token), userId, origin, expires]);
  return { token, expires };
}
export async function deleteSession(token: string, db: Pick<PoolClient, "query"> = pool()) {
  await db.query("DELETE FROM platform.sessions WHERE token_hash=$1", [hashToken(token)]);
}
export async function assignSuperAdmins(db: Pick<PoolClient, "query"> = pool()) {
  for (const code of config().superAdmins) {
    const result = await db.query(`INSERT INTO platform.user_roles(employee_code,role_id)
      SELECT $1,id FROM platform.roles WHERE key='super_admin'
      ON CONFLICT(employee_code) DO UPDATE SET role_id=EXCLUDED.role_id,updated_at=now()`, [code]);
    if (result.rowCount !== 1) throw new Error("Superadmin role missing; apply migrations first");
  }
}
// Existing seeded identities and names are kept. Custom roles receive a demo user on demand.
export async function demoUser(role: string, db: PoolClient): Promise<User> {
  const { rows: roles } = await db.query<{ id: string; name: string }>("SELECT id,name FROM platform.roles WHERE key=$1", [role]);
  if (!roles[0]) throw new ApiError("invalid", "VALIDATION_FAILED", "validation failed", { role: "INVALID" });
  const { rows: users } = await db.query<{ id: string }>(`${userQuery} WHERE u.is_demo AND r.key=$1 ORDER BY u.employee_code LIMIT 1`, [role]);
  if (users[0]) return findUser(users[0].id, db);
  const seeds: Record<string, string[]> = {
    employee: ["DEMO-EMPLOYEE", "วรรณา", "สุขประเสริฐ", "ฝ่ายบัญชี", "พนักงานบัญชีอาวุโส"],
    housekeeper_lead: ["DEMO-HOUSEKEEPER-LEAD", "มาลี", "ทองดี", "ฝ่ายอาคารสถานที่", ""],
    security_lead: ["DEMO-SECURITY-LEAD", "สมศักดิ์", "แก้วกล้า", "ฝ่ายอาคารสถานที่", ""],
    technician: ["DEMO-TECHNICIAN", "ธนากร", "พึ่งบุญ", "ฝ่ายอาคารสถานที่", ""],
    admin: ["DEMO-ADMIN", "ปวีณา", "ศรีสุข", "ศูนย์จัดการงานอาคาร", ""],
    super_admin: ["DEMO-SUPER-ADMIN", "ณัฐพล", "อินทรวงศ์", "ฝ่ายเทคโนโลยีสารสนเทศ", "เจ้าหน้าที่ระบบ"],
  };
  const [code, first, last, department, position] = seeds[role] ?? [`DEMO-${role.toUpperCase()}`, "ผู้ใช้ตัวอย่าง", roles[0].name, "", ""];
  const { rows } = await db.query<{ id: string }>(`INSERT INTO platform.users(employee_code,first_name_th,last_name_th,department,position_th,is_demo)
    VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(employee_code) DO UPDATE SET updated_at=now()
    WHERE platform.users.is_demo RETURNING id`, [code, first, last, department || null, position || null]);
  if (!rows[0]) throw new Error("Demo employee code already belongs to a real user");
  await db.query(`INSERT INTO platform.user_roles(employee_code,role_id) VALUES($1,$2)
    ON CONFLICT(employee_code) DO UPDATE SET role_id=EXCLUDED.role_id,updated_at=now()`, [code, roles[0].id]);
  return findUser(rows[0].id, db);
}
export async function findDemoUsers() {
  const { rows } = await pool().query<{ role: string; role_name: string; first_name_th: string | null; last_name_th: string | null; first_name_en: string | null; last_name_en: string | null; employee_code: string | null }>(`
    SELECT r.key AS role,r.name AS role_name,d.* FROM platform.roles r LEFT JOIN LATERAL (
      SELECT u.first_name_th,u.last_name_th,u.first_name_en,u.last_name_en,u.employee_code
      FROM platform.users u LEFT JOIN platform.user_roles ur ON ur.employee_code=u.employee_code
      LEFT JOIN platform.roles dr ON dr.id=ur.role_id
      WHERE u.is_demo AND coalesce(dr.key,'employee')=r.key ORDER BY u.employee_code LIMIT 1
    ) d ON true ORDER BY r.sort_order,r.created_at,r.key`);
  return rows;
}
export async function saveSSOUser(values: (string | null)[], db: PoolClient): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`INSERT INTO platform.users(employee_code,sso_subject,
    first_name_th,last_name_th,first_name_en,last_name_en,email,department,division,position_th,last_login_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(employee_code) DO UPDATE SET
    sso_subject=EXCLUDED.sso_subject,first_name_th=EXCLUDED.first_name_th,last_name_th=EXCLUDED.last_name_th,
    first_name_en=EXCLUDED.first_name_en,last_name_en=EXCLUDED.last_name_en,email=EXCLUDED.email,
    department=EXCLUDED.department,division=EXCLUDED.division,position_th=EXCLUDED.position_th,last_login_at=now(),updated_at=now()
    RETURNING id`, values);
  return rows[0].id;
}
export async function recordRoleSwitch(origin: string, demoId: string, role: string, from: string, db: PoolClient) {
  await db.query(`INSERT INTO platform.audit_log(actor_user_id,action,target_type,target_id,data)
    VALUES($1,'dev.role_switch','user',$2,$3)`, [origin, demoId, { role, fromUserId: from }]);
}
