# Wanheda glossary

Domain terms used in `FRD.md`, `SPEC.md`, the ADRs and the code. Alphabetical. When code and this file disagree, fix one of them.

**Account.** A place money sits: cash, bank, card, wallet or crypto. Each account has one currency and an opening balance (`account` table).

**Activity.** One live thing the island can show: media playing, speech, a timer or pomodoro, a transfer, a sync, a money alert or an agent session. Each has an id, a kind and a priority.

**Activity bus.** The zustand store (`lib/activity/store.ts`) that holds the live activities. Modules call `publish()` and `end(id)`, and the island reads from it. It syncs across tabs with `BroadcastChannel` and, on desktop, over IPC.

**ARPA.** Average revenue per account: MRR divided by active customers.

**ARR.** Annual recurring revenue: MRR × 12.

**Base currency.** The one currency reports convert into. The owner can switch it in Settings; the default is NGN (decided 2026-11-05). Original amounts are always shown too.

**Billing event.** One raw event from a billing provider (Polar, Stripe, Paystack), stored as-is in `billing_event`. The table is append-only. MRR movements are derived from it.

**Builder.** The Claude Code session that writes code, tests, docs and hand-offs, in its own worktree. It commits and pushes only after the user's go-ahead (`docs/handoff/README.md`).

**Capability.** A named feature that is on only when its config exists, such as `db` or `auth`. `lib/capabilities.ts` answers `has(cap)` and never throws. Modules can hide themselves when their capability is off.

**Category.** A label for a transaction (food, transport, salary). It has an emoji, a colour from the data palette, a kind (expense, income, transfer) and an optional parent, so at most two levels.

**Checkpoint.** A clean stopping point inside a phase: a group of §T tasks done, an ADR decided, or a spike with a result. Each checkpoint gets its own branch, a hand-off and a review. Separately, the Reviewer's three checkpoints are diff, push and merge.

**Churn.** Customer churn is customers lost in a period ÷ customers at its start. Net MRR churn is (churned + contraction − expansion − reactivation) ÷ MRR at the start.

**Connector.** A link to an outside service (Neon, Polar, Stripe, Paystack, R2, Umami …). Each has a nullable client. Without config it returns `null`, the module shows seed data or hides, and its API routes return 503.

**Continuation prompt.** A ready-to-paste prompt that starts the next session. There are two, one for the Builder and one for the Reviewer. Both go at the end of each hand-off and in `docs/handoff/LATEST.md`.

**Data palette.** The colour set for categories, charts and sticky notes. It is kept apart from the signal hue and checked for contrast in both themes (Phase 3).

**Demo mode.** The app with no database and no auth configured. It is open and shows seed data only. It is the `demo` gate mode.

**Dock.** The bar of pinned and running apps. "Running" means the app has a live activity or an open mini window.

**Engine (TTS).** One text-to-speech backend behind the `TtsEngine` interface: Piper, Kokoro, Web Speech or a cloud route. Engines can be swapped without touching the Reader or Notes.

**Forged commit.** A commit whose author timezone differs from its committer timezone, or whose committer timezone is -0700 or -0800. CI fails on it, merges included (ADR-0011).

**FX rate.** A daily exchange rate between two currencies, cached in `fx_rate`.

**Gate mode.** The access state decided by `gateMode()`: `demo` (no DB, no auth: open, seed data), `locked` (DB but no auth: 503 on every route) or `gated` (auth configured: log in first). It fails closed (ADR-0003).

**Hand-off.** A short written record of the state of work, left at every checkpoint, phase end, long context or session end. It lives in `docs/handoff/` and is never edited after it is written.

**Home board.** The rearrangeable widget grid on the home screen. Its layout is saved per breakpoint in `board_layout`.

**Idempotency key.** A key that makes repeating an action safe. Importing the same file twice, or replaying the same webhook, changes nothing the second time.

**Import batch.** One run of importing a statement file into an account. It records rows total, imported and skipped, the skipped rows, and an idempotency key that stops the same file being imported twice (`import_batch`).

**Island.** The dynamic island at the top centre of the shell, built on Shadow Garden's `LiveActivity`. It shows the highest-priority activity as a pill, expands into a card, and cycles through the rest.

**Ledger.** The money record. It is append-only: events are deduped on the provider's event id, and state is derived from events instead of being overwritten. Spending and manual income share one ledger.

**Locator.** A saved position inside a document: a page number for PDF, a CFI for EPUB, or a heading anchor for Markdown. Reading progress and highlights store one.

**LTV.** Lifetime value: ARPA ÷ customer churn rate.

**Mini window.** A small floating, draggable panel over any app: the music mini-player, a sticky note, the TTS controller or the timer. On desktop it can be torn out into a real OS window.

**Minor units.** Money stored as a whole number of the smallest unit (kobo, cents) in a `bigint`, always with an ISO currency code. Never floats.

**Module.** One self-contained slice of the app (Money, Income, Media, Reader, Voice, Notes). It has its routes, pure logic in `lib/<module>/`, server actions in `actions/<module>.ts`, and a manifest.

**Module manifest.** The object a module registers in `lib/modules.ts`: id, title, icon, route, widgets, palette commands, activity sources and capability. The shell builds the rail, dock, palette and widget picker from these, so a new module never edits shell code.

**MRR.** Monthly recurring revenue: active recurring subscriptions normalised to a month, after discounts, without tax or one-off charges.

**MRR movement.** One change to MRR for one customer: new, expansion, contraction, churn or reactivation. Movements are derived from billing events in `mrr_movement` and can be rebuilt from scratch.

**Outbox.** The IndexedDB queue (Dexie) where note and quick-capture writes wait while offline. It flushes when the connection comes back.

**Palette.** The command palette (Ctrl/⌘+K). It opens apps, runs module commands, searches, and does quick actions like "add expense 4500 food".

**Payee.** Who a transaction was paid to or received from, as text on the transaction. Rules, recurring detection and the import dedupe key all use it.

**Platform bridge.** `lib/platform/`, the one interface UI code uses for native features (files, TTS, media, notifications). It picks the web or desktop version at runtime.

**Privacy mode.** One shortcut that blurs every money figure in the app, for screen sharing.

**Processed event.** A webhook event id already handled, stored in `processed_event` (unique per provider). A repeated delivery is seen there and skipped.

**Pulse.** The `/api/pulse` server-sent events feed that tells the client "something changed", using a watermark. It replaces long-lived sockets, which Vercel cannot run.

**Reconcile.** The one idempotent function that brings billing state in line with the provider. Webhooks (push) and manual sync (pull) both call it, so a missed webhook fixes itself on the next sync.

**Remux.** Moving audio and video streams into a container the browser can play (for example MKV to MP4) without re-encoding them. Fast, unlike a transcode.

**Reviewer.** The second Claude Code session. It reviews the Builder's work with the `diff-reviewer` skill, is read-only in the Builder's worktree, and answers `LGTM`, `LGTM with nits` or `FIX`.

**Role token.** A CSS variable named for its job (surface, text, signal), not its colour. Components use role tokens only, never raw hex.

**Rule.** "Payee contains X → category Y, tag Z", applied on import and on entry (`rule` table).

**Sealed.** Encrypted in the database with a key derived per feature, for bank tokens and API keys (Raven `sealed.ts` pattern).

**Seed data.** Built-in sample data shown in demo mode or when a connector is not configured.

**Signal hue.** The single accent colour of a skin. It is reserved for live, active and primary things, and never used for categories.

**Skin.** One CSS block of tokens that re-tints the whole app without touching components. Phase 0 ships Ember (light) and Nebula (dark). Bench comes with the Phase 1 skin picker.

**Subscription.** A recurring charge: name, amount, cycle, next renewal, trial end, status and cancel URL. It can be detected from transactions.

**Transcode.** Re-encoding media into a codec the browser can decode. Slow, so it is the last resort after native play and remux.

**Tripwire.** The scan (`bun run tripwire`) that fails the commit or CI run when the repo holds any worm indicator from the private incident record (`~/.claude/security/worm-incident-2026-10.md`). Markers are never pasted into the repo; tests build them at runtime.

**Txn.** Short for transaction: one money movement on an account, with amount in minor units, currency, date, payee, category, note, tags and source (manual, import, bank or webhook).

**Verdict.** The Reviewer's answer on the first line of a review: `LGTM`, `LGTM with nits` or `FIX`. It is not the user's approval.

**Widget.** A small card on the home board, offered by a module through its manifest (clock, today's spend, next renewals, pinned notes).

**Worktree.** A separate git working folder per branch, under `D:\Vxrcel\wanheda-wt\<branch-slug>`, so the Reviewer can read the Builder's work without touching it.
