import { describe, expect, test } from "vitest";
import { isOwnFeed, latestYmlProblem, updateMode } from "./update-policy";

describe("updateMode", () => {
  test("only the packaged Windows app updates itself", () => {
    expect(updateMode({ packaged: true, platform: "win32" })).toBe("auto");
    expect(updateMode({ packaged: false, platform: "win32" })).toBe("off");
    for (const platform of ["darwin", "linux", "freebsd"] as const) expect(updateMode({ packaged: true, platform })).toBe("off");
  });
});

describe("isOwnFeed", () => {
  const own = "owner: kleenpulse\nrepo: wanheda\nprovider: github\nupdaterCacheDirName: wanheda-updater\n";

  test("takes the feed electron-builder writes for this repo", () => {
    expect(isOwnFeed(own)).toBe(true);
    expect(isOwnFeed(own.replace(/\n/g, "\r\n"))).toBe(true);
    expect(isOwnFeed("provider: 'github'\nowner: \"kleenpulse\"\nrepo: wanheda\n")).toBe(true);
  });

  test("refuses another repo, owner or provider", () => {
    expect(isOwnFeed(own.replace("repo: wanheda", "repo: wanheda-fork"))).toBe(false);
    expect(isOwnFeed(own.replace("owner: kleenpulse", "owner: someone"))).toBe(false);
    expect(isOwnFeed(own.replace("provider: github", "provider: generic"))).toBe(false);
    expect(isOwnFeed("")).toBe(false);
  });

  test("refuses anything that could send downloads elsewhere or pin a publisher", () => {
    expect(isOwnFeed(`${own}url: https://example.test/updates\n`)).toBe(false);
    expect(isOwnFeed(`${own}host: example.test\n`)).toBe(false);
    expect(isOwnFeed(`${own}publisherName: Someone\n`)).toBe(false);
    expect(isOwnFeed(`${own}  - nested\n`)).toBe(false);
  });
});

describe("latestYmlProblem", () => {
  const expected = { version: "0.8.0", file: "Wanheda-0.8.0-win-x64.exe", sha512: "abc+/=" };
  const yml = [
    "version: 0.8.0",
    "files:",
    "  - url: Wanheda-0.8.0-win-x64.exe",
    "    sha512: abc+/=",
    "    size: 160213818",
    "path: Wanheda-0.8.0-win-x64.exe",
    "sha512: abc+/=",
    "releaseDate: '2026-11-13T17:00:00.000Z'",
  ].join("\n");

  test("null when it names this version, this installer and its hash", () => {
    expect(latestYmlProblem(yml, expected)).toBeNull();
  });

  test("names what's wrong", () => {
    expect(latestYmlProblem(yml.replace("version: 0.8.0", "version: 0.7.9"), expected)).toMatch(/version 0\.7\.9/);
    expect(latestYmlProblem(yml.replace("path: Wanheda-0.8.0", "path: Other-0.8.0"), expected)).toMatch(/points at Other/);
    expect(latestYmlProblem(yml.replace(/^sha512: .*$/m, "sha512: xyz"), expected)).toMatch(/sha512/);
    expect(latestYmlProblem("", expected)).toMatch(/version none/);
  });
});
