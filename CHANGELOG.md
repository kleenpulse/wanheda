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
