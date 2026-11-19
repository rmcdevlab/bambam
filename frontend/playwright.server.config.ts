import { defineConfig } from "@playwright/test";
import testEnv from "./scripts/test-env.cjs";

Object.assign(process.env, testEnv.env);

// Server tests use Playwright's runner without launching a browser or Next.js.
export default defineConfig({
  testDir: ".",
  testMatch: ["src/server/platform/*.test.ts", "scripts/*.test.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "off", video: "off", screenshot: "off" },
});
