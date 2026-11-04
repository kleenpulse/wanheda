# Changelog

All notable user-visible changes. Shipped in-app as "What's New" (FR-SHELL-10).

## [Unreleased]

### Added

- Phase 0 foundation: Next.js 16 app scaffold with the Ember (light) and Nebula (dark) skins.
- Security rails: worm tripwire, forged-commit check and gitleaks, in a pre-commit hook and in CI.
- Owner-only sign-in: GitHub for the first sign-in, then passkeys. Only emails in `OWNER_EMAILS` can get an account.
- Gate modes: with no database and no sign-in configured the app runs open on seed data (demo); with a database but no sign-in every page answers 503 (locked); with sign-in configured every page needs the owner (gated).
- `/login` page and a placeholder home with add passkey, sign out and a theme toggle.
- Switching between Ember and Nebula grows the new skin as a circle from the theme toggle. Reduced motion switches instantly.
- Live at https://wanheda-chi.vercel.app (Vercel, Frankfurt), with GitHub and passkey sign-in for the owner. Only `main` deploys; other branches get no preview deployment.
- Sign-in tokens from GitHub are stored encrypted.
- The shell: a nav rail that widens from 84 px to 232 px to show labels (press `[` to toggle), and it remembers its width without a flash on load. On phones it becomes a floating tab bar.
- An account menu on the rail with settings and sign out, and a Settings page for the theme and passkeys.
- Command palette (Ctrl/⌘K, `/`, the search pill, or the search button on phones): open apps, switch theme, toggle the sidebar, and start timers. Type a length like `25`, `90s` or `1h30` to start one.
- The dynamic island: running timers live in a black pill at the top of the screen. Tap it for pause, +5 min and cancel; arrow keys switch between timers. Timers keep running across pages, reloads and other tabs.
- The home board: clock, weather, today and a quick note, arranged on a grid. Press Edit board to drag, resize (corner, or Shift+arrows on the grip), add and remove widgets; the layout is saved per screen size. Set `WEATHER_LATITUDE`, `WEATHER_LONGITUDE` and `WEATHER_PLACE` for live weather from Open-Meteo.
- The dock: Home and the timer at the bottom of the screen on desktop, swelling under the pointer, with a dot on whatever is running, and the search pill at its end.
- Mini windows: open the timer window from the dock or the palette ("timers window"). Drag it by its title bar, resize it from the corner (or the grip: arrows move, Shift+arrows resize, Escape closes); it snaps to an edge when dropped near one, and keeps its place on this device.
- Timers: starting a length that is already running brings that timer forward instead of starting a twin (a finished one starts over). Settings → Timers can allow repeats instead; repeats are numbered ("25 min timer 2").
- Settings → Appearance: pick a skin (Ember & Nebula, or Motion Garden's graphite Bench), any accent colour (presets or a free colour picker; its lightness is adjusted per theme so text stays readable), and a Home wallpaper (Glow, Orbs or Grid). They follow you to other devices, and load without a flash.
- Notification centre: the bell on the rail (or "Open notifications" in the palette) lists past alerts with read and unread, a filter and Mark all read. Finished timers raise an alert, once even with two tabs open.
