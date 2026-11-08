import { describe, expect, test } from "vitest";
import { TOKEN_HEADER } from "../shared";
import { checkRequest } from "./guard";

const token = "k".repeat(43);

describe("checkRequest", () => {
  test("exact Host and the token pass", () => {
    expect(checkRequest({ host: "localhost:4123", [TOKEN_HEADER]: token }, 4123, token)).toEqual({ ok: true });
  });

  test("any other Host is refused, the other loopback spelling included", () => {
    for (const host of ["127.0.0.1:4123", "localhost", "localhost:4124", "evil.test", "LOCALHOST:4123", "[::1]:4123", undefined]) {
      expect(checkRequest({ host, [TOKEN_HEADER]: token }, 4123, token), String(host)).toEqual({ ok: false, reason: "host" });
    }
  });

  test("a missing, wrong, repeated or empty token is refused", () => {
    const host = "localhost:4123";
    expect(checkRequest({ host }, 4123, token)).toEqual({ ok: false, reason: "token" });
    expect(checkRequest({ host, [TOKEN_HEADER]: "x".repeat(43) }, 4123, token)).toEqual({ ok: false, reason: "token" });
    expect(checkRequest({ host, [TOKEN_HEADER]: token.slice(1) }, 4123, token)).toEqual({ ok: false, reason: "token" });
    expect(checkRequest({ host, [TOKEN_HEADER]: [token, token] }, 4123, token)).toEqual({ ok: false, reason: "token" });
    expect(checkRequest({ host, [TOKEN_HEADER]: "" }, 4123, "")).toEqual({ ok: false, reason: "token" });
  });
});
