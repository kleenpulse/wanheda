# Hand-off — Self-service account deletion and Google sign-in (T85)

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8 side task T85 (owner request): a user can delete their own account; then, in the same PR, Google sign-in beside GitHub |
| Branch | `phase-8/account-deletion` (off `main` at `fcf3b4c`), **uncommitted**, waiting for the Reviewer |
| HEAD at start | `fcf3b4c` — Merge pull request #87 from kleenpulse/phase-8/open-signup-admin |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-open-signup-admin.md |

## State in one paragraph
With open sign-up merged (#87), users had no way to leave. Settings → Account now has a Danger zone with a "Delete account" button. It opens a confirm dialog where the user types their email; the server action checks it and calls Better Auth's `deleteUser`. Every table with a `user_id` cascades from `user`, so one row delete removes all server data. Better Auth refuses sessions older than a day; the dialog then offers "Sign in again". After success the tab deletes the account's scoped IndexedDB stores, then clears its state like a sign-out and lands on `/login?deleted=1`, which says the account is gone.

Then the owner asked for Google sign-in in the same PR. With `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set, `/login` shows "Continue with Google" beside GitHub; without them nothing changes. GitHub stays the one required provider. The same sign-up guard applies (Google sends `email_verified`), and a Google email that matches an existing verified account links to it. The desktop's system-browser sign-in now handles both providers.

## Done this session
- **After-merge for #87:** switched to `main`, checked the incoming commits (ancestor OK, forged-commits clean, only #87's commits plus GitHub's merge), pulled, confirmed `main`'s tree is byte-identical to the verified `69a80b8`, tripwire clean, `git tidy`.
- **Server:** `lib/auth/server.ts` sets `user.deleteUser.enabled` and `disabledPaths: ["/delete-user", "/delete-user/callback"]`, so the HTTP routes answer 404 and `auth.api` still works. `actions/account.ts` `deleteAccount({ confirm })`: user from the session, demo refused, typed email must match (trim, case-insensitive) or `mismatch`, `SESSION_EXPIRED` → `stale`, anything else → `failed`.
- **Device:** `lib/device/scope.ts` `ACCOUNT_STORES` + `AccountStore`; `openScopedDexie` and `scopedName` only take a listed name, so a new store can't be left out. `lib/device/dexie.ts` `forgetAccountStores(scope)` deletes all five (bounded wait 2 s).
- **Client:** `components/auth/account-actions.tsx` `leaveAfterDelete()` (stores first, then announce + clear, then `/login?deleted=1`) and `leaveAfterSignOut(to)`. `components/settings/delete-account.tsx` (button + GrowDialog, typed email, states idle|pending|signing-out|mismatch|stale|failed). The Danger zone card is in `settings-board.tsx`. The login page shows "Account deleted" on `?deleted=1`.
- **Tests:** `actions/account.test.ts` (5); `lib/auth/server.test.ts` (routes 404; mutation-checked: 401 without `disabledPaths`); `lib/device/dexie.test.ts` (only A's stores deleted; bounded wait); `components/auth/account-actions.test.ts` (order; mutation-checked); `lib/db/schema/cascade.test.ts` (all 33 tables with `user_id` cascade from `user`).
- **Docs:** SPEC V79 + T85, ADR-0015 amendment, CHANGELOG (1 Added entry).

### "Last used" badge (same PR)
- `lib/auth/last-method.ts` (+ test): cookie name `wanheda.last_sign_in`, `parseLastMethod` (passkey | github | google, else null).
- `lib/auth/server.ts`: Better Auth `lastLoginMethod({ cookieName })` before `nextCookies` (test checks both). Cookie only; no database column, no migration.
- `/login` reads the cookie on the server and passes `lastUsed`; a `google` value while Google is off gets no badge. `SignInPanel` `LastUsed` sits on the button's top-right edge. The first version sat in the label's flow and overflowed a 320 px phone (measured: 225 px content in a 204 px button); the owner then asked for absolute top-right, which is what shipped.
- `deleteAccount` clears the cookie (test). e2e: the right button is badged, and a tampered value or no cookie shows none.
- Looked at in Chrome (gated build on :3311, dummy auth): dark + light, passkey + Google variants, 320 px and 500 px. No overflow (client = scroll width on every button).

### Google sign-in (same PR)
- **Server:** `env/server.ts` optional `GOOGLE_CLIENT_ID|SECRET`; `lib/capabilities.ts` `AuthSettings.google` (both or null) + `googleSignIn()`; `lib/auth/server.ts` adds the `google` provider only when set (`prompt: "select_account"`).
- **Login:** `SignInPanel` takes `google`, renders one button per provider (desktop "Open Google again" and its hint follow the provider); copy reads "GitHub or Google" when Google is on.
- **Desktop:** `oauth.ts` `CALLBACK_PATHS`, `authorizeProvider` (https, exact host + path for github.com and accounts.google.com `/o/oauth2/v2/auth`), `PendingSignIn.provider`, `callbackQuery(provider, …)` refuses the other provider's callback, `iss` relayed; `browserReturn` returns the provider; `bootstrap.ts` → `server-process.ts` (provider validated) → `main.ts` `startOAuthSignIn` / `finishSignIn(provider, …)`; `policy.ts` kind `oauth-sign-in` with provider. Dev: Google is logged and skipped (embedded windows are refused by Google).
- **Config:** `.env.example`, `desktop/env-file.ts` names, Playwright pins `GOOGLE_*` (dummy in gated, empty in locked), `scripts/setup-deploy.sh` optional Google step (local + production clients, prod secret in memory only) and `GOOGLE_*` in the preview-forbidden list.
- **Tests:** capabilities (4), auth server (provider only when set), desktop oauth (Google start, cross-provider refusals, `iss` kept, extras dropped), policy, e2e login copy + both buttons + `?deleted=1`.
- **Docs:** SPEC V80 (and T85 widened), ADR-0015 second amendment, desktop/README, CHANGELOG (1 more Added entry).

## Verification (actual results)
- tripwire clean. typecheck and `desktop:typecheck` clean. Tests: 174 files, 1752 passed. ESLint on the changed files: 0.
- `bun run build` passes (`/settings` and `/login` partial prerender). e2e: 16 passed (after a rebuild; Playwright serves the existing `.next`).
- `bash -n scripts/setup-deploy.sh` passes; the wizard itself was not run.
- **Not checked:** the deletion dialog in a browser and a real deletion against Neon (need a throwaway account); a real Google sign-in (needs a Google OAuth client, owner action); `desktop:smoke` (needs a staged build; its Google checks are new and unrun).

## Decisions made
- **Confirm dialog, not an Undo toast.** Nothing can bring the account back, so the typed email is the pause.
- **Better Auth's freshAge (1 day) stays the default.** Lowering it would also affect other fresh-session checks.
- **The cookie change in `deleteAccount` doesn't stop `leaveAfterDelete`.** In Next 16.4.5 a cookie change marks the action revalidated (`request-cookies.js:125` sets `pathWasRevalidated`; `action-handler.js:123-127` sends `x-action-revalidated`), and the page may render into the response. A redirect there goes into the stream; it isn't thrown, so there is no `x-action-redirect`. The client resolves the action promise first (`server-action-reducer.js:258`), then applies or refreshes the tree, which soft-navigates to `/login` while `forgetAccountStores` waits; `location.replace` then loads `/login?deleted=1` fresh. (Review read the re-render step differently; both readings end the same way.)
- **Known edge:** anything that writes to a Dexie store during that soft navigation (an unmount flush) can recreate an empty `<base>@u.<id>` after the delete. It holds no data from the account; it's left as is.
- **Known, dev only:** in `desktop:dev`, Google is logged and skipped, but the sign-in panel still says "Finish signing in on Google". Use `desktop:preview`.
- **Google is optional; GitHub stays required.** Making "any one provider" enough would change the gate modes (V6) and the production env check for no gain today.
- **Two Google clients (local, production)**, like GitHub's two apps, so the production secret never lands in `.env.local`.
- **OPFS reader bytes stay** (shared by sha256, V78). There is no export or grace period, and no deletion from the admin page.

## Open / next
- **Real Neon deletion, test plan (Review nit):** Better Auth deletes sessions and accounts before the user row, and not in one transaction. If the cascade failed, the person would be signed out with their data still there and see "not deleted. Try again" (signing in again relinks). Seed the throwaway account with a `txn` on a `money_account` plus an `import_batch` (both reference `money_account` with ON DELETE NO ACTION, checked at the end of the statement, so it should pass), then delete it and check that every table has no rows for that user.
- `WEATHER_*` is still server-wide (per-user weather is the next candidate).
- T80 (ffmpeg ≈ 126 MB) still waits for the owner's yes.
- Owner to-do from #87: delete `OWNER_EMAILS` from Vercel (now safe, #87 is merged); re-import `.env` on the desktop app.
- Done 2026-11-09 on the owner's word: `GOOGLE_CLIENT_ID|SECRET` in `.env.local` (owner) and copied from it to Vercel Production (secret sensitive; Preview and Development have none). The same client serves local and production, so it must list `https://wanheda-chi.vercel.app/api/auth/callback/google` as a redirect URI. Production shows the button only after this PR merges and deploys.
- Owner to-do for Google (reference): in Google Cloud, set up and **publish** the consent screen (External), make a local Web client (redirects `http://localhost:3000/api/auth/callback/google` and, for desktop, `http://localhost:<saved port>/api/auth/callback/google`) and a production one (`<prod URL>/api/auth/callback/google`); put the local pair in `.env.local` (and the desktop `.env`), the production pair in Vercel Production only. `bash scripts/setup-deploy.sh` walks it.

## Continuation prompts

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; never write to the repo.
Review the uncommitted diff on phase-8/account-deletion (T85): self-service account deletion + Google sign-in.
Read docs/handoff/2026-11-09-phase-8-account-deletion.md, ADR-0015 (both amendments), SPEC V79, V80 first. Bugs and edge cases only; verdict LGTM | LGTM with nits | FIX, sent to the Builder.
```
