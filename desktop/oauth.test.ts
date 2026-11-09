import { describe, expect, test } from "vitest";
import { browserReturn, CALLBACK_PATH, callbackQuery, RETURNED_PATH, SIGN_IN_TTL_MS, signInFrom } from "./oauth";

const app = "http://localhost:4123";
const state = "aB3_dE-f.ghIjKlMnOpQr";

function authorize(params: Record<string, string>): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.href;
}

const good = authorize({ client_id: "c", redirect_uri: `${app}${CALLBACK_PATH}`, state, scope: "read:user user:email" });

describe("signInFrom", () => {
  test("a GitHub authorize URL that comes back to this app", () => {
    expect(signInFrom(good, app, 1000)).toEqual({ state, expiresAt: 1000 + SIGN_IN_TTL_MS });
  });

  test("anything else starts nothing", () => {
    for (const url of [
      authorize({ redirect_uri: `http://localhost:9999${CALLBACK_PATH}`, state }),
      authorize({ redirect_uri: `${app}/elsewhere`, state }),
      authorize({ redirect_uri: `${app}${CALLBACK_PATH}` }),
      authorize({ redirect_uri: `${app}${CALLBACK_PATH}`, state: "short" }),
      authorize({ redirect_uri: `${app}${CALLBACK_PATH}`, state: "has spaces in it, not a nonce" }),
      good.replace("https://github.com", "https://github.com.evil.test"),
      good.replace("https:", "http:"),
      good.replace("/login/oauth/authorize", "/login"),
      "not a url",
    ]) {
      expect(signInFrom(url, app, 0), url).toBeNull();
    }
    expect(signInFrom(good, null, 0)).toBeNull();
  });
});

describe("callbackQuery", () => {
  const pending = { state, expiresAt: 10_000 };

  test("the answer to the pending sign-in, rebuilt from known parameters", () => {
    expect(callbackQuery(`?code=abc&state=${state}`, pending, 0)).toBe(`code=abc&state=${state}`);
    expect(callbackQuery(`?code=abc&state=${state}&extra=1`, pending, 0)).toBe(`code=abc&state=${state}`);
    // A refusal on GitHub still goes to Better Auth, which sends the window back to the login page.
    expect(callbackQuery(`?error=access_denied&error_description=The+user+said+no&state=${state}`, pending, 0)).toBe(
      `state=${state}&error=access_denied&error_description=The+user+said+no`,
    );
  });

  test("everything else is ignored", () => {
    for (const search of [
      `?code=abc&state=${state}x`,
      "?code=abc",
      `?state=${state}`,
      `?code=abc&error=x&state=${state}`,
      `?code=abc&code=def&state=${state}`,
      `?code=&state=${state}`,
      `?code=${"a".repeat(1025)}&state=${state}`,
    ]) {
      expect(callbackQuery(search, pending, 0), search).toBeNull();
    }
    expect(callbackQuery(`?code=abc&state=${state}`, null, 0)).toBeNull();
    expect(callbackQuery(`?code=abc&state=${state}`, pending, 10_001)).toBeNull();
  });
});

describe("browserReturn", () => {
  const host = "localhost:4123";

  test("GitHub's redirect and the page after it, without the token", () => {
    expect(browserReturn("GET", `${CALLBACK_PATH}?code=a&state=b`, host, 4123, false)).toEqual({ kind: "callback", search: "?code=a&state=b" });
    expect(browserReturn("GET", RETURNED_PATH, host, 4123, false)).toEqual({ kind: "returned" });
  });

  test("everything else goes to the token guard", () => {
    expect(browserReturn("GET", `${CALLBACK_PATH}?code=a`, host, 4123, true)).toBeNull();
    expect(browserReturn("POST", CALLBACK_PATH, host, 4123, false)).toBeNull();
    expect(browserReturn("GET", CALLBACK_PATH, "127.0.0.1:4123", 4123, false)).toBeNull();
    expect(browserReturn("GET", CALLBACK_PATH, "evil.test", 4123, false)).toBeNull();
    expect(browserReturn("GET", CALLBACK_PATH, "localhost:4124", 4123, false)).toBeNull();
    expect(browserReturn("GET", "/api/auth/callback/google?code=a", host, 4123, false)).toBeNull();
    expect(browserReturn("GET", `${CALLBACK_PATH}/x`, host, 4123, false)).toBeNull();
    expect(browserReturn("GET", `${RETURNED_PATH}?x=1`, host, 4123, false)).toBeNull();
    expect(browserReturn("GET", "/", host, 4123, false)).toBeNull();
    expect(browserReturn("GET", undefined, host, 4123, false)).toBeNull();
  });
});
