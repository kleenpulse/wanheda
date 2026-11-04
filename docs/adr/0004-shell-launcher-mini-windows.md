# ADR-0004: Shell model is a launcher with full-screen apps and pop-out mini windows

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D4, §4.2, §6.1, Phase 1.

## Context

Wanheda should feel like a small OS. The obvious model is a daedalOS-style desktop with overlapping windows everywhere.

A real window manager is a lot of work. If it is not built very well, it feels worse than tabs. Most modules (Money, Reader, Media) want the full screen anyway.

## Decision

- **Home** is a widget board (react-grid-layout) that can be rearranged and resized. The layout is saved per breakpoint.
- **Apps**: each module is a route (`/money`, `/media`, `/reader`, …) shown full-screen inside the shell, with a nav rail and a dock.
- **Mini windows**: a few things pop out as floating, draggable panels on top of any app. These are the music mini-player, a sticky note, the TTS controller and the timer. On desktop the same mini windows can be torn out into real OS windows.
- **Command palette** (Ctrl/⌘+K) launches anything.
- The shell builds the rail, dock, palette and widget picker from **module manifests** (`lib/modules.ts`). A new module never edits shell code.

## Consequences

### In 6 months

- Phase 1 ships a shell that feels like an OS without a window manager.
- Each module is a normal Next route, so routing, loading states and code splitting work as usual.

### In 2 years

- The few things that really need to float (player, note, TTS, timer) already do.
- If overlapping windows are still wanted, they can be tried as an experiment on top of the same manifests.

## Alternatives considered

- **Full daedalOS-style window manager.** Over-engineering for v1. High risk of feeling worse than tabs. Puter is AGPL (read only, never copy).
- **Plain tabs or a sidebar app.** Loses the "my OS" feel and the floating mini-player.

## Revisit when

- After Phase 10, if overlapping windows are still wanted. They become a Phase 11 experiment.
