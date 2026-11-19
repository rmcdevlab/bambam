import "./server-env";
import { config } from "../src/server/platform/config";
import { pool, transaction } from "../src/server/platform/db";
import { createSession, demoUser } from "../src/server/platform/service";
try {
  if (!config().roleSwitcher) throw new Error("Demo sessions are disabled");
  const role = process.argv[2] ?? "employee";
  const session = await transaction(async db => createSession((await demoUser(role, db)).id, null, db));
  // Explicit local CLI output only, matching the old cmd/devsession interface.
  process.stdout.write(session.token + "\n");
} finally { await pool().end(); }
