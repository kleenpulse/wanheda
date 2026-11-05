"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/*
  A note's Markdown, read-only except for its checklists (FR-NOTES-5): GFM
  (tables, task lists, strikethrough, autolinks), sanitized, raw HTML never
  rendered. A task box toggles the source line it came from; positions survive
  sanitizing, so the line is exact even with code blocks and nesting.
*/

const REMARK = [remarkGfm];
const REHYPE = [rehypeSanitize];

export function NoteMarkdown({
  body,
  onToggleTask,
  className,
}: {
  body: string;
  /** 1-based source line of the task item. Absent: boxes are read-only. */
  onToggleTask?: (line: number) => void;
  className?: string;
}) {
  const components = React.useMemo<Components>(
    () => ({
      // The li draws its own box, which knows its line; drop the parser's.
      input: () => null,
      li({ node, className: liClass, children, ...rest }) {
        const isTask = typeof liClass === "string" && liClass.includes("task-list-item");
        if (!isTask) return <li {...rest}>{children}</li>;
        const box = node?.children.find((c) => c.type === "element" && c.tagName === "input");
        const checked = box?.type === "element" && Boolean(box.properties.checked);
        const line = node?.position?.start.line;
        return (
          <li {...rest} className="task-item" data-line={line}>
            <input
              type="checkbox"
              checked={checked}
              disabled={!onToggleTask || line === undefined}
              onChange={() => {
                if (line !== undefined) onToggleTask?.(line);
              }}
              aria-label={checked ? "Done, untick" : "Not done, tick"}
              className="note-check"
            />
            <span className={cn("min-w-0", checked && "text-ink-3 line-through")}>{children}</span>
          </li>
        );
      },
      a({ node: _node, children, ...rest }) {
        return (
          <a {...rest} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      },
    }),
    [onToggleTask],
  );

  return (
    <div className={cn("note-md", className)}>
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
