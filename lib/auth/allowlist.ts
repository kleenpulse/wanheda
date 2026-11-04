// The owner allowlist (`OWNER_EMAILS`), parsed. Pure and import-free: the env
// schema, the capability check, the sign-up guard and `requireOwner()` all read
// the list through here, so they can never disagree about who the owner is.

/** Comma-separated emails → a lower-cased set. Blank entries are dropped. */
export function parseOwnerEmails(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Case-insensitive. An empty allowlist admits nobody (fail closed). */
export function isAllowedOwner(email: string | null | undefined, owners: ReadonlySet<string>): boolean {
  if (!email) return false;
  return owners.has(email.trim().toLowerCase());
}
