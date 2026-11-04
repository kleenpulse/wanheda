import { describe, expect, it } from "vitest";
import { RAIL_ATTR, RAIL_COOKIE, parseRail, railBootScript, railCookie } from "./rail";

/** Runs the boot script against a fake document; returns the attribute it set, if any. */
function boot(cookie: string | (() => string)): string | undefined {
  const attrs = new Map<string, string>();
  const document = {
    get cookie() {
      return typeof cookie === "function" ? cookie() : cookie;
    },
    documentElement: { setAttribute: (name: string, value: string) => attrs.set(name, value) },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script is ours and runs inline in <head>
  const run = new Function("document", railBootScript()) as (doc: typeof document) => void;
  run(document);
  return attrs.get(RAIL_ATTR);
}

describe("railBootScript", () => {
  it.each(["wanheda-rail=open", "a=1; wanheda-rail=open", "wanheda-rail=open; b=2"])("marks %j open", (cookie) => {
    expect(boot(cookie)).toBe("open");
  });

  it.each(["wanheda-rail=closed", "xwanheda-rail=open", "wanheda-rail=opened", "a=wanheda-rail=open", ""])(
    "leaves %j alone",
    (cookie) => {
      expect(boot(cookie)).toBeUndefined();
    },
  );

  it("agrees with railCookie and parseRail", () => {
    for (const expanded of [true, false]) {
      expect(boot(railCookie(expanded).split(";")[0] ?? "") === "open").toBe(expanded);
    }
  });

  it("never throws, even when document.cookie does", () => {
    expect(
      boot(() => {
        throw new Error("blocked");
      }),
    ).toBeUndefined();
  });
});

describe("parseRail", () => {
  it("is expanded only for an explicit open", () => {
    expect(parseRail("open")).toBe(true);
  });

  it.each([undefined, null, "", "closed", "OPEN", "true", "1"])("treats %j as collapsed", (value) => {
    expect(parseRail(value)).toBe(false);
  });
});

describe("railCookie", () => {
  it("writes a value that parseRail reads back", () => {
    for (const expanded of [true, false]) {
      const value = railCookie(expanded).split(";")[0]?.split("=")[1];
      expect(parseRail(value)).toBe(expanded);
    }
  });

  it("is site-wide, long-lived and same-site", () => {
    const cookie = railCookie(true);
    expect(cookie.startsWith(`${RAIL_COOKIE}=open;`)).toBe(true);
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("max-age=31536000");
    expect(cookie).toContain("samesite=lax");
  });
});
