import type { Note } from "./notes";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Demo mode's notes (G4): sample content, never saved. Stamped relative to `now`, so they read as recent. */
export function seedNotes(now: number): Note[] {
  const at = (ago: number) => now - ago;
  const make = (id: string, ago: number, n: Partial<Note>): Note => ({
    id,
    title: "",
    bodyMd: "",
    color: "plain",
    pinned: false,
    archived: false,
    tags: [],
    version: 1,
    editedAt: at(ago),
    createdAt: at(ago + DAY),
    updatedAt: at(ago),
    ...n,
  });
  return [
    make("5b0c3f7e-0d1a-4c2e-9f4b-1a2b3c4d5e01", 20 * MINUTE, {
      title: "This week",
      bodyMd: "- [x] Ship the notes list\n- [ ] Offline outbox\n- [ ] Board view\n- [ ] Pinned notes on Home",
      color: "amber",
      pinned: true,
      tags: ["plan"],
    }),
    make("5b0c3f7e-0d1a-4c2e-9f4b-1a2b3c4d5e02", 3 * HOUR, {
      bodyMd: "Buy a 2 TB SSD for the media library",
      tags: ["errand"],
    }),
    make("5b0c3f7e-0d1a-4c2e-9f4b-1a2b3c4d5e03", 2 * DAY, {
      title: "Reading list",
      bodyMd: "## Next up\n\n1. *The Pragmatic Programmer*\n2. Designing Data-Intensive Applications\n\n> Finish one before starting the next.",
      color: "sky",
      tags: ["reading"],
    }),
    make("5b0c3f7e-0d1a-4c2e-9f4b-1a2b3c4d5e04", 9 * DAY, {
      title: "Old idea",
      bodyMd: "A widget that shows the next renewal. Waits for Money.",
      archived: true,
    }),
  ];
}
