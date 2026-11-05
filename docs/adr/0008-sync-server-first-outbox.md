# ADR-0008: Sync is server-first with a small outbox, no sync engine yet

| | |
|---|---|
| Status | Accepted (amended 2026-11-05: money joins the outbox) |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D8, §6.8, Phase 2, §11.

## Context

One user, two devices (web and desktop). Most screens can read from the server. Sticky notes and quick capture must work offline, because ideas come when the network does not.

Sync engines exist, but each has a cost:

- **Zero** needs an always-on connection, which stops Neon from scaling to zero (more cost).
- **ElectricSQL's** cloud is winding down after the Databricks/Neon deal.

## Decision

- **Reads** go through TanStack Query, with RSC prefetch and a `HydrationBoundary`.
- **Writes** go through Server Actions with optimistic updates.
- **Sticky notes and quick capture** get an IndexedDB **outbox** (Dexie). Writes queue there offline and flush when the connection comes back.
- Conflicts use last-write-wins per note. The losing version is kept in `note_revision`.
- No sync engine for now. Neither Zero nor Electric is worth it for one user on two devices.

### Amendment, 2026-11-05: money writes use an outbox too

Quick-add on a phone in a dead zone is the main way money gets entered. Before this, a money write was retried three times (about 23 s) and then dropped with a toast, which loses a ledger entry. Now every money write (a transaction saved or deleted, an account saved or archived) goes into its own IndexedDB outbox (`wanheda-money`) first, the same pattern as notes:

- One queue for transactions and accounts, sent oldest first, one op in flight across tabs (a Web Lock). A transaction made on a new account always lands after the account, and a delete is never sent while a save of the same transaction is still on its way.
- Nothing leaves the queue until the server answers. A network failure, a timeout or a lost session keeps the op and tries again. Only a refusal drops it, with a toast.
- A newer save or a delete replaces older saves of that transaction that were never sent. A save that was sent without an answer stays and goes first, since it may have landed.
- Replays are safe because ids are made on the client: a save is an upsert, deleting a row that is gone counts as done, archiving sets a flag.
- Money has no conflict rule beyond last write wins per row: one owner, and money rows are small and rarely edited on two devices at once. No revision table.
- Undo stays in front of the queue: a delete is queued only when its undo toast runs out.

## Consequences

### In 6 months

- Phase 2 proves the write and offline pattern that every later module reuses.
- Neon can still scale to zero, so cost stays low.

### In 2 years

- Notes, capture and money writes work offline. Other modules need the network for writes. Desktop adds a local read cache (Phase 8).
- Two outboxes now share one shape (queue store, drain loop, timeout, Web Lock) but not code. A third module going offline is the moment to pull out a shared queue core instead of a third copy.
- Last-write-wins can lose an edit from view, but never from history.

## Alternatives considered

- **Zero 1.0.** Keeps compute awake. No array columns. SSR is still on its roadmap.
- **ElectricSQL.** Cloud winding down. PGlite and TanStack DB stay open source and can be used later.
- **Full local-first (PGlite everywhere).** Big complexity for one user.

## Revisit when

- After Phase 8 (desktop), when real offline needs are known.
- Conflicts between the two devices start to hurt in practice.
