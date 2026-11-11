# Hand-off — Phase 8: account voices (T87) — built, uncommitted

| | |
|---|---|
| Date | 2026-11-11 |
| Phase / checkpoint | P8 side request (owner): a voice downloaded on the web isn't on the desktop app |
| Branch | `phase-8/account-voices` off `main` at `ac9c4e1`, uncommitted |
| HEAD at start | `ac9c4e1` — Merge pull request #89 |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-auth-swarm.md |

## State in one paragraph
The owner saw Amy installed on the web but showing Download in the desktop app. Investigation: not a bug. Voice files live in OPFS, which is per origin, and the desktop runs its own server at `http://localhost:62899` (port stable since 2026-11-09). The installed v0.7.0 bundle does contain Amy, and both catalogs (`lib/speech/voices.ts`, `desktop/tts-catalog.ts`) agree. The owner chose the feature: the account remembers which voices it keeps, and a device missing some offers to fetch them, never automatically, because the link is metered. Built; every gate passes; not yet tried in a browser or the desktop app; migration not applied.

## Done this session
- `lib/db/schema/voices.ts`: `account_voices` (user_id PK → user cascade, `voices` jsonb, RLS on, no policies). It's its own table, not a `user_prefs` column, because `loadPrefs` selects every column and a lagging migration would fail the whole shell's prefs. `drizzle/0014_account_voices.sql` (renamed from the generated name, journal updated), **not applied**.
- `lib/speech/account-voices.ts` + test (11): `parseAccountVoices`, `strictAccountVoices`, `withVoice`, `missingVoices`, `bytesOf`, `voiceNames`, `offerKey`.
- `lib/speech/account-voices-store.ts`: load; add (`jsonb_agg(distinct)` union in one upsert); remove (jsonb `-`). One statement each, so two devices never undo each other. The SQL was rendered with `drizzle.mock()` and checked.
- `actions/voices.ts`: `accountVoices`, `addAccountVoices`, `removeAccountVoice` (owner from session, demo refused, ids strict).
- `components/settings/account-voices.ts`: zustand list. `voiceAdded`/`voiceRemoved` are called by `voice-manager.ts` (download done; delete after its Undo runs out). `seedFromDevice` runs once per account per device (`wanheda-voices-seeded`). Actions are `import()`ed lazily, so the voice manager's test and first bundle don't pull in a server action.
- `components/speech/voice-offer.tsx`: mounted in ShellFrame. It reads 2.5 s after mount (never before paint), shows one toast per tab (names + MB, Get it/them, × = Not now kept per user until the missing set changes), plus `VoiceOfferRow` in Settings → Voices.
- SPEC V83 + T87. CHANGELOG line.

## Verification (actual results)
- `bun run typecheck`: pass. `bun run test`: 1775 passed (177 files). `bun run tripwire`: clean.
- eslint on the touched files: one `no-unnecessary-condition` on `navigator.storage?.getDirectory` (moved unchanged from voices-section; the guard is intentional).
- Not run: build, browser, desktop. The offer needs the migration applied to show.

## Next
1. Owner: review; go-ahead to commit, push and open the PR.
2. Owner: `bun run db:migrate` for 0014 before (or right after) deploy. Until then, voice reads fail quietly (no offer) and writes are dropped; nothing else is affected.
3. Try it: download a voice on the web, open the desktop app, see the toast, press Get it.
