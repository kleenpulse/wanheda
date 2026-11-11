import { describe, expect, it } from "vitest";
import {
  CLOCK_SKEW_MS,
  checklistProgress,
  noteMarkdown,
  clampEditedAt,
  displayTitle,
  draftNote,
  isBlank,
  excerpt,
  sameContent,
  noteWriteSchema,
  parseCapture,
  placeAfter,
  prefixTsQuery,
  resolveWrite,
  searchLocal,
  searchTerms,
  sortNotes,
  taskItems,
  toggleTaskAt,
  writeOf,
  type Note,
} from "./notes";

const NOW = 1_800_000_000_000;
const ID = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10";

function note(over: Partial<Note> = {}): Note {
  return { ...draftNote(ID, NOW), version: 3, ...over };
}

describe("noteWriteSchema", () => {
  const valid = { ...writeOf(note({ title: "T", bodyMd: "b" })), tags: [" Errand ", "errand", "plan"] };

  it("accepts a write and normalises tags", () => {
    const parsed = noteWriteSchema.parse(valid);
    expect(parsed.tags).toEqual(["errand", "plan"]);
  });

  it("refuses bad ids, colours, extra keys, long titles, old clocks and too many tags", () => {
    for (const bad of [
      { ...valid, id: "1 or 1=1" },
      { ...valid, color: "red" },
      { ...valid, userId: "someone-else" },
      { ...valid, title: "x".repeat(201) },
      { ...valid, editedAt: 0 },
      { ...valid, baseVersion: -1 },
      { ...valid, tags: Array.from({ length: 21 }, (_, i) => `t${String(i)}`) },
      { ...valid, tags: ["x".repeat(33)] },
      { ...valid, board: { x: 0, y: 0, w: 100, h: 200 } },
      { ...valid, board: { x: 0.5, y: 0, w: 240, h: 192 } },
      { ...valid, board: { x: 200_000, y: 0, w: 240, h: 192 } },
      { ...valid, board: { x: 0, y: 0, w: 240, h: 192, z: 1 } },
    ]) {
      expect(noteWriteSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("takes a board place, none, or a write queued before the board existed", () => {
    const place = { x: -48, y: 24, w: 240, h: 192 };
    expect(noteWriteSchema.parse({ ...valid, board: place }).board).toEqual(place);
    expect(noteWriteSchema.parse({ ...valid, board: null }).board).toBeNull();
    const { board: _none, ...old } = valid;
    expect(noteWriteSchema.parse(old).board).toBeUndefined();
  });
});

describe("board place in content", () => {
  it("counts in sameContent, not in isBlank (nor do a pin or a colour)", () => {
    const placed = note({ board: { x: 0, y: 0, w: 240, h: 192 } });
    expect(sameContent(placed, note())).toBe(false);
    expect(isBlank(placed)).toBe(true);
    expect(isBlank(note({ pinned: true, color: "mint" }))).toBe(true);
    expect(isBlank(note({ bodyMd: "x" }))).toBe(false);
    expect(isBlank(note({ tags: ["x"] }))).toBe(false);
  });

  it("treats a place missing from an old device copy as none", () => {
    const old = { ...note() } as Partial<Note>;
    delete old.board;
    expect(sameContent(old as Note, note())).toBe(true);
    expect(writeOf(old as Note).board).toBeNull();
  });
});

describe("clampEditedAt", () => {
  it("pulls a clock from the future back to now, leaves small skew and the past alone", () => {
    expect(clampEditedAt(NOW + CLOCK_SKEW_MS + 1, NOW)).toBe(NOW);
    expect(clampEditedAt(NOW + 1000, NOW)).toBe(NOW + 1000);
    expect(clampEditedAt(NOW - 86_400_000, NOW)).toBe(NOW - 86_400_000);
  });
});

describe("resolveWrite (SPEC V23)", () => {
  const current = note({ title: "server", editedAt: NOW });

  it("inserts when there is no row", () => {
    expect(resolveWrite(null, writeOf(note(), 0))).toEqual({ kind: "insert" });
  });

  it("applies a write made on the current version", () => {
    expect(resolveWrite(current, { ...writeOf(current), title: "mine" })).toEqual({ kind: "update" });
  });

  it("does nothing for a write that changes nothing, whatever its base (a replay)", () => {
    expect(resolveWrite(current, writeOf(current))).toEqual({ kind: "noop" });
    expect(resolveWrite(current, writeOf(current, 1))).toEqual({ kind: "noop" });
  });

  it("settles a stale write by edit time: later wins, a tie keeps the server row", () => {
    const stale = { ...writeOf(current, 2), title: "other device" };
    expect(resolveWrite(current, { ...stale, editedAt: NOW + 1 })).toEqual({ kind: "conflict", winner: "incoming" });
    expect(resolveWrite(current, { ...stale, editedAt: NOW - 1 })).toEqual({ kind: "conflict", winner: "server" });
    expect(resolveWrite(current, { ...stale, editedAt: NOW })).toEqual({ kind: "conflict", winner: "server" });
  });

  it("settles a move as place only, on any version: it never touches the text conflict", () => {
    const place = { x: 24, y: 48, w: 240, h: 192 };
    expect(resolveWrite(current, { ...writeOf(current), board: place })).toEqual({ kind: "place" });
    expect(resolveWrite(current, { ...writeOf(current, 2), board: place, editedAt: NOW - 5 })).toEqual({ kind: "place" });
    // A replayed move is nothing.
    expect(resolveWrite({ ...current, board: place }, { ...writeOf(current, 2), board: place })).toEqual({ kind: "noop" });
  });

  it("applies an offline text edit made before a move elsewhere, and keeps the move (review FIX, PR #12)", () => {
    // Desktop moved the sticky: place only, so the version stays where the phone's edit was made.
    const moved: Note = { ...current, board: { x: 96, y: 0, w: 240, h: 192 } };
    const { board: _phoneSawNoMove, ...phone } = { ...writeOf(current), bodyMd: "edited offline", editedAt: NOW - 60_000 };
    expect(resolveWrite(moved, phone)).toEqual({ kind: "update" });
    expect(placeAfter(moved, phone)).toEqual(moved.board);
  });

  it("lets a move ride along with a text conflict either way", () => {
    const place = { x: 24, y: 48, w: 240, h: 192 };
    const stale = { ...writeOf(current, 2), title: "stale text", board: place };
    expect(resolveWrite(current, { ...stale, editedAt: NOW - 5 })).toEqual({ kind: "conflict", winner: "server" });
    expect(placeAfter(current, stale)).toEqual(place);
    const { board: _none, ...unmoved } = stale;
    expect(placeAfter({ ...current, board: place }, unmoved)).toEqual(place);
  });
});

describe("writeOf", () => {
  const place = { x: 0, y: 24, w: 240, h: 192 };
  it("carries the place only when it differs from the server's copy", () => {
    const local = note({ board: place });
    expect(writeOf(local, 3, note({ board: place })).board).toBeUndefined();
    expect(writeOf(local, 3, note()).board).toEqual(place);
    // A note the server hasn't seen yet sends its place, none included.
    expect(writeOf(local, 0, null).board).toEqual(place);
    expect("board" in writeOf(note(), 0, undefined)).toBe(true);
  });
});

describe("checklists", () => {
  const body = ["# Today", "- [ ] buy SSD", "  - [x] compare prices", "```", "- [ ] not a task", "```", "> 1. [X] quoted", "plain"].join(
    "\n",
  );
  const at = (b: string, line: number) => taskItems(b).find((t) => t.line === line)?.offset ?? -1;

  it("finds task items outside code fences, nested, ordered and quoted", () => {
    expect(taskItems(body).map(({ line, checked }) => ({ line, checked }))).toEqual([
      { line: 2, checked: false },
      { line: 3, checked: true },
      { line: 7, checked: true },
    ]);
    expect(checklistProgress(body)).toEqual({ done: 2, total: 3 });
    expect(checklistProgress("no tasks")).toBeNull();
  });

  it("agrees with remark-gfm on the edge cases", () => {
    const none = [
      "- [ ]",
      "- [ ] ",
      "para\n\n    - [ ] indented code",
      "> ```\n> - [ ] fenced in a quote\n> ```",
      "<div>\n- [ ] html block\n</div>",
      "```\n- [ ] still code\n```js\n- [ ] still code\n```",
    ];
    for (const b of none) expect(checklistProgress(b), b).toBeNull();
    expect(taskItems("- > - [ ] x")).toEqual([{ offset: 4, line: 1, checked: false }]);
    expect(checklistProgress("- [ ] a\r\n- [x] b\r\n")).toEqual({ done: 1, total: 2 });
  });

  it("toggles only a real task item", () => {
    const ticked = toggleTaskAt(body, at(body, 2));
    expect(ticked.split("\n")[1]).toBe("- [x] buy SSD");
    expect(toggleTaskAt(ticked, at(ticked, 2))).toBe(body);
    expect(toggleTaskAt(body, at(body, 7)).split("\n")[6]).toBe("> 1. [ ] quoted");
    expect(toggleTaskAt(body, body.indexOf("- [ ] not a task"))).toBe(body);
    expect(toggleTaskAt(body, 0)).toBe(body);
    expect(toggleTaskAt(body, 9999)).toBe(body);
    expect(toggleTaskAt("- > - [ ] x", 4)).toBe("- > - [x] x");
  });
});

describe("titles and excerpts", () => {
  it("falls back to the first line, stripped of Markdown, then Untitled", () => {
    expect(displayTitle({ title: "  Plan ", bodyMd: "x" })).toBe("Plan");
    expect(displayTitle({ title: "", bodyMd: "\n## **Buy** a [disk](https://x.test)\nmore" })).toBe("Buy a disk");
    expect(displayTitle({ title: "", bodyMd: "- [ ] task one" })).toBe("task one");
    expect(displayTitle({ title: "", bodyMd: "  " })).toBe("Untitled");
  });

  it("skips the line used as the title", () => {
    expect(excerpt({ title: "", bodyMd: "first\nsecond\nthird" })).toBe("second · third");
    expect(excerpt({ title: "T", bodyMd: "first\nsecond" })).toBe("first · second");
    expect(excerpt({ title: "T", bodyMd: "x".repeat(300) }, 20)).toHaveLength(20);
  });
});

describe("parseCapture", () => {
  it("takes what follows `note `", () => {
    expect(parseCapture("note buy SSD")).toBe("buy SSD");
    expect(parseCapture("  Note   call mum \n")).toBe("call mum");
    expect(parseCapture("note")).toBeNull();
    expect(parseCapture("note   ")).toBeNull();
    expect(parseCapture("notes")).toBeNull();
    expect(parseCapture("buy note x")).toBeNull();
  });
});

describe("search", () => {
  it("builds a prefix tsquery from letters and digits only", () => {
    expect(prefixTsQuery("Buy SSD")).toBe("buy:* & ssd:*");
    expect(prefixTsQuery("a' & b | !c:* (d)")).toBe("a:* & b:* & c:* & d:*");
    expect(prefixTsQuery("ünïcode 2tb")).toBe("ünïcode:* & 2tb:*");
    expect(prefixTsQuery("  !!! ")).toBeNull();
    expect(prefixTsQuery("Buy SSD", "any")).toBe("buy:* | ssd:*");
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(8);
  });

  const notes = [
    note({ id: "a", title: "SSD prices", bodyMd: "", editedAt: NOW - 10 }),
    note({ id: "b", title: "Errands", bodyMd: "buy an ssd today", editedAt: NOW }),
    note({ id: "c", title: "", bodyMd: "ssd ssd", archived: true }),
    note({ id: "d", title: "Other", bodyMd: "nothing here" }),
  ];

  it("matches every word as a prefix, ranks title hits first, skips the archive", () => {
    expect(searchLocal(notes, "ss").map((n) => n.id)).toEqual(["a", "b"]);
    expect(searchLocal(notes, "buy ssd").map((n) => n.id)).toEqual(["b"]);
    expect(searchLocal(notes, "zzz")).toEqual([]);
    expect(searchLocal(notes, "  ")).toEqual([]);
  });
});

describe("sortNotes", () => {
  it("puts pinned first, then the newest edit", () => {
    const sorted = sortNotes([
      note({ id: "old", editedAt: 1 }),
      note({ id: "pin", pinned: true, editedAt: 0 }),
      note({ id: "new", editedAt: 2 }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["pin", "new", "old"]);
  });
});

describe("noteMarkdown", () => {
  it("puts the title over the body as a heading", () => {
    expect(noteMarkdown({ title: "  Plan ", bodyMd: "- [ ] one" })).toBe("# Plan\n\n- [ ] one");
  });

  it("is the body alone when there is no title", () => {
    expect(noteMarkdown({ title: "   ", bodyMd: "@Vxrcel\n\nText" })).toBe("@Vxrcel\n\nText");
  });
});
