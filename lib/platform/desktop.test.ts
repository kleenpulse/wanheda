import { afterEach, describe, expect, test, vi } from "vitest";
import { acceleratorFromKey, acceleratorKeys, desktopBridge, desktopFileUrl, desktopNotice, isAppPath, isDesktop, isDesktopCommand } from "./desktop";

describe("desktopBridge", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("null on the server and on the web", () => {
    expect(desktopBridge()).toBeNull();
    vi.stubGlobal("window", {});
    expect(isDesktop()).toBe(false);
  });

  test("only a bridge that says it is the desktop's", () => {
    vi.stubGlobal("window", { wanheda: { desktop: "yes" } });
    expect(isDesktop()).toBe(false);
    const bridge = { desktop: true, onOpen: () => () => {} };
    vi.stubGlobal("window", { wanheda: bridge });
    expect(desktopBridge()).toBe(bridge);
  });
});

describe("isAppPath", () => {
  test("same-app paths only", () => {
    expect(isAppPath("/media?tab=music")).toBe(true);
    for (const path of ["//evil.test", "/\\evil.test", "https://evil.test", "/\t/evil.test", "media"]) expect(isAppPath(path), path).toBe(false);
  });
});

describe("desktopNotice", () => {
  test("a centre row as a system notice; a path only when it's this app's", () => {
    expect(desktopNotice({ kind: "money", title: "Budget at 80 %", body: "Groceries", href: "/money/budgets" })).toEqual({ kind: "money", title: "Budget at 80 %", body: "Groceries", path: "/money/budgets" });
    expect(desktopNotice({ kind: "timer", title: "Timer done", body: null, href: null })).toEqual({ kind: "timer", title: "Timer done", body: "", path: null });
    expect(desktopNotice({ kind: "income", title: "New customer", body: "x", href: "https://evil.test" })?.path).toBeNull();
  });

  test("long text is clipped to the shell's limits; a blank title is no notice", () => {
    const n = desktopNotice({ kind: "money", title: "t".repeat(500), body: "b".repeat(500), href: null });
    expect(n?.title.length).toBe(120);
    expect(n?.body.length).toBe(300);
    expect(n?.title.endsWith("…")).toBe(true);
    expect(desktopNotice({ kind: "money", title: "  ", body: null, href: null })).toBeNull();
  });
});

describe("acceleratorFromKey", () => {
  const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

  test("physical keys, modifiers in the shell's order", () => {
    expect(acceleratorFromKey(key("Space", { shiftKey: true, ctrlKey: true }))).toBe("Ctrl+Shift+Space");
    expect(acceleratorFromKey(key("KeyN", { altKey: true, ctrlKey: true }))).toBe("Ctrl+Alt+N");
    expect(acceleratorFromKey(key("Digit3", { metaKey: true }))).toBe("Super+3");
    expect(acceleratorFromKey(key("F13", { altKey: true }))).toBe("Alt+F13");
    expect(acceleratorFromKey(key("Slash", { ctrlKey: true }))).toBe("Ctrl+/");
    expect(acceleratorFromKey(key("ArrowUp", { altKey: true }))).toBe("Alt+Up");
  });

  test("not yet, or never, an accelerator", () => {
    expect(acceleratorFromKey(key("ControlLeft", { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromKey(key("KeyA", { shiftKey: true }))).toBeNull();
    expect(acceleratorFromKey(key("KeyA"))).toBeNull();
    expect(acceleratorFromKey(key("Escape", { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromKey(key("F25", { ctrlKey: true }))).toBeNull();
  });

  test("keys for display", () => {
    expect(acceleratorKeys("Ctrl+Shift+Space")).toEqual(["Ctrl", "Shift", "Space"]);
    expect(acceleratorKeys("Super+Plus")).toEqual(["Win", "+"]);
  });
});

describe("isDesktopCommand", () => {
  test("the three kinds, well formed only", () => {
    expect(isDesktopCommand({ kind: "palette" })).toBe(true);
    expect(isDesktopCommand({ kind: "media", action: "next" })).toBe(true);
    expect(isDesktopCommand({ kind: "capture", text: "milk" })).toBe(true);
    expect(isDesktopCommand({ kind: "island", command: { kind: "music", action: "next" } })).toBe(true);
    expect(isDesktopCommand({ kind: "island", command: { kind: "dismiss", noticeId: "n1" } })).toBe(true);
    expect(isDesktopCommand({ kind: "island", command: { kind: "open", path: "/" } })).toBe(false);
    expect(isDesktopCommand({ kind: "island", command: { kind: "speech", action: "next" } })).toBe(false);
    for (const bad of [null, "palette", { kind: "media", action: "eject" }, { kind: "capture", text: " " }, { kind: "capture" }, { kind: "quit" }]) {
      expect(isDesktopCommand(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("desktopFileUrl", () => {
  test("encodes each segment like the shell's fileUrl", () => {
    expect(desktopFileUrl("0123456789abcdef0123456789abcdef", "Album/AC#DC 100%/01?.mp3")).toBe("wanheda-file://0123456789abcdef0123456789abcdef/Album/AC%23DC%20100%25/01%3F.mp3");
  });
});
