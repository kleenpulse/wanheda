# Hand-off — Phase 0: Foundation — Checkpoint 1 closed

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / checkpoint | Phase 0 — Checkpoint 1 closed (reviewed, pushed, CI green); Checkpoint 2 not started |
| Branch | `phase-0/env-db-auth` (worktree `D:\Vxrcel\wanheda-wt\env-db-auth`, no upstream set) |
| HEAD | `e2fd50b258a7cef7176b60112b71c79c01a098b4` — chore: phase 0 scaffold, security rails and docs |
| Previous hand-off | docs/handoff/2026-11-04-phase-0-scaffold.md |

## State in one paragraph

The Phase 0 scaffold is public at https://github.com/kleenpulse/wanheda. `main` = `e2fd50b` (one commit, author and committer both +0100). The `protect-default-branch` ruleset (id 26546157) is active: no deletion, no force-push, PRs only (0 approvals), required checks `rails` and `check`, no bypass actors. The first CI run (41865966810, push) passed both jobs. The Checkpoint 2 branch and worktree exist with no code changes yet; this hand-off and `LATEST.md` are the only edits on it.

## Done this session (since the previous hand-off)

- Reviewer CP1 FIX 1 (false tripwire claim about FRD.md) and FIX 2 (worktrees can't see the local-only FRD) fixed in the docs; nits taken (username out of public files, plan ranges, README wording).
- User go-ahead → 49 files staged explicitly → commit `e2fd50b` (pre-commit hook ran tripwire + gitleaks) → `gh repo create kleenpulse/wanheda --public` → push `main` → ruleset applied.
- 20 repo topics added (repo metadata only, no commit), at the user's request.
- gitleaks 8.30.1 installed locally (winget).
- `git worktree add D:\Vxrcel\wanheda-wt\env-db-auth -b phase-0/env-db-auth origin/main`, then `git branch --unset-upstream` so a bare `git push` can't target `main`.

## Verification (actual results, not intentions)

- Before the commit: tripwire clean; typecheck pass; `bun run test` 50 passed; lint 0 problems; zero-env build pass.
- After the commit: `git check-ignore .env.local` passes; `git ls-files` = 49, the only env file is `.env.example`; `gitleaks git .` → no leaks; `sh scripts/forged-commits.sh HEAD` → clean (1 commit).
- `git fetch` then `origin/main` = local `main` = `e2fd50b`; `forged-commits.sh origin/main` → clean.
- CI run 41865966810: `rails` success (9 steps: tripwire, forged commits, gitleaks install + checksum, canary, whole-history scan) in 5 s; `check` success (11 steps: install, typecheck, test, zero-env build, lint) in 29 s. Confirmed from the job/step API by both sessions. The run-level status still showed `in_progress` (GitHub lag), so the raw log lines (e.g. "canary caught, as expected") were not read yet.
- In the new worktree, `FRD.md` does not exist (as expected) and `D:\Vxrcel\wanheda\FRD.md` resolves.
- Exit criteria (Phase 0): still none can pass; they need Checkpoints 2–3.

## In progress / not finished

- Nothing half-done. Uncommitted on `phase-0/env-db-auth`: this file and `docs/handoff/LATEST.md` (they go into the Checkpoint 2 commit).

## Decisions made

- Repo owner `kleenpulse` (no `Vxrcel` account exists on GitHub). FRD.md stays local and gitignored (user, 2026-11-04).
- Ruleset applied after the first push, so the push could create `main`.
- Standing rule from the user: every checkpoint close, phase end and session stop gets a new hand-off doc and continuation prompts.

## Bugs found

- None.

## Known problems and risks

- Open from Checkpoint 1: `package.json` lists `sharp` and `unrs-resolver` in both `ignoreScripts` and `trustedDependencies` (as `create-next-app` wrote them); settle in Checkpoint 2.
- `scripts/tripwire.sh` matches three C2 addresses that the private incident record's repo-scan regex lacks; aligning the record is the user's call.
- The raw CI log lines were not read (run-level status lag); re-check once the run shows `completed`.
- `.env.local` still holds `DATABASE_URL` only. Once Checkpoint 2 lands, that local setup is the `locked` gate mode (503 everywhere) until the auth vars are added. That is intended.

## Next steps (in order)

1. Start Checkpoint 2 when the user says go: §T13 `env/server.ts` + `env/client.ts` in this worktree.
2. §T14 `lib/capabilities.ts` + `gateMode()` + tests; §T15 `lib/db`; §T16 auth schema; §T17 `lib/auth`; §T18 `proxy.ts` + `/login` + `(shell)`.
3. Settle `ignoreScripts` vs `trustedDependencies`.
4. Verify → new hand-off → review request (Checkpoint 1 of the CP2 cycle) → user go-ahead → commit, push the branch, open a PR → Reviewer push check → user merges → Reviewer merge check.

## Files to read first

- `D:\Vxrcel\wanheda\FRD.md` (local only, not in the repo or worktrees) §2 D2, D3 and §10 Phase 0
- `SPEC.md` §T (T13–T18) and §V (V6–V9, V21)
- `~/.claude/plans/its-time-to-execute-snoopy-beaver.md` (approved plan, Checkpoint 2)
- `CLAUDE.md`, `.env.example`, `scripts/tripwire.sh`

## Env / services touched

- GitHub: repo `kleenpulse/wanheda` (public), ruleset `protect-default-branch` (26546157), 20 topics. Actions enabled.
- No new env var names. No Neon migrations. No Vercel project yet.

## Review state (two-session model, §10.1)

- Checkpoint 1 cycle (first commit, `main`): diff review LGTM with nits (FIX 1 and FIX 2 resolved, last nit applied before the commit); first-push check passed on `e2fd50b` (same SHA everywhere, TZ clean, tree = reviewed tree, tripwire + gitleaks clean in a fresh clone, ruleset confirmed); CI green (confirmed by the Reviewer from the API).
- Checkpoint 2 cycle (`phase-0/env-db-auth`): not started. Nothing pending on the Reviewer.
- Nits left open on purpose: `ignoreScripts`/`trustedDependencies` (CP2); C2 list alignment (user's call).

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 0 — Foundation. Last checkpoint: Checkpoint 1 closed (pushed, CI green).
Read these first, in order:
1. docs/handoff/2026-11-04-phase-0-cp1-closed.md (the hand-off), in the worktree
   D:\Vxrcel\wanheda-wt\env-db-auth
2. D:\Vxrcel\wanheda\FRD.md (local only, not in the repo or worktrees) §10.0–10.1 and §2 D2, D3, §10 Phase 0
3. SPEC.md §T and §V

Before writing code, verify the hand-off against the repo:
- `git fetch`, then `git merge-base --is-ancestor e2fd50b origin/main`
  must succeed.
- `git log -10 --format='%H %an %ad %cd %s'`: author and committer
  timezones must match on every commit; flag any you didn't expect
  (forged-commit rule). `sh scripts/forged-commits.sh origin/main` must be clean.
- Run `bun install`, `bun run tripwire`, then `bun run typecheck` and `bun run test`,
  and compare with the hand-off's Verification section. If anything differs,
  report it before continuing.

Then do next step 1: §T13 env schema, starting in env/server.ts, on branch
phase-0/env-db-auth in worktree D:\Vxrcel\wanheda-wt\env-db-auth.
At the next checkpoint: send the reviewer a review request (FRD §10.1),
then write the next hand-off (FRD §10.0).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-0-cp1-closed.md (in D:\Vxrcel\wanheda-wt\env-db-auth),
section "Review state", and FRD §10.1.
Open items:
- nothing pending; wait for the builder's review request for Checkpoint 2
  (branch phase-0/env-db-auth, worktree D:\Vxrcel\wanheda-wt\env-db-auth, base e2fd50b).

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §2 D2, D3 and §10 Phase 0,
SPEC.md §V (the invariants every diff must keep), and the repo rules in CLAUDE.md.
```
