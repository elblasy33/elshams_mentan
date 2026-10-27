import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL: process.env.E2E_URL ?? "http://localhost:3400", locale: "ar-EG", viewport: { width: 1360, height: 900 }, screenshot: "only-on-failure" },
  reporter: "list",
});
