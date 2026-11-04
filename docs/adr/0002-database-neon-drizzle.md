# ADR-0002: Database is Neon Postgres with Drizzle ORM

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D2, §8, §9.4, Phase 0.

## Context

Wanheda syncs money, notes, reading progress and layouts between two devices. It needs one source of truth.

Neon + Drizzle is already the stack in email-manager, ecommerce-app, booking-api, Mita and ellum-harness. The app must also run with zero credentials (demo mode).

## Decision

- **Neon Postgres** is the source of truth for all synced data.
- **Drizzle 0.45** with `@neondatabase/serverless`.
- The **pooled** URL (`DATABASE_URL`) is used at runtime. The **direct (unpooled)** URL (`DATABASE_URL_UNPOOLED`) is used by `drizzle-kit`.
- The Neon HTTP fetch is wrapped in a retry with jittered backoff, copied from `D:\Avi\ellum-harness\lib\db\client.ts`. Only rejected fetches are retried, not error responses.
- `lib/db` **never throws at import time**. When `DATABASE_URL` is missing, `getDb()` returns `null` and the app falls back to seed data. (The null-handle pattern lives in `D:\Vxrcel\rawstash\lib\db\index.ts`. ecommerce-app throws at import, which is the gotcha we avoid.)
- RLS is enabled on every table with no policies, so access is server-only.
- Migrations are reviewed SQL files in the repo (`drizzle-kit generate`), never `db:push` once real data exists (from Phase 3).
- **Preview branches** come from the **Neon ↔ Vercel integration**. Non-default branches expire after **7 days**, set in the integration.
- `@neon/env` and `@neon/config` (used by ellum-harness) are **not used**. They are unverified scoped packages, and `node_modules` is treated as untrusted.

## Consequences

### In 6 months

- Every module uses the same DB client and the same null fallback. Demo mode works without special cases.
- Preview deploys get their own throwaway database branch with no code of ours to maintain.

### In 2 years

- All synced data lives in one Postgres. Moving away means a data export, not a rewrite of the domain logic, because `lib/<module>` stays pure.
- Neon can scale to zero. This only holds while nothing keeps a connection open (ADR-0008).

## Alternatives considered

- **Supabase.** Brings its own auth and realtime, which we do not need. It is not the stack of the recent projects.
- **Local-first only (PGlite or Dexie).** No easy sync between web and desktop. PGlite stays a P2 desktop offline option.
- **Prisma.** Heavier client and a separate schema language. Drizzle is the house ORM.
- **Our own branch script (ellum-harness `neon.ts`).** The Vercel integration already does it.

## Revisit when

- Neon pricing or limits change in a way that hurts a single-user app.
- A sync engine is adopted (ADR-0008), since it may need logical replication.
- Desktop needs a full offline database (PGlite mode, Phase 8+).
