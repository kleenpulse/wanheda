# Hand-off — Phase 0: Foundation — Checkpoint 3, deploy setup (Reviewer LGTM; committed with the user's go-ahead)

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / checkpoint | Phase 0 — Checkpoint 3 (T19 done, T20 machine stages done, T21 not started); Reviewer round 1 = FIX → round 2 = **LGTM**; round 3 (theme reveal) = **LGTM**; round 4 (Android origin fix) = **LGTM**; user go-ahead → this hand-off ships in the CP3 commit, then push + PR |
| Branch | `phase-0/deploy-and-exit` (worktree `D:\Vxrcel\wanheda-wt\deploy-and-exit`) |
| HEAD | the CP3 commit on top of `e1e38baea932946c9e676a0ab58b12e94831b170` (its SHA and the PR number go to the Reviewer and into the next hand-off) |
| Previous hand-off | docs/handoff/2026-11-04-phase-0-cp2-closed.md |

## State in one paragraph

The local half of Checkpoint 3 is reviewed (LGTM) and committed with the user's go-ahead: `vercel.json` (`fra1`), a Playwright smoke test of all three gate modes (CI step, no browser), `scripts/setup-deploy.sh` (the owner-only deploy steps), and encrypted OAuth token storage. The Reviewer's round-1 FIX is applied: **previews get no database** (Neon preview branches would copy production rows into builds of unreviewed branches), so the Neon ↔ Vercel integration is dropped and the wizard fails if Vercel Preview ever holds a database or auth variable. At the user's request the Builder ran the wizard's machine stages itself (the wizard needs a TTY): the Vercel project `vxrcels-projects/wanheda` exists, is linked and Git-connected, and holds all 8 Production variables (Preview: none). The user created the production GitHub OAuth app and gave its client ID and the owner email; the user put the production client ID + secret into `.env.local`, and the Builder piped the secret from there into Vercel (sensitive). The user then made the local OAuth app and **signed in locally** as the owner with GitHub and then a passkey (token stored encrypted, checked in the DB). At the user's request the toggle now has the circular theme reveal from email-manager, with Motion Garden's Android origin fix. Nothing is deployed yet; production deploys when the PR is merged.

## Done this session

- Verified the CP2-closed hand-off against the repo (ancestry, TZ check, forged-commits clean, push CI 41876958430 green, install/tripwire/typecheck/lint/192 tests). No differences.
- `@playwright/test` 1.64.1 (exact dev dep, published 2026-10-14; it, `playwright`, `playwright-core` have no install scripts). `test:e2e` script.
- `playwright.config.ts` + `e2e/smoke.spec.ts`: one build, three `next start` servers by env alone (gated `:3101`, locked `:3102`, demo `:3103`); unused vars set to `""` because Next's `.env*` loader never overrides a set variable; locked server awaited by port (Playwright doesn't count 503 as up). 10 tests: gated one-hop redirects incl. `?next=`, `/login` public, forged session cookie → streamed redirect to `/login` with no shell content; locked `/`, `/money`, `/login`, `/api/auth/get-session` → 503 lock body only; demo `/` and `/login` → 200.
- CI `check`: "Playwright smoke (gate modes)" after the zero-env build. `vercel.json`: `regions: ["fra1"]`.
- `lib/auth/server.ts`: `account: { encryptOAuthTokens: true }` (Reviewer nit 2, taken now because no account row exists yet). New `lib/auth/server.test.ts` (2 tests: null without auth; encryption on).
- `scripts/setup-deploy.sh` (bash, 8 stages, ~18 min), library byte-identical to the `/wizard` template. Round-1 changes: stage 6 is now "Database URLs — Production only" (from `.env.local`, sensitive) instead of the Neon integration; `assert_preview_clean` (fails closed) after stages 6 and 7; `host_of` takes userinfo greedily up to the last `@` before the first `/` (Reviewer nit 1); stage 1 tells a pre-2026-10-11 login to re-login (Reviewer nit 3); stage 4 undoes the `.gitignore` lines `vercel link` appends (found in this run).
- Docs: ADR-0002 (previews get no database; integration and preview branches rejected, with reasons), ADR-0003 (two OAuth apps, previews demo with no db/auth, encrypted tokens, passkeys bind to the `BETTER_AUTH_URL` host), ADR-0010 and the ADR index (no preview branches), SPEC C6 / C11 / C12 / §I / T19 `x` / T20, README.
- **Outward, at the user's request ("run bash scripts/setup-deploy.sh yourself"), the user choosing to continue with the current Vercel login:**
  - main checkout `.env.local`: backed up to `.env.local.bak-2026-11-04` (git-ignored); added `DATABASE_URL_UNPOOLED` (pooled URL without `-pooler`), a new `BETTER_AUTH_SECRET` (44 chars), `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` = `http://localhost:3000`. `vercel link` added a `VERCEL_OIDC_TOKEN`. No values printed.
  - `vercel link --yes --project wanheda` → created `vxrcels-projects/wanheda`, connected `github.com/kleenpulse/wanheda`, wrote `.vercel/` (ignored). It also appended `.vercel` and `.env*` to the main checkout's `.gitignore` (CRLF); the `.env*` line after `!.env.example` would re-ignore `.env.example` → restored with `git checkout -- .gitignore`; ignore rules re-checked.
  - Production domain from the API (`/v9/projects/wanheda/domains`): **`wanheda-chi.vercel.app`** (`wanheda.vercel.app` belongs to someone else and redirects to `itswanheda.vercel.app`).
  - Vercel Production: `BETTER_AUTH_SECRET` (generated in a pipe, sensitive), `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (from `.env.local`, sensitive), `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` = `https://wanheda-chi.vercel.app`. Vercel Preview: no variables.
- **Local sign-in proven** (after the Reviewer's round-2 LGTM): the user created the local OAuth app (`.env.local` now holds its ID, not the production one; production secret no longer there). The Builder ran the worktree build on `:3000` with the main checkout's `.env.local` (`bun --env-file=… run start`; worktree build, so `encryptOAuthTokens` is on — the main checkout at `e1e38ba` would have stored the token in plaintext). `/` → 307 `/login` → 200 gated; the user signed in with GitHub and saw "Signed in as <owner>" (screenshot). Read-only DB check afterwards: 1 `user`, 1 `account` (`github`), access token 160 chars, ciphertext shape, **no `gho_` plaintext prefix**. Then the user added a passkey and signed in with it ("passkey passed", screenshot shows "Passkey added"); read-only DB check: 1 `user`, 1 `passkey`, 1 live `session`. The user also confirmed the theme transition works ("theme transition transitioned").
- **Theme reveal** (user, after the LGTM: "add that theme transition effect I use in pretty much all my projects", then "check D:\Vxrcel\email-manager"): `components/theme-toggle.tsx` gains `revealTheme()` + `centerOf()`, ported from email-manager's `components/shell/theme-toggle.tsx` (2026-10-12, the newest of the user's versions; the 303-line shadow-garden and 75-line yoake variants were compared and not used; the source was tripwire-scanned first). The new skin grows as a circle from the toggle on the View Transitions API; the class is applied synchronously inside the transition; instant switch on reduced motion (OS or `data-motion="reduce"`), unchanged skin, or no `startViewTransition`. `app/globals.css` gains the "Skin switch" block (`skin-reveal`, 640 ms, `--ease-out-quint`) and view-transition pseudo-elements in both reduced-motion clamps (`*` doesn't match them).
- **Android origin fix** (user: "motion-garden have fixed the Possible Android glitch"): `revealTheme()` now sets `--reveal-x/-y` as percentages of the viewport and `--reveal-r` as a percentage of `hypot(w, h) / √2`, the fix from Motion Garden's `D:\Vxrcel\shadow-garden\lib\theme-transition.ts` (`::view-transition-new(root)` is sized to the snapshot containing block, which on Android Chrome is larger than the viewport, so px origins drift toward the top-left). The CSS keyframes are unchanged (`circle()` takes percentages).

## Verification (actual results, not intentions)

Final tree, in the worktree:

- `bun run tripwire` → clean. `bun run typecheck` → clean. `bun run lint` → no output.
- `bun run test` → **11 files, 194 passed** (+1 file, +2 tests: `lib/auth/server.test.ts`).
- `bun run build` (zero env) → exit 0. `bun run test:e2e` → **10 passed**.
- Mutation checks (all reverted): `decideProxy` locked → pass + `requireOwner()` anonymous → demo → 5 smoke tests fail; deleting `encryptOAuthTokens: true` → the new unit test fails.
- `bash -n scripts/setup-deploy.sh` → OK (no `shellcheck` here). `host_of` over 9 shapes (raw `@`, `#`, `?` in the password, quoted, port, no userinfo, non-URL) → host only, never a password character. `assert_preview_clean` run live against the project → passes (Preview empty); its matcher run against Production finds `BETTER_AUTH_SECRET` (count 1), so it is not blind.
- `vercel env list production` → `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_URL`, `BETTER_AUTH_SECRET` (all Encrypted, Production). `vercel env list preview` → none.
- Main checkout after the run: `git status` clean; `.vercel` and `.env.local` ignored; `.env.example` not ignored; `git ls-files` lists only `.env.example` among env files.
- gitleaks 8.30.1 (full path) over the 18 changed/new files → no leaks. `TRIPWIRE_TARGET` scan over the same files → clean.
- After the theme reveal (20 files): typecheck clean, lint silent, tripwire clean, no raw colours in `components/theme-toggle.tsx`; `bun run build` → exit 0 and `skin-reveal` is in the built CSS; `bun run test` → 11 files, 194 passed; `bun run test:e2e` → 10 passed. The reveal itself was not checked in a browser by the Builder (the user is trying it live on `:3000`).
- After the Android fix: typecheck, lint, tripwire clean; build exit 0; 194 unit + 10 smoke passed. The % math checked for 4 viewport/origin cases (1440×900, 390×844 corners, centre): the % radius maps back exactly to the farthest-corner distance, so the circle always covers the screen. **In Chrome (DevTools MCP, isolated context) at 390×844×3 mobile, Android UA**, clicking the toggle on `/login`: view transition started, `skin-reveal` ran, `--reveal-x/-y/-r` = `80.769%` / `36.683%` / `94.356%` (toggle centre 315, 310), dark → light. With `prefers-reduced-motion: reduce` emulated: no view transition, 0 reveal animations, class flipped synchronously. Real Android hardware not tried.

## In progress / not finished

- T20: done so far — production OAuth app created by the user (callback `https://wanheda-chi.vercel.app/api/auth/callback/github`, the user confirmed); its `GITHUB_CLIENT_ID` and `OWNER_EMAILS` = the owner's email (the user's message dropped the `.com`; it was completed from `kleenpulse`'s public GitHub email, the field Better Auth reads — the address itself stays out of this public repo) set in Vercel Production; `OWNER_EMAILS` also in `.env.local`. The user added the production `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` to `.env.local` (the ID matches the production app); the Builder piped the secret from `.env.local` into Vercel Production (`--sensitive`, value never printed) → Production 8 of 8. The user then created the local OAuth app and replaced the pair in `.env.local` (verified: different ID, 40-char secret). T20 is done (local GitHub + passkey sign-in proven).
- T21: not started (needs the deploy).

## Decisions made

- **Previews get no database and no auth** (user, after Reviewer FIX): demo mode on seed data. Neon ↔ Vercel integration not installed; production DB URLs set by hand. Supersedes "previews locked (503)" from earlier this session.
- **Builder ran the wizard's machine stages** (user: "run bash scripts/setup-deploy.sh yourself") before the Reviewer's re-review. The user chose to continue with the current Vercel CLI login although it may predate the worm.
- Deploy path: Vercel Git integration, production from `main` only. Domain: the assigned `wanheda-chi.vercel.app`. Wizard committed.
- Two GitHub OAuth apps; different local and production `BETTER_AUTH_SECRET`s; OAuth tokens encrypted at rest.
- Smoke test is HTTP-only; demo mode joined the smoke run.

## Bugs found

- Reviewer FIX (design): Neon preview branches + Vercel building every pushed branch = production data in unreviewed builds. Fixed by dropping preview databases.
- `vercel link` silently edits `.gitignore` (adds `.env*` after `!.env.example`). Undone, and the wizard now undoes it.
- My own drafts: `host_of` echoed a quoted URL whole, then (Reviewer fuzz) leaked after a raw `@`, then (my fuzz) mis-parsed a raw `#`. Fixed: greedy userinfo up to the first `/`.
- Lint: an unnecessary optional chain in the new test. Fixed.

## Known problems and risks

- **Vercel CLI login may predate the worm** (CLI in use since 2026-06; `auth.json` rewritten today, so its date proves nothing; the worm harvested Credential Manager and env vars). User accepted it. Sensitive values can't be read back, but a stolen token could still change env or deploy. `vercel logout && vercel login` + revoking old tokens at vercel.com/account/settings/tokens remains recommended.
- Vercel is Git-connected now: every push builds. Previews are demo-only. All 8 Production variables exist, so a `main` build passes the env schema.
- The production GitHub client secret sat in `.env.local` for a while (the user's paste) before the local app replaced it; it is in Vercel now. Rotating it in the production OAuth app is cheap if that matters.
- The owner account lives in the production Neon DB (local and production share one database by design). A passkey added on `localhost` binds to `localhost` and will not work on `wanheda-chi.vercel.app`; production needs its own.
- **Production `GITHUB_CLIENT_SECRET` provenance** (Reviewer round-3 question): when it was piped, `.env.local`'s `GITHUB_CLIENT_ID` was checked and equalled the production app's ID (`Ov23liJdINXQIWuCamAN`), no edit came between the check and the pipe, and the local app did not exist yet (the user created it afterwards; its ID `Ov23limGS3S0GliEw3wg` appeared only then). So it is the production app's secret, unless the user copied it from elsewhere; Vercel can't show it (sensitive, correct). Production `GITHUB_CLIENT_ID` = `Ov23liJdINXQIWuCamAN`, set from the user's message, which the user confirmed is the production app. T21's first production sign-in settles it: a wrong secret fails closed (GitHub "incorrect client credentials"); the fix then is a new secret on the production app, `vercel env add GITHUB_CLIENT_SECRET production --sensitive --force`, typed at the prompt.
- A local server for the user may still run on `:3000` from the worktree build (a background task of this session); it stops with the session.
- If `kleenpulse`'s public email is ever hidden or changed, Better Auth falls back to the primary verified email, which may differ from `OWNER_EMAILS` → sign-in refused (fail closed). The `gh` token here lacks the `user` scope, so the verified-email list was not checked.
- Vercel project Node.js version is 26.x (default); local is 24.22.1. Watch the first build.
- **Doc drift outside the repo:** `D:\Vxrcel\wanheda\FRD.md:85` (7-day expiry) and the Phase 0 bullet "Preview deploys use Neon branches" now contradict ADR-0002. The user's local file; not edited.
- gitleaks: WinGet-installed but not on `PATH`, so the pre-commit hook would skip it. CI scans.
- The `.env.local.bak-2026-11-04` backup was deleted by the user (checked: gone).
- The local passkey is bound to `localhost`; production needs its own passkey (T21).
- Still open from CP1: the private incident record's C2 list vs `scripts/tripwire.sh` (user's call).

## Next steps (in order)

1. ~~Reviewer re-review~~ — round 2 LGTM (wanheda-19).
2. ~~Production secret, local app, local sign-in~~ — done (Vercel 8 / 0). Reviewer rounds 3 and 4 LGTM.
3. ~~User go-ahead~~ (given for commit, push and PR) → stage files by name → commit → push → PR → Reviewer push check (SHA + PR number). The PR's preview should run demo mode; CI must be green.
4. User merges → production deploy from `main` → Reviewer merge check.
5. T21 on `https://wanheda-chi.vercel.app`, results recorded: owner signs in with GitHub, adds a passkey, signs in with it; a second GitHub account is refused; logged out → `/login` in one hop; CI logs show planted-IOC tests and the gitleaks canary as asserted failures; demo proven by the smoke run. Then the Phase 0 done hand-off with Phase 1 prompts (docs PR → review → merge → Reviewer merge check).

## Files to read first

- `scripts/setup-deploy.sh` (below the STAGES marker), `lib/auth/server.ts`, `lib/auth/server.test.ts`
- `components/theme-toggle.tsx`, `app/globals.css` ("Skin switch" and the reduced-motion clamps)
- `playwright.config.ts`, `e2e/smoke.spec.ts`, `.github/workflows/ci.yml`
- `docs/adr/0002-database-neon-drizzle.md`, `docs/adr/0003-auth-better-auth-owner-only.md`
- `SPEC.md` C6, C11, C12, §I, T19–T21

## Env / services touched

- npm registry: `@playwright/test` 1.64.1.
- **Vercel:** project `vxrcels-projects/wanheda` created (Node 26.x, Next.js preset, root `.`), Git-connected to `kleenpulse/wanheda`, domain `wanheda-chi.vercel.app`. Production env: `BETTER_AUTH_SECRET`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (sensitive), `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `OWNER_EMAILS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (sensitive) — 8 of 8. Preview/Development: none. No deployment yet.
- **GitHub:** two OAuth apps created by the user — production (client ID `Ov23liJdINXQIWuCamAN`) and local (`Ov23limGS3S0GliEw3wg`); IDs are public.
- **Main checkout `.env.local`:** + `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `OWNER_EMAILS`, `VERCEL_OIDC_TOKEN` (by `vercel link`), and the local app's `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` (by the user). Backup `.env.local.bak-2026-11-04`. `.vercel/` created.
- **Neon:** no integration, branch or migration. The user's local sign-in wrote the owner rows (1 `user`, 1 `account`, sessions) to the production database.

## Review state (two-session model, §10.1)

- Checkpoint 2 cycle: closed.
- Checkpoint 3 cycle (`phase-0/deploy-and-exit`, base `e1e38ba`, uncommitted): round 1 (wanheda-19) = **FIX** — previews must not get production data (Neon preview branches) → applied (no preview database, `assert_preview_clean`, ADR/SPEC aligned). Nits taken: `host_of` greedy userinfo, `encryptOAuthTokens`, re-login note. Round 2 (delta only) = **LGTM**, no new findings: live Vercel state matched (Production 5 vars, Preview none, no deployments); `assert_preview_clean` fed the real Production listing flags the 4 forbidden names and not `NEXT_PUBLIC_APP_URL`, and fails closed; `host_of` over 10 shapes leaks nothing (an `@` in the query gives a wrong host but no secret — accepted); the `encryptOAuthTokens` mutation fails the test; main `.gitignore` == HEAD; gates match. The Reviewer wrote nothing in the worktree. Next for the Reviewer: the push check once the user approves the commit (send the pushed SHA).
- Told to the Reviewer: the Builder ran the wizard's machine stages before the re-review, at the user's request.
- Round 3 (theme-reveal delta, added after the round-2 LGTM at the user's request) = **LGTM**, no FIX; the Reviewer asked which app's secret went to production (answered under Known problems, with the timeline).
- Round 4 (Android origin fix, px → %) = **LGTM**, no findings; the Reviewer recomputed the math independently (within 0.004 px) and closed the production-secret question on the timeline (T21's first production sign-in is the proof).
- **User go-ahead** for commit, push and PR (2026-11-04, after the user confirmed: passkey works, theme transition works). Next for the Reviewer: the push check (send the pushed SHA and the PR number).
- Nits left open on purpose: login skeleton height (cosmetic); C2 list alignment (user's call).

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 0 — Foundation. Checkpoint 3 on phase-0/deploy-and-exit (base main = e1e38ba):
Reviewer rounds 1–4 done (FIX → LGTM ×3), committed and pushed with the user's go-ahead,
PR open. The Vercel project vxrcels-projects/wanheda exists (Git-connected, domain
wanheda-chi.vercel.app) with all 8 Production variables; local GitHub + passkey sign-in work.
Read these first, in order:
1. docs/handoff/2026-11-04-phase-0-cp3-deploy-setup.md (the hand-off), in the worktree
   D:\Vxrcel\wanheda-wt\deploy-and-exit
2. D:\Vxrcel\wanheda\FRD.md (local only) §10.0–10.1 and §10 Phase 0 (exit criteria)
3. SPEC.md §C (C6, C11, C12), §T (T19–T21) and §V

Before anything else, verify the hand-off against the repo:
- `git fetch`; `origin/main` must still be e1e38ba (or check new commits with
  `sh scripts/forged-commits.sh e1e38ba..origin/main` before using them).
- `git log -1 origin/phase-0/deploy-and-exit` is the CP3 commit; `sh scripts/forged-commits.sh
  e1e38ba..origin/phase-0/deploy-and-exit` is clean; `gh pr list --head phase-0/deploy-and-exit`.
- Run `bun run tripwire`, `bun run typecheck`, `bun run lint`, `bun run test` (11 files,
  194 passed), `bun run build`, then `bun run test:e2e` (10 passed).
- `vercel env list production` and `vercel env list preview` (from D:\Vxrcel\wanheda) must
  match "Env / services touched" (names only; Preview must be empty). Report any difference first.

Then continue from "Next steps": the Reviewer's push check, CI on the PR, the user's merge,
the Reviewer's merge check, then T21 on the production URL and the Phase 0 done hand-off.
Every outward step (commit, push, PR, deploy, env changes, migrations) waits for the user.
At the next checkpoint: review request, then the next hand-off.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-0-cp3-deploy-setup.md (in D:\Vxrcel\wanheda-wt\deploy-and-exit),
section "Review state", and FRD §10.1.
Branch phase-0/deploy-and-exit (worktree D:\Vxrcel\wanheda-wt\deploy-and-exit,
base e1e38ba): rounds 2–4 were LGTM. Pending: the push check (Reviewer Checkpoint 2) on the
pushed SHA and PR the builder sends, then the merge check after the user merges.

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §10 Phase 0 (exit criteria),
SPEC.md §V (esp. V5, V6, V7, V8, V21) and §C12, and the repo rules in CLAUDE.md.
scripts/setup-deploy.sh handles secrets; Vercel state can be read with
`vercel env list production|preview` (names only) from D:\Vxrcel\wanheda.
```
