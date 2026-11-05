import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { taskItems } from "@/lib/notes/notes";
import { NoteMarkdown } from "./note-markdown";

describe("NoteMarkdown", () => {
  it("gives each task box the source offset toggleTaskAt expects, labelled by its own text, through sanitizing", () => {
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
    const offsets = [...html.matchAll(/data-offset="(\d+)"/g)].map((m) => Number(m[1]));
    expect(offsets).toEqual(taskItems(body).map((t) => t.offset));
    expect(offsets).toHaveLength(4);
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
    expect(html.match(/aria-labelledby="/g)).toHaveLength(4);
  });

  it("renders no raw HTML and no script links", () => {
    const html = renderToStaticMarkup(<NoteMarkdown body={'<img src=x onerror="alert(1)"> [x](javascript:alert(1))'} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });
});
