# Hand-off — Phase 0: Foundation — Checkpoint 2 (env, DB, auth, gate)

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / checkpoint | Phase 0 — Checkpoint 2: env schema, capabilities + gate modes, DB, auth schema, Better Auth, proxy, `/login`, `(shell)` |
| Branch | `phase-0/env-db-auth` (worktree `D:\Vxrcel\wanheda-wt\env-db-auth`, no upstream set) |
| HEAD | `e2fd50b258a7cef7176b60112b71c79c01a098b4` — nothing committed on top; all CP2 work is uncommitted |
| Previous hand-off | docs/handoff/2026-11-04-phase-0-cp1-closed.md |

## State in one paragraph

§T13–T18 are built in the worktree and uncommitted. One function, `gateMode()` in `lib/capabilities.ts`, decides demo / locked / gated, and both `proxy.ts` and `requireOwner()` use it. Better Auth 1.7.14 runs GitHub + passkey with an `OWNER_EMAILS` sign-up guard. The DB layer is a lazy, nullable Neon HTTP client with a retrying fetch. The auth schema is written by hand and checked against Better Auth's own `getSchema()` by a test. `drizzle/0000_auth.sql` is generated and, with the user's go-ahead, **applied** to the Neon DB (`eu-central-1`, direct host). The readout microtype now uses Poppins (user request, mid-session). Waiting for Reviewer Checkpoint 1 on this diff, then the user's go-ahead to commit, push and open a PR.

## Done this session

- §T13 `env/server.ts` (`createServerEnv(runtime)`, every var optional, `VERCEL_ENV=production` ⇒ `PRODUCTION_REQUIRED` all present, else throw) and `env/client.ts`; `next.config.ts` imports both so `next build`/`next start` validate.
- §T14 `lib/capabilities.ts`: `has("db"|"auth")`, `databaseUrl()`, `ownerEmails()`, `authSettings()`, `gateMode()`. `auth` needs db + secret ≥ 32 + GitHub id/secret + a non-empty allowlist.
- §T15 `lib/db/{client,index,url}.ts`, `drizzle.config.ts` (unpooled URL, else strip `-pooler` from the first host label).
- §T16 `lib/db/schema/auth.ts` (user, session, account, verification, passkey; snake_case, timestamptz, RLS on), `bun run db:generate` → `drizzle/0000_auth.sql` + meta.
- §T17 `lib/auth/{allowlist,gate,signup-guard,server,owner,client}.ts`, `app/api/auth/[...all]/route.ts` (503 when auth is unconfigured).
- §T18 `proxy.ts`, `app/(auth)/login/page.tsx`, `app/(shell)/{layout,page}.tsx` (moved from `app/page.tsx`), `components/auth/{sign-in-panel,account-actions}.tsx`, `components/theme-toggle.tsx`, `components/ui/button.ts`.
- Settled the CP1 open item: removed `ignoreScripts` and set `"trustedDependencies": []` in `package.json` (relocked). An absent field would turn on Bun's built-in allowlist (`bun pm default-trusted`, 367 packages incl. esbuild); the empty list blocks every lifecycle script. `scripts/install-scripts.test.ts` guards it (Reviewer FIX 2).
- Poppins for the `readout` utility (`--font-label`), at the user's request.
- Docs: SPEC §C1, §I, §V6, §V15, §T11–T18 amended (via the `spec` skill); CHANGELOG; CLAUDE.md commands table (`db:generate`, `db:migrate`).
- Deps added (exact, all ≥ 7 days old, publishers checked on npm): `@t3-oss/env-nextjs` 0.13.11, `zod` 4.6.7, `drizzle-orm` 0.45.4, `@neondatabase/serverless` 1.2.0, `better-auth` 1.7.14, `@better-auth/passkey` 1.7.14, `server-only` 0.0.1; dev `drizzle-kit` 0.31.11.

## Verification (actual results, not intentions)

- Start of session: `git fetch`; `e2fd50b` is an ancestor of `origin/main`; one commit, author and committer both +0100; `forged-commits.sh origin/main` clean. `bun install`, tripwire clean, typecheck pass, 50 tests pass: matched the previous hand-off.
- End of session, in the worktree: `bun run tripwire` → `tripwire: clean`; `bun run typecheck` → pass; `bun run lint` → 0 problems; `bun run test` → **10 files, 192 passed, 0 failed** (188 before the Reviewer FIXes).
- Reviewer FIX 1 (open redirect): `safeNextPath` now also checks its normalised output; `/.//evil.example.com`, `/a/..//evil.example.com` and `/%2e//evil.example.com` → `/` (new rows in gate.test.ts).
- Mutation checks (made, run, then reverted): adding a required `account.issuer` column fails `auth.test.ts` ("no required column Better Auth never writes"); making `gateMode()` return `demo` when only the DB is set fails 6 gate tests.
- `bun run build` with a stripped environment: pass. `/` and `/login` are partial prerenders (only the Suspense skeleton is static), `/api/auth/[...all]` dynamic, proxy present.
- `bun run build` with `VERCEL_ENV=production` and only `DATABASE_URL` set: **fails** with "Production deploy is missing required environment variables: BETTER_AUTH_SECRET, BETTER_AUTH_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, OWNER_EMAILS".
- One zero-env build, started three times with different env (`next start -p 3917`, curl):
  - demo (no env): `/` 200 "Demo mode", `/login` 200 "No sign-in needed", `/api/auth/get-session` 503, 0 redirects.
  - locked (dummy `DATABASE_URL` only): `/`, `/money`, `/login`, `/api/auth/get-session` all 503; `/favicon.ico` 200.
  - gated (dummy DB + dummy auth vars): `/` → 307 `/login`; `/money` → 307 `/login?next=%2Fmoney`; `/login` 200 "Welcome back"; `/login?next=//evil.com` 200 (next ignored); following `/` ends at `/login` after **1** redirect.
  - gated + forged session cookie (both cookie names): the proxy passes it; `requireOwner()` refuses it. Response is 200 with a streamed `NEXT_REDIRECT;replace;/login;307` and no "Signed in as". It is not a 307 status because the static shell has already streamed.
- vxrcel-ui-design self-check: no hex/rgb, no white/black utilities in `app/` `components/`; reduced-motion backstop present; no `layoutId`; no `src/`/`pages/`. Item 6 (exactly three faces) is now four by the user's choice (SPEC V15 amended).
- Screenshots checked: `/login` Ember light 1280×800, `/login?error=not-owner` Nebula dark 390×844, `/` demo Nebula dark 390×844 (before and after Poppins), `/` demo Ember light 1280×800.
- With `"trustedDependencies": []`: `bun pm untrusted` lists all four script packages as blocked (esbuild 0.25.12, 0.28.2, 0.18.20 and unrs-resolver 1.12.2); `bun.lock` has `"trustedDependencies": []`; `require('sharp')` and `require('unrs-resolver')` load; drizzle-kit generate and migrate work without esbuild's postinstall. esbuild's `install.js` never ran on this machine: the first `bun add` blocked it while the old list named only sharp and unrs-resolver, and later installs changed nothing.
- `bun run db:migrate` (user's go-ahead, URL from the main repo's `.env.local` via `bun --env-file`, never printed): before, the DB had no tables and no `drizzle` schema; after, 5 public tables (account 13 cols, passkey 11, session 8, user 7, verification 6), RLS on all 5, 3 FKs with ON DELETE CASCADE, 12 indexes as in the SQL, `drizzle.__drizzle_migrations` holds 1 row (created_at 1793810952594 = `0000_auth` in `_journal.json`), `user` has 0 rows.
- Not verified: a real GitHub sign-in or passkey (no OAuth app yet); CI on this branch (not pushed).

## In progress / not finished

- Nothing half-done. Uncommitted: 10 modified/deleted tracked files and the untracked files from `git status` (new code, tests, `drizzle/`, both CP hand-offs).

## Decisions made

- **Auth schema by hand, not by CLI.** The 1.7 CLI is the `auth` package and pulls babel, prettier, `open` and more into the install for a one-off job. `lib/db/schema/auth.test.ts` compares the tables with `getSchema({ plugins: [passkey()] })` instead, so an upgrade that changes the shape fails CI.
- **No `account.issuer`.** The plan (from photographers) said 1.7 needs it. In 1.7.14 it is gone: `@better-auth/core` `schema-diff` says it existed only in 1.7.0–1.7.2, and a required column Better Auth never writes makes every insert fail.
- better-auth pinned to 1.7.14 (2026-10-26), the newest 1.7 release that passes the 7-day rule.
- `auth` capability implies db; auth vars without a DB = demo (no real data exists). `holdsRealData()` is the hook for later connectors (comment in `lib/capabilities.ts`).
- The sign-up guard also requires `emailVerified` (GitHub's primary-email verified flag).
- `getOwner()` calls `connection()` first, so the gate always runs at request time and can't be prerendered with build-time env.
- Locked mode 503s `/login` and `/api/auth` too ("every route", FRD D3); only static files pass.
- `?next=` accepts same-origin paths only and never `/login`.
- Timestamps are `timestamptz`; passkey FK cascades on user delete (Better Auth's default has no onDelete).
- No GitHub mark on the button: lucide 1.x has no brand icons, and the skill says brand marks are authored separately. The button is text plus `LogIn`.
- Poppins for `readout` only, weights 400/500 (user, mid-session). The status chip stays Geist Mono.

## Bugs found

- None in shipped code. During the session: two type errors (t3-env strict `runtimeEnv` keys; drizzle weak-type on `process.env`) and 20 lint errors (misused promises, void arrows, `require-await`, non-null assertion), all fixed before verification.

## Known problems and risks

- Gated mode still can't sign anyone in until the GitHub OAuth app and auth vars exist (CP3). The schema is in place.
- Local `.env.local` (main repo) has only `DATABASE_URL`, so a local run there is **locked** (503 everywhere). That is intended.
- In PPR pages, `requireOwner()` redirects arrive as a streamed redirect (status 200), not a 307. The proxy still gives a real 307 to cookieless requests; Playwright in CP3 should assert the final URL, not only the status.
- The login card is about 20 px taller than its skeleton (small layout shift). Cosmetic.
- Preview deploys (`VERCEL_ENV=preview`) with a Neon branch but no auth vars will be locked. CP3 must set auth vars for previews, or accept that.
- Still open from CP1: the private incident record's C2 list vs `scripts/tripwire.sh` (user's call).

## Next steps (in order)

1. Reviewer Checkpoint 1 on this diff (review request below).
2. Fix any FIX; user go-ahead → stage files explicitly → commit → push `phase-0/env-db-auth` → open a PR → Reviewer push check → user merges → Reviewer merge check.
3. Checkpoint 3 (`phase-0/deploy-and-exit`, §T19–T21): `vercel.json` fra1, Playwright smoke (gated + locked), wizard for the GitHub OAuth app, Vercel env and Neon integration, then prove the exit criteria on the deployed URL.

## Files to read first

- `lib/capabilities.ts`, `lib/auth/gate.ts`, `lib/auth/owner.ts`, `proxy.ts` (the gate)
- `env/server.ts`, `lib/auth/server.ts`, `lib/db/schema/auth.ts` + its test
- `SPEC.md` §V6–V9, §T13–T21
- `D:\Vxrcel\wanheda\FRD.md` (local only) §2 D2, D3, §10 Phase 0

## Env / services touched

- No new env var names (all eight were already in `.env.example`). Neon: migration `0000_auth` applied (user's go-ahead, 2026-11-04). No GitHub or Vercel changes. npm registry read-only (`npm view`).

## Review state (two-session model, §10.1)

- Checkpoint 2 cycle (`phase-0/env-db-auth`, base `e2fd50b`): diff review round 1 = **FIX** (FIX 1 open redirect via dot-segments in `safeNextPath`; FIX 2 absent `trustedDependencies` enables Bun's default allowlist). Both fixed, both nits taken (V6 static-extension exception documented + proxy comment; capabilities comment). Round 2 (delta only) = **LGTM**, no new findings (Reviewer mutation-tested FIX 1; confirmed `--frozen-lockfile --ignore-scripts` accepts the relock).
- User go-ahead (2026-11-04): commit and push after the Reviewer's LGTM; `db:migrate` approved and run. Opening the PR: ask first.
- Push check: pending (after the push). Merge check: not started.
- Nits left open on purpose: login skeleton height; C2 list alignment (user's call).

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 0 — Foundation. Last checkpoint: Checkpoint 2 built (env, DB, auth, gate), uncommitted, in review.
Read these first, in order:
1. docs/handoff/2026-11-04-phase-0-cp2-env-db-auth.md (the hand-off), in the worktree
   D:\Vxrcel\wanheda-wt\env-db-auth
2. D:\Vxrcel\wanheda\FRD.md (local only, not in the repo or worktrees) §10.0–10.1 and §2 D2, D3, §10 Phase 0
3. SPEC.md §T and §V

Before writing code, verify the hand-off against the repo:
- `git fetch`, then `git merge-base --is-ancestor e2fd50b origin/main` must succeed,
  and `git status` in the worktree must match the hand-off's "In progress" list.
- `git log -10 --format='%H %an %ad %cd %s'`: author and committer timezones must match
  on every commit; `sh scripts/forged-commits.sh origin/main` must be clean.
- Run `bun install`, `bun run tripwire`, `bun run typecheck`, `bun run lint` and `bun run test`
  (expect 192 passed) and compare with the Verification section. Report any difference first.

Then check "Review state": if the Reviewer's Checkpoint 1 verdict is not in, wait for it
or ask for it. Fix every FIX, then ask the user for the go-ahead to commit, push and open a PR.
`0000_auth` is applied; never run a new migration without the user's go-ahead.
At the next checkpoint: send the reviewer a review request (FRD §10.1),
then write the next hand-off (FRD §10.0).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-0-cp2-env-db-auth.md (in D:\Vxrcel\wanheda-wt\env-db-auth),
sections "Verification" and "Review state", and FRD §10.1.
Open items:
- Checkpoint 1 (diff) on branch phase-0/env-db-auth, worktree D:\Vxrcel\wanheda-wt\env-db-auth,
  base e2fd50b, uncommitted (tracked changes + untracked files).
- After the user's go-ahead and push: Checkpoint 2 (push check) on the PR.

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §2 D2, D3 and §10 Phase 0,
SPEC.md §V (the invariants every diff must keep, esp. V6–V9, V15, V16, V21),
and the repo rules in CLAUDE.md.
```
