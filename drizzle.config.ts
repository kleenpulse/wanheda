import { defineConfig } from "drizzle-kit";
import { directDatabaseUrl } from "./lib/db/url";

// `db:generate` needs no connection. `db:migrate` runs against the direct URL and
// only with the owner's go-ahead (reviewed SQL in drizzle/, never `push`).
const url = directDatabaseUrl({
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
});

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(url ? { dbCredentials: { url } } : {}),
});
