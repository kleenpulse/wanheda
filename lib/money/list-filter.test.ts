import { describe, expect, it } from "vitest";
import { filterParam, parseFilter } from "./list-filter";

describe("entries filter param", () => {
  it("round-trips every kind, including the none rows", () => {
    for (const f of [
      { by: "category", key: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10" },
      { by: "category", key: "" },
      { by: "account", key: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11" },
      { by: "payee", key: "mama put: jollof" },
      { by: "payee", key: "" },
    ] as const) {
      expect(parseFilter(filterParam(f))).toEqual(f);
    }
  });

  it("names nothing for a missing, unknown or malformed value", () => {
    expect(parseFilter(null)).toBeNull();
    expect(parseFilter("")).toBeNull();
    expect(parseFilter("category")).toBeNull();
    expect(parseFilter("tag:food")).toBeNull();
    expect(parseFilter("account:")).toBeNull();
  });
});
