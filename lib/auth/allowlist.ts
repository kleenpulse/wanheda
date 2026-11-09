// The admin list (`ADMIN_EMAILS`), parsed. Pure and import-free: the env
// schema, the capability check and `requireAdmin()` all read the list through
// here, so they can never disagree about who is an admin. Anyone may sign up
// (ADR-0015); this list only decides who sees the admin page.

/** Comma-separated emails → a lower-cased set. Blank entries are dropped. */
export function parseEmailList(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Case-insensitive. An empty list holds nobody. */
export function isListed(email: string | null | undefined, list: ReadonlySet<string>): boolean {
  if (!email) return false;
  return list.has(email.trim().toLowerCase());
}
