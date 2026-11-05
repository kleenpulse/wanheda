import { describe, expect, it } from "vitest";
import {
  CLOCK_SKEW_MS,
  checklistProgress,
  clampEditedAt,
  displayTitle,
  draftNote,
  excerpt,
  noteWriteSchema,
  parseCapture,
  prefixTsQuery,
  resolveWrite,
  searchLocal,
  searchTerms,
  sortNotes,
  taskLines,
  toggleTaskAtLine,
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
    ]) {
      expect(noteWriteSchema.safeParse(bad).success).toBe(false);
    }
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
});

describe("checklists", () => {
  const body = ["# Today", "- [ ] buy SSD", "  - [x] compare prices", "```", "- [ ] not a task", "```", "> 1. [X] quoted", "plain"].join(
    "\n",
  );

  it("finds task items outside code fences, nested, ordered and quoted", () => {
    expect(taskLines(body)).toEqual([
      { line: 2, checked: false },
      { line: 3, checked: true },
      { line: 7, checked: true },
    ]);
    expect(checklistProgress(body)).toEqual({ done: 2, total: 3 });
    expect(checklistProgress("no tasks")).toBeNull();
  });

  it("toggles only a real task line", () => {
    const ticked = toggleTaskAtLine(body, 2);
    expect(ticked.split("\n")[1]).toBe("- [x] buy SSD");
    expect(toggleTaskAtLine(ticked, 2)).toBe(body);
    expect(toggleTaskAtLine(body, 7).split("\n")[6]).toBe("> 1. [ ] quoted");
    expect(toggleTaskAtLine(body, 5)).toBe(body); // inside the fence
    expect(toggleTaskAtLine(body, 1)).toBe(body);
    expect(toggleTaskAtLine(body, 99)).toBe(body);
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
