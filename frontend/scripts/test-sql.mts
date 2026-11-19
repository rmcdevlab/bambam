import { Pool } from "pg";
const raw=process.env.E2E_DATABASE_URL;
if(!raw||!/(?:_e2e|_test)(?:_|$)/.test(new URL(raw).pathname))throw new Error("Dedicated test database required");
const db=new Pool({connectionString:raw,connectionTimeoutMillis:3000});
try{let sql="";for await(const chunk of process.stdin)sql+=chunk;
 const result=await db.query(sql),results=Array.isArray(result)?result:[result];
 for(const r of results)for(const row of r.rows)process.stdout.write(Object.values(row).map(v=>v==null?"":String(v)).join("|")+"\n");
}finally{await db.end();}
