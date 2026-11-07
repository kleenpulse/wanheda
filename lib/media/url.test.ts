import { describe, expect, it } from "vitest";
import { parseMediaUrl, parseStart } from "./url";

const YT = "dQw4w9WgXcQ";

describe("parseMediaUrl: embeds", () => {
  it.each([
    `https://www.youtube.com/watch?v=${YT}`,
    `https://youtube.com/watch?v=${YT}&list=PL123`,
    `https://m.youtube.com/watch?v=${YT}`,
    `https://music.youtube.com/watch?v=${YT}`,
    `https://youtu.be/${YT}`,
    `https://www.youtube.com/shorts/${YT}`,
    `https://www.youtube.com/embed/${YT}`,
    `https://www.youtube.com/live/${YT}`,
    `https://www.youtube-nocookie.com/embed/${YT}`,
    `youtube.com/watch?v=${YT}`,
  ])("YouTube %s", (raw) => {
    expect(parseMediaUrl(raw)).toMatchObject({
      kind: "embed",
      provider: "youtube",
      id: YT,
      fp: `youtube:${YT}`,
      embedSrc: `https://www.youtube-nocookie.com/embed/${YT}`,
      mediaKind: "video",
    });
  });

  it("keeps a YouTube start time, rebuilt as a number", () => {
    expect(parseMediaUrl(`https://youtu.be/${YT}?t=1m30s`)).toMatchObject({
      embedSrc: `https://www.youtube-nocookie.com/embed/${YT}?start=90`,
      startS: 90,
    });
  });

  it("never copies the raw URL into the iframe src", () => {
    const hit = parseMediaUrl(`https://www.youtube.com/watch?v=${YT}&x="><script>`);
    expect(hit.kind === "embed" && hit.embedSrc).toBe(`https://www.youtube-nocookie.com/embed/${YT}`);
  });

  it("rejects a YouTube link with a bad id, and playlists", () => {
    expect(parseMediaUrl("https://www.youtube.com/watch?v=short").kind).toBe("invalid");
    expect(parseMediaUrl("https://www.youtube.com/playlist?list=PL1").kind).toBe("invalid");
  });

  it.each([
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
    ["https://vimeo.com/channels/staffpicks/76979871", "https://player.vimeo.com/video/76979871"],
    ["https://player.vimeo.com/video/76979871", "https://player.vimeo.com/video/76979871"],
    ["https://vimeo.com/76979871/abc123def0", "https://player.vimeo.com/video/76979871?h=abc123def0"],
  ])("Vimeo %s", (raw, src) => {
    expect(parseMediaUrl(raw)).toMatchObject({ kind: "embed", provider: "vimeo", id: "76979871", fp: "vimeo:76979871", embedSrc: src });
  });

  it("SoundCloud tracks and sets, src rebuilt from the path", () => {
    expect(parseMediaUrl("https://soundcloud.com/Artist-1/some_track?si=xyz")).toMatchObject({
      kind: "embed",
      provider: "soundcloud",
      id: "artist-1/some_track",
      fp: "soundcloud:artist-1/some_track",
      embedSrc: "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist-1%2Fsome_track&visual=true",
      mediaKind: "audio",
    });
    expect(parseMediaUrl("https://soundcloud.com/artist/sets/album")).toMatchObject({ kind: "embed", id: "artist/sets/album" });
    expect(parseMediaUrl("https://soundcloud.com/artist").kind).toBe("invalid");
  });

  it("Spotify types, with or without intl", () => {
    const id = "4uLU6hMCjMI75M1A2tKUQC";
    expect(parseMediaUrl(`https://open.spotify.com/intl-de/track/${id}?si=1`)).toMatchObject({
      kind: "embed",
      provider: "spotify",
      fp: `spotify:track:${id}`,
      embedSrc: `https://open.spotify.com/embed/track/${id}`,
    });
    expect(parseMediaUrl(`https://open.spotify.com/album/${id}`)).toMatchObject({ embedSrc: `https://open.spotify.com/embed/album/${id}` });
    expect(parseMediaUrl(`https://open.spotify.com/user/${id}`).kind).toBe("invalid");
  });
});

describe("parseMediaUrl: direct URLs", () => {
  it("normalises: lowercase host, default port and fragment dropped, query kept", () => {
    expect(parseMediaUrl("HTTPS://Cdn.Example.com:443/v/My%20Clip.mp4?token=a#t=5")).toEqual({
      kind: "url",
      url: "https://cdn.example.com/v/My%20Clip.mp4?token=a",
      fp: "https://cdn.example.com/v/My%20Clip.mp4?token=a",
      mediaKind: "video",
      name: "My Clip.mp4",
    });
  });

  it("guesses audio from the extension", () => {
    expect(parseMediaUrl("https://example.com/a/song.flac")).toMatchObject({ kind: "url", mediaKind: "audio" });
    expect(parseMediaUrl("https://example.com/a/show.mkv")).toMatchObject({ kind: "url", mediaKind: "video" });
  });

  it.each(["javascript:alert(1)", "data:video/mp4;base64,AAAA", "file:///C:/x.mp4", "ftp://example.com/x.mp4", "https://user:pw@example.com/x.mp4", "   ", "http://"])(
    "rejects %s",
    (raw) => {
      expect(parseMediaUrl(raw).kind).toBe("invalid");
    },
  );

  it("an unknown host is a direct URL, never an embed", () => {
    expect(parseMediaUrl("https://evil.example/embed/dQw4w9WgXcQ").kind).toBe("url");
  });
});

describe("parseStart", () => {
  it.each([
    ["90", 90],
    ["90s", 90],
    ["1m30s", 90],
    ["1h2m3s", 3723],
    ["", null],
    ["abc", null],
    [null, null],
  ] as const)("%s → %s", (raw, out) => {
    expect(parseStart(raw)).toBe(out);
  });
});
