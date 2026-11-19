import "./server-env";
import { Pool } from "pg";
import { migrate } from "./migrations";
const raw=process.env.E2E_DATABASE_URL;
if(!raw)throw new Error("E2E_DATABASE_URL is required");
const url=new URL(raw),name=decodeURIComponent(url.pathname.slice(1));
if(!/^[a-zA-Z0-9_]+$/.test(name)||!/(?:_e2e|_test)(?:_|$)/.test(name))throw new Error("Use a dedicated test database");
if(process.env.DATABASE_URL){const dev=new URL(process.env.DATABASE_URL);if(dev.host===url.host&&dev.pathname===url.pathname)throw new Error("Test database matches the development database");}
if(["localhost","127.0.0.1","::1"].includes(url.hostname)){
 const adminUrl=new URL(url);adminUrl.pathname="/postgres";const admin=new Pool({connectionString:adminUrl.toString(),connectionTimeoutMillis:3000});
 try{if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1",[name])).rowCount)await admin.query(`CREATE DATABASE "${name}"`);}finally{await admin.end();}
}
const db=new Pool({connectionString:raw,connectionTimeoutMillis:3000});
try{await migrate(db);}finally{await db.end();}
