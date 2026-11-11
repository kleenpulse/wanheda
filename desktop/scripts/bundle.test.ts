import { describe, expect, test } from "vitest";
import { DEFAULT_APP_URL } from "../origin";
import { appUrl } from "./bundle";

describe("appUrl", () => {
  test("production unless WANHEDA_APP_URL names another https origin", () => {
    expect(appUrl({})).toBe(DEFAULT_APP_URL);
    expect(appUrl({ WANHEDA_APP_URL: "" })).toBe(DEFAULT_APP_URL);
    expect(appUrl({ WANHEDA_APP_URL: "https://wanheda-git-t88.vercel.app/" })).toBe("https://wanheda-git-t88.vercel.app");
  });

  test("anything but a bare https origin stops the build", () => {
    for (const raw of ["http://localhost:3000", "https://wanheda-chi.vercel.app/money", "https://u:p@wanheda-chi.vercel.app"]) {
      expect(() => appUrl({ WANHEDA_APP_URL: raw }), raw).toThrow(/bare https origin/);
    }
  });
});
