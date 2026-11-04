# Wanheda

A personal super-dashboard and mini OS: money, media, reading, voice, notes and a live-activity island in one place. Built for one owner. Web first, desktop later.

Status: Phase 0 (foundation). See `CHANGELOG.md`.

## Run it

```sh
bun install
bun run dev
```

With no environment variables it runs in demo mode. `.env.example` lists the variable names.

## Deploy setup

The owner-only steps (GitHub OAuth apps, Vercel project and Production variables, local `.env.local`) are a guided script:

```sh
bash scripts/setup-deploy.sh
```

Production deploys from `main` through Vercel's Git integration. Previews get no database and no sign-in, so they run demo mode on seed data (ADR-0002).

## Checks

```sh
bun run typecheck
bun run test
bun run build
bun run test:e2e   # after a build: gate-mode smoke test
bun run tripwire
```

## Docs

- `docs/adr/`: architecture decisions
- `docs/CONTEXT.md`: glossary
- `docs/handoff/`: session hand-offs (`LATEST.md` is the newest)
- `SPEC.md`: goals, constraints, invariants, tasks and the bug ledger
- `CLAUDE.md`: rules for agent sessions working on this repo
