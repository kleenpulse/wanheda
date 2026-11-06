"use client";

import type { HighlighterCore, LanguageInput } from "shiki/core";
import { HIGHLIGHT_MAX_CHARS, type ShikiLang } from "@/lib/reader/md";

// Code highlighting for the Markdown reader (T48): Shiki's fine-grained core
// with the JavaScript regex engine, so no Oniguruma WASM is shipped. Nothing
// loads until a document holds a fenced block in a known language; then the
// core, two themes and only that grammar arrive, each its own chunk. Runs in
// the browser: the document's bytes never leave this device (T46), so there
// is no server copy to highlight. Results are kept by language and code, so
// reopening a document paints its colours at once (V24).

const LOADERS: Record<ShikiLang, () => Promise<{ default: LanguageInput }>> = {
  bash: () => import("shiki/langs/bash.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  dart: () => import("shiki/langs/dart.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  elixir: () => import("shiki/langs/elixir.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  haskell: () => import("shiki/langs/haskell.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  ini: () => import("shiki/langs/ini.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  lua: () => import("shiki/langs/lua.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  powershell: () => import("shiki/langs/powershell.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  zig: () => import("shiki/langs/zig.mjs"),
};

const LIGHT = "github-light";
const DARK = "github-dark";

let core: Promise<HighlighterCore> | null = null;
const grammars = new Map<ShikiLang, Promise<void>>();

function highlighter(): Promise<HighlighterCore> {
  core ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([import("shiki/core"), import("shiki/engine/javascript")]);
    return createHighlighterCore({
      themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
      langs: [],
      // A grammar rule the JS engine can't translate is skipped, not fatal: that token goes uncoloured.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();
  // A failed load (offline on first use) is tried again next time.
  core.catch(() => {
    core = null;
  });
  return core;
}

function grammar(hl: HighlighterCore, lang: ShikiLang): Promise<void> {
  let p = grammars.get(lang);
  if (!p) {
    p = LOADERS[lang]().then((m) => hl.loadLanguage(m.default));
    p.catch(() => {
      grammars.delete(lang);
    });
    grammars.set(lang, p);
  }
  return p;
}

/** Highlighted blocks, newest last; the oldest go past this many. */
const KEEP = 400;
const done = new Map<string, string>();

const keyOf = (lang: ShikiLang, code: string) => `${lang}\u0000${code}`;

/** A block highlighted before, ready to paint now. */
export function cachedHtml(lang: ShikiLang, code: string): string | undefined {
  return done.get(keyOf(lang, code));
}

/**
 * The block as Shiki's HTML: a <pre class="shiki"> whose spans carry both
 * themes as CSS variables (--shiki-light, --shiki-dark), so the paper picks
 * the colours in CSS without a second pass. Shiki escapes the code itself.
 * Null when the block is too long or a part fails to load: it stays plain.
 */
export async function highlight(lang: ShikiLang, code: string): Promise<string | null> {
  if (code.length > HIGHLIGHT_MAX_CHARS) return null;
  const key = keyOf(lang, code);
  const hit = done.get(key);
  if (hit !== undefined) return hit;
  try {
    const hl = await highlighter();
    await grammar(hl, lang);
    const html = hl.codeToHtml(code, { lang, themes: { light: LIGHT, dark: DARK }, defaultColor: false });
    done.set(key, html);
    if (done.size > KEEP) {
      const oldest = done.keys().next();
      if (!oldest.done) done.delete(oldest.value);
    }
    return html;
  } catch {
    return null;
  }
}
