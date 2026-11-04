# Changelog

All notable user-visible changes. Shipped in-app as "What's New" (FR-SHELL-10).

## [Unreleased]

### Added

- Phase 0 foundation: Next.js 16 app scaffold with the Ember (light) and Nebula (dark) skins.
- Security rails: worm tripwire, forged-commit check and gitleaks, in a pre-commit hook and in CI.
- Owner-only sign-in: GitHub for the first sign-in, then passkeys. Only emails in `OWNER_EMAILS` can get an account.
- Gate modes: with no database and no sign-in configured the app runs open on seed data (demo); with a database but no sign-in every page answers 503 (locked); with sign-in configured every page needs the owner (gated).
- `/login` page and a placeholder home with add passkey, sign out and a theme toggle.
