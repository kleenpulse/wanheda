import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { isAllowedOwner, parseOwnerEmails } from "./allowlist";
import { assertOwnerSignup } from "./signup-guard";

const OWNERS = parseOwnerEmails("owner@example.com, Second@Example.com");

describe("parseOwnerEmails", () => {
  it("trims, lower-cases and drops blanks", () => {
    expect([...parseOwnerEmails(" A@x.com,, b@X.com ,")]).toEqual(["a@x.com", "b@x.com"]);
  });

  it("is empty for undefined or blank input", () => {
    expect(parseOwnerEmails(undefined).size).toBe(0);
    expect(parseOwnerEmails(" , ").size).toBe(0);
  });
});

describe("isAllowedOwner", () => {
  it("matches case-insensitively", () => {
    expect(isAllowedOwner("SECOND@example.COM", OWNERS)).toBe(true);
  });

  it("refuses missing emails and empty allowlists", () => {
    expect(isAllowedOwner(null, OWNERS)).toBe(false);
    expect(isAllowedOwner("", OWNERS)).toBe(false);
    expect(isAllowedOwner("owner@example.com", new Set())).toBe(false);
  });
});

describe("assertOwnerSignup", () => {
  const signUp = (email: string, emailVerified: boolean, owners = OWNERS) => () => {
    assertOwnerSignup({ email, emailVerified }, owners);
  };

  it("allows a verified owner email", () => {
    expect(signUp("owner@example.com", true)).not.toThrow();
  });

  it("allows the owner whatever the case", () => {
    expect(signUp("OWNER@example.com", true)).not.toThrow();
  });

  it("refuses an email not on the allowlist with FORBIDDEN", () => {
    let thrown: unknown;
    try {
      assertOwnerSignup({ email: "someone@example.com", emailVerified: true }, OWNERS);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(APIError);
    expect((thrown as APIError).status).toBe("FORBIDDEN");
  });

  it("refuses the owner's email when it is not verified", () => {
    expect(signUp("owner@example.com", false)).toThrow(APIError);
  });

  it("refuses everyone when the allowlist is empty", () => {
    expect(signUp("owner@example.com", true, parseOwnerEmails(""))).toThrow(APIError);
  });
});
