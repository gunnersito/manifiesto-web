import { defineConfig, devices } from "@playwright/test";

// La API y el frontend los arranca el job de CI (o a mano en local); aquí solo
// se apunta a la web y se guardan trazas cuando algo falla.
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
