import "server-only";
import { config } from "./config";
import { transaction } from "./db";
import { assignSuperAdmins, demoUser } from "./service";
export async function initialize() {
  const c = config();
  await transaction(async db => {
    await db.query("SELECT pg_advisory_xact_lock(56001)");
    await assignSuperAdmins(db);
    if (!c.superAdmins.length) {
      const { rows } = await db.query(`SELECT 1 FROM platform.users u JOIN platform.user_roles ur USING(employee_code)
        JOIN platform.roles r ON r.id=ur.role_id WHERE r.key='super_admin' LIMIT 1`);
      if (!rows.length) console.warn(JSON.stringify({ event: "no_superadmin_configured" }));
    }
    if (c.roleSwitcher) for (const role of ["employee", "housekeeper_lead", "security_lead", "technician", "admin", "super_admin"]) await demoUser(role, db);
  });
}
