import { describe, expect, test } from "vitest";
import { parsePortRecord, portRecord } from "./ports";

describe("port record", () => {
  test("round trip", () => {
    expect(parsePortRecord(portRecord(51234))).toBe(51234);
  });

  test("anything unusable is null", () => {
    for (const text of [null, "", "{broken", "null", '{"port":80}', '{"port":70000}', '{"port":"5000"}', '{"port":5000.5}', "[]"]) {
      expect(parsePortRecord(text), String(text)).toBeNull();
    }
  });
});
