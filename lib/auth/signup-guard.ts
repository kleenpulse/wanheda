import { APIError } from "better-auth/api";

/**
 * Runs before Better Auth creates a user. Anyone may sign up (ADR-0015), but
 * only with a verified email: it is the account's identity and the admin
 * check reads it, so an unverified one is refused before any row exists.
 */
export function assertVerifiedSignup(user: { email: string; emailVerified: boolean }): void {
  if (!user.emailVerified || !user.email.trim()) {
    throw new APIError("FORBIDDEN", { message: "Verify your email with GitHub first, then sign in again." });
  }
}
