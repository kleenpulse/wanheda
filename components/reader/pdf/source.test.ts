import { describe, expect, it } from "vitest";
import { pdfParams } from "./source";

describe("pdfParams", () => {
  const file = new File([new Uint8Array([37, 80, 68, 70])], "a.pdf");
  const noop = () => undefined;

  it("passes a locked PDF's password only when there is one", async () => {
    expect(await pdfParams(file, noop, "test")).toMatchObject({ password: "test" });
    expect("password" in (await pdfParams(file, noop))).toBe(false);
  });

  it("never lets a document fetch: same-origin data only, no worker fetch", async () => {
    expect(await pdfParams(file, noop)).toMatchObject({ useWorkerFetch: false, enableXfa: false });
  });
});
