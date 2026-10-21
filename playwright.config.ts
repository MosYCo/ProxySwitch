import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "tests/ui",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { outputFolder: "artifacts/ui-tests/report", open: "never" }]],
  outputDir: "artifacts/ui-tests/results",
  use: {
    baseURL: "http://127.0.0.1:13042",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 13042",
    url: "http://127.0.0.1:13042/docs/preview.html",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
