import { describe, expect, it } from "vitest";
import { formatMoney } from "./currency";
import { MASK, maskMoney, privacyBootScript } from "./privacy";

describe("maskMoney", () => {
  it("keeps sign and currency, hides every digit", () => {
    expect(maskMoney("-₦4,500.00")).toBe(`-₦${MASK}`);
    expect(maskMoney("$15.49")).toBe(`$${MASK}`);
    expect(maskMoney("¥1,500")).toBe(`¥${MASK}`);
    expect(maskMoney("1.2k")).toBe(`${MASK}k`);
    expect(maskMoney("₦1,000 – ₦2,000")).toBe(`₦${MASK} – ₦`);
    for (const minor of [0, 7, 123_456_789, -99]) expect(maskMoney(formatMoney({ minor, currency: "NGN" }))).not.toMatch(/\d/);
  });

  it("the boot script only reads its own key", () => {
    expect(privacyBootScript()).toContain('localStorage.getItem("wanheda-privacy")');
  });
});
