import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  // Per-test contexts share their worker's Chromium process. Give the long
  // animation suites and crawler checks separate browser lifetimes.
  projects: [
    {
      name: "interactive",
      testIgnore: ["**/reveal.spec.ts", "**/seo.spec.ts"],
    },
    { name: "reveal", testMatch: "**/reveal.spec.ts" },
    { name: "seo", testMatch: "**/seo.spec.ts" },
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    },
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
  },
});
