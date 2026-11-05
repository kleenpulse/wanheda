import { describe, expect, it, vi } from "vitest";
import { dismissToast, toast } from "./toaster";

// Undoable actions commit in onDismiss, so it must run exactly once for every
// way a toast leaves, and never when its action (Undo) was used.

describe("toast onDismiss", () => {
  it("runs once on close, never twice", () => {
    const onDismiss = vi.fn();
    toast({ id: "a", title: "A", onDismiss });
    dismissToast("a");
    dismissToast("a");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not run when the action was used", () => {
    const onDismiss = vi.fn();
    toast({ id: "b", title: "B", action: { label: "Undo", onClick: () => undefined }, onDismiss });
    dismissToast("b", true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("runs for a toast replaced by one with the same id", () => {
    const first = vi.fn();
    const second = vi.fn();
    toast({ id: "c", title: "C", onDismiss: first });
    toast({ id: "c", title: "C again", onDismiss: second });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    dismissToast("c");
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("runs for toasts pushed out by newer ones", () => {
    const oldest = vi.fn();
    toast({ id: "d1", title: "1", onDismiss: oldest });
    toast({ id: "d2", title: "2" });
    toast({ id: "d3", title: "3" });
    expect(oldest).not.toHaveBeenCalled();
    toast({ id: "d4", title: "4" });
    expect(oldest).toHaveBeenCalledTimes(1);
    for (const id of ["d2", "d3", "d4"]) dismissToast(id);
  });
});
