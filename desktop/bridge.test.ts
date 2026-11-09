import { describe, expect, test } from "vitest";
import { canTakeCommand, MAX_CAPTURE, MAX_NOTICE_BODY, MAX_NOTICE_TITLE, MAX_VALUE, openPath, parseAudible, parseCaptureText, parseDesktopChange, parseMenuAnchor, parseNotice, parseRootKind, parseSecretsAction, parseTitleBarColors, parseTtsInstall, needsLoad, trustedSender } from "./bridge";

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

describe("parseNotice", () => {
  const ok = { kind: "money", title: "Budget at 80 %", body: "Groceries", path: "/money/budgets" };

  test("a well-formed notice, trimmed", () => {
    expect(parseNotice(ok)).toEqual(ok);
    expect(parseNotice({ kind: "timer", title: " Timer done ", body: "Tea ", path: null })).toEqual({ kind: "timer", title: "Timer done", body: "Tea", path: null });
  });

  test("a path main may not open isn't followed; a path that isn't text drops the notice", () => {
    for (const path of ["/api/auth/sign-out", "https://evil.test/", "//evil.test", "/money?x=1"]) {
      expect(parseNotice({ ...ok, path })?.path, path).toBeNull();
    }
    expect(parseNotice({ ...ok, path: 5 })).toBeNull();
  });

  test("bad kinds, blank or long text, extra shapes", () => {
    expect(parseNotice({ ...ok, kind: "mail" })).toBeNull();
    expect(parseNotice({ ...ok, title: "  " })).toBeNull();
    expect(parseNotice({ ...ok, title: "x".repeat(MAX_NOTICE_TITLE + 1) })).toBeNull();
    expect(parseNotice({ ...ok, body: "x".repeat(MAX_NOTICE_BODY + 1) })).toBeNull();
    expect(parseNotice({ ...ok, body: null })).toBeNull();
    expect(parseNotice([ok])).toBeNull();
    expect(parseNotice(null)).toBeNull();
  });
});

describe("parseCaptureText", () => {
  test("keeps the text as typed; blank, long or not text is refused", () => {
    expect(parseCaptureText("  buy milk\n- eggs ")).toBe("  buy milk\n- eggs ");
    expect(parseCaptureText(" \n ")).toBeNull();
    expect(parseCaptureText("x".repeat(MAX_CAPTURE + 1))).toBeNull();
    expect(parseCaptureText(["x"])).toBeNull();
  });
});

describe("parseDesktopChange", () => {
  test("keep running", () => {
    expect(parseDesktopChange({ keepRunning: false })).toEqual({ keepRunning: false });
    expect(parseDesktopChange({ keepRunning: "no" })).toBeNull();
    expect(parseDesktopChange({ keepRunning: true, extra: 1 })).toBeNull();
    expect(parseDesktopChange({ island: false })).toEqual({ island: false });
    expect(parseDesktopChange({ island: 0 })).toBeNull();
  });

  test("a shortcut: a valid accelerator, written one way, or null to turn it off", () => {
    expect(parseDesktopChange({ shortcut: "capture", accelerator: "shift+ctrl+n" })).toEqual({ shortcut: "capture", accelerator: "Ctrl+Shift+N" });
    expect(parseDesktopChange({ shortcut: "palette", accelerator: null })).toEqual({ shortcut: "palette", accelerator: null });
    expect(parseDesktopChange({ shortcut: "palette", accelerator: "Shift+P" })).toBeNull();
    expect(parseDesktopChange({ shortcut: "quit", accelerator: "Ctrl+Q" })).toBeNull();
    expect(parseDesktopChange({ shortcut: "palette" })).toBeNull();
    expect(parseDesktopChange({ shortcut: "palette", accelerator: "Alt+P", keepRunning: true })).toBeNull();
  });
});

describe("small parsers", () => {
  test("audible and secrets actions", () => {
    expect(parseAudible(true)).toBe(true);
    expect(parseAudible("true")).toBeNull();
    expect(parseSecretsAction("import")).toBe("import");
    expect(parseSecretsAction("demo")).toBe("demo");
    expect(parseSecretsAction("delete")).toBeNull();
    expect(parseRootKind("music")).toBe("music");
    expect(parseRootKind("video")).toBe("video");
    expect(parseRootKind("docs")).toBeNull();
    const model = new Uint8Array([1, 2]);
    expect(parseTtsInstall({ voice: "v", model, config: "{}" })).toEqual({ voice: "v", model, config: "{}" });
    expect(parseTtsInstall({ voice: "v", model: model.buffer, config: "{}" })?.model).toEqual(model);
    expect(parseTtsInstall({ voice: "v", model: [1, 2], config: "{}" })).toBeNull();
    expect(parseTtsInstall({ voice: "v", model, config: "x".repeat(70_000) })).toBeNull();
  });
});

describe("needsLoad", () => {
  const app = "http://localhost:4123";
  test("only the window's own page on the app's origin counts as loaded", () => {
    expect(needsLoad(`${app}/capture`, app, "/capture")).toBe(false);
    expect(needsLoad(`${app}/island`, app, "/island")).toBe(false);
    expect(needsLoad(`${app}/login?next=%2Fcapture`, app, "/capture")).toBe(true);
    expect(needsLoad(`${app}/login?next=%2Fisland`, app, "/island")).toBe(true);
    expect(needsLoad(`${app}/island`, app, "/capture")).toBe(true);
    expect(needsLoad("http://localhost:4999/capture", app, "/capture")).toBe(true);
    expect(needsLoad("", app, "/island")).toBe(true);
    expect(needsLoad(`${app}/`, app, "/island")).toBe(true);
  });
});

describe("canTakeCommand", () => {
  test("an app page, loaded, with its listener up", () => {
    expect(canTakeCommand({ onApp: true, loading: false, ready: true })).toBe(true);
    expect(canTakeCommand({ onApp: true, loading: false, ready: false })).toBe(false);
    expect(canTakeCommand({ onApp: true, loading: true, ready: true })).toBe(false);
    expect(canTakeCommand({ onApp: false, loading: false, ready: true })).toBe(false);
  });
});

describe("parseTitleBarColors", () => {
  test("two #rrggbb colours, lower-cased", () => {
    expect(parseTitleBarColors({ color: "#050A0B", symbol: "#9aa3a5" })).toEqual({ color: "#050a0b", symbol: "#9aa3a5" });
  });

  test("anything else is dropped", () => {
    for (const bad of [null, "x", { color: "#050a0b" }, { color: "red", symbol: "#ffffff" }, { color: "#fff", symbol: "#ffffff" }, { color: "#05050505", symbol: "#ffffff" }, { color: "rgb(0,0,0)", symbol: "#ffffff" }]) {
      expect(parseTitleBarColors(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("parseMenuAnchor", () => {
  test("a point in the window, rounded", () => {
    expect(parseMenuAnchor({ x: 4.4, y: 32 })).toEqual({ x: 4, y: 32 });
  });

  test("anything else is dropped", () => {
    for (const bad of [null, { x: 1 }, { x: -1, y: 0 }, { x: 0, y: Number.NaN }, { x: 0, y: 1e9 }, { x: "1", y: 1 }]) {
      expect(parseMenuAnchor(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
