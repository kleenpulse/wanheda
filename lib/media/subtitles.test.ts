import { describe, expect, it } from "vitest";
import { srtToVtt } from "./subtitles";

describe("srtToVtt", () => {
  it("converts commas, drops cue numbers, handles BOM and CRLF", () => {
    const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\nthere\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nBye\r\n";
    expect(srtToVtt(srt)).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nthere\n\n00:00:03.000 --> 00:00:04.000\nBye\n");
  });

  it("skips a malformed cue and keeps the rest", () => {
    const srt = "1\n00:00:01,000 -> 00:00:02,000\nBroken\n\n2\n00:00:03,000 --> 00:00:04,000\nGood\n\n3\n00:00:05,000 --> 00:00:06,000\n\n";
    expect(srtToVtt(srt)).toBe("WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nGood\n");
  });

  it("keeps cue text as text: markup escaped, b|i|u kept", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\n<i>soft</i> <script>x</script> a --> b & c\n";
    expect(srtToVtt(srt)).toContain("<i>soft</i> &lt;script&gt;x&lt;/script&gt; a --&gt; b &amp; c");
  });

  it("accepts a cue without a number and one-digit hours", () => {
    expect(srtToVtt("0:00:01,000 --> 0:00:02,000\nHi")).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n");
  });

  it("never throws on junk", () => {
    expect(srtToVtt("")).toBe("WEBVTT\n\n");
    expect(srtToVtt("not subtitles at all\n\n\n")).toBe("WEBVTT\n\n");
  });
});
