# ADR-0007: Object storage is Cloudflare R2

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D7, §12.2, Phases 5 and 7.

## Context

Uploaded music, video and PDFs need a home that both devices can reach. Media files are large and are read many times, so egress cost matters more than storage cost. Heavy or private files can also stay on the device (FRD §1).

## Decision

- Uploads go to **Cloudflare R2** through **presigned URLs** (`app/api/upload/route.ts`). The file never passes through our server.
- R2 has zero egress fees and a 10 GB free tier.
- The R2 client is a nullable connector. Without config, uploads are hidden and the route returns 503 (FRD §4.5).

## Consequences

### In 6 months

- Reader (Phase 5) and Media (Phase 7) share one upload path.
- Streaming the same video many times costs nothing in egress.

### In 2 years

- Storage is the only R2 cost. It stays small for one person, but large video libraries could push past the free tier.
- Files live with a second vendor (Cloudflare), separate from the database (Neon).

## Alternatives considered

- **Neon Object Storage.** S3-compatible and branch-aware, which is attractive. Still in beta, with a 5 GiB per-object cap.
- **Vercel Blob.** Egress is charged. Not built for large media.
- **Local only.** Files would not reach the second device.

### Re-reviewed 2026-11-07 (Phase 7, T60)

- **Neon Object Storage now:**
  - 5 GiB per single upload, 10 GiB with multipart;
  - 5 GB free per project;
  - Frankfurt (`aws-eu-central-1`) available, presigned URLs supported;
  - branches inherit the parent's objects (unused here: C6 allows no preview branches);
  - its docs don't say whether it's out of beta, and its egress price isn't published.
- **Decision unchanged: R2 for media.** Its zero egress matters when the same video streams again and again, and the 10 GB free tier is larger.
- **Neon is the fallback.** It needs no card on file, and that is what deferred R2 in T46. It suits the small files (reader documents, covers) if the owner wants uploads before adding a card. Either way, uploads stay off until the owner chooses (SPEC V38).

## Revisit when

- ~~Phase 7: compare Neon Object Storage with R2 again.~~ Done 2026-11-07, above.
- Neon publishes its Object Storage egress price, or lifts the 10 GiB cap.
- The library grows past the R2 free tier.
