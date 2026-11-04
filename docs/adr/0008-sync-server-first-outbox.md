# ADR-0008: Sync is server-first with a small outbox, no sync engine yet

| | |
|---|---|
| Status | Accepted |
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

## Consequences

### In 6 months

- Phase 2 proves the write and offline pattern that every later module reuses.
- Neon can still scale to zero, so cost stays low.

### In 2 years

- Only notes and capture work fully offline. Other modules need the network for writes. Desktop adds a local read cache (Phase 8).
- Last-write-wins can lose an edit from view, but never from history.

## Alternatives considered

- **Zero 1.0.** Keeps compute awake. No array columns. SSR is still on its roadmap.
- **ElectricSQL.** Cloud winding down. PGlite and TanStack DB stay open source and can be used later.
- **Full local-first (PGlite everywhere).** Big complexity for one user.

## Revisit when

- After Phase 8 (desktop), when real offline needs are known.
- Conflicts between the two devices start to hurt in practice.
