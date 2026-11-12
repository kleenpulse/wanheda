import { describe, expect, it } from "vitest";
import * as web from "../lib/auth/desktop-link";
import { acceptHandoff, authLink, HANDOFF_TTL_MS, newHandoff, REDEEM_HEADER, REDEEM_PATH, redeemUrl, SIGN_IN_PAGE, signInPageUrl } from "./handoff";
import { linkPath } from "./links";

const T = "t".repeat(40) + "-_9";
const N = "N".repeat(43);
const app = "https://wanheda.example.test";

describe("newHandoff", () => {
  it("makes a 43-character nonce that the server takes, for 10 minutes", () => {
    const pending = newHandoff(1000);
    expect(web.isHandoffValue(pending.nonce)).toBe(true);
    expect(pending.expiresAt).toBe(1000 + HANDOFF_TTL_MS);
    expect(newHandoff(0).nonce).not.toBe(pending.nonce);
  });
});

describe("authLink", () => {
  it("reads the link the server hands back", () => {
    expect(authLink(web.appLink(T, N))).toEqual({ token: T, nonce: N });
    expect(authLink(`wanheda://auth/?nonce=${N}&token=${T}`)).toEqual({ token: T, nonce: N });
    expect(authLink(`WANHEDA://AUTH?token=${T}&nonce=${N}`)).toEqual({ token: T, nonce: N });
  });

  it("drops anything else", () => {
    for (const link of [
      `wanheda://auth?token=${T}`,
      `wanheda://auth?nonce=${N}`,
      `wanheda://auth?token=${T}&nonce=${N}&next=/`,
      `wanheda://auth?token=${T}&token=${T}&nonce=${N}`,
      `wanheda://auth?token=${T}x&nonce=${N}`,
      `wanheda://auth?token=${T.slice(1)}&nonce=${N}`,
      `wanheda://auth?token=${T.slice(1)}%21&nonce=${N}`,
      `wanheda://auth?token=${T}&nonce=${N}#x`,
      `wanheda://auth/x?token=${T}&nonce=${N}`,
      `wanheda://open/notes?token=${T}&nonce=${N}`,
      `wanheda://evil.test/auth?token=${T}&nonce=${N}`,
      `https://wanheda.example.test/auth?token=${T}&nonce=${N}`,
      `wanheda://auth?token=${T}&nonce=${N}&${"x".repeat(2048)}`,
    ]) {
      expect(authLink(link), link).toBeNull();
    }
  });

  it("is never a page link", () => {
    expect(linkPath(web.appLink(T, N))).toBeNull();
  });
});

describe("acceptHandoff", () => {
  const pending = { nonce: N, expiresAt: 5000 };

  it("takes the nonce main made, in time", () => {
    expect(acceptHandoff({ token: T, nonce: N }, pending, 5000)).toBe(true);
  });

  it("refuses another nonce, a late answer, or no sign-in under way", () => {
    expect(acceptHandoff({ token: T, nonce: "M".repeat(43) }, pending, 0)).toBe(false);
    expect(acceptHandoff({ token: T, nonce: N }, pending, 5001)).toBe(false);
    expect(acceptHandoff({ token: T, nonce: N }, null, 0)).toBe(false);
  });
});

describe("the web side's shapes", () => {
  it("match", () => {
    expect(REDEEM_HEADER).toBe(web.REDEEM_HEADER);
    expect(REDEEM_PATH).toBe(web.REDEEM_PATH);
    expect(SIGN_IN_PAGE).toBe(web.SIGN_IN_PAGE);
    expect(signInPageUrl(app, N)).toBe(`${app}${web.signInPagePath(N)}`);
    expect(new URL(redeemUrl(app, T)).searchParams.get("token")).toBe(T);
  });
});
