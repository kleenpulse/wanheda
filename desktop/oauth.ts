/*
 * GitHub's and Google's authorize pages, so main can tell when a page starts
 * an OAuth sign-in in one of its windows (V68). The hosted app (preview,
 * packaged) then signs in through the system browser instead
 * (desktop/handoff.ts); `desktop:dev` sends GitHub to its own auth window.
 */

export type Provider = "github" | "google";

/** Each provider's authorize page, as Better Auth builds it. */
const AUTHORIZE: Readonly<Record<Provider, { host: string; path: string }>> = {
  github: { host: "github.com", path: "/login/oauth/authorize" },
  google: { host: "accounts.google.com", path: "/o/oauth2/v2/auth" },
};

/** The provider whose authorize page this is, or null. Exact host and path over https. */
export function authorizeProvider(url: URL): Provider | null {
  if (url.protocol !== "https:" || url.username || url.password) return null;
  for (const provider of Object.keys(AUTHORIZE) as Provider[]) {
    if (url.host === AUTHORIZE[provider].host && url.pathname === AUTHORIZE[provider].path) return provider;
  }
  return null;
}
