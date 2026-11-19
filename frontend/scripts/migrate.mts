import "./server-env";
import { Pool } from "pg";
import { migrate } from "./migrations";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const database = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
try { for (const file of await migrate(database)) console.log(`Applied ${file}`); }
finally { await database.end(); }
