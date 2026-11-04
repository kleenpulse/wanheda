import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { authSettings, has, ownerEmails, type AuthSettings } from "@/lib/capabilities";
import { getDb, type Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { assertOwnerSignup } from "./signup-guard";

// Better Auth, owner only (FRD D3, ADR-0003): GitHub OAuth for the first
// sign-in, then passkeys. There is no email/password sign-in. Built lazily so
// importing this module never needs credentials.

function createAuth(db: Db, settings: AuthSettings) {
  const origin = settings.baseURL ? new URL(settings.baseURL) : undefined;
  return betterAuth({
    appName: "Wanheda",
    secret: settings.secret,
    ...(settings.baseURL ? { baseURL: settings.baseURL } : {}),
    database: drizzleAdapter(db, { provider: "pg", schema }),
    socialProviders: {
      github: {
        clientId: settings.githubClientId,
        clientSecret: settings.githubClientSecret,
      },
    },
    // GitHub access tokens are stored encrypted with the auth secret, so a
    // database copy, backup or dump never holds a usable token. Rotating
    // BETTER_AUTH_SECRET makes stored tokens unreadable; Wanheda does not use
    // them after sign-in, so that only costs a fresh GitHub sign-in.
    account: { encryptOAuthTokens: true },
    databaseHooks: {
      user: {
        create: {
          // Read the allowlist at call time, not from `settings`, so an edit to
          // OWNER_EMAILS applies without a restart.
          before: (user) => {
            assertOwnerSignup(user, ownerEmails());
            return Promise.resolve();
          },
        },
      },
    },
    telemetry: { enabled: false },
    plugins: [
      passkey({
        rpName: "Wanheda",
        ...(origin ? { rpID: origin.hostname, origin: origin.origin } : {}),
      }),
      // Must stay last: it sets cookies from server actions.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** The Better Auth instance, or null when auth is not configured. */
export function getAuth(): Auth | null {
  if (!has("auth")) return null;
  const settings = authSettings();
  const db = getDb();
  if (!settings || !db) return null;
  instance ??= createAuth(db, settings);
  return instance;
}
