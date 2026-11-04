# Wanheda

A personal super-dashboard and mini OS: money, media, reading, voice, notes and a live-activity island in one place. Built for one owner. Web first, desktop later.

Status: Phase 0 (foundation). See `CHANGELOG.md`.

## Run it

```sh
bun install
bun run dev
```

With no environment variables it runs in demo mode. `.env.example` lists the variable names.

## Checks

```sh
bun run typecheck
bun run test
bun run build
bun run tripwire
```

## Docs

- `docs/adr/`: architecture decisions
- `docs/CONTEXT.md`: glossary
- `docs/handoff/`: session hand-offs (`LATEST.md` is the newest)
- `SPEC.md`: goals, constraints, invariants, tasks and the bug ledger
- `CLAUDE.md`: rules for agent sessions working on this repo
