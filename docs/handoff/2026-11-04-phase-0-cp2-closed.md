# Hand-off — Phase 0: Foundation — Checkpoint 2 closed

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / checkpoint | Phase 0 — Checkpoint 2 closed (merged as PR #1); Checkpoint 3 not started |
| Branch | `phase-0/deploy-and-exit` (worktree `D:\Vxrcel\wanheda-wt\deploy-and-exit`, no upstream set) |
| HEAD | `e1e38baea932946c9e676a0ab58b12e94831b170` — Merge pull request #1 from kleenpulse:phase-0/env-db-auth |
| Previous hand-off | docs/handoff/2026-11-04-phase-0-cp2-env-db-auth.md |

## State in one paragraph

Checkpoint 2 is merged: `main` = `e1e38ba`, a merge commit of `e2fd50b` (old main) and `ec6d947` (the reviewed CP2 commit), with a tree byte-identical to `ec6d947`. Env schema, gate modes, the Neon DB layer, the Better Auth schema (applied to Neon), GitHub + passkey auth, `proxy.ts`, `/login` and the `(shell)` placeholder are on `main`. Nobody can sign in yet: there is no GitHub OAuth app and no auth env anywhere. That is Checkpoint 3. The CP2 worktree and branch are removed. The CP3 worktree exists with no code changes; this hand-off and `LATEST.md` are its only edits.

## Done this session (since the previous hand-off)

- Reviewer round 1 FIX (open redirect via dot-segments in `safeNextPath`; absent `trustedDependencies` enabled Bun's default allowlist) → fixed, both nits taken → round 2 LGTM.
- `bun run db:migrate` with the user's go-ahead: `0000_auth` applied to the Neon DB (`eu-central-1`).
- User go-ahead → 47 paths staged by name → commit `ec6d947` (pre-commit: tripwire clean, gitleaks no leaks) → pushed `phase-0/env-db-auth` → user go-ahead → PR #1 opened → CI green → user merged → `e1e38ba`.
- Local `main` fast-forwarded after checking incoming commits; `git worktree remove` (clean tree) + `git branch -d` (merged) for the CP2 branch; `git worktree add D:\Vxrcel\wanheda-wt\deploy-and-exit -b phase-0/deploy-and-exit origin/main`, then `--unset-upstream`.

## Verification (actual results, not intentions)

- Before pulling: `git log main..origin/main` = 2 commits. Merge `e1e38ba` has parents `e2fd50b` + `ec6d947`, author Vxrcel +0100, committer GitHub +0100, `%G? = E` (web-flow key not imported; not needed, no exemption used). `forged-commits.sh main..origin/main` → clean (2 commits). `origin/main^{tree}` = `ec6d947^{tree}` = `44687f2…`.
- Local `main` after `git merge --ff-only`: `bun install --frozen-lockfile` → "Blocked 3 postinstalls"; tripwire clean; `gitleaks git .` → no leaks.
- PR #1 CI (run 41876510895, `pull_request`, head `ec6d947`): `rails` success (9 steps), `check` success (11 steps); GitGuardian (external app) success; merge state CLEAN.
- Push CI on `main` (run 41876958430, `push`, head `e1e38ba`): completed, **success**. `rails` success, `check` success. The run sat in GitHub's status lag for over 10 minutes (every `rails` step already green) before it finalised.
- Reviewer (wanheda-19), CP2 cycle: diff FIX → LGTM (round 2); push check passed on `ec6d947`, with 83/85 blobs identical to the reviewed snapshot and the 2 declared doc lines reviewed; PR checks passed (author kleenpulse, base main, 1 commit, 47 files, CI green); merge check passed on `e1e38ba` (all refs agree, merge tree = reviewed tree, forged check clean, tripwire + whole-history gitleaks clean, only `.env.example` tracked).
- In the new worktree: `git status` lists only this file and `LATEST.md`.
- Exit criteria (Phase 0): still not proven. They need the deployed URL (CP3).

## In progress / not finished

- Nothing half-done. Uncommitted on `phase-0/deploy-and-exit`: this file and `docs/handoff/LATEST.md` (they go into the CP3 commit).

## Decisions made

- Merge style: a merge commit (the user merged in the GitHub UI). GitHub auto-deleted the remote branch.
- The CP2 records in the previous hand-off stay as committed. The push check, PR checks and merge check are recorded here instead of in an extra commit.

## Bugs found

- Two, both found by the Reviewer before the commit and fixed in `ec6d947`: the `safeNextPath` open redirect, and an install-script trust gap (see the previous hand-off).

## Known problems and risks

- Sign-in is impossible until CP3 adds the GitHub OAuth app and the auth vars (locally and in Vercel). The main repo's `.env.local` holds `DATABASE_URL` only, so a local run there is **locked** (503 everywhere).
- Preview deploys with a Neon branch but no auth vars will be locked. CP3 decides whether previews get auth vars.
- Inside PPR pages, `requireOwner()` redirects arrive as a streamed redirect (HTTP 200). Playwright smoke should assert the final URL, not only the status code.
- GitHub ruleset: the PR merged with 0 approvals and the required checks green, as configured (ADR-0011).
- Still open from CP1: the private incident record's C2 list vs `scripts/tripwire.sh` (user's call).

## Next steps (in order)

1. Checkpoint 3 (§T19–T21) in this worktree:
   - `vercel.json` with `regions: ["fra1"]`.
   - Playwright smoke (`e2e/smoke.spec.ts`), two `webServer`s: gated (dummy DB + auth vars; `/` ends at `/login` after ≤ 1 redirect, `/login` 200) and locked (dummy DB only; `/` and `/money` 503, no data). Add `test:e2e` and the CI step.
   - A `wizard` for the user-only steps: GitHub OAuth app (local and prod callbacks), `vercel link` + env vars, Neon ↔ Vercel integration (preview branches, 7-day expiry), `.env.local` additions.
   - Deploy, then prove every Phase 0 exit criterion on the deployed URL and record actual results.
3. Phase 0 done hand-off with the Phase 1 Builder and Reviewer prompts → review → user merges → Reviewer merge check.

## Files to read first

- `D:\Vxrcel\wanheda\FRD.md` (local only) §10 Phase 0 (exit criteria)
- `SPEC.md` §T19–T21, §V6, §V8
- `~/.claude/plans/its-time-to-execute-snoopy-beaver.md` (approved plan, Checkpoint 3)
- `proxy.ts`, `lib/auth/gate.ts`, `.github/workflows/ci.yml`, `.env.example`

## Env / services touched

- Neon: migration `0000_auth` applied (user's go-ahead). GitHub: PR #1 opened and merged (by the user), branch auto-deleted. No Vercel project yet. No new env var names.

## Review state (two-session model, §10.1)

- Checkpoint 2 cycle (`phase-0/env-db-auth`): diff FIX → LGTM (round 2); push check passed (`ec6d947`); PR #1 checks + CI green; merge check passed (`e1e38ba`). **Closed.** Push CI on `main` green.
- Checkpoint 3 cycle (`phase-0/deploy-and-exit`, base `e1e38ba`): not started. Nothing pending on the Reviewer.
- Nits left open on purpose: login skeleton height (cosmetic); C2 list alignment (user's call).

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 0 — Foundation. Last checkpoint: Checkpoint 2 closed (PR #1 merged, main = e1e38ba).
Read these first, in order:
1. docs/handoff/2026-11-04-phase-0-cp2-closed.md (the hand-off), in the worktree
   D:\Vxrcel\wanheda-wt\deploy-and-exit
2. D:\Vxrcel\wanheda\FRD.md (local only, not in the repo or worktrees) §10.0–10.1 and §10 Phase 0 (exit criteria)
3. SPEC.md §T (T19–T21) and §V
4. ~/.claude/plans/its-time-to-execute-snoopy-beaver.md, "Checkpoint 3"

Before writing code, verify the hand-off against the repo:
- `git fetch`, then `git merge-base --is-ancestor e1e38ba origin/main` must succeed.
- `git log -10 --format='%H %an %ad %cd %s'`: author and committer timezones must match
  on every commit; `sh scripts/forged-commits.sh e2fd50b..origin/main` must be clean.
- `gh run view 41876958430 --repo kleenpulse/wanheda`: push CI on main must be green.
- Run `bun install`, `bun run tripwire`, `bun run typecheck`, `bun run lint` and `bun run test`
  (expect 10 files, 192 passed) and compare with the Verification section. Report any difference first.

Then do next step 1: Checkpoint 3 (§T19–T21) on branch phase-0/deploy-and-exit in worktree
D:\Vxrcel\wanheda-wt\deploy-and-exit. Every outward step (GitHub OAuth app, Vercel link,
env vars, Neon integration, deploy, new migrations) waits for the user's go-ahead.
At the next checkpoint: send the reviewer a review request (FRD §10.1),
then write the next hand-off (FRD §10.0).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-0-cp2-closed.md (in D:\Vxrcel\wanheda-wt\deploy-and-exit),
section "Review state", and FRD §10.1.
Open items:
- Push CI on main (run 41876958430, e1e38ba) finished green (builder confirmed via gh).
- Wait for the builder's review request for Checkpoint 3
  (branch phase-0/deploy-and-exit, worktree D:\Vxrcel\wanheda-wt\deploy-and-exit, base e1e38ba).

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §10 Phase 0 (exit criteria),
SPEC.md §V (the invariants every diff must keep, esp. V6, V8, V21), and the repo rules in CLAUDE.md.
```
