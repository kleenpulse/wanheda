import { afterEach, describe, expect, test, vi } from "vitest";
import { desktopBridge, isAppPath, isDesktop } from "./desktop";

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
