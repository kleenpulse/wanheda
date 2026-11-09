import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { isListed, parseEmailList } from "./allowlist";
import { assertVerifiedSignup } from "./signup-guard";

const ADMINS = parseEmailList("admin@example.com, Second@Example.com");

describe("parseEmailList", () => {
  it("trims, lower-cases and drops blanks", () => {
    expect([...parseEmailList(" A@x.com,, b@X.com ,")]).toEqual(["a@x.com", "b@x.com"]);
  });

  it("is empty for undefined or blank input", () => {
    expect(parseEmailList(undefined).size).toBe(0);
    expect(parseEmailList(" , ").size).toBe(0);
  });
});

describe("isListed", () => {
  it("matches case-insensitively", () => {
    expect(isListed("SECOND@example.COM", ADMINS)).toBe(true);
  });

  it("refuses missing emails and empty lists", () => {
    expect(isListed(null, ADMINS)).toBe(false);
    expect(isListed("", ADMINS)).toBe(false);
    expect(isListed("admin@example.com", new Set())).toBe(false);
  });
});

describe("assertVerifiedSignup", () => {
  const signUp = (email: string, emailVerified: boolean) => () => {
    assertVerifiedSignup({ email, emailVerified });
  };

  it("lets anyone with a verified email sign up", () => {
    expect(signUp("someone@example.com", true)).not.toThrow();
    expect(signUp("admin@example.com", true)).not.toThrow();
  });

  it("refuses an unverified email with FORBIDDEN", () => {
    let thrown: unknown;
    try {
      assertVerifiedSignup({ email: "someone@example.com", emailVerified: false });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(APIError);
    expect((thrown as APIError).status).toBe("FORBIDDEN");
  });

  it("refuses a blank email", () => {
    expect(signUp("  ", true)).toThrow(APIError);
  });
});
