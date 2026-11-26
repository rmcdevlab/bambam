import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

// Dedicated private config leaves existing database-mode .env.local intact.
const privateEnv = parseEnv(readFileSync(new URL("../.env.aok.local", import.meta.url), "utf8"));
if (!privateEnv.secret_key) throw new Error("Configure .env.aok.local first; see deploy/AOK.md");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ...privateEnv, is_aok: "true", APP_ENV: "development", DATABASE_URL: "",
    NEXT_PUBLIC_USE_MOCKS: "false", NEXT_PUBLIC_ROLE_SWITCHER: "false", NEXT_PUBLIC_BASE_PATH: "", NEXT_PUBLIC_API_BASE_URL: "/api/v1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.once("error", () => { console.error("Unable to start local API mode"); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
