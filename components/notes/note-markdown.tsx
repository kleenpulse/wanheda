"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/*
  A note's Markdown, read-only except for its checklists (FR-NOTES-5): GFM
  (tables, task lists, strikethrough, autolinks), sanitized, raw HTML never
  rendered. A task box toggles the source item it came from; positions survive
  sanitizing, so the offset is exact even with code blocks and nesting.
*/

const REMARK = [remarkGfm];
const REHYPE = [rehypeSanitize];

export function NoteMarkdown({
  body,
  onToggleTask,
  className,
}: {
  body: string;
  /** Called with the task item's source offset. Absent: boxes are read-only. */
  onToggleTask?: (offset: number) => void;
  className?: string;
}) {
  const components = React.useMemo<Components>(
    () => ({
      // The li draws its own box, which knows its offset; drop the parser's.
      input: () => null,
      li({ node, className: liClass, children, ...rest }) {
        const isTask = typeof liClass === "string" && liClass.includes("task-list-item");
        if (!isTask) return <li {...rest}>{children}</li>;
        const box = node?.children.find((c) => c.type === "element" && c.tagName === "input");
        const checked = box?.type === "element" && Boolean(box.properties.checked);
        return (
          <TaskItem {...rest} checked={checked} offset={node?.position?.start.offset} toggle={onToggleTask}>
            {children}
          </TaskItem>
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

/** One checklist item. Its box is named by its own text, so a screen reader can tell items apart. */
function TaskItem({
  checked,
  offset,
  toggle,
  children,
  ...rest
}: React.ComponentProps<"li"> & { checked: boolean; offset: number | undefined; toggle: ((offset: number) => void) | undefined }) {
  const textId = React.useId();
  return (
    <li {...rest} className="task-item" data-offset={offset}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!toggle || offset === undefined}
        onChange={() => {
          if (offset !== undefined) toggle?.(offset);
        }}
        aria-labelledby={textId}
        className="note-check"
      />
      <span id={textId} className={cn("min-w-0", checked && "text-ink-3 line-through")}>
        {children}
      </span>
    </li>
  );
}
