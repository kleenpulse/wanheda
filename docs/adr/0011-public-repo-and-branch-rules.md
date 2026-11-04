# ADR-0011: Public repo, branch rules and the forged-commit check

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md Phase 0, §9.2, §10.1. Private incident record: `~/.claude/security/worm-incident-2026-10.md`.

## Context

In the 2026-10 worm incident, about 12 repos under `D:\Vxrcel` were infected, including forged force-pushes. The unprotected private repos are the ones that got force-pushed.

On GitHub's free plan, private repos cannot have rulesets. Public repos can.

## Decision

### The repo is public

- This lets the GitHub **`protect-default-branch`** ruleset work on the free plan:
  - PRs only. No direct pushes to `main`.
  - No force-push.
  - No deletion.
  - Required CI checks: **`rails`** and **`check`**.
- **No secrets ever enter the repo.** gitleaks runs in pre-commit and in CI. Env var names live in `.env.example`; values never do.

### The forged-commit check

- CI checks **every** commit in the range, **merges included**.
- It fails when **author TZ ≠ committer TZ**, or when **committer TZ is -0700 or -0800**.
- There is **no exemption by committer email**. A forger controls the email.
- GitHub's own merge commits in the owner's history already have matching timezones, so they pass without a skip.
- If an exemption is ever needed, it must key on a **verified GitHub web-flow signature**: CI imports `https://github.com/web-flow.gpg` and requires `%G?` to be `G`. Never on the email.

### First push exception (FRD Phase 0)

The scaffold commit that creates the repo is reviewed at Checkpoint 1 before the first push, because there is no `main` yet to protect. Instead of Checkpoint 2 (which needs an existing `origin/main`), the Reviewer confirms that the pushed `main` tree equals the reviewed tree, runs the timezone check on every commit, and runs the whole-tree indicator and secrets scan. The ruleset is applied right after the first push.

## Consequences

### In 6 months

- Nobody, including a stolen token, can force-push or delete `main`.
- Every change reaches `main` through a PR with green `rails` and `check`.

### In 2 years

- The code is public. Anything personal must stay in env vars, the database or the private incident record, never in the repo.
- If GitHub adds rulesets to free private repos, going private becomes an option again.

## Alternatives considered

- **Private repo, no protection.** This is exactly what got force-pushed in 2026-10.
- **Paid plan for private rulesets.** A cost for a personal project, with no extra safety over public + ruleset.
- **Skip merges in the forged check.** A forged merge would pass.
- **Exempt GitHub's committer email.** Anyone can write that email into a commit.

## Revisit when

- GitHub's free plan allows rulesets on private repos.
- A real commit is ever blocked by the check (then add the signature-based exemption, not an email one).
- The incident record lists new indicators (update the tripwire by reference, never by pasting markers).
