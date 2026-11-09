import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { lastLoginMethod } from "better-auth/plugins";
import { authSettings, has, type AuthSettings } from "@/lib/capabilities";
import { getDb, type Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { LAST_METHOD_COOKIE } from "./last-method";
import { assertVerifiedSignup } from "./signup-guard";

// Better Auth (ADR-0003, ADR-0015): anyone may sign up with GitHub or Google
// OAuth, then add passkeys; each user sees only their own data. There is no email/password
// sign-in. Built lazily so importing this module never needs credentials.

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
      // Optional. Google reports email_verified, so the sign-up guard applies
      // as for GitHub. A Google email that matches an existing account links
      // to it (both sides verified), so one person keeps one Wanheda.
      ...(settings.google
        ? { google: { clientId: settings.google.clientId, clientSecret: settings.google.clientSecret, prompt: "select_account" as const } }
        : {}),
    },
    // GitHub access tokens are stored encrypted with the auth secret, so a
    // database copy, backup or dump never holds a usable token. Rotating
    // BETTER_AUTH_SECRET makes stored tokens unreadable; Wanheda does not use
    // them after sign-in, so that only costs a fresh GitHub sign-in.
    account: { encryptOAuthTokens: true },
    // Account deletion (V79). Every row is keyed to the user with ON DELETE
    // CASCADE, so deleting the user row deletes the rest. Better Auth refuses a
    // session older than a day (freshAge), so a stolen old cookie can't do it.
    // The HTTP routes stay closed: the deleteAccount action, which also checks
    // the typed email, is the only way in.
    user: { deleteUser: { enabled: true } },
    disabledPaths: ["/delete-user", "/delete-user/callback"],
    databaseHooks: {
      user: {
        create: {
          // A verified email only: it names the account and the admin check reads it.
          before: (user) => {
            assertVerifiedSignup(user);
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
      // The /login "Last used" badge (V81): a readable cookie with the method
      // name, set only when a sign-in succeeds. Nothing in the database.
      lastLoginMethod({ cookieName: LAST_METHOD_COOKIE }),
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
