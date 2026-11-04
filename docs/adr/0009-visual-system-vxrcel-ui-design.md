# ADR-0009: Visual system is `vxrcel-ui-design`, Ember + Nebula by default

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D9, §1 (principles), FR-SHELL-7, Phase 0, Phase 3. Skill: `D:\Vxrcel\skills\vxrcel-ui-design` (`SKILL.md`, `references/skins/{ember,nebula,bench}.md`, `references/{components,motion,new-skin}.md`).

## Context

Shadow Garden is the design system. The `vxrcel-ui-design` skill distils Motion Garden and Raven into tokens, skins and component recipes. Wanheda follows it and does not invent a parallel system.

Each skin is one CSS block. Swapping it re-tints the app without touching components.

## Decision

- **Default skin pair: Ember (light, `:root`) + Nebula (dark, `.dark`)**, the Raven skins. The skill recommends them for consumer, productivity and inbox-like apps.
- **Phase 0 ships Ember + Nebula only.** The skill keys every skin on `:root` and `.dark`. Bench's `--color-accent` collides with the shadcn bridge in the Ember layer. So **Bench** (Motion Garden graphite + amethyst) needs a **`[data-skin]` scoping layer** first. It arrives with the skin picker in **Phase 1** (FR-SHELL-7).
- **Rules adopted as-is:** role tokens only (no raw hex); one **signal hue** per skin, reserved for live, active and primary; mono uppercase microtype for readouts; `tabular-nums` on every number; controls are `h-8`; tonal panels, not bordered ones; glass only for overlays, with a reduced-transparency fallback; `lucide-react` only; the three reduced-motion layers (CSS backstop, `MotionConfig`, per-effect opt-outs).
- **Motion constants** come from the skill's `lib/motion.ts`: `TAB_SPRING` (350/30) for every `layoutId` indicator, `DIALOG_SPRING`, `BANNER_SPRING`, `EASE_OUT`. Jumping or drifting pills are fixed with the `motion-pill-jump` skill.
- **Separate data palette (Phase 3).** The skill forbids the signal colour for categories. Money categories, charts and sticky-note colours get their own data palette, checked for contrast in both themes with the `dataviz` skill method, and kept apart from the signal hue.
- **Never run `shadcn init`.** It injects a rival `--color-accent`. Primitives are vendored into `components/ui/` and restyled to tokens.
- Fonts: Geist, Geist Mono and Instrument Sans via `next/font/google`. Themes via `next-themes`.

## Consequences

### In 6 months

- Every screen uses the same tokens, so a design pass is a token change, not a hunt through components.
- Bench and the skin picker land together in Phase 1, with the scoping layer they need.

### In 2 years

- New skins are one CSS block each (`references/new-skin.md`).
- Categories and charts never compete with the signal hue for attention.

## Alternatives considered

- **Ship all three skins in Phase 0.** Bench would break the shadcn bridge without the `[data-skin]` layer.
- **Stock shadcn theme (`shadcn init`).** Rival tokens, and it does not match the house style.
- **Use the signal hue for categories.** Forbidden by the skill. Live and active states would stop standing out.

## Revisit when

- Phase 1: the skin picker and `[data-skin]` layer are built.
- Phase 3: the data palette is chosen.
- The skill itself changes its skin keys or the shadcn bridge.
