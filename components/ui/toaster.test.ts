import { describe, expect, it, vi } from "vitest";
import { dismissToast, toast } from "./toaster";

// Undoable actions commit in onExpire and cancel in onClose, so each must run
// exactly once for its own exits and never for the others (user 2026-11-05:
// Undo and × both cancel a delete; only running out commits it).

const hooks = () => ({ onExpire: vi.fn(), onClose: vi.fn() });

describe("toast exits", () => {
  it("× runs onClose once, never onExpire", () => {
    const h = hooks();
    toast({ id: "a", title: "A", ...h });
    dismissToast("a", "close");
    dismissToast("a", "close");
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(h.onExpire).not.toHaveBeenCalled();
  });

  it("timing out runs onExpire once, never onClose", () => {
    const h = hooks();
    toast({ id: "b", title: "B", ...h });
    dismissToast("b", "expire");
    dismissToast("b", "expire");
    expect(h.onExpire).toHaveBeenCalledTimes(1);
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it("using the action runs neither", () => {
    const h = hooks();
    toast({ id: "c", title: "C", action: { label: "Undo", onClick: () => undefined }, ...h });
    dismissToast("c", "action");
    expect(h.onExpire).not.toHaveBeenCalled();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it("a toast replaced by one with the same id expires", () => {
    const first = hooks();
    const second = hooks();
    toast({ id: "d", title: "D", ...first });
    toast({ id: "d", title: "D again", ...second });
    expect(first.onExpire).toHaveBeenCalledTimes(1);
    expect(second.onExpire).not.toHaveBeenCalled();
    dismissToast("d", "close");
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });

  it("toasts pushed out by newer ones expire", () => {
    const oldest = hooks();
    toast({ id: "e1", title: "1", ...oldest });
    toast({ id: "e2", title: "2" });
    toast({ id: "e3", title: "3" });
    expect(oldest.onExpire).not.toHaveBeenCalled();
    toast({ id: "e4", title: "4" });
    expect(oldest.onExpire).toHaveBeenCalledTimes(1);
    expect(oldest.onClose).not.toHaveBeenCalled();
    for (const id of ["e2", "e3", "e4"]) dismissToast(id);
  });
});
