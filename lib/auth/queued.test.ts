import { describe, expect, it } from "vitest";
import { queuedForAnother } from "./queued";

const owner = { kind: "owner" as const, user: { id: "user-1" } };

describe("queuedForAnother", () => {
  it("is true only when a queued write names a different account", () => {
    expect(queuedForAnother(owner, "user-2")).toBe(true);
    expect(queuedForAnother(owner, "user-1")).toBe(false);
  });

  it("lets live writes and demo through: no account named, nothing to compare", () => {
    expect(queuedForAnother(owner, undefined)).toBe(false);
    expect(queuedForAnother({ kind: "demo" }, "user-2")).toBe(false);
  });

  it("ignores a non-string sent by a tampered client", () => {
    expect(queuedForAnother(owner, { id: "user-2" })).toBe(false);
  });
});
