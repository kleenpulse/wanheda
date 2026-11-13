# Hand-off — Phase 8: T91 service worker (+ social avatar)

## State in one paragraph

On branch `phase-8/t91-service-worker` (off `main` at `f302c04`), **uncommitted**, waiting for the owner's go-ahead (or a Reviewer LGTM). Two changes, one PR (lean mode):

1. **Social avatar** (owner's quick ask): the account button shows the Google/GitHub profile photo over the initials. `image` now flows session → `SessionUser` (`lib/auth/gate.ts`, `owner.ts`) → `ShellAccount.image` (`lib/shell/account.ts`, `avatarUrl()` keeps `https:` only) → `components/shell/account-menu.tsx` (`Avatar`: fades in on load, initials stay on failure, `referrerPolicy="no-referrer"`, a ref check for photos cached before hydration).
2. **T91, offline cold start** (ADR-0016 amendment 2026-11-13): a service worker on the hosted origin. `lib/sw/policy.ts` (pure, tested), `lib/sw/worker.ts` (event glue), `lib/sw/client.ts` (register / tell account), `components/providers/service-worker.tsx` (in the root layout), `scripts/build-sw.ts` (Bun.build ⇒ ignored `public/sw.js`, run by `bun run build`). Pages are network first (navigation preload; offline, 5xx or > 3 s ⇒ saved copy; unsaved ⇒ 302 to saved `/`). `/_next/static` is cache first. Saved pages are per account: the shell reports its scope; sign-out, deletion and the login page report null.

The full rules are in SPEC T91 and the ADR-0016 amendment. `CHANGELOG.md` has an entry for each change. The T90 hand-off docs (this file's predecessor and `LATEST.md`) ride in the same commit.

## Verified

- tripwire clean, typecheck clean, `bun run test` 185 files / 1877 tests.
- Real browser (demo standalone build on :3305, Playwright, persistent profile): the visits saved `/`, `/money` and `/money?tab=x`. A sign-out message emptied the pages and a revisit refilled them. With the server killed, a fresh browser on the same profile rendered `/` and `/money` from cache (styled, hydrated), and `/notes` (never visited) landed on `/`. `/sw.js` answers 200 with `no-cache`.
- Found and fixed during the check: wiping on *any* marker change raced the new account's first saved page (`/` was never kept). Now pages saved while signed out, or before the first report, are adopted (`wipesPages`).

## Not checked

- The avatar on screen with a real signed-in Google account (demo has no photo). If the owner's account started with email/passkey and linked Google later, `user.image` may be empty.
- The Electron app on the hosted origin with the worker (needs a deploy). The e2e suite runs in CI only.

## Next steps (in order)

1. Owner: commit / push / PR on your word.
2. After deploy: sign in on the web, open a few pages, go offline, reload. Then in `desktop:preview`, quit, go offline and start the app: it should open instead of "Can't reach Wanheda".
3. Still open from before: `desktop:preview` native folder + read-aloud check, the Neon deletion test, T89 nit 3.

## Notes

- `public/sw.js` exists locally (ignored). `next dev` serves it, but dev unregisters any worker, so the owner's dev server is unaffected.
- Kill switch, if the worker ever misbehaves: ship one whose install unregisters itself and deletes the `wanheda-*` caches. A 404 does not remove an installed worker.
