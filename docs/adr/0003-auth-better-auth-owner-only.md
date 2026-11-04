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
