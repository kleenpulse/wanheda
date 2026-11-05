import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { taskLines } from "@/lib/notes/notes";
import { NoteMarkdown } from "./note-markdown";

describe("NoteMarkdown", () => {
  it("gives each task box the source line toggleTaskAtLine expects, through sanitizing", () => {
    const body = [
      "# Plan",
      "",
      "- [ ] one",
      "- [x] two",
      "  - [ ] nested",
      "",
      "```md",
      "- [ ] not a task",
      "```",
      "",
      "> 1. [X] quoted",
    ].join("\n");
    const html = renderToStaticMarkup(<NoteMarkdown body={body} onToggleTask={() => undefined} />);
    const lines = [...html.matchAll(/data-line="(\d+)"/g)].map((m) => Number(m[1]));
    expect(lines).toEqual(taskLines(body).map((t) => t.line));
    expect(lines).toEqual([3, 4, 5, 11]);
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
  });

  it("renders no raw HTML and no script links", () => {
    const html = renderToStaticMarkup(<NoteMarkdown body={'<img src=x onerror="alert(1)"> [x](javascript:alert(1))'} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });
});
