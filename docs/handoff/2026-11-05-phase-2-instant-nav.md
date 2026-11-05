# Hand-off — Phase 2, checkpoint 4: instant navigation (T33)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / tasks | Phase 2, SPEC T33 (`~` until merged). T30 and T31 still `~` (owner checks not run yet); T32 (Phase 2 exit) `.` |
| Branch / PR | `phase-2/instant-nav`, built in `D:\Vxrcel\wanheda`; commit `b8e5b09`, pushed and PR #13 opened 2026-11-05 on the user's go-ahead |
| Main | `ed1cc03` — Merge pull request #12 (`phase-2/board`) |
| Previous hand-off | docs/handoff/2026-11-05-phase-2-board.md |

## State in one paragraph

The session started on the T30/T31 owner checks and turned into a navigation fix. The user saw the whole app reload on every hop: that was dev-only, a 431 from a localhost cookie jar shared across ports (SPEC B9; the user cleared the cookies). After that, every hop still showed the page skeleton, because each page awaited `requireOwner()` and a Neon read before rendering. The user set a house goal in `CLAUDE.md`, **native-app feel**, now SPEC V24: shell pages await nothing; server reads stream in beside the client view and refresh the client cache. The same branch fixes two jumping tab pills, gives empty states the Wanheda mark with pointer parallax, and makes `NotebookPen` the Notes icon (user's pick).

## What is in the change

- **Pages await nothing** (`app/(shell)/page.tsx`, `notes/page.tsx`, `settings/page.tsx`). Owner/demo text: `components/shell/mode-text.tsx` `ModeText`. Server reads: `components/providers/prefetch.tsx` `Prefetch({queryKey, load})` inside its own `<Suspense fallback={null}>` beside the view; `requireOwner()` first; a `load-failed` read hydrates nothing.
- **Home board in TanStack Query:** `lib/board/layout.ts` `BOARD_KEY`, `BoardPayload`, `BoardSource`; `lib/board/server.ts` `boardFor`; `GET /api/board` (503 on a failed read). `Board` reads the cache (skeleton on first visit only; failed read with no cache shows the seed as `load-failed`, never saved) and renders `BoardGrid` keyed by source, which writes every layout change back to the cache.
- **Board saver flushes pending key nudges on unmount** (B10). It used to clear the timer and drop them.
- **Weather widget** resolves owner/demo inside its own Suspense (`components/widgets/index.tsx`).
- `lib/fetch-json.ts` shared by notes and board.
- **Pills** (motion-pill-jump skill): Settings' sticky tab column is `motion.aside layout layoutRoot` and its pill has `layoutDependency={section}` (B11; `layoutRoot` alone did not work, Motion needs `layout` to make it a projecting parent). `Segmented` takes `layoutId?`; `NotesApp` passes one id for every view, so the pill slides into and out of Board (B12).
- **EmptyMark** (`components/shell/empty-mark.tsx`, used by `EmptyState`): mark + two rings as parallax layers (depth 3/6/10, tilt, dot +1.5 units), `FOLLOW_SPRING` in `lib/motion.ts`, fine pointers only, still under reduced motion. Ported from `D:\Avi\ellum-harness\components\avatar-stage.tsx` (read only, nothing run there).
- **Notes icon** `NotebookPen` in `lib/modules.ts` and the palette's note rows.
- Lint fixes in `lib/board/layout.ts` (zod v4 `.finite()` no-op, needless casts) and the board's breakpoint generic.

## Verification (actual results)

- Typecheck clean; Vitest 33 files / 402 tests; tripwire clean; ESLint clean on all touched files; zero-env build passes (`/`, `/notes`, `/settings` partial prerender, `/api/board` dynamic). Forged-commit check on `b8e5b09`: clean. gitleaks is not installed locally, so the pre-commit secret scan was skipped; CI scans the whole history.
- Owner production build (standalone copy in the scratchpad, real Neon, a throwaway user `dev-agent@wanheda.local` made owner only in that process; user row deleted after, sessions cascade): 6 rail hops 21–50 ms, no skeleton, same document; key nudge then hop inside 700 ms → saved to Neon, shown after hop back and reload; new note shown 58 ms after hop back, on the server; cold `/notes` reload has no console errors.
- Demo production build, drift probe: Settings → Timers 380 → 42 px (gap 42), → Account 5.5 → 82.5 px (gap 83), same-tab 3.4 → 0; Notes switch into/out of Board 0 → 61.6/61.6/58.7 px (= gaps), settles 0; rail clean with and without a scroll reset. Palette theme switch only ruled out by reading.
- EmptyMark: transforms follow the pointer at depth; screenshots in Nebula and Ember; reduced motion → all `none`.
- **Not verified:** the owner's own browser on the production build of this branch; T30/T31 owner checks; phones (EmptyMark is still on touch by design).

## Gotchas found this session

- `.next` is shared with the user's running `next dev`; a dev restart wipes production output. Run production checks from a copy of `.next/standalone` (+ `.next/static`) outside the repo.
- `.env.local` has an unquoted `&` in `DATABASE_URL`: never `source` it in sh; use `node --env-file=` or `bun --env-file=`.
- Localhost cookies are shared by every port. If navigations reload the page in dev, check the `?_rsc=` status for 431 (B9).

## Next steps

1. User merges PR #13.
2. Owner checks, now on the faster app: **T30** (offline edit → chip "Offline · 1 waiting" → online → second device). **T31** (drag and resize a sticky, reload on another device; recolour; pin → Home; note window from the palette).
3. **T32**, the Phase 2 exit, then the Phase 2 done hand-off with Phase 3 prompts.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.
House goal (CLAUDE.md): native-app feel, SPEC V24.

Phase 2 exit: T32. Read docs/handoff/2026-11-05-phase-2-instant-nav.md, SPEC.md §T (T30, T31,
T32, T33), §V (V15, V17, V23, V24) and the P2 CP1–CP4 lines in §I.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh ed1cc03..origin/main`
before pulling; fast-forward main. Ask the user for the owner checks of T30 and T31 (next step 2
in the hand-off); mark T30, T31 and T33 `x` as each passes. Then run T32 with the user (offline
note → second device ≤ 5 s after its next sync; a conflict keeps both versions; palette finds a
body word) and write the Phase 2 done hand-off with Phase 3 prompts.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-05-phase-2-instant-nav.md, SPEC.md §V (V7, V17, V24). Look hardest at
components/providers/prefetch.tsx (requireOwner first; failed read never hydrates over good cache),
components/board/board.tsx (Board/BoardGrid split: key by source, setQueryData write-back vs a
background refetch or streamed hydration landing after a local edit, unmount flush), app/api/board
(503 path), and components/settings/settings-board.tsx (layout + layoutRoot on the sticky aside).
```
