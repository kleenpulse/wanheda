import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tip, TooltipGroup } from "./tooltip";

/** The trigger's own opening tag. */
const tag = (html: string) => /<(button|span)\b[^>]*data-slot="tooltip-trigger"[^>]*>/.exec(html)?.[0] ?? "";
const isDisabled = (html: string) => /\sdisabled(=""|[\s>])/.test(tag(html));

describe("Tip", () => {
  it("disables the button itself when disabled, not only its tooltip", () => {
    const html = renderToStaticMarkup(
      <Tip type="button" aria-label="Stop reading" label="Stop reading" disabled>
        x
      </Tip>,
    );
    expect(tag(html)).toContain("<button");
    expect(isDisabled(html)).toBe(true);
    expect(tag(html)).toContain('aria-label="Stop reading"');
  });

  it("leaves the button live when it isn't disabled", () => {
    for (const disabled of [undefined, false]) {
      const html = renderToStaticMarkup(
        <Tip type="button" label="Stop reading" {...(disabled === undefined ? {} : { disabled })}>
          x
        </Tip>,
      );
      expect(tag(html)).toContain("<button");
      expect(isDisabled(html)).toBe(false);
    }
  });

  it("disables it inside a shared tooltip group too", () => {
    const html = renderToStaticMarkup(
      <TooltipGroup>
        <Tip type="button" label="Previous sentence" disabled>
          x
        </Tip>
      </TooltipGroup>,
    );
    expect(isDisabled(html)).toBe(true);
  });

  it("keeps a caller's own element as given", () => {
    const html = renderToStaticMarkup(
      <Tip label="Kept on this device" disabled render={<span role="status" />}>
        x
      </Tip>,
    );
    expect(tag(html)).toContain("<span");
    expect(tag(html)).toContain('role="status"');
  });
});
