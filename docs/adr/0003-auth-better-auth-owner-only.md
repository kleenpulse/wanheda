# ADR-0003: Auth is Better Auth, owner-only, with gate modes

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D3, §5.2, Phase 0.

## Context

Wanheda holds personal financial data for one person. Nobody else should ever get in. The app must also run with zero env vars (demo mode), and it must never serve real data without a login gate.

No past project has a Better Auth passkey setup or sign-up refusal, so this part is written new.

## Decision

- **Better Auth** with **passkey + GitHub OAuth**.
- An `OWNER_EMAILS` allowlist. Anyone else is refused at sign-up. An empty list refuses everyone.
- Sessions are cookies. `proxy.ts` gates every route except `/login`, the auth API and webhooks.
- Server actions read the user from the session. They never trust a client-sent user id. `requireOwner()` re-checks the allowlist on every server read.
- Global data fetches never run while logged out. This avoids the 401 → redirect → `/login` loop (rawstash §B14).

### Gate modes (fail closed)

One function, `gateMode()`, decides access. Both `proxy.ts` and the server-side owner check use it.

| Mode | When | What happens |
|---|---|---|
| `demo` | No database **and** no auth configured | The app is open and shows seed data only. |
| `locked` | A database is configured but auth is not | Every route returns 503. Real data is never served without a gate. |
| `gated` | Auth is configured | Unauthenticated requests redirect to `/login`. |

- When `VERCEL_ENV` is `production`, the env schema makes the auth variables and `DATABASE_URL` **required**. A misconfigured production build fails instead of deploying.
- An empty `OWNER_EMAILS` counts as "auth not configured".

### Deploy environments (Phase 0 CP3)

- **Two GitHub OAuth apps**, because an OAuth app has exactly one callback URL: "Wanheda (local)" for `http://localhost:3000` and "Wanheda" for the production URL. Each has its own client secret, and production and local use different `BETTER_AUTH_SECRET`s.
- **Previews get no database and no auth variables**, so they run demo mode on seed data. They hold no real data and no secret, even when a pushed branch changes the gate code (ADR-0002). Preview hosts change per deploy and can't match an OAuth callback anyway.
- **Preview deployments are off** (2026-11-04, the user, to save Vercel resources): `vercel.json` sets `git.deploymentEnabled` to `"**": false, "main": true`, so only `main` deploys and branch pushes create no deployment at all. The Preview rules above still apply if previews are turned back on.
- **OAuth tokens are stored encrypted** (`account.encryptOAuthTokens: true`, keyed by `BETTER_AUTH_SECRET`), so a database copy, backup or dump never holds a usable GitHub token. Rotating the secret makes stored tokens unreadable, which only costs a fresh GitHub sign-in.
- Passkeys bind to the hostname of `BETTER_AUTH_URL`. Moving production to another domain means registering passkeys again.
- **A new Vercel project's first deployment is always Production**, whatever its branch (Vercel's rule). Wanheda's first one was the PR #2 branch build, which ran with the production variables on the production domain for about 7 minutes before the merge (SPEC §B1; the code was the reviewed tree). For any new project, the first push must be `main`, and `scripts/setup-deploy.sh` checks that the production branch is `main`.

## Consequences

### In 6 months

- Only the owner can log in on the deployed URL. A second GitHub account is refused.
- A renamed or missing env var locks the door (503) instead of opening it.
- The proxy is a UX layer. The real gate is `requireOwner()` in the shell layout and in every action.

### In 2 years

- Multi-user is still not a goal. Adding it would mean real RLS policies and a new ADR.
- Passkeys mean no passwords to store or leak.

## Alternatives considered

- **Auth.js / NextAuth.** Weaker passkey story. More glue for an allowlist.
- **Clerk or another hosted auth.** A third party in the login path of a financial app, plus a cost.
- **No auth, rely on a secret URL.** Not acceptable for financial data.
- **Proxy-only gate.** A proxy can be bypassed by a matcher mistake. The server check must exist too.

## Revisit when

- Wanheda ever gets a second user.
- Better Auth changes its passkey plugin or adapter in a breaking way.
- The desktop shell needs an offline login (Phase 8).
