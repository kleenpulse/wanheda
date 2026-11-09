import { describe, expect, test } from "vitest";
import { classifyAuthUrl, classifyUrl, navigationStep, permissionAllowed } from "./policy";

const app = "http://localhost:4123";

describe("classifyUrl", () => {
  test("the app's own pages and blobs stay in the app", () => {
    expect(classifyUrl(`${app}/money`, app)).toEqual({ kind: "app" });
    expect(classifyUrl(`blob:${app}/0b5c`, app)).toEqual({ kind: "app" });
  });

  test("the other loopback spelling and other ports are not the app", () => {
    expect(classifyUrl("http://127.0.0.1:4123/", app).kind).toBe("external");
    expect(classifyUrl("http://localhost:4124/", app).kind).toBe("external");
  });

  test("http(s) goes to the system browser; other schemes are dropped", () => {
    expect(classifyUrl("https://example.com/a", app)).toEqual({ kind: "external", url: "https://example.com/a" });
    for (const url of ["mailto:a@b.c", "tel:123", "file:///C:/x", "javascript:alert(1)", "blob:https://evil.test/1", "wanheda://open", "not a url"]) {
      expect(classifyUrl(url, app), url).toEqual({ kind: "deny" });
    }
    expect(classifyUrl("https://user:pw@example.com/", app)).toEqual({ kind: "deny" });
  });

  test("GitHub's and Google's OAuth authorize pages start a sign-in", () => {
    const url = "https://github.com/login/oauth/authorize?client_id=x&state=y";
    expect(classifyUrl(url, app)).toEqual({ kind: "oauth-sign-in", provider: "github", url });
    const google = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y";
    expect(classifyUrl(google, app)).toEqual({ kind: "oauth-sign-in", provider: "google", url: google });
    expect(classifyUrl("https://accounts.google.com/ServiceLogin", app).kind).toBe("external");
    expect(classifyUrl("https://u:p@accounts.google.com/o/oauth2/v2/auth", app)).toEqual({ kind: "deny" });
    expect(classifyUrl("http://github.com/login/oauth/authorize", app).kind).toBe("external");
    expect(classifyUrl("https://github.com/settings", app).kind).toBe("external");
  });

  test("with no server yet, nothing is the app", () => {
    expect(classifyUrl(`${app}/`, null).kind).toBe("external");
  });
});

describe("classifyAuthUrl", () => {
  test("GitHub's sign-in pages stay in the auth window", () => {
    for (const path of ["/login", "/login/oauth/authorize?x=1", "/session", "/sessions/two-factor/app", "/sessions/verified-device"]) {
      expect(classifyAuthUrl(`https://github.com${path}`, app), path).toEqual({ kind: "github" });
    }
  });

  test("reaching the app ends the sign-in", () => {
    const url = `${app}/api/auth/callback/github?code=c&state=s`;
    expect(classifyAuthUrl(url, app)).toEqual({ kind: "app", url });
  });

  test("other pages go out; odd schemes and lookalikes don't stay", () => {
    expect(classifyAuthUrl("https://github.com/password_reset", app).kind).toBe("external");
    expect(classifyAuthUrl("https://github.com/signup", app).kind).toBe("external");
    expect(classifyAuthUrl("https://github.com.evil.test/login", app).kind).toBe("external");
    expect(classifyAuthUrl("http://github.com/login", app).kind).toBe("external");
    expect(classifyAuthUrl("https://gist.github.com/login", app).kind).toBe("external");
    expect(classifyAuthUrl("javascript:alert(1)", app)).toEqual({ kind: "deny" });
    expect(classifyAuthUrl("https://u:p@github.com/login", app)).toEqual({ kind: "deny" });
    expect(classifyAuthUrl("http://127.0.0.1:4123/api/auth/callback/github", app).kind).toBe("external");
  });
});

describe("navigationStep", () => {
  const main = { isMainFrame: true, isAuth: false };

  test("a subframe redirect never reaches the system browser", () => {
    expect(navigationStep({ url: "https://ads.example/x", isMainFrame: false, isAuth: false }, app)).toEqual({ kind: "allow" });
    expect(navigationStep({ url: "https://ads.example/x", isMainFrame: false, isAuth: true }, app)).toEqual({ kind: "allow" });
  });

  test("the main frame: app stays, http(s) goes out, sign-in opens the auth window", () => {
    expect(navigationStep({ url: `${app}/money`, ...main }, app)).toEqual({ kind: "allow" });
    expect(navigationStep({ url: "https://ads.example/x", ...main }, app)).toEqual({ kind: "external", url: "https://ads.example/x" });
    const signIn = "https://github.com/login/oauth/authorize?client_id=x";
    expect(navigationStep({ url: signIn, ...main }, app)).toEqual({ kind: "oauth-sign-in", provider: "github", url: signIn });
    expect(navigationStep({ url: "file:///C:/x", ...main }, app)).toEqual({ kind: "block" });
  });

  test("the main frame never becomes a blob: document, even the app's own", () => {
    expect(navigationStep({ url: `blob:${app}/0b5c`, ...main }, app)).toEqual({ kind: "block" });
    expect(navigationStep({ url: `BLOB:${app}/0b5c`, ...main }, app)).toEqual({ kind: "block" });
  });

  test("the auth window: GitHub and the app stay, other pages go out", () => {
    const auth = { isMainFrame: true, isAuth: true };
    expect(navigationStep({ url: "https://github.com/sessions/two-factor", ...auth }, app)).toEqual({ kind: "allow" });
    expect(navigationStep({ url: `${app}/api/auth/callback/github?code=c`, ...auth }, app)).toEqual({ kind: "allow" });
    expect(navigationStep({ url: "https://github.com/signup", ...auth }, app)).toEqual({ kind: "external", url: "https://github.com/signup" });
    expect(navigationStep({ url: "javascript:alert(1)", ...auth }, app)).toEqual({ kind: "block" });
  });
});

describe("permissionAllowed", () => {
  const embed = "https://www.youtube-nocookie.com/embed/abc";

  test("an embed's own fullscreen button works on an app page", () => {
    expect(permissionAllowed("fullscreen", embed, `${app}/media`, app)).toBe(true);
    expect(permissionAllowed("fullscreen", `${app}/media`, `${app}/media`, app)).toBe(true);
  });

  test("other permissions are judged by the frame asking", () => {
    expect(permissionAllowed("clipboard-sanitized-write", embed, `${app}/media`, app)).toBe(false);
    expect(permissionAllowed("clipboard-sanitized-write", `${app}/notes`, `${app}/notes`, app)).toBe(true);
  });

  test("never off the app, never a blob: page, never an unlisted permission", () => {
    expect(permissionAllowed("fullscreen", embed, "https://evil.test/", app)).toBe(false);
    expect(permissionAllowed("fullscreen", `blob:${app}/1`, `blob:${app}/1`, app)).toBe(false);
    expect(permissionAllowed("media", `${app}/`, `${app}/`, app)).toBe(false);
    expect(permissionAllowed("fullscreen", `${app}/`, `${app}/`, null)).toBe(false);
  });
});
