import { describe, expect, it } from "vitest";
import { draftNote, type Note } from "./notes";
import { mergeNotes } from "./sync";

const NOW = 1_800_000_000_000;
const ID = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10";

function note(over: Partial<Note> = {}): Note {
  return { ...draftNote(ID, NOW), version: 1, ...over };
}

describe("mergeNotes", () => {
  it("puts local edits over server rows, drops local deletes, adds local-only notes, sorts", () => {
    const server = [note({ id: "a", title: "server a", editedAt: 1 }), note({ id: "b", editedAt: 2 }), note({ id: "c", editedAt: 3 })];
    const merged = mergeNotes(server, {
      a: note({ id: "a", title: "local a", editedAt: 5 }),
      b: null,
      d: note({ id: "d", editedAt: 4, version: 0 }),
    });
    expect(merged.map((n) => [n.id, n.title])).toEqual([
      ["a", "local a"],
      ["d", ""],
      ["c", ""],
    ]);
  });
});
