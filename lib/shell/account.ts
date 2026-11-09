// Who the shell shows in the rail and the tab bar. A plain module: the shell
// layout (server) builds it from the owner decision and the client reads it.
// "owner" is whoever is signed in: each user owns their own data (ADR-0015).

export interface ShellAccount {
  kind: "owner" | "demo";
  /** The user's id, or null in demo. Names this account's device stores (lib/device/scope.ts). */
  id: string | null;
  name: string;
  email: string | null;
  /** Shows the Admin page in the rail. Only a hint: /admin checks on the server. */
  admin: boolean;
}

/** The demo account: no database and no auth, so nobody is signed in. */
export const DEMO_ACCOUNT: ShellAccount = { kind: "demo", id: null, name: "Demo", email: null, admin: false };

/** "Isaac Gideon" → "IG", "octocat" → "O", "" → "?". Punctuation is not a word boundary. */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : words.slice(0, 1);
  const result = letters.map((word) => Array.from(word ?? "")[0] ?? "").join("");
  return result ? result.toUpperCase() : "?";
}

/** The one-line provenance under the name. */
export function accountMode(account: ShellAccount): string {
  if (account.kind === "demo") return "Demo · seed data";
  return account.admin ? "Admin" : "Signed in";
}
