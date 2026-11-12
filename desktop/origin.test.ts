import { describe, expect, test } from "vitest";
import { DEFAULT_APP_URL, parseAppOrigin, unreachablePage, unreachableRetry } from "./origin";

describe("parseAppOrigin", () => {
  test("a bare https origin, with or without the trailing slash", () => {
    expect(parseAppOrigin(DEFAULT_APP_URL)).toBe(DEFAULT_APP_URL);
    expect(parseAppOrigin(`${DEFAULT_APP_URL}/`)).toBe(DEFAULT_APP_URL);
    expect(parseAppOrigin("https://wanheda-git-x.vercel.app:8443")).toBe("https://wanheda-git-x.vercel.app:8443");
  });

  test("anything else is refused", () => {
    for (const raw of [
      undefined,
      "",
      "http://wanheda-chi.vercel.app",
      "http://localhost:3000",
      "https://user:pw@wanheda-chi.vercel.app",
      "https://wanheda-chi.vercel.app/money",
      "https://wanheda-chi.vercel.app/?a=1",
      "https://wanheda-chi.vercel.app/#x",
      "https://WANHEDA-chi.vercel.app",
      "https://wanheda-chi.vercel.app:443",
      " https://wanheda-chi.vercel.app",
      "wanheda://auth",
      "not a url",
    ]) {
      expect(parseAppOrigin(raw), String(raw)).toBeNull();
    }
  });
});

describe("unreachableRetry", () => {
  const app = DEFAULT_APP_URL;
  test("a failed main-frame load of the app's own page is retried there", () => {
    expect(unreachableRetry({ errorCode: -106, url: `${app}/money?tab=a`, isMainFrame: true }, app)).toBe(`${app}/money?tab=a`);
    expect(unreachableRetry({ errorCode: -105, url: `${app}/`, isMainFrame: true }, app)).toBe(`${app}/`);
    // Never the redeem URL: its token is spent and Retry can't send main's header.
    expect(unreachableRetry({ errorCode: -106, url: `${app}/api/desktop/redeem?token=${"t".repeat(43)}`, isMainFrame: true }, app)).toBe(`${app}/login`);
  });

  test("aborted loads, subframes, other origins and no origin are not failures", () => {
    expect(unreachableRetry({ errorCode: -3, url: `${app}/`, isMainFrame: true }, app)).toBeNull();
    expect(unreachableRetry({ errorCode: -106, url: `${app}/`, isMainFrame: false }, app)).toBeNull();
    expect(unreachableRetry({ errorCode: -106, url: "https://evil.test/", isMainFrame: true }, app)).toBeNull();
    expect(unreachableRetry({ errorCode: -106, url: "data:text/html,x", isMainFrame: true }, app)).toBeNull();
    expect(unreachableRetry({ errorCode: -106, url: `${app}/`, isMainFrame: true }, null)).toBeNull();
    expect(unreachableRetry({ errorCode: 0, url: `${app}/`, isMainFrame: true }, app)).toBeNull();
  });
});

describe("unreachablePage", () => {
  test("a script-free data page whose Retry links back to the failed page", () => {
    const page = unreachablePage(`${DEFAULT_APP_URL}/a?b=1&c="x"`, { background: "#000000", ink: "#ffffff" }, 32);
    expect(page.startsWith("data:text/html;charset=utf-8,")).toBe(true);
    const html = decodeURIComponent(page.slice(page.indexOf(",") + 1));
    expect(html).toContain("Can't reach Wanheda");
    expect(html).toContain(`href="${DEFAULT_APP_URL}/a?b=1&#38;c=&#34;x&#34;"`);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("default-src 'none'");
  });
});
