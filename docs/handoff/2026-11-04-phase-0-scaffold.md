# Hand-off — Phase 0: Foundation — Checkpoint 1 (scaffold + rails + docs)

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / checkpoint | Phase 0 — Checkpoint 1: scaffold, security rails, design tokens, docs |
| Branch | `main` (no commits yet; this is the first commit, FRD Phase 0 exception) |
| HEAD | none — not committed |
| Previous hand-off | none (first) |

## State in one paragraph

`D:\Vxrcel\wanheda` is a git repo (`main`, no commits) holding a Next.js 16.4.3 + Bun app with the Ember/Nebula skins, a placeholder home page, the worm tripwire, the forged-commit check, gitleaks config, a husky pre-commit hook, CI (`rails` → `check`), ADR 0001–0011, the glossary, the hand-off protocol, `SPEC.md` and `CLAUDE.md`. There is no env, DB or auth code yet (Checkpoint 2). Everything is uncommitted and waiting for Reviewer Checkpoint 1 and the user's go-ahead.

## Done this session

- §T1 FRD.md amended (Reviewer `wanheda-19` FIX 1–4 + nits; Beta's contradictions) — uncommitted, and `FRD.md` is now gitignored (see "Known problems").
- §T2 `.gitignore` before `git init -b main`; `.gitattributes` forces LF.
- §T3 scaffold made in a scratch dir and moved in; versions pinned exactly; `bunfig.toml` 7-day cooldown; strict tsconfig; `next.config.ts`; `eslint.config.ts`.
- §T4 `AGENTS.md` matches `node_modules/next/dist/server/lib/generate-agent-files.js`.
- §T5 `scripts/tripwire.{sh,ts,test.ts}`; §T6 `scripts/forged-commits.{sh,test.ts}`; §T7 `.gitleaks.toml`, `.husky/pre-commit`, `.vscode/settings.json`; §T8 `.github/workflows/ci.yml`.
- §T9 design tokens + providers + placeholder page; §T10 docs.

## Verification (actual results, not intentions)

- `sh scripts/tripwire.sh`: `tripwire: clean`, exit 0, on the 49 untracked files. FRD.md is gitignored, so the tripwire does not read it (`git grep --untracked -l . -- FRD.md` prints nothing); it was scanned separately with `TRIPWIRE_TARGET` on a copy: clean, exit 0.
- `bun run typecheck`: pass (exit 0).
- `bun run test` (Vitest): 50 passed, 0 failed (2 files: tripwire 39, forged-commits 11).
- `bun run lint`: 0 problems.
- `bun run build` with `.env.local` moved out and a stripped environment: pass (`/` static).
- `bun run start` on port 3917: `GET /` → 200, heading "Wanheda". Screenshots checked: Ember light at 1280×800, Nebula dark at 390×844 phone.
- `git check-ignore -v .env.local` → `.gitignore:7:.env*`. No env file is untracked except `.env.example`.
- gitleaks 8.30.1 installed locally (winget, user's go-ahead). `gitleaks dir .` finds 13 `generic-api-key` hits, all in the ignored `.next/` build output (Next's generated preview keys); none in files that will be committed.
- Not verified: CI itself (nothing pushed), the pre-commit hook end to end (no commit yet).
- Exit criteria (Phase 0): none can pass yet; login, deploy and CI proofs belong to Checkpoints 2–3.

## In progress / not finished

- Nothing half-done. All 49 files are untracked and listed by `git status`.

## Decisions made

- Ember + Nebula only; Bench deferred to Phase 1 (ADR-0009).
- Public repo `kleenpulse/wanheda` + ruleset (ADR-0011); EU Frankfurt (ADR-0010). FRD.md stays local (user, 2026-11-04).
- TypeScript pinned to 6.0.3 (Mita's version), not 7.0.2 (published the same day, Go port).
- Bun cooldown 7 days, as in Mita. It resolved next 16.4.3, react 19.3.1, motion 14.7.1, lucide-react 1.63.0.
- The Next 16.4 scaffold has no PostCSS config (Tailwind via `@tailwindcss/turbopack`), so no `.mjs` problem.
- Padding scan covers every non-Markdown file (stricter than `*.config.*` only; same as diff-reviewer's `verify.sh`).
- Recon corrections recorded in the FRD: rawstash (not ecommerce-app) holds the null DB handle pattern; `@neon/env|config` not used.

## Bugs found

- None in shipped code. Two fixes during the session: a TS type error in the forged-commits test helper, and a lint error in the skill's `use-reduced-motion` hook (arrow returning void) — both fixed before verification.

## Known problems and risks

- **`FRD.md` is gitignored** (the line appeared mid-session; the user confirmed on 2026-11-04 to keep the FRD out of the public repo). Docs and SPEC refer to it as a local-only file, so a fresh clone has no FRD.
- gitleaks lives under `%LOCALAPPDATA%\Microsoft\WinGet\`; a shell or editor started before the install may not have it on PATH (the hook then warns instead of scanning) until restarted.
- Port 3100 on this machine belongs to another app; use another port for local runs.
- `package.json` lists `sharp` and `unrs-resolver` in both `ignoreScripts` and `trustedDependencies`, exactly as `create-next-app` 16.4 wrote them. Whether Bun reads `ignoreScripts` is not verified; `bun pm untrusted` reports 0 untrusted packages with scripts. Left as generated; settle it in Checkpoint 2.
- `scripts/tripwire.sh` also matches three C2 addresses from the incident record's C2 list that its repo-scan regex (record line 96) lacks. Adding them to that private record so both match is the user's call.

## Next steps (in order)

1. Reviewer Checkpoint 1 on the untracked tree (review request sent to `wanheda-19`).
2. User go-ahead → stage the 49 files explicitly → first commit → `gh repo create kleenpulse/wanheda --public` (no `Vxrcel` account exists on GitHub; the user chose kleenpulse) → push `main` → ruleset `protect-default-branch` (required checks `rails`, `check`).
3. Reviewer first-push check: pushed tree = reviewed tree, TZ check on every commit, whole-tree scan.
4. Create `D:\Vxrcel\wanheda-wt\` and start Checkpoint 2 on `phase-0/env-db-auth` (§T13–T18).

## Files to read first

- `D:\Vxrcel\wanheda\FRD.md` (local only, not in the repo) §2 (D2, D3), §10 Phase 0
- `SPEC.md` §T (T11 onward), §V (V6–V9)
- `~/.claude/plans/its-time-to-execute-snoopy-beaver.md` (approved plan, Checkpoint 2)
- `scripts/tripwire.sh`, `.github/workflows/ci.yml`, `CLAUDE.md`

## Env / services touched

- None. `.env.local` holds `DATABASE_URL` only (Neon `eu-central-1`); no migrations run, no GitHub repo, no Vercel project yet.

## Review state (two-session model, §10.1)

- Branch / PR: `main` / not pushed
- Checkpoint 1 (diff): pending
- Checkpoint 2 (push): replaced for the first push by the tree/TZ/scan check (FRD Phase 0)
- Checkpoint 3 (merge): n/a for the first push
- Nits left open on purpose: none

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 0 — Foundation. Last checkpoint: Checkpoint 1 (scaffold + rails + docs).
Read these first, in order:
1. docs/handoff/2026-11-04-phase-0-scaffold.md (the hand-off)
2. D:\Vxrcel\wanheda\FRD.md (local only, not in the repo or worktrees) §10.0–10.1 and §2 D2, D3, §10 Phase 0
3. SPEC.md §T and §V

Before writing code, verify the hand-off against the repo:
- `git fetch`, then confirm origin/main contains the Checkpoint 1 commit
  (or, if nothing is pushed yet, that `git status` matches the hand-off).
- `git log -10 --format='%H %an %ad %cd %s'`: author and committer
  timezones must match on every commit; flag any you didn't expect
  (forged-commit rule).
- Run `bun run tripwire`, then `bun run typecheck` and `bun run test`, and compare
  with the hand-off's Verification section. If anything differs, report it before
  continuing.

Then do next step 1 still open in the hand-off. For Checkpoint 2: §T13 env schema,
starting in env/server.ts, on branch phase-0/env-db-auth in worktree
D:\Vxrcel\wanheda-wt\env-db-auth.
At the next checkpoint: send the reviewer a review request (FRD §10.1),
then write the next hand-off (FRD §10.0).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-0-scaffold.md, section "Review state", and FRD §10.1.
Open items:
- main (untracked tree, first commit): checkpoint 1 pending — the whole tree is new.
- after the user's go-ahead and push: the first-push check (pushed tree = reviewed
  tree, TZ check on every commit, whole-tree IOC + secrets scan).

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §2 and §10 Phase 0, SPEC.md §V (the invariants
every diff must keep), and the repo rules in CLAUDE.md.
```
