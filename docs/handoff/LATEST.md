# Latest hand-off

**Newest:** [2026-11-05-phase-4-income-core.md](2026-11-05-phase-4-income-core.md). **Phase 4 CP1 (T40, income core) built on `phase-4/income-core`; Reviewer LGTM with nits (2 folded in) ⇒ committed, pushed, PR opened; the user merges.** PR #24 (Phase 3 exit) merged. SPEC: Phase 3 draft applied; Phase 4 V33–V37 and T40–T45 approved. Built: 7 income tables (`0006_saas`, applied to Neon), sealed connector secrets (`CONNECTOR_SEAL_KEY`), Polar webhook verify (key = secret's UTF-8 bytes, cross-checked against `standardwebhooks`), webhook route, pull sync, `reconcile()` fold, Settings › Connections. Typecheck, Vitest 74 files / 811, tripwire, ESLint on touched files and build pass. `app/globals.css` holds an edit that isn't this session's: left out of the PR.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
commit, push and PRs only on the user's word; a short hand-off + continuation prompt after every
PR. No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app feel, V24.

Read docs/handoff/2026-11-05-phase-4-income-core.md first. If branch phase-4/income-core is
still uncommitted: on the user's word commit (files staged by name, list in the hand-off; NOT
app/globals.css), push, open the PR. If it is merged: `git fetch`, check
`sh scripts/forged-commits.sh 112497e..origin/main`, fast-forward main, then build T41
`phase-4/mrr-engine` per SPEC §T (V34–V37): pure movementsFrom(events) + mrrAt + metrics over
billing_event payloads; reconcile() rebuilds mrr_movement per product in one transaction
(deterministic ids); metric_snapshot from Polar GET /v1/metrics/ beside computed; V37 alerts;
demo seed events. Movements from snapshot transitions only (webhook and pull copies of one state are 2 rows; review nit 2). First settle V35's `?` (week/day normalisation, amount vs discount) against
Polar's docs or the owner's real org. Tests: rebuild ⇒ identical rows; Σ movements = MRR; refund
before payment; out-of-order updates; cancel at period end ⇒ churn on end date; trial ⇒ 0 then
new. Any new SQL: generate, show it, apply only on the user's go-ahead
(`bun --env-file=.env.local run db:migrate`). Never bunx an unpinned tool.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the phase-4/income-core PR (T40). Riskiest: webhook verify (key = secret's UTF-8 bytes,
multi-sig header, ±5 min, constant-time, raw body before parse); route order (nothing written
before verify; 404/503/401/413 paths; after() only on a new delivery); recordDelivery batch
atomicity and unique keys; sync snapshot ids (repeat pull ⇒ 0); seal (AAD = connector id, fresh
IV, broken blob ⇒ only a new token); no secret in any reply, log or last_error; jsonb `||` config
merges vs a concurrent map edit; products archive Undo/× semantics; migration 0006 (RLS, cascades,
nulls-not-distinct unique). Context: docs/handoff/2026-11-05-phase-4-income-core.md.
```
