import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // clipboard tests must run serially to avoid interference
  retries: process.env.CI ? 2 : 0,
  workers: 1, // one worker — clipboard is a shared system resource
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    // Grant clipboard permissions so tests can read what was written
    permissions: ["clipboard-read", "clipboard-write"],
    // Chromium is required — Firefox and WebKit handle clipboard differently
    // and Web Workers behave differently in each. We test the primary target.
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the Vite dev server automatically before running tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
