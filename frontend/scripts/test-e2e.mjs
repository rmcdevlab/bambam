import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

// Keep browser output outside the repository and discard the test-only Next cache on exit.
const args = process.argv.slice(2);
const server = args[0] === "--server";
if (server) args.shift();
const output = await mkdtemp(join(tmpdir(), "bambam-e2e-"));
const dist = `.next-e2e-run-${process.pid}`;
const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--output", output, ...(server ? ["--config", "playwright.server.config.ts"] : []), ...args], {
  stdio: "inherit", env: {
    ...process.env, E2E_DIST_DIR: dist,
    ...(server ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --conditions=react-server` } : {}),
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
try {
  process.exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolveExit(code ?? 1));
  });
} finally {
  await Promise.all([rm(output, { recursive: true, force: true }), rm(resolve(dist), { recursive: true, force: true })]);
  if (!server) {
    const file = resolve("tsconfig.json");
    const config = JSON.parse(await readFile(file, "utf8"));
    config.include = config.include?.filter(entry => !entry.startsWith(`${dist}/`));
    await writeFile(file, JSON.stringify(config, null, 2) + "\n");
  }
}
