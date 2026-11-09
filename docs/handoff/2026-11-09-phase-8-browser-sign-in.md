# Hand-off — Phase 8: Desktop — GitHub sign-in in the default browser

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8, owner request between T79 and T80: desktop GitHub sign-in moves from the in-app auth window to the default browser |
| Branch | `phase-8/desktop-browser-sign-in` (off `main` at `8702037`), uncommitted, waiting for review |
| HEAD at start | `8702037` — Merge pull request #84 from kleenpulse/phase-8/desktop-tts |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-t79-desktop-tts.md |

## State in one paragraph
The owner installed the T79 build, imported their `.env` and saw GitHub's sign-in page inside Wanheda's own window. They asked for sign-in in the default browser, the way VS Code and git do it.

That is built. The app's window still starts the sign-in, so Better Auth's signed state cookie stays in the app's session. Main opens GitHub's authorize page in the browser instead of letting the window go there. GitHub sends the browser back to the local server, whose token gate passes that one tokenless request's query to main and moves the tab to a script-free "Back to Wanheda" page. Main loads the callback in the app's window only if the query answers the sign-in it started, and Better Auth finishes there.

`desktop:dev` keeps the auth window, because `next dev` has no gate to catch the browser's return.

## Done this session
- `desktop/oauth.ts` (pure, + `oauth.test.ts`):
  - `signInFrom`: the pending sign-in, from an authorize URL whose `redirect_uri` is this app's callback, with a state of 16–256 characters and a 10-minute expiry (Better Auth's verification row; its state cookie lapses at 5 minutes, after which Better Auth itself answers "try again").
  - `callbackQuery`: requires the same state, exactly one of a code or an error, single values of at most 1 KB each, and is rebuilt from the five known parameters only.
  - `browserReturn`: tokenless GET plus exact Host, for the callback path or `/desktop/signed-in` with no query.
  - The static page and its headers: CSP `default-src 'none'`, no script, `no-store`, `no-referrer`.
- `desktop/server/bootstrap.ts`: the gate checks `browserReturn` before the token guard. A callback reports `oauth-callback` to the shell and answers 303 to the page. Nothing reaches Next without the token.
- `desktop/server-process.ts`: `ServerHandle.onOAuthCallback`. It is wired for the standalone server; dev's is a no-op.
- `desktop/main.ts`:
  - `startGitHubSignIn` opens the browser, or the auth window in dev.
  - `finishSignIn` shows the window, then loads the callback in it.
  - `attach` subscribes to the current server only and clears the pending sign-in.
- `components/auth/sign-in-panel.tsx`: on desktop, after GitHub opens, the button is enabled again ("Open GitHub again") with the hint "Finish signing in on GitHub. Wanheda picks it up from there." (worded for dev's auth window too)
- `desktop/scripts/smoke.ts`: four new checks (303 to the page, the query relayed, the page is 200, a foreign Host gets 403).
- Docs:
  - SPEC V68 amended.
  - ADR-0014 got an amendment line.
  - desktop/README "GitHub sign-in" now describes the browser flow.
  - The CHANGELOG's unreleased desktop sentence was updated.

## Verification (actual results)
- tripwire clean. `typecheck` and `desktop:typecheck` clean. Tests: 167 files, 1673 passed. ESLint on the changed files: 0.
- `desktop:stage` then `desktop:smoke`: 10/10. That covers the old six, plus the 303 to `/desktop/signed-in`, the query relayed exactly, the page answering 200, and a foreign Host on the callback getting 403.
- **Preview** (demo, port 53532):
  - A tokenless callback with an unknown state got 303 to `/desktop/signed-in`.
  - The main log said `sign-in: a callback that doesn't answer this app's sign-in was ignored`.
  - The page was served with its CSP and "Back to Wanheda".
- **Not checked:**
  - A real GitHub round trip. It needs the owner's credentials and their OAuth app, whose callback is set for the installed app's port, 62899.
  - The accepting path end to end. Testing it would have opened the owner's browser while they were using it.

## Review (wanheda-87): LGTM with nits, all three taken
- **Nit 1:** the TTL comment and docs now say Better Auth's state cookie lapses at 5 minutes and its verification row at 10. Main keeps 10, so a late return gets Better Auth's "try again" instead of silence.
- **Nit 2:** the hint is worded for both flows: "Finish signing in on GitHub."
- **Nit 3:** the tab's page adds "If Wanheda didn't sign you in, start again from the app." That covers an older tab's return after "Open GitHub again".

## Decisions made
- **Loopback on the existing server port, not a `wanheda://` callback.** GitHub then redirects to the registered callback exactly, the browser shows no "Open Wanheda?" prompt, and nothing new listens.
- **Main pins the state** taken from the authorize URL it opened. A local page that pings the callback can't move the app's window, because unsolicited callbacks are ignored. The state cookie check in Better Auth still applies.
- **Dev keeps the auth window.** Catching the return under `next dev` would need a relay into Next's own process, which isn't worth it for dev.

## Known problems and risks
- When the browser comes back, Windows may only flash Wanheda's taskbar button instead of bringing it forward (focus-stealing rules). The sign-in still completes.
- If the port moves, the GitHub callback has to be updated, as before.

## Next steps (in order)
1. Reviewer wanheda-87 reviews the uncommitted diff. On LGTM: commit, push, open a PR. Merging is the owner's call.
2. The owner rebuilds (`bun run desktop:build`), reinstalls, and signs in with GitHub to check the real round trip.
3. T80 still waits for the owner's yes (ffmpeg ≈ 126 MB).

## Files to read first
- desktop/oauth.ts, desktop/server/bootstrap.ts (the gate), desktop/main.ts (`startGitHubSignIn`, `finishSignIn`, `attach`), components/auth/sign-in-panel.tsx

## Env / services touched
- No new env vars. No downloads.

### Reviewer prompt

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only, one pass.
Review the uncommitted diff on phase-8/desktop-browser-sign-in (desktop GitHub sign-in in the default browser). Read docs/handoff/2026-11-09-phase-8-browser-sign-in.md, SPEC V68, desktop/README.md "GitHub sign-in".
Bugs and edge cases only; verdict LGTM / LGTM with nits / FIX, sent to the Builder.
Weigh hardest: the tokenless path through the gate (nothing reaches Next without the token), state pinning and replay, the 303 page, the sign-in panel on web vs desktop.
```
