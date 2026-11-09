import { defineConfig } from "@playwright/test";

// HTTP-level smoke test of the gate modes (SPEC V6, V8) against a production
// build. It uses only the `request` fixture, so no browser is installed.
//
// One build serves every mode: the gate reads env at request time. Each mode
// gets its own `next start` on its own port. No real database or OAuth app is
// needed: the proxy decides from env alone, and a cookieless request never
// reaches the database.
//
// Every variable the gate reads is set, and unused ones are set to "": Next's
// .env loader never overrides a variable that is already set, so a local
// .env.local cannot change the mode under test.

const GATED_PORT = 3101;
const LOCKED_PORT = 3102;
const DEMO_PORT = 3103;

// Not a real database: nothing in these tests may connect to it.
const DUMMY_DATABASE_URL = "postgresql://e2e@127.0.0.1:5432/e2e";

const COMMON = {
  NEXT_TELEMETRY_DISABLED: "1",
  VERCEL_ENV: "",
  DATABASE_URL_UNPOOLED: "",
};

const GATED_ENV = {
  ...COMMON,
  DATABASE_URL: DUMMY_DATABASE_URL,
  // Dummy values that only pass the length and shape checks.
  BETTER_AUTH_SECRET: "e2e-".repeat(10),
  BETTER_AUTH_URL: `http://localhost:${GATED_PORT}`,
  GITHUB_CLIENT_ID: "e2e-client-id",
  GITHUB_CLIENT_SECRET: "e2e-client-secret",
  GOOGLE_CLIENT_ID: "e2e-google-id",
  GOOGLE_CLIENT_SECRET: "e2e-google-secret",
  ADMIN_EMAILS: "admin@example.test",
};

const LOCKED_ENV = {
  ...COMMON,
  DATABASE_URL: DUMMY_DATABASE_URL,
  BETTER_AUTH_SECRET: "",
  BETTER_AUTH_URL: "",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  ADMIN_EMAILS: "",
};

// Zero env: no database and no auth (FRD Phase 0 exit: "builds and runs with
// zero env vars").
const DEMO_ENV = {
  ...LOCKED_ENV,
  DATABASE_URL: "",
};

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  projects: [
    { name: "gated", grep: /@gated/, use: { baseURL: `http://localhost:${GATED_PORT}` } },
    { name: "locked", grep: /@locked/, use: { baseURL: `http://localhost:${LOCKED_PORT}` } },
    { name: "demo", grep: /@demo/, use: { baseURL: `http://localhost:${DEMO_PORT}` } },
  ],
  // Needs a build first: `bun run build`, then `bun run test:e2e`.
  webServer: [
    {
      command: `bun run start -p ${GATED_PORT}`,
      url: `http://localhost:${GATED_PORT}/login`,
      env: GATED_ENV,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bun run start -p ${LOCKED_PORT}`,
      // Wait on the port, not a URL: Playwright does not count a 503 as up,
      // and locked mode answers 503 everywhere.
      port: LOCKED_PORT,
      env: LOCKED_ENV,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bun run start -p ${DEMO_PORT}`,
      url: `http://localhost:${DEMO_PORT}/login`,
      env: DEMO_ENV,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
