"use client";

import * as React from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import { HIGHLIGHT_MAX_CHARS, shikiLang } from "@/lib/reader/md";
import { MD_REHYPE, MD_REMARK, MD_REMARK_REHYPE } from "@/lib/reader/md-pipeline";
import { cachedHtml, highlight } from "./highlight";

type Element = NonNullable<ExtraProps["node"]>;
type ElementContent = Element["children"][number];

// A document's Markdown, as the reader shows it (T48, V40): GFM, sanitized,
// headings slugged (lib/reader/md-pipeline.ts), code highlighted by Shiki.
// Links: in-document anchors stay (the reader scrolls to them), web and mail
// links open in a new tab with no opener or referrer, relative links to files
// that aren't here render as plain text. Images load only over https, lazily,
// with no referrer; anything else shows its alt text.

function textOf(nodes: readonly ElementContent[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") out += n.value;
    else if (n.type === "element") out += textOf(n.children);
  }
  return out;
}

function fenceOf(code: Element): string | null {
  const cls = code.properties.className;
  const list = Array.isArray(cls) ? cls : [];
  for (const c of list) {
    if (typeof c === "string" && c.startsWith("language-")) return c.slice("language-".length);
  }
  return null;
}

const EXTERNAL = /^(https?:|mailto:)/i;

const COMPONENTS: Components = {
  pre({ node }) {
    const code = node?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
    if (!code) return null;
    return <CodeBlock fence={fenceOf(code)} code={textOf(code.children).replace(/\n$/, "")} />;
  },
  a({ node: _node, href, children, ...rest }) {
    if (typeof href === "string" && href.startsWith("#")) {
      return (
        <a {...rest} href={href}>
          {children}
        </a>
      );
    }
    if (typeof href === "string" && EXTERNAL.test(href)) {
      return (
        <a {...rest} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    // A path to a file beside this one, which the reader doesn't have.
    return <span title={typeof href === "string" ? href : undefined}>{children}</span>;
  },
  img({ node: _node, src, alt }) {
    if (typeof src === "string" && /^https:\/\//i.test(src)) {
      // eslint-disable-next-line @next/next/no-img-element -- a document's own image, from wherever it points
      return <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
    }
    return alt ? <span className="md-alt">[{alt}]</span> : null;
  },
};

/**
 * The last document parsed, as its React tree. The tree is immutable, so
 * reopening the same text mounts it again without parsing it again (V24).
 */
let lastTree: { text: string; tree: React.ReactElement } | null = null;

function treeOf(text: string): React.ReactElement {
  if (lastTree?.text === text) return lastTree.tree;
  // react-markdown's sync entry is a plain function of its options: parse once, here.
  const tree = ReactMarkdown({ remarkPlugins: MD_REMARK, rehypePlugins: MD_REHYPE, remarkRehypeOptions: MD_REMARK_REHYPE, components: COMPONENTS, children: text });
  lastTree = { text, tree };
  return tree;
}

/** The rendered document. Memoised on the text: scrolling and the bars never re-render it. */
export const MdBody = React.memo(function MdBody({ text }: { text: string }) {
  return React.useMemo(() => treeOf(text), [text]);
});

/** Plain text: paragraphs at blank lines (any line ending, spaces allowed on them), line breaks kept. */
export const TextBody = React.memo(function TextBody({ text }: { text: string }) {
  const paras = React.useMemo(() => text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n\s*/), [text]);
  return (
    <>
      {paras.map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para}
        </p>
      ))}
    </>
  );
});

/**
 * A fenced block. Plain at once, then Shiki's colours when they're ready (at
 * once too, when this block was highlighted before). Shiki's output is the
 * only HTML the reader sets directly (V40): it is generated from code the
 * sanitizer already passed, and Shiki escapes every character of it.
 */
function CodeBlock({ fence, code }: { fence: string | null; code: string }) {
  const lang = shikiLang(fence);
  const [html, setHtml] = React.useState<string | null>(() => (lang ? (cachedHtml(lang, code) ?? null) : null));
  React.useEffect(() => {
    if (!lang || html !== null || code.length > HIGHLIGHT_MAX_CHARS) return;
    let live = true;
    void highlight(lang, code).then((h) => {
      if (live && h !== null) setHtml(h);
    });
    return () => {
      live = false;
    };
  }, [lang, code, html]);
  if (html !== null) return <div className="md-code" dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className="md-code">
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
