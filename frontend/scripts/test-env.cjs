/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { parseEnv } = require("node:util");

// Test credentials never fall back to application secrets or database credentials.
const file = join(__dirname, "..", ".env.test.local");
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}), ...process.env };
/** @param {string} key */
function required(key) {
  const value = env[key];
  if (!value) throw new Error(`Missing ${key}; configure frontend/.env.test.local or inject it in the environment`);
  return value;
}
module.exports = { env, required };
