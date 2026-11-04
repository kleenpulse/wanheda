import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
// Relative import: next.config.ts loads this file, and the `@/` alias is not
// resolved there.
import { parseOwnerEmails } from "../lib/auth/allowlist";

// Server environment schema. next.config.ts imports this module, so `next build`
// and `next start` validate the environment before any route runs.
//
// Every variable is optional: with none set, the app runs in demo mode on seed
// data (FRD D2/D3). A production deploy (VERCEL_ENV=production) must be fully
// configured instead: the database and every auth variable become required, so
// a misconfigured production build fails rather than deploying (SPEC V6).
//
// Runtime code asks `lib/capabilities.ts` what is configured. This module is
// the gate on the values themselves.

type RuntimeEnv = Record<string, string | undefined>;

export const PRODUCTION_REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "OWNER_EMAILS",
] as const;

const ownerEmails = z
  .string()
  .refine(
    (raw) => [...parseOwnerEmails(raw)].every((email) => z.email().safeParse(email).success),
    "OWNER_EMAILS must be a comma-separated list of email addresses",
  );

export function createServerEnv(runtimeEnv: RuntimeEnv) {
  const env = createEnv({
    server: {
      VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
      // Neon: pooled URL for the app, direct URL for drizzle-kit (ADR-0002).
      DATABASE_URL: z.url().optional(),
      DATABASE_URL_UNPOOLED: z.url().optional(),
      // Better Auth (ADR-0003). No fallback secret, ever.
      BETTER_AUTH_SECRET: z.string().min(32).optional(),
      BETTER_AUTH_URL: z.url().optional(),
      GITHUB_CLIENT_ID: z.string().min(1).optional(),
      GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
      OWNER_EMAILS: ownerEmails.optional(),
      // Home board weather (Open-Meteo, keyless). All three or none.
      WEATHER_LATITUDE: z.coerce.number().min(-90).max(90).optional(),
      WEATHER_LONGITUDE: z.coerce.number().min(-180).max(180).optional(),
      WEATHER_PLACE: z.string().min(1).max(60).optional(),
    },
    runtimeEnv: {
      VERCEL_ENV: runtimeEnv.VERCEL_ENV,
      DATABASE_URL: runtimeEnv.DATABASE_URL,
      DATABASE_URL_UNPOOLED: runtimeEnv.DATABASE_URL_UNPOOLED,
      BETTER_AUTH_SECRET: runtimeEnv.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: runtimeEnv.BETTER_AUTH_URL,
      GITHUB_CLIENT_ID: runtimeEnv.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: runtimeEnv.GITHUB_CLIENT_SECRET,
      OWNER_EMAILS: runtimeEnv.OWNER_EMAILS,
      WEATHER_LATITUDE: runtimeEnv.WEATHER_LATITUDE,
      WEATHER_LONGITUDE: runtimeEnv.WEATHER_LONGITUDE,
      WEATHER_PLACE: runtimeEnv.WEATHER_PLACE,
    },
    emptyStringAsUndefined: true,
  });

  if (env.VERCEL_ENV === "production") {
    const missing = PRODUCTION_REQUIRED.filter((name) =>
      name === "OWNER_EMAILS" ? parseOwnerEmails(env.OWNER_EMAILS).size === 0 : !env[name],
    );
    if (missing.length > 0) {
      throw new Error(`Production deploy is missing required environment variables: ${missing.join(", ")}`);
    }
  }

  return env;
}

export const env = createServerEnv(process.env);
