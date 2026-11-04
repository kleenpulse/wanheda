import { APIError } from "better-auth/api";
import { isAllowedOwner } from "./allowlist";

/**
 * Runs before Better Auth creates a user. Only a verified email on the owner
 * allowlist gets an account; everyone else is refused before any row exists.
 * An empty allowlist refuses everyone (fail closed, SPEC V6).
 */
export function assertOwnerSignup(
  user: { email: string; emailVerified: boolean },
  owners: ReadonlySet<string>,
): void {
  if (!user.emailVerified || !isAllowedOwner(user.email, owners)) {
    throw new APIError("FORBIDDEN", { message: "This Wanheda belongs to someone else." });
  }
}
