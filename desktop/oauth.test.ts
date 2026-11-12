import { describe, expect, it } from "vitest";
import { authorizeProvider } from "./oauth";

describe("authorizeProvider", () => {
  it("knows GitHub's and Google's authorize pages", () => {
    expect(authorizeProvider(new URL("https://github.com/login/oauth/authorize?client_id=c&state=s"))).toBe("github");
    expect(authorizeProvider(new URL("https://accounts.google.com/o/oauth2/v2/auth?client_id=c"))).toBe("google");
  });

  it("refuses look-alikes", () => {
    for (const raw of [
      "http://github.com/login/oauth/authorize",
      "https://github.com.evil.test/login/oauth/authorize",
      "https://gist.github.com/login/oauth/authorize",
      "https://github.com/login/oauth/authorize/x",
      "https://u:p@github.com/login/oauth/authorize",
      "https://accounts.google.com/o/oauth2/auth",
      "https://evil.test/o/oauth2/v2/auth",
    ]) {
      expect(authorizeProvider(new URL(raw)), raw).toBeNull();
    }
  });
});
