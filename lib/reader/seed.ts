import { formatLocator, type Collection, type ReaderDoc } from "./reader";

// Demo's library (G4): a few sample entries so /reader and Home's "Continue
// reading" have something to show. The two text samples carry their own text,
// so they open with nothing on the device; the PDFs are entries only and read
// as "not on this device". Nothing here is stored.

const DAY = 86_400_000;

const GUIDE = `# Reading in Wanheda

Your library lives in one place. The files stay on the device you opened them on, and the list, your place in each file and your collections follow you to every device.

## Opening a file

Drop a PDF, Markdown or text file on the library, or press **Open file**. Wanheda reads it on your device, works out its fingerprint (a SHA-256 of its bytes) and keeps a copy in this browser's private storage.

## On another device

The entry is already there, marked *not on this device*. Open the same file there: the fingerprint matches, it links up, and you pick up where you stopped.

## Your place

Wanheda keeps your position as you read, a couple of seconds after you stop scrolling and again when you leave the page. If two devices disagree, the most recent position wins.
`;

const NOTES = `Field notes, chapter one

The river was lower than the maps said. We walked the bank for an hour before the path turned inland, and the birds went quiet as the trees closed in.

By noon the heat had settled into the valley. We rested under a fig tree and counted what was left of the water: two bottles and a half.

The village was not where it should have been either. It had moved, a woman told us, when the river did. Everything here follows the water.

We stayed the night. In the morning the mist sat on the fields like a second river, and for a moment the old maps were right again.
`;

export const DEMO_COLLECTIONS: Collection[] = [
  { id: "7a1f0c52-58b1-4c39-9d2e-0c6e5a3f0001", name: "Craft" },
  { id: "7a1f0c52-58b1-4c39-9d2e-0c6e5a3f0002", name: "Evenings" },
];

function hash(seed: string): string {
  // A stable fake fingerprint per sample: never compared with a real file's.
  let h = 0x811c9dc5;
  let out = "";
  for (let i = 0; out.length < 64; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i;
    h = Math.imul(h, 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

/** The sample library, dated relative to now. */
export function seedLibrary(now: number): { documents: ReaderDoc[]; collections: Collection[] } {
  const [craft, evenings] = DEMO_COLLECTIONS.map((c) => c.id) as [string, string];
  const documents: ReaderDoc[] = [
    {
      id: "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0001",
      kind: "md",
      title: "Reading in Wanheda",
      author: "Wanheda",
      fileName: "reading-in-wanheda.md",
      sha256: hash("guide"),
      sizeBytes: new TextEncoder().encode(GUIDE).length,
      pages: null,
      tags: ["guide"],
      mode: "scroll",
      collections: [],
      progress: { locator: formatLocator({ kind: "md", heading: "", y: 420 }), percent: 42, at: now - 2 * 3_600_000 },
      lastOpenedAt: now - 2 * 3_600_000,
      createdAt: now - 9 * DAY,
      sample: GUIDE,
    },
    {
      id: "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0002",
      kind: "pdf",
      title: "The Design of Everyday Systems",
      author: "Sample author",
      fileName: "everyday-systems.pdf",
      sha256: hash("systems"),
      sizeBytes: 8_412_330,
      pages: 312,
      tags: ["design", "systems"],
      mode: "scroll",
      collections: [craft],
      progress: { locator: formatLocator({ kind: "pdf", page: 118, y: 200 }), percent: 38, at: now - DAY },
      lastOpenedAt: now - DAY,
      createdAt: now - 30 * DAY,
    },
    {
      id: "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0003",
      kind: "txt",
      title: "Field notes",
      author: null,
      fileName: "field-notes.txt",
      sha256: hash("field"),
      sizeBytes: new TextEncoder().encode(NOTES).length,
      pages: null,
      tags: ["travel"],
      mode: "scroll",
      collections: [evenings],
      progress: { locator: formatLocator({ kind: "md", heading: "", y: 700 }), percent: 70, at: now - 3 * DAY },
      lastOpenedAt: now - 3 * DAY,
      createdAt: now - 12 * DAY,
      sample: NOTES,
    },
    {
      id: "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0004",
      kind: "pdf",
      title: "Notes on Typography",
      author: "Sample author",
      fileName: "notes-on-typography.pdf",
      sha256: hash("type"),
      sizeBytes: 2_904_118,
      pages: 96,
      tags: ["design", "type"],
      mode: "flip",
      collections: [craft, evenings],
      progress: { locator: formatLocator({ kind: "pdf", page: 96, y: 1000 }), percent: 100, at: now - 14 * DAY },
      lastOpenedAt: now - 14 * DAY,
      createdAt: now - 40 * DAY,
    },
    {
      id: "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0005",
      kind: "pdf",
      title: "A Short Field Guide to Rivers",
      author: null,
      fileName: "rivers.pdf",
      sha256: hash("rivers"),
      sizeBytes: 14_220_901,
      pages: 188,
      tags: ["travel"],
      mode: "scroll",
      collections: [],
      progress: null,
      lastOpenedAt: null,
      createdAt: now - 2 * DAY,
    },
  ];
  return { documents, collections: DEMO_COLLECTIONS };
}
