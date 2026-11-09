import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNT, accountMode, initials } from "./account";

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
    expect(accountMode({ kind: "owner", id: "u1", name: "A", email: "a@example.com", admin: false })).toBe("Signed in");
    expect(accountMode({ kind: "owner", id: "u1", name: "A", email: "a@example.com", admin: true })).toBe("Admin");
  });
});
