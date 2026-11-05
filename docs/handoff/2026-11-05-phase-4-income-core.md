# Hand-off — Phase 4 CP1: income core (T40)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / checkpoint | Phase 4 CP1, T40 `phase-4/income-core`, built; Reviewer wanheda-e9: LGTM with nits ⇒ committed, pushed, PR opened (user 2026-11-05: "always make PR after peer's LGTM") |
| Branch | `phase-4/income-core` (off main `112497e`; PR #24 merged, forged-commit check on `88f610c..origin/main` clean, 3 commits) |
| Previous hand-off | docs/handoff/2026-11-05-phase-3-exit.md |

## State in one paragraph

PR #24 (Phase 3 exit) was merged; main was fast-forwarded after the forged-commit check. The user approved the Phase 3 SPEC draft (T39 → x, V15 ₦ note, V31 soft delete, B19) and the Phase 4 draft (V33–V37, T40–T45). User decisions: Polar first for shadow-garden/PRO + rawstash; one Polar organization ⇒ one connector, products mapped by Polar product id; secrets sealed in the DB with `CONNECTOR_SEAL_KEY`; the net view counts ledger income only (SaaS revenue is its own line, so Polar payouts aren't counted twice). T40 is built: schema + migration `0006_saas` (applied to Neon on the user's go-ahead), seal, Polar webhook verify, events, client, store, sync, webhook route, actions, and Settings › Connections. Reviewer wanheda-e9 gave LGTM with nits (no FIXes); nits 1 and 3 folded in, nit 2 carried to T41; then committed, pushed and the PR opened under the user's standing rule (merge stays the user's).

## Done this session

- **SPEC**: Phase 3 draft applied; V33 (sealed secrets), V34 (ingest: signature over the raw body, dedupe, append-only, order by Polar's `modified_at`, refund before order), V35 (MRR engine, rebuildable, rounding, churn on access end), V36 (metrics, `—` for a zero denominator, Polar vs computed snapshots), V37 (income alerts, dedupe, only events < 48 h old). T40 → x with build notes and an §I entry; T41–T45 drafted.
- **Polar's webhook key**: Polar's SDK base64-encodes the secret string as-is before `standardwebhooks` decodes it, so the HMAC key is the secret's raw UTF-8 bytes (a `whsec_` prefix included, never decoded). Verified once against the real `standardwebhooks` library from shadow-garden's node_modules (scratch run, outside the repo); the unit tests pin it.
- **No `@polar-sh/sdk`**: plain `fetch` + loose zod on the fields we use. Unknown statuses and intervals pass through, so a new Polar enum can't sink a webhook. The whole object is kept as `billing_event.payload` for T41.
- **Webhook**: `POST /api/webhooks/polar/[connectorId]` (already public under `/api/webhooks`). Verifies before any write; processed_event + billing_event go in one `db.batch`; `after()` → `reconcile()` only for a new delivery. Unknown connector → 404, secret not set → 503 (so Polar retries), bad or stale signature → 401.
- **Sync**: pulls products, subscriptions, orders and refunds. Snapshot ids are `sync:<kind>:<id>:<modified>`, so a repeat pull adds 0 rows.
- **reconcile()** is a fold only in T40 (latest snapshot per object). T41 writes `mrr_movement` and raises the alerts.
- **Settings › Data › Connections** (`/settings?s=connections`, palette "Open connections (Polar)"): connect (token checked with Polar before saving), token hint + replace, webhook URL + copy + secret, sync, disconnect with inline Delete? ✓ ✕, products (optimistic add, archive with an Undo toast), and the Polar product → product mapping.
- **Env**: `CONNECTOR_SEAL_KEY` in the env schema (32 bytes base64, validated at build), `.env.example`, capability `connectors` = db ∧ key. A fresh key was appended to `.env.local` without being printed (user's choice). **Vercel Production needs its own key before this ships.**

## Review (wanheda-e9, one pass)

LGTM with nits. Confirmed upstream (polar-js `src/webhooks.ts`) that the key is the secret's UTF-8 bytes. Nits:
1. `setProductMap` merged in JS, so two map edits in flight (two tabs) could drop one → **fixed**: merge in SQL (`jsonb_set(config, '{productMap}', (coalesce(config->'productMap','{}') || adds) - removed)`), checked on Neon (add + remove, missing key, unknown key).
2. **For T41:** the webhook copy and the pull copy of one state are 2 `billing_event` rows (delivery id vs sync id). `latestSnapshots` collapses them; `mrr_movement` must come from snapshot *transitions*, never per row, or it double counts.
3. A signed but unreadable event was only `console.warn`ed → **fixed**: sets `connector.last_error` ("Polar sent an event Wanheda can't read yet…") so Settings shows it; test added.

## Verification (actual results)

- `bun run typecheck` pass. `bun run test` 74 files / 811 passed (after the review fixes). `bun run tripwire` clean. ESLint clean on every touched file. `bun run build` pass (`/api/webhooks/polar/[connectorId]` dynamic).
- Neon: 7 migrations recorded; all 7 new tables exist with RLS on.
- Browser (owner, :3000, dev server already running, `.env.local` reloaded): connect form shows; product "Motion Garden" added → survives reload (it's still in Neon, a real product the user wants); archive → Undo → still there 10 s later on the server; a junk token → real Polar 401 → "Polar refused the token…", nothing saved; `/api/connections` holds no sealed field; 0 console errors.

## Not done / open

1. **Owner check with a real token** (needs the user): create a Polar Organization Access Token (products, subscriptions, orders, refunds read; metrics read for T41), connect, map Polar products onto Motion Garden / rawstash, Sync now. The webhook needs a public URL: production after deploy, or a tunnel locally. Check whether Polar's products list leaves archived products out (T40 note).
2. `app/globals.css` has an edit that is not this session's (darker Bench dark palette: `--band`, `--sheet`, `--background` …). Read, benign; **left out of the PR** for the user.
3. Demo seed events → T41 (with the engine that reads them).
4. Still open from Phase 3: `local-store.ts` test (needs `fake-indexeddb`), Accounts and Subscriptions totals per currency.

## Files for the commit (stage by name)

`.env.example`, `SPEC.md`, `env/server.ts`, `lib/capabilities.ts`, `lib/db/schema/index.ts`, `lib/db/schema/saas.ts`, `drizzle/0006_saas.sql`, `drizzle/meta/0006_snapshot.json`, `drizzle/meta/_journal.json`, `lib/saas/seal-key.ts`, `lib/saas/seal.ts`, `lib/saas/seal.test.ts`, `lib/saas/connectors.ts`, `lib/saas/store.ts`, `lib/saas/server.ts`, `lib/saas/server.test.ts`, `lib/saas/reconcile.ts`, `lib/saas/polar/client.ts`, `lib/saas/polar/events.ts`, `lib/saas/polar/events.test.ts`, `lib/saas/polar/webhook.ts`, `lib/saas/polar/webhook.test.ts`, `app/api/webhooks/polar/[connectorId]/route.ts`, `app/api/webhooks/polar/[connectorId]/route.test.ts`, `app/api/connections/route.ts`, `actions/connectors.ts`, `components/settings/connections-section.tsx`, `components/settings/settings-board.tsx`, `components/shell/command-palette.tsx`, this hand-off and `docs/handoff/LATEST.md`. **Not** `app/globals.css`.

## Next steps (in order)

1. Done: committed, pushed, PR opened after the Reviewer's LGTM. The user merges.
2. After merge, a fresh session: T41 `phase-4/mrr-engine` (pure `movementsFrom`, `mrrAt`, metrics, rebuild in one transaction, `metric_snapshot` from `GET /v1/metrics/`, V37 alerts, demo seed events). First check the V35 `?`: how Polar normalises week/day intervals and whether `subscription.amount` is before or after the discount.

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
