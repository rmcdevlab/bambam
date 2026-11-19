import { defineConfig, devices } from "@playwright/test";
import stack from "./e2e/test-stack.cjs";

// CR-056: one Next.js runtime and a separate PostgreSQL test database.
// Demo sessions are created through the Node CLI; no real SSO login is automated.

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: stack.BASE_URL,
    trace: "off",
    video: "off",
    screenshot: "off",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        // The 3D specs (F23, F31) switch to Chrome's new headless for WebGL (D-103). Software WebGL
        // (swiftshader) on the whole project delayed canvas / paint work on other pages by 10–30 s.
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // reused when already up (e.g. started by the Atlas runner) — both use the same ports and database
  webServer: stack.servers.map((s) => ({ ...s, reuseExistingServer: !process.env.CI })),
});
