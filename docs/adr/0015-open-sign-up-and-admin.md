# ADR-0015: Anyone can sign up; admins get a usage page

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Deciders | Isaac Gideon (owner) |

Amends [ADR-0003](0003-auth-better-auth-owner-only.md): the gate modes, Better Auth, passkeys, GitHub OAuth and the server-side gate all stay. Only the sign-up allowlist goes.

## Context

The FRD calls Wanheda a "personal dashboard". The build read that as "one owner only" and refused every sign-up outside `OWNER_EMAILS`. The owner's meaning (2026-11-09) is personal to each user: anyone can make an account and get their own Wanheda, and the owner wants an admin page to see how many people use it.

The data layer was already per user. Every table carries `user_id` (FK → `user`, cascade), every store filters by the id `requireOwner()` takes from the session, and the reader's link tables use composite FKs on `(id, user_id)`, so a cross-user link fails in the database even if a store check were missing. Files are local-only (R2 is off, V38) and voices download straight to the device, so a stranger can't run up a storage bill yet.

## Decision

- **Open sign-up.** Any GitHub account with a **verified** email can sign up (`assertVerifiedSignup`). An unverified email is refused before a row exists, because the email names the account and the admin check reads it.
- **"Owner" now means the signed-in user.** `requireOwner()` keeps its name: each user owns their own data. The `not-owner` state is gone.
- **`ADMIN_EMAILS`** replaces `OWNER_EMAILS`. It is optional and only decides who sees `/admin`. An empty list means no admin page; sign-up stays open either way, and production no longer requires it.
- **The admin check runs on the server, on every request.** `decideOwner()` returns `admin` from `ADMIN_EMAILS`, read at call time. `/admin` calls `requireAdmin()`, which shows anyone else (demo included) the not-found page before any of the admin page renders. The shell streams first, so the HTTP status may already be 200; nothing of the page is in the response either way. The shell's `admin` flag only shows the rail entry.
- **Activity is one row per user per UTC day** (`user_activity`, PK `(user_id, day)`), written after the reply by `getOwner()` with a per-instance dedupe set. Nothing else is stored: no paths, IPs or actions. Session `updated_at` was not enough: Better Auth refreshes it at most daily per session.
- **Device stores are per account.** Two people can share one browser, so every IndexedDB store with user data is named after the account: `wanheda-notes@u.<id>`, and likewise `wanheda-money`, `wanheda-reader`, `wanheda-reader-keys` and `wanheda-media`; demo uses `@demo`. One opener (`lib/device/dexie.ts`) does it for all of them. Without an account it refuses, and callers keep writes in memory. So a queued write is only ever drained by the account that made it, and A's queue waits for A. The old unscoped stores (from when only the owner could sign in) are adopted once by an admin account, never overwriting newer rows, then deleted.
- **Sign-out leaves nothing behind in the tab.** It reloads `/login` as a new page, so module-level stores and in-tab memory don't carry over. It also clears the persisted timers and mini windows, and tells other tabs to reload. Each shell tab announces its account on a BroadcastChannel and reloads if another tab speaks for a different one, because a stale tab would otherwise send its queue with the new user's cookie. The reload is best-effort (a timer can fire before the new tab announces), so the server closes it: every replayed write carries the user id of the store that queued it, and the action refuses it as a transient failure when that differs from the session user.
- **The admin page shows counts, never content:** users, new this week and month, active today, this week and this month, live sessions, sign-ups and actives per day for 30 days, users per app (at least one row in `txn`, `connector`, `note`, `document` or `media_item`), and the 25 newest accounts with name, email, join date and last active day. All of it is read in one `db.batch` round trip.

## Amendment (2026-11-09): self-service account deletion

Open sign-up needs a way out, so a user can delete their own account (SPEC V79), from Settings → Account → Danger zone.

- **One door.** The `deleteAccount` server action takes the user from the session, refuses demo, and checks that the typed email matches the account's. Only then does it call Better Auth's `deleteUser`. The `/delete-user` HTTP routes are listed in `disabledPaths`, so nobody can skip the typed check with a direct POST.
- **A fresh session.** Better Auth refuses a session older than a day (`freshAge`). The dialog then offers "Sign in again", which signs out and comes back to the Account section. A stolen old cookie can't delete an account.
- **Server data.** Every table with a `user_id` references `user` with `ON DELETE CASCADE` (sessions, OAuth accounts and passkeys included), so deleting the user row deletes everything. No per-table delete code to keep in step.
- **Device data.** After the action succeeds, the tab deletes the account's scoped IndexedDB stores (`ACCOUNT_STORES`, V78), then clears its state like a sign-out. The order matters: the sign-out announcement reloads every shell tab, this one included. `openScopedDexie` only accepts a listed name, so a new store can't be left out. Reader files in OPFS stay: they are shared by sha256 between accounts and reachable only through a row, and the rows are gone.
- **Not built:** export before delete, a grace period, and deletion by an admin. The confirm dialog is the pause, since nothing can bring the account back.

## Amendment (2026-11-09): Google sign-in

Google is a second, optional OAuth provider beside GitHub (SPEC V80).

- **Optional.** With both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set, Better Auth gets the `google` provider and `/login` shows "Continue with Google". With either missing, nothing changes. GitHub stays the one required provider, so the gate modes (V6) are unchanged.
- **Same rules.** Google reports `email_verified`, so the sign-up guard applies unchanged. When a Google email matches an existing account whose email is verified, Better Auth links the two, so one person keeps one Wanheda whichever button they press. `prompt=select_account` lets someone with several Google accounts pick one.
- **Desktop.** Google refuses embedded browsers, so the system-browser flow (V68) is its only way in. The flow now knows each provider's authorize page and callback, and a return on one provider's callback never answers the other's sign-in. `desktop:dev` can't catch the browser's return, so Google there is logged and skipped; use `desktop:preview`.
- **Setup.** One Google OAuth client per environment, like GitHub's two apps: local (plus the desktop's `http://localhost:<saved port>` callback) and production. The consent screen must be published, or only test users can sign in. Previews get neither (the wizard's preview check covers `GOOGLE_*`).

## Consequences

### In 6 months

- Strangers' data sits in the same Neon database. Isolation is enforced in app code (store filters by session user id, composite FKs), not by Postgres policies: RLS is on with no policies and the app role bypasses it. A store that forgets its `user_id` filter would leak. Every new store must filter by the session user, and review checks it.
- Neon storage and compute grow with users. Free-tier limits become the first ceiling.
- Server-wide settings still apply to everyone: `WEATHER_*` gives every user the owner's weather location until it becomes a per-user setting.
- Existing desktop installs carry a sealed `OWNER_EMAILS` and no `ADMIN_EMAILS`, so the admin page appears there only after the owner re-imports `.env`.

### In 2 years

- If Wanheda gets many users, per-user RLS policies (a session variable per request) become worth their cost as a second wall behind the store filters.
- Turning R2 on (V38) needs a per-user storage quota and an upload rate limit before it ships, and account deletion must then delete the user's objects too (V79).

## Alternatives considered

- **Keep the allowlist and add people by hand.** Doesn't match what the owner wants.
- **Count users from sessions only.** Undercounts daily users (once-a-day refresh) and loses history when sessions expire.
- **A hosted analytics script (Umami, Plausible, Vercel Analytics).** Counts page views, not accounts or app adoption, and adds a third party to every page. It can be added later for traffic.
- **Rename `requireOwner()` to `requireUser()`.** Over 50 call sites of churn for a word; the meaning is recorded here and in CONTEXT.

## Revisit when

- R2 uploads are switched on (quotas first).
- Users reach the low thousands, or a second person needs admin access to anything beyond counts.
- Anyone asks for export before deletion, or for deletion from the admin page.
