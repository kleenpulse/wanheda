# Hand-off — Open sign-up and the Admin page (T84)

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8 side task T84 (owner request): anyone can sign up; `ADMIN_EMAILS` sees `/admin` |
| Branch | `phase-8/open-signup-admin` (off `main` at `c366353`), uncommitted, waiting for review |
| HEAD at start | `c366353` — Merge pull request #86 from kleenpulse:phase-8/desktop-titlebar |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-title-bar.md |

## State in one paragraph
The owner asked how to count users. The answer exposed a misread from the start of the project: "personal dashboard" meant personal *to each user*, not one owner. Anyone may now sign up with a verified GitHub email, and the owner (skyeparagon@gmail.com, via `ADMIN_EMAILS`) gets an Admin page with user counts, active users, sign-ups, app use and the newest accounts. The data layer was already per user (every table has `user_id`, every store filters by the session user), so no data code changed. R2 is off and voices download to the device, so per-user storage quotas are deferred until R2 turns on (recorded in V77 and ADR-0015).

## Done this session
- **Auth:** `lib/auth/allowlist.ts` → `parseEmailList` / `isListed`; `signup-guard.ts` → `assertVerifiedSignup` (verified, non-blank email only); `gate.ts` `decideOwner` drops `not-owner` and returns `admin`; `owner.ts` adds `requireAdmin()` (not-found page for anyone else, demo included) and records activity in `after()`.
- **Env:** `OWNER_EMAILS` → `ADMIN_EMAILS`, optional and no longer production-required (`env/server.ts`, `lib/capabilities.ts` `adminEmails()`, `.env.example`, `desktop/env-file.ts`, Playwright env).
- **Activity:** `lib/db/schema/activity.ts` `user_activity (user_id, day)` + `drizzle/0013_user_activity.sql` (**not applied**). `lib/admin/activity.ts` writes once per user per UTC day per instance; failures are swallowed and retried.
- **Admin page:** `app/(shell)/admin/page.tsx` (gate in Suspense, then PageFrame, stats in their own Suspense), `lib/admin/stats.ts` (one `db.batch`), `lib/admin/series.ts` (+ test), `components/admin/admin-dashboard.tsx` (tiles, two 30-day bar charts with table twins, app use bars, newest-users table).
- **Shell:** `ShellAccount.admin`; `ADMIN_PAGE` + `systemPages(admin)` in `lib/modules.ts`, used by the rail, the tab bar and the palette. The account menu now says "Admin" or "Signed in" instead of "Owner".
- **Login:** new copy ("Sign in with GitHub to open your own Wanheda…"); the not-owner screen is gone.
- **Review FIX (wanheda-87): device data per account.** `lib/device/scope.ts` (+ test), `lib/device/dexie.ts` `openScopedDexie` (+ test with a fake Dexie: A's queued op is invisible to B; no scope rejects; legacy adopted by admin only, newer rows win), `lib/device/account-channel.ts`. Notes, money, reader, reader-keys and media stores open through it. `ShellAccount.id`; `AccountProvider` sets the scope and reloads on another account. Sign-out (`leaveAfterSignOut`) clears timers + windows, tells other tabs, and loads `/login` fresh in all 3 places. SPEC V78.
- **Re-review (LGTM with nits), both taken:** replayed writes send `asUser` (`queueOwner()`), and the 13 outbox actions refuse another account's op as "failed" (`lib/auth/queued.ts` + tests, notes and money action tests); legacy adoption has a done-mark (`wanheda-adopted:<base>`) so a blocked delete can't make it copy again (test).
- **Nits:** `scripts/setup-deploy.sh` asks for optional `ADMIN_EMAILS`; the "404" wording is now "not-found page" (the status may be 200, the shell streams first).
- **Docs:** ADR-0015 (new), ADR-0003 status, ADR index, SPEC V6/V7 amended + V77 + T84, CONTEXT (Active user, Admin, Owner), CHANGELOG (2 Added entries), FRD D3 (local-only).

## Verification (actual results)
- tripwire clean. typecheck clean. Tests: 169 files, 1682 passed. ESLint on the changed files: 0.
- `bun run build` passes; `/admin` is partial prerender.
- e2e: 15 passed, including the new `/admin` → `/login?next=%2Fadmin` (gated) and `/admin` not found in demo.
- **Not checked:** the dashboard in a browser with real data. That needs the migration applied and a signed-in admin.

## Owner to-do
1. Done 2026-11-09 on the owner's word: migration `0013_user_activity` applied to Neon (14 recorded; `user_activity` exists; 1 user).
2. Done 2026-11-09: `ADMIN_EMAILS` added to Vercel Production (sensitive); `.env.local` already had it. Delete `OWNER_EMAILS` from Vercel only **after** this PR merges (main still requires it in production).
3. Desktop: re-import `.env` so the sealed secrets get `ADMIN_EMAILS`.
4. GitHub OAuth app: nothing to change.

## Decisions made
- `requireOwner()` keeps its name; "owner" = the signed-in user (CONTEXT). Renaming 50+ call sites was churn.
- Isolation stays in app code (store filters + composite FKs); per-user RLS policies are deferred (ADR-0015 consequences).
- Activity is its own table, not session timestamps (Better Auth refreshes those at most daily).
- Quotas wait for R2 (V77).

## Open / next
- `WEATHER_*` is server-wide, so every user sees the owner's weather location. A per-user weather setting is a separate task.
- Unverified-email sign-up failures show the generic "Sign-in failed. Try again." on /login.
- T80 (ffmpeg ≈ 126 MB) still waits for the owner's yes.

## Continuation prompts

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Read docs/handoff/LATEST.md → 2026-11-09-phase-8-open-signup-admin.md, ADR-0015, SPEC V77 and T84.
If phase-8/open-signup-admin is merged: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy.
Then T80 (desktop media, ffmpeg ≈ 126 MB): confirm with the owner before fetching it.
```

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; never write to the repo.
Review the uncommitted diff on phase-8/open-signup-admin (T84): open sign-up, ADMIN_EMAILS, /admin, user_activity.
Read docs/handoff/2026-11-09-phase-8-open-signup-admin.md and ADR-0015 first. Bugs and edge cases only; verdict LGTM | LGTM with nits | FIX, sent to the Builder.
```
