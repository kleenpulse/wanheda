import { describe, expect, test } from "vitest";
import { MAX_VALUE, openPath, trustedSender } from "./bridge";

describe("openPath", () => {
  test("takes allowlisted pages and their keys", () => {
    expect(openPath("/")).toBe("/");
    expect(openPath("/money/budgets")).toBe("/money/budgets");
    expect(openPath("/media?tab=music")).toBe("/media?tab=music");
    expect(openPath("/notes?n=abc&view=edit")).toBe("/notes?n=abc&view=edit");
    expect(openPath("/settings?s=appearance")).toBe("/settings?s=appearance");
  });

  test("drops other pages, keys and repeated keys", () => {
    expect(openPath("/api/auth/sign-out")).toBeNull();
    expect(openPath("/login")).toBeNull();
    expect(openPath("/money?next=/x")).toBeNull();
    expect(openPath("/media?tab=a&tab=b")).toBeNull();
    expect(openPath("/media/")).toBeNull();
  });

  test("drops anything that leaves the app or that the URL parser would tidy", () => {
    for (const path of ["//evil.test/", "/\evil.test", "https://evil.test/", "/money/../api/x", "/%2e%2e/api", "/money#x", "/\t/evil.test", "money", ""]) {
      expect(openPath(path), path).toBeNull();
    }
  });

  test("caps each value", () => {
    expect(openPath(`/notes?n=${"a".repeat(MAX_VALUE)}`)).not.toBeNull();
    expect(openPath(`/notes?n=${"a".repeat(MAX_VALUE + 1)}`)).toBeNull();
  });
});

describe("trustedSender", () => {
  const app = "http://localhost:4123";
  test("only the app's own top frame", () => {
    expect(trustedSender({ origin: app, isTop: true }, app)).toBe(true);
    expect(trustedSender({ origin: app, isTop: false }, app)).toBe(false);
    expect(trustedSender({ origin: "https://www.youtube-nocookie.com", isTop: true }, app)).toBe(false);
    expect(trustedSender({ origin: "http://127.0.0.1:4123", isTop: true }, app)).toBe(false);
    expect(trustedSender(null, app)).toBe(false);
    expect(trustedSender({ origin: app, isTop: true }, null)).toBe(false);
  });
});
