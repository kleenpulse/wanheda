import { describe, expect, it } from "vitest";
import { bumpPackageJson, cutRelease, hasRelease, nextVersion, releaseBranch } from "./bump-core";

describe("nextVersion", () => {
  it("bumps patch/minor/major", () => {
    expect(nextVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(nextVersion("0.1.9", "minor")).toBe("0.2.0");
    expect(nextVersion("0.9.3", "major")).toBe("1.0.0");
  });

  it("accepts an explicit version and rejects junk", () => {
    expect(nextVersion("0.1.0", "2.5.7")).toBe("2.5.7");
    expect(() => nextVersion("0.1.0", "banana")).toThrow(/patch\|minor\|major/);
    expect(() => nextVersion("dev", "patch")).toThrow(/not x\.y\.z/);
  });
});

describe("releaseBranch", () => {
  it("names the branch after the version", () => {
    expect(releaseBranch("0.7.0")).toBe("release/v0.7.0");
  });
});

describe("bumpPackageJson", () => {
  it("rewrites the first version key only", () => {
    const pkg = `{\n  "name": "wanheda",\n  "version": "0.1.0",\n  "deps": { "version": "0.1.0" }\n}`;
    const out = bumpPackageJson(pkg, "0.1.0", "0.2.0");
    expect(out).toContain(`"version": "0.2.0"`);
    expect(out).toContain(`"deps": { "version": "0.1.0" }`);
  });

  it("throws when the expected version string is absent", () => {
    expect(() => bumpPackageJson("{}", "0.1.0", "0.2.0")).toThrow(/package\.json/);
  });
});

describe("cutRelease", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "- New thing.",
    "- Another thing.",
    "",
    "## [0.1.0] - 2026-07-01",
    "",
    "### Added",
    "",
    "- Old thing.",
    "",
  ].join("\n");

  it("moves Unreleased under the new version and leaves a fresh Unreleased", () => {
    const { out, entryCount } = cutRelease(changelog, "0.2.0", "2026-08-09");
    expect(entryCount).toBe(2);
    const unreleasedAt = out.indexOf("## [Unreleased]");
    const newAt = out.indexOf("## [0.2.0] - 2026-08-09");
    const oldAt = out.indexOf("## [0.1.0] - 2026-07-01");
    expect(unreleasedAt).toBeGreaterThan(-1);
    expect(newAt).toBeGreaterThan(unreleasedAt);
    expect(oldAt).toBeGreaterThan(newAt);
    // The fresh Unreleased section is empty.
    expect(out.slice(unreleasedAt, newAt)).not.toContain("- ");
    // Entries moved under the new heading.
    expect(out.slice(newAt, oldAt)).toContain("- New thing.");
  });

  it("works when Unreleased is the last section", () => {
    const first = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- First.\n";
    const { out, entryCount } = cutRelease(first, "0.1.0", "2026-11-07");
    expect(entryCount).toBe(1);
    expect(out).toBe("# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-11-07\n\n### Added\n\n- First.\n");
  });

  it("reports 0 entries for an empty Unreleased", () => {
    const empty = "# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-07-01\n\n- Old.\n";
    expect(cutRelease(empty, "0.2.0", "2026-08-09").entryCount).toBe(0);
  });

  it("keeps CRLF line endings", () => {
    const { out, entryCount } = cutRelease(changelog.replaceAll("\n", "\r\n"), "0.2.0", "2026-08-09");
    expect(entryCount).toBe(2);
    expect(out).toContain("## [0.2.0] - 2026-08-09\r\n");
    expect(out.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("throws without an Unreleased section", () => {
    expect(() => cutRelease("# Changelog\n", "0.2.0", "2026-08-09")).toThrow(/Unreleased/);
  });

  it("refuses a version that is already in the changelog", () => {
    expect(() => cutRelease(changelog, "0.1.0", "2026-08-09")).toThrow(/already exists/);
  });
});

describe("hasRelease", () => {
  it("matches the exact version heading only", () => {
    const raw = "## [Unreleased]\n\n## [0.10.1] - 2026-11-01\n";
    expect(hasRelease(raw, "0.10.1")).toBe(true);
    expect(hasRelease(raw, "0.10.0")).toBe(false);
    expect(hasRelease(raw, "0.1.1")).toBe(false);
    expect(hasRelease("## [0x10y1] - 2026\n", "0.10.1")).toBe(false);
  });
});
