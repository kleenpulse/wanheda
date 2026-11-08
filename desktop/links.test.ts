import { describe, expect, test } from "vitest";
import { linkArg, linkPath, MAX_LINK } from "./links";

describe("linkPath", () => {
  test("opens allowlisted pages", () => {
    expect(linkPath("wanheda://open/media?tab=music")).toBe("/media?tab=music");
    expect(linkPath("wanheda://open/notes?n=abc")).toBe("/notes?n=abc");
    expect(linkPath("wanheda://open")).toBe("/");
    expect(linkPath("wanheda://open/")).toBe("/");
    expect(linkPath("WANHEDA://open/money")).toBe("/money");
  });

  test("takes the trailing slash Windows adds", () => {
    expect(linkPath("wanheda://open/money/")).toBe("/money");
  });

  test("drops everything else", () => {
    for (const link of [
      "wanheda://other/money",
      "wanheda://open/api/auth/sign-out",
      "wanheda://open/money?x=1",
      "wanheda://open/../api",
      "wanheda://open//evil.test",
      "wanheda://open/money#frag",
      "https://evil.test",
      "wanheda:open/money",
    ]) {
      expect(linkPath(link), link).toBeNull();
    }
  });

  test("caps the length", () => {
    expect(linkPath(`wanheda://open/notes?n=${"a".repeat(MAX_LINK)}`)).toBeNull();
  });
});

describe("linkArg", () => {
  test("finds the link among Chromium's switches", () => {
    expect(linkArg(["Wanheda.exe", "--allow-file-access", "wanheda://open/money"])).toBe("wanheda://open/money");
    expect(linkArg(["Wanheda.exe", "--wanheda-mode=preview"])).toBeUndefined();
  });
});
