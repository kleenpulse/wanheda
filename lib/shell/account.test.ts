import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNT, accountMode, avatarUrl, initials } from "./account";

describe("initials", () => {
  it.each([
    ["Isaac Gideon", "IG"],
    ["isaac michael gideon", "IG"],
    ["octocat", "O"],
    ["Shadow (Operator)", "SO"],
    ["  ", "?"],
    ["", "?"],
    ["Émile Zola", "ÉZ"],
  ])("%j → %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("accountMode", () => {
  it("names the demo as seed data", () => {
    expect(accountMode(DEMO_ACCOUNT)).toBe("Demo · seed data");
    expect(accountMode({ kind: "owner", id: "u1", name: "A", email: "a@example.com", image: null, admin: false })).toBe("Signed in");
    expect(accountMode({ kind: "owner", id: "u1", name: "A", email: "a@example.com", image: null, admin: true })).toBe("Admin");
  });
});

describe("avatarUrl", () => {
  it("keeps an https photo", () => {
    const url = "https://lh3.googleusercontent.com/a/abc=s96-c";
    expect(avatarUrl(url)).toBe(url);
  });

  it.each([null, undefined, "", "http://example.com/a.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "not a url"])(
    "drops %j",
    (image) => {
      expect(avatarUrl(image)).toBeNull();
    },
  );
});
