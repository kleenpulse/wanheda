import { afterEach, describe, expect, it } from "vitest";
import { deviceScope, scopedName, scopeFor, setDeviceScope } from "./scope";

afterEach(() => {
  setDeviceScope(null);
});

describe("scopeFor", () => {
  it("names two users' stores apart, and demo apart from both", () => {
    const a = scopedName("wanheda-notes", scopeFor({ kind: "owner", id: "A", admin: false }));
    const b = scopedName("wanheda-notes", scopeFor({ kind: "owner", id: "B", admin: false }));
    const demo = scopedName("wanheda-notes", scopeFor({ kind: "demo", id: null, admin: false }));
    expect(new Set([a, b, demo]).size).toBe(3);
    expect(a).toBe("wanheda-notes@u.A");
    expect(demo).toBe("wanheda-notes@demo");
  });

  it("never reuses the old unscoped name", () => {
    expect(scopedName("wanheda-money", scopeFor({ kind: "owner", id: "A", admin: true }))).not.toBe("wanheda-money");
  });

  it("lets only an admin adopt the old stores", () => {
    expect(scopeFor({ kind: "owner", id: "A", admin: true }).adoptsLegacy).toBe(true);
    expect(scopeFor({ kind: "owner", id: "B", admin: false }).adoptsLegacy).toBe(false);
    expect(scopeFor({ kind: "demo", id: null, admin: true }).adoptsLegacy).toBe(false);
  });

  it("treats an owner without an id as demo, never as a shared name", () => {
    expect(scopeFor({ kind: "owner", id: null, admin: true })).toEqual({ id: "demo", userId: null, adoptsLegacy: false });
  });
});

describe("deviceScope", () => {
  it("is null until the shell sets it", () => {
    expect(deviceScope()).toBeNull();
    setDeviceScope(scopeFor({ kind: "owner", id: "A", admin: false }));
    expect(deviceScope()?.id).toBe("u.A");
  });
});
