import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  expect: { timeout: 2500 },
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173/netflix-shinsaku-book/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "iphone",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        browserName: "webkit",
      },
    },
    {
      name: "duo-open",
      use: {
        viewport: { width: 884, height: 1104 },
        hasTouch: true,
        browserName: "chromium",
      },
    },
    {
      name: "landscape",
      use: { viewport: { width: 1100, height: 800 }, browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173/netflix-shinsaku-book/",
    reuseExistingServer: !process.env.CI,
  },
});
