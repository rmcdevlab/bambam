import { randomBytes, createHash } from "node:crypto";
import { open, unlink } from "node:fs/promises";

const code = process.argv[2];
if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) throw new Error("Usage: npm run aok:issue -- <existing employee_code>");
const key = randomBytes(48).toString("base64url");
const hash = createHash("sha256").update(key).digest("hex");
const local = new URL("../.env.aok.local", import.meta.url);
const production = new URL("../.env.aok.production.local", import.meta.url);
const created = [];
try {
  for (const [file, body] of [
    [local, `is_aok=true\naok_api_url=https://rmc.cipcloud.net/bambam/api/v1\nsecret_key=${key}\n`],
    [production, `AOK_SECRET_KEY_HASH=${hash}\nAOK_EMPLOYEE_CODE=${code}\n`],
  ]) {
    const handle = await open(file, "wx", 0o600);
    created.push(file);
    try { await handle.writeFile(body); } finally { await handle.close(); }
  }
} catch (error) {
  await Promise.all(created.map(file => unlink(file)));
  throw error;
}
console.log("Created private .env.aok.local and .env.aok.production.local (0600). No secret printed. See deploy/AOK.md before activating.");
