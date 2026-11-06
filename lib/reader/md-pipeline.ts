import type { Options as MarkdownOptions } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { ID_PREFIX } from "./md";

// The reader's Markdown pipeline (T48, V40), shared by the reader and its test
// so the order can't drift: GFM, then rehype-sanitize (GitHub's schema: no raw
// HTML, no `javascript:` links, every id prefixed), then rehype-slug on the
// clean tree (its ids take the same prefix). Shiki comes last, at render, on
// code the sanitizer has already passed (components/reader/md/code-block.tsx).
// No MDX: nothing in a document ever runs.

export const MD_REMARK: PluggableList = [remarkGfm];

export const MD_REHYPE: PluggableList = [rehypeSanitize, [rehypeSlug, { prefix: ID_PREFIX }]];

/** The sanitizer prefixes ids itself; remark-rehype adding it too would double it on footnotes. */
export const MD_REMARK_REHYPE: NonNullable<MarkdownOptions["remarkRehypeOptions"]> = { clobberPrefix: "" };
