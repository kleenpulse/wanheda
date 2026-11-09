import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut } }));
const forgetAccountStores = vi.fn();
const announceAccount = vi.fn();
vi.mock("@/lib/device/dexie", () => ({ forgetAccountStores }));
vi.mock("@/lib/device/account-channel", () => ({ announceAccount }));

const { leaveAfterDelete, signOutOk } = await import("./account-actions");
const { scopeFor, setDeviceScope } = await import("@/lib/device/scope");

describe("signOutOk", () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it("is true when the session ends", async () => {
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    expect(await signOutOk()).toBe(true);
  });

  it("is false on an error response, so the button does not stay stuck", async () => {
    signOut.mockResolvedValue({ data: null, error: { status: 500, message: "boom" } });
    expect(await signOutOk()).toBe(false);
  });

  it("is false when the request throws (network down)", async () => {
    signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await signOutOk()).toBe(false);
  });
});

describe("leaveAfterDelete", () => {
  const replace = vi.fn();
  const removeItem = vi.fn();

  beforeEach(() => {
    forgetAccountStores.mockReset();
    announceAccount.mockReset();
    replace.mockReset();
    removeItem.mockReset();
    vi.stubGlobal("window", { location: { replace } });
    vi.stubGlobal("localStorage", { removeItem });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setDeviceScope(null);
  });

  // The announcement reloads this tab too (its own AccountProvider hears it),
  // so announcing first would cut the store deletes short.
  it("deletes the account's stores before it tells any tab, then leaves for the notice", async () => {
    const scope = scopeFor({ kind: "owner", id: "A", admin: false });
    setDeviceScope(scope);
    let finish: () => void = () => undefined;
    forgetAccountStores.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const leaving = leaveAfterDelete();
    await Promise.resolve();
    expect(forgetAccountStores).toHaveBeenCalledWith(scope);
    expect(announceAccount).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    finish();
    await leaving;
    expect(announceAccount).toHaveBeenCalledWith(null);
    expect(removeItem).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledWith("/login?deleted=1");
  });
});
