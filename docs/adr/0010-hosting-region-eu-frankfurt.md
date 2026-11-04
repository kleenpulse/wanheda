# ADR-0010: Hosting region is EU Frankfurt

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md §9.2 (data residency), §11 open question 2.

## Context

Wanheda stores financial data: transactions, balances, income, bank tokens. That is personal data under Nigeria's Data Protection Act (NDPA). The owner lives in Lagos.

FRD §9.2 says to pick the Neon and Vercel regions on purpose and record them in an ADR. The Mita backlog flagged the same issue.

The existing Neon database for Wanheda is already in `eu-central-1` (Frankfurt).

## Decision

- **Neon:** `eu-central-1` (Frankfurt). Keep the existing database there.
- **Vercel functions:** `fra1` (Frankfurt), set in `vercel.json` (`regions`).
- Database and functions sit in the same region, so every query is a short hop.

Reason: Frankfurt is the nearest major region to Lagos with a strong privacy posture (the EU's GDPR). Keeping the functions next to the database matters more for speed than keeping them next to the user.

## Consequences

### In 6 months

- Server round trips from Lagos go to Frankfurt. That is slower than a local region would be, but fine for one user.
- Preview branches from the Neon ↔ Vercel integration are created in the same Neon project and region.

### In 2 years

- Data stays in one known jurisdiction. If the NDPA rules on cross-border transfer tighten, this ADR is where to start.
- Moving regions later means a Neon project move (dump and restore) and a `vercel.json` change.

## Alternatives considered

- **US East (Neon and Vercel defaults).** Further from Lagos and a weaker privacy posture.
- **London.** Close in distance, but the existing database is already in Frankfurt and moving it gains little.
- **A region in Africa.** Vercel has one, but the database would then sit far from its functions unless Neon offers a matching region. Check this again if it ever matters.

## Revisit when

- Neon opens a region in Africa.
- The NDPA or its regulations change the rules on storing personal data abroad.
- Latency from Lagos becomes a real problem.
