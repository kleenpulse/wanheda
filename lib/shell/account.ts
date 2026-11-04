// Who the shell shows in the rail and the tab bar. A plain module: the shell
// layout (server) builds it from the owner decision and the client reads it.

export interface ShellAccount {
  kind: "owner" | "demo";
  name: string;
  email: string | null;
}

/** The demo account: no database and no auth, so nobody is signed in. */
export const DEMO_ACCOUNT: ShellAccount = { kind: "demo", name: "Demo", email: null };

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
  return account.kind === "owner" ? "Owner" : "Demo · seed data";
}
