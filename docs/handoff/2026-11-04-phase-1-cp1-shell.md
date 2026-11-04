# Hand-off — Phase 1: The shell and the island — Checkpoint 1 (shell port)

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / checkpoint | Phase 1, CP1 (SPEC T22): admin_shadow-garden shell ported to Ember/Nebula |
| Branch | `phase-1/shell` (worktree `D:\Vxrcel\wanheda-wt\shell`), base `0490755` (= `origin/main`), upstream unset on purpose |
| Last code on main | `04907551e5bea75c6d27ceec7e8a383e3738a0a4` — Merge pull request #3 from kleenpulse:phase-0/done |
| Previous hand-off | docs/handoff/2026-11-04-phase-0-done.md |
| State of the work | **Not committed.** Waiting for the Reviewer's Checkpoint 1, then the user's go-ahead |

## State in one paragraph

The shell has arrived. Every page in `app/(shell)` now sits in a `ShellFrame`: an 84 px nav rail that widens to 232 px (`[` or the Collapse button), with its state in the `wanheda-rail` cookie. The layout reads the cookie on the server, and an inline `<head>` script reads the same cookie before first paint, so the static Suspense fallback already draws the rail band at the right width and the streamed shell lands without a shift (Reviewer round 1 FIX, SPEC B2/V22). Below `md` the rail becomes a floating glass tab bar. Pages use `PageFrame` (header on the band, rounded sheet). The rail and the tab bar are built from `lib/modules.ts` (manifest v1); Phase 1 has only Home plus the Settings system page. A new `/settings` page holds the theme toggle, add passkey and sign out. Phase 1 is planned in SPEC §T as T22–T28.

## Done this session

- Verified the Phase 0 done hand-off against the repo: no differences (see Verification).
- **SPEC:** §T gains T22–T28 (Phase 1 checkpoints: shell, palette, island, board, mini windows + dock, prefs + notifications, exit). §I gains the CP1 interfaces.
- **Shell port** (from `D:\Vxrcel\admin_shadow-garden\components\shell` + `lib\shell\rail.ts` + `components\admin\nav.ts`; the prompt's `components\admin` holds only `nav.ts` of these): `components/shell/{shell-frame,nav-rail,mobile-tab-bar,page-frame,account,account-menu,mode-chip,styles,wanheda-mark}.tsx|ts`, `lib/shell/{rail,account}.ts`, `lib/modules.ts`. Tokens remapped from the admin's Bench names to Ember/Nebula roles following the skill's `[R] App frame` recipe (`components.md` lines 289–299). `SPRING_DETENT` → `TAB_SPRING`, with `layoutDependency`.
- **Primitives:** `components/ui/tooltip.tsx` (Raven goo-morph tooltip, `TooltipGroup` + `Tip`), `components/ui/menu.tsx` (frosted menu), `components/ui/kbd.tsx`. One new dependency: `@base-ui/react` **1.9.0**, pinned (published 2026-10-09, past the 7-day cooldown; still 4 blocked postinstalls, none new). The admin also used Radix for its dropdown; Wanheda uses Base UI for both.
- `components/theme-toggle.tsx`: optional `className` (replaces the default look; the rail draws it as a circle).
- Home is a `PageFrame` with an empty state (the board is T25). The demo subtitle is shortened to "Seed data, open to anyone." because the long one was cut off at phone width.
- **Phase 0 nits folded in** (Reviewer, PR #3):
  1. `scripts/setup-deploy.sh`: `warn_first_deploy`'s ✓ now says "so branch pushes cannot reach Production" (was "become previews"); stage 4 says "The first push to main will, and it goes to Production" plus "Pushes to other branches deploy nothing (vercel.json git.deploymentEnabled)". (Wrote "cannot" because an apostrophe broke the single-quoted `printf`; `bash -n` caught it.)
  2. The Phase 0 done hand-off cites `dpl_6Rp2ivKjHteqDA4fjJvVuE1h2uir` as the §B1 live-test proof; that deployment was **removed** later (the user asked to cut Vercel usage). Surviving proof, checked today with `gh`: the Vercel bot comment on PR #3 lists that deployment as **Preview** at `wanheda-git-phase-0-done-vxrcels-projects.vercel.app`, and commit `d887a54` carries the status `Vercel success — Deployment has completed`.
- CHANGELOG `[Unreleased]`: two lines for the shell and Settings.
- **Reviewer round 1 (FIX + 2 nits), all taken:**
  - FIX, the first paint had no rail: the fallback was rail-less, so on a hard load the page column painted at x=0 and the rail pushed it 84/232 px right when `requireOwner()` resolved. Fix: `railBootScript()` in `lib/shell/rail.ts`, rendered as an inline `<head>` script in `app/layout.tsx` (sets `html[data-rail=open]`; never throws); the `app/(shell)` fallback now draws the rail band and sets `--rail-w` from that attribute. `ShellFrame` writes the cookie and the attribute after a change (not on mount). Recorded as SPEC B2 + V22.
  - Nit 1: sign-out had no failure path. New `signOutOk()` in `components/auth/account-actions.tsx` (false on an error response or a throw); both `SignOutButton` and the account menu use it and show "Sign-out failed, try again" instead of staying stuck on "Signing out".
  - Nit 2: `[` now also works with AltGr (Ctrl+Alt on Windows, `getModifierState("AltGraph")`); plain Ctrl+`[` is still ignored.
- **Reviewer round 2: LGTM with nits.** The Reviewer measured a real first paint (3 s probe after `requireOwner()` in its scratch copy only, system Chrome): fallback and finished shell identical in every sample, light and dark, no console messages. One nit taken: the account menu's sign-out item has `closeOnClick={false}`, so "Signing out" / "Sign-out failed, try again" stay visible (Base UI closes a menu item on click by default).

## Verification (actual results, not intentions)

- **Phase 0 hand-off check on `main` (`0490755`):** `git merge-base --is-ancestor ed389f2 origin/main` ok; last 10 commits all author TZ = committer TZ = +0100; `sh scripts/forged-commits.sh ed389f2..origin/main` → clean (3 commits); install, tripwire, typecheck, lint exit 0; Vitest 11 files / 194 passed; build exit 0; `test:e2e` 10 passed. Same as the hand-off.
- **This worktree, final tree (after round 1):** tripwire exit 0; typecheck exit 0; lint silent; Vitest **15 files / 231 passed** (new: `lib/shell/rail.test.ts` incl. the boot script on fake documents — open for `wanheda-rail=open`, `a=1; wanheda-rail=open`, `wanheda-rail=open; b=2`; nothing for `closed`, `xwanheda-rail=open`, `wanheda-rail=opened`, `a=wanheda-rail=open`, `""`; no throw when `document.cookie` throws; `lib/shell/account.test.ts`; `lib/modules.test.ts`; `components/auth/account-actions.test.ts`); build exit 0 (routes `/` ◐, `/login` ◐, `/settings` ◐, `/api/auth/[...all]` ƒ); `test:e2e` **13 passed** (new, demo: "the server paints the rail at the width its cookie says"; "the static shell already has a rail at the cookie's width" — HTML before the first `hidden id="S:` holds the boot script and the `data-rail-skeleton` band; "/settings is a shell page"); `bash -n scripts/setup-deploy.sh` ok.
- **Round 1 FIX measured in the browser** (built app, demo, 1440×900): the static shell alone (HTML before the first `S:` segment, other scripts stripped, rendered in a same-origin iframe) vs the finished shell — cookie `closed`: band 84 px, header x 116 = real rail 84, header 116; cookie `open`: `html[data-rail]` = `open`, band 232, header x 264 = real rail 232, header 264. Compiled CSS has `html[data-rail=open] …{width:232px}` and, inside `@media (min-width:48rem)`, the `--rail-w:232px` override. Toggle: `[` → attribute removed + cookie `closed` + 84 px; AltGr `[` → `open` + 232 px; Ctrl+`[` → ignored. Console: no messages (no hydration warning from the `<html>` attribute).
- **vxrcel-ui-design self-check:** no hex/`rgb()` and no `white`/`black` in `app/` `components/` `.tsx`; reduced-motion backstop present; the one `layoutId` has `TAB_SPRING` + `layoutDependency` + `useId()`; no `src/` or `pages/`. Signal-family classes used: `bg-signal`, `bg-signal-soft`, `text-signal`, `ring-signal`, plus `bg-accent` as the Nebula hover surface (same use as `components/ui/button.ts`). No numbers rendered yet.
- **In the browser** (built app, zero env = demo, `next start` on :3210, Chrome DevTools): Ember desktop 1440×900 (rail collapsed, Home active); `[` → rail 232 px and `document.cookie` = `wanheda-rail=open`; reload in Nebula on `/settings` → rail still 232 px from the server, gold pill on Settings; phone 390×844 Ember: tab bar shown, rail `display:none`, `scrollWidth` 390 (no overflow); phone Nebula: account menu opens above the tab bar, focus on its first item; desktop Ember collapsed: hovering Home shows the goo tooltip "Home". Screenshots are in the session scratchpad, not the repo. The phone shots were taken **before** the subtitle was shortened; the short subtitle is not screenshotted.
- **Not verified:** the owner (signed-in) view, the sign-out menu item and the passkey button on `/settings` (these need real auth; demo only here); Lighthouse (T28); keyboard-only walk of the rail; reduced-motion run.

## In progress / not finished

- T22 is `~` until the review cycle closes. Nothing else started.

## Decisions made

- **One headless library:** `@base-ui/react` for the tooltip and the menu (no Radix).
- **Manifest v1 is minimal:** `{id, title, icon, route: Route, blurb}`. Settings is a `SYSTEM_PAGES` entry at the rail's foot, not a module. No rail group labels until there is more than one app. `route` is Next's typed `Route` (`typedRoutes` is on).
- **Shell fallback draws the rail band from a pre-paint script** (the next-themes pattern), not a rail-less skeleton: FR-SHELL-1 is P0 and the user's Neon cold start makes the fallback visible. The script will need a nonce or hash when a CSP lands.
- **The floating pill, the `/` key and the tab bar's search button wait for CP2** (the palette), so nothing ships that opens nothing.
- Demo account: name "Demo", mode "Demo · seed data", no sign-out.

## Known problems and risks

- Rail labels fade with `opacity-0` while collapsed, so they stay in the accessibility tree, but every one sits inside a control with its own `aria-label`; the bare "Theme" caption is `aria-hidden`.
- Carried from Phase 0: Vercel CLI login may predate the worm (re-login recommended); gitleaks not on `PATH`; FRD.md still mentions Neon preview branches; the C2 list vs tripwire (user's call).
- Open question for T27: FRD Phase 1 says "accent colour", while V15 allows one signal hue per skin. Ask the user before CP6.

## Next steps (in order)

1. Reviewer Checkpoint 1 on this diff → fix any FIX → user go-ahead → commit (explicit paths) → push `phase-1/shell` → PR → Reviewer push check → user merges → Reviewer merge check. `vercel.json` means the branch push deploys nothing; only the merge to `main` deploys.
2. T23 (CP2 `phase-1/palette`): cmdk palette, zustand store, floating pill, `/` and Ctrl/⌘K, manifests gain `commands`, theme commands via `revealTheme`.

## Files to read first

- `SPEC.md` §T (T22–T28), §I (P1 CP1 lines), §V15–V17
- `components/shell/shell-frame.tsx`, `components/shell/nav-rail.tsx`, `app/(shell)/layout.tsx`, `lib/modules.ts`
- `D:\Vxrcel\wanheda\FRD.md` (local only) §4.2, §6.1–6.2, §10 Phase 1

## Env / services touched

- None. No Vercel, Neon or GitHub writes; `gh` was used read-only (PR #3 comments, commit statuses).

## Review state (two-session model, §10.1)

- Phase 0: closed (PR #3 merged as `0490755`; the two optional nits are folded into this diff).
- Phase 1 CP1 (`phase-1/shell`, base `0490755`): round 1 = **FIX** (first paint had no rail; the Reviewer measured the stream: fallback at byte 2112, rail at 13684, swap at 26383) + nits (sign-out failure path; AltGr) → all applied; round 2 = **LGTM with nits** (one nit: `closeOnClick={false}` on the sign-out item, taken). **Waiting for the user's go-ahead** to commit (33 paths, explicit), push and open the PR; then the Reviewer push check (SHA + PR number), merge, merge check.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 1 — The shell and the island. Current checkpoint: CP1 shell port (SPEC T22),
branch phase-1/shell in worktree D:\Vxrcel\wanheda-wt\shell, base 0490755, not committed.
Read these first, in order:
1. docs/handoff/2026-11-04-phase-1-cp1-shell.md in that worktree (the hand-off)
2. D:\Vxrcel\wanheda\FRD.md (local only) §10.0–10.1, §4.2, §6.1–6.2 and §10 Phase 1
3. SPEC.md §T (T22–T28), §I, §V and §B

Before writing code, verify the hand-off against the worktree:
- `git fetch`; `origin/main` must still be 0490755 (or check every new commit with
  `sh scripts/forged-commits.sh 0490755..origin/main` before rebasing).
- `git status` must list the files the hand-off names; run `bun run tripwire`,
  `bun run typecheck`, `bun run lint`, `bun run test` (15 files, 231 passed),
  `bun run build`, `bun run test:e2e` (13 passed). Report any difference first.

Then: if the Reviewer's CP1 verdict is pending, ask for it (ListAgents → SendMessage) and
fix any FIX. Commit, push and open the PR only after the user's go-ahead (stage paths
explicitly). After the merge check passes, start T23 (CP2 palette) on phase-1/palette in
D:\Vxrcel\wanheda-wt\palette. At the next checkpoint: review request, then a new hand-off.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-1-cp1-shell.md in D:\Vxrcel\wanheda-wt\shell,
section "Review state", and FRD §10.1.
Open item: Checkpoint 1 on phase-1/shell (worktree D:\Vxrcel\wanheda-wt\shell,
base 0490755, uncommitted). Then the push and merge checks once the user approves.

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §4.2, §6.1–6.2 and §10 Phase 1,
SPEC.md §V (the invariants every diff must keep) and §B, and the repo rules in CLAUDE.md.
```
