import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut } }));

const { signOutOk } = await import("./account-actions");

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
