import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = `${process.env.E2E_BASE_URL || ""}`.trim().replace(/\/$/, "");
const localBaseUrl = "http://127.0.0.1:4173";
const chromeExecutable = `${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || ""}`.trim();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 12_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl || localBaseUrl,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "node scripts/dev-server.mjs",
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: "4173",
        },
      },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromeExecutable
          ? { launchOptions: { executablePath: chromeExecutable } }
          : {}),
      },
    },
    {
      name: "webkit-mobile",
      use: {
        ...devices["iPhone 15"],
      },
    },
  ],
});
