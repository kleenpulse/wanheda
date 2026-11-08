import { describe, expect, test } from "vitest";
import { EMBED_ORIGINS } from "@/lib/media/url";
import { contentSecurityPolicy } from "./csp";

function directives(): Map<string, string[]> {
  return new Map(
    contentSecurityPolicy()
      .split("; ")
      .map((part) => {
        const [name = "", ...values] = part.split(" ");
        return [name, values];
      }),
  );
}

describe("contentSecurityPolicy", () => {
  test("never allows eval, only wasm compilation", () => {
    const policy = contentSecurityPolicy();
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directives().get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"]);
  });

  test("frames only the embed allowlist (V56)", () => {
    expect(directives().get("frame-src")).toEqual([...EMBED_ORIGINS]);
  });

  test("locks plugins, base, forms and framing", () => {
    const d = directives();
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
  });

  test("fetch reaches only the app, the voice host and YouTube thumbnails", () => {
    expect(directives().get("connect-src")).toEqual(["'self'", "https://huggingface.co", "https://*.hf.co", "https://*.huggingface.co", "https://i.ytimg.com"]);
  });

  test("no directive would push the desktop's http://localhost to https", () => {
    const d = directives();
    expect(d.has("upgrade-insecure-requests")).toBe(false);
    expect(d.has("block-all-mixed-content")).toBe(false);
  });

  test("one line, no stray separators", () => {
    expect(contentSecurityPolicy()).not.toMatch(/[\r\n]|;;|; $/);
  });
});
