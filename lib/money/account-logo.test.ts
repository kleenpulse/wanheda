import { describe, expect, it } from "vitest";
import { accountLogo } from "./account-logo";

describe("accountLogo", () => {
  it.each(["OPAY", "OPay", "opay", "O-Pay", "O Pay", "OPay wallet", "My OPay", "Savings (OPay)"])("knows %s", (name) => {
    expect(accountLogo(name)).toBe("/opay-logo.jpg");
  });

  it.each(["Opayo", "Topay", "GTBank", "Cash", ""])("leaves %s to its kind icon", (name) => {
    expect(accountLogo(name)).toBeNull();
  });
});
