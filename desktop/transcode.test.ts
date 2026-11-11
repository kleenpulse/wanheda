import { describe, expect, test } from "vitest";
import { DESKTOP_CONVERTS } from "../lib/media/ladder";
import { FFMPEG_PIN, ffmpegZipUrl, zipPathOf } from "./ffmpeg-pin";
import { AUDIO_DECODERS, GRANT_PATH, parseTranscodeUrl, SEEK_NUDGE_S, transcodableFrom, transcodeArgs } from "./transcode";

const ROOT = "0123456789abcdef0123456789abcdef";

describe("parseTranscodeUrl", () => {
  test("a folder file with both tracks and a start", () => {
    expect(parseTranscodeUrl(`wanheda-transcode://${ROOT}/Films/A%20film.mkv?v=0&a=1&ss=12.5`)).toEqual({
      source: ROOT,
      segments: ["Films", "A film.mkv"],
      video: 0,
      audio: 1,
      startS: 12.5,
    });
  });

  test("audio alone, from the start", () => {
    expect(parseTranscodeUrl(`wanheda-transcode://${ROOT}/${GRANT_PATH}?a=0`)).toEqual({ source: ROOT, segments: [GRANT_PATH], video: null, audio: 0, startS: 0 });
  });

  test.each([
    ["another scheme", `wanheda-file://${ROOT}/a.mkv?a=0`],
    ["no query", `wanheda-transcode://${ROOT}/a.mkv`],
    ["no audio track", `wanheda-transcode://${ROOT}/a.mkv?v=0`],
    ["a bad source", `wanheda-transcode://nope/a.mkv?a=0`],
    ["a path that climbs", `wanheda-transcode://${ROOT}/../a.mkv?a=0`],
    ["an encoded climb", `wanheda-transcode://${ROOT}/%2e%2e/a.mkv?a=0`],
    ["a drive letter", `wanheda-transcode://${ROOT}/C:/a.mkv?a=0`],
    ["an unknown key", `wanheda-transcode://${ROOT}/a.mkv?a=0&c=copy`],
    ["a key twice", `wanheda-transcode://${ROOT}/a.mkv?a=0&a=1`],
    ["a track that isn't a number", `wanheda-transcode://${ROOT}/a.mkv?a=0:1`],
    ["a negative track", `wanheda-transcode://${ROOT}/a.mkv?a=-1`],
    ["a track with an option in it", `wanheda-transcode://${ROOT}/a.mkv?a=0%20-f%20null`],
    ["an empty video track", `wanheda-transcode://${ROOT}/a.mkv?v=&a=0`],
    ["a start that isn't seconds", `wanheda-transcode://${ROOT}/a.mkv?a=0&ss=00:01:00`],
    ["a negative start", `wanheda-transcode://${ROOT}/a.mkv?a=0&ss=-5`],
    ["an exponent", `wanheda-transcode://${ROOT}/a.mkv?a=0&ss=1e9`],
    ["a fragment", `wanheda-transcode://${ROOT}/a.mkv?a=0#x`],
  ])("refuses %s", (_name, url) => {
    expect(parseTranscodeUrl(url)).toBeNull();
  });
});

describe("transcodeArgs", () => {
  const input = "D:\\Films\\-i evil.mkv";

  test("copies the video, converts the audio to AAC and streams fragmented MP4", () => {
    const args = transcodeArgs(input, { video: 0, audio: 1, startS: 10 });
    expect(args.join(" ")).toContain("-map 0:V:0 -map 0:a:1 -c:v copy -c:a aac -ac 2");
    expect(args.slice(-3)).toEqual(["-f", "mp4", "pipe:1"]);
    expect(args[args.indexOf("-movflags") + 1]).toBe("+frag_keyframe+empty_moov+default_base_moof");
  });

  test("the path is one argument behind file:, so nothing in a name is read as an option or a protocol", () => {
    const args = transcodeArgs(input, { video: 0, audio: 0, startS: 0 });
    expect(args[args.indexOf("-i") + 1]).toBe(`file:${input}`);
    expect(args.filter((a) => a.includes("evil"))).toHaveLength(1);
    expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("file");
  });

  test("seeks by the file's own timestamp, a hair late so the keyframe asked for is the one found", () => {
    const args = transcodeArgs(input, { video: 0, audio: 0, startS: 11.405 });
    expect(args[args.indexOf("-seek_timestamp") + 1]).toBe("1");
    expect(args[args.indexOf("-ss") + 1]).toBe((11.405 + SEEK_NUDGE_S).toFixed(6));
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
  });

  test("audio alone maps no video and cuts a fragment a second", () => {
    const args = transcodeArgs(input, { video: null, audio: 2, startS: 0 });
    expect(args.filter((a) => a === "-map")).toHaveLength(1);
    expect(args).toContain("0:a:2");
    expect(args[args.indexOf("-frag_duration") + 1]).toBe("1000000");
  });

  test("every argument is a plain string with no shell in it", () => {
    for (const arg of transcodeArgs("C:\\a.mkv", { video: 3, audio: 4, startS: 99.5 })) expect(arg).not.toMatch(/[|&;<>`$]/);
  });
});

describe("transcodableFrom", () => {
  const decoders = ["Decoders:", " ------", " V....D h264                 H.264", " A....D ac3                  ATSC A/52A (AC-3)", " A....D dca                  DCA (DTS Coherent Acoustics) (codec dts)", " A....D aac                  AAC"].join("\r\n");
  const encoders = [" A....D aac                  AAC (Advanced Audio Coding)", " A....D ac3                  ATSC A/52A (AC-3)"].join("\n");

  test("names the probe's codecs this build decodes", () => {
    expect(transcodableFrom(decoders, encoders)).toEqual(["ac3", "dts"]);
  });

  test("nothing without an AAC encoder, or from output that isn't a codec list", () => {
    expect(transcodableFrom(decoders, " A....D ac3   AC-3")).toEqual([]);
    expect(transcodableFrom("ffmpeg: not found", encoders)).toEqual([]);
  });

  test("the codecs converted are the ones the page says the desktop app converts", () => {
    expect(Object.keys(AUDIO_DECODERS).sort()).toEqual([...DESKTOP_CONVERTS].sort());
  });
});

describe("the ffmpeg pin (V74)", () => {
  test("every hash is a real sha256, never a placeholder", () => {
    for (const sha of [FFMPEG_PIN.zip.sha256, ...FFMPEG_PIN.files.map((f) => f.sha256)]) {
      expect(sha).toMatch(/^[0-9a-f]{64}$/);
      expect(sha).not.toMatch(/^0+$/);
    }
  });

  test("it is an LGPL build from a pinned release, and only ffmpeg.exe and its licence ship", () => {
    expect(FFMPEG_PIN.zip.name).toMatch(/-win64-lgpl-/);
    expect(ffmpegZipUrl()).toBe(`https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_PIN.release}/${FFMPEG_PIN.zip.name}`);
    expect(FFMPEG_PIN.files.map((f) => f.as)).toEqual(["ffmpeg.exe", "FFMPEG-LICENSE.txt"]);
    const [exe] = FFMPEG_PIN.files;
    expect(zipPathOf(exe)).toBe(`${FFMPEG_PIN.zip.name.slice(0, -4)}/bin/ffmpeg.exe`);
  });
});
