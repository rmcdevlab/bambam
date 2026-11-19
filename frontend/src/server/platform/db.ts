import "server-only";
import { Pool, type PoolClient } from "pg";
import { config } from "./config";

const globalDb = globalThis as typeof globalThis & { bambamPool?: Pool };
export function pool(): Pool {
  if (!globalDb.bambamPool) {
    globalDb.bambamPool = new Pool({ connectionString: config().DATABASE_URL,
      max: 10, connectionTimeoutMillis: 3000, statement_timeout: 15000, query_timeout: 15000,
    });
    globalDb.bambamPool.on("error", () => console.error(JSON.stringify({ event: "database_pool_error" })));
  }
  return globalDb.bambamPool;
}
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
