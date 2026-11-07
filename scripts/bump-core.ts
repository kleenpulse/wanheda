/**
 * Pure string rewriters behind scripts/bump.ts. Every function is
 * (raw, ...) => raw so a test can prove each one touches only its version.
 * Mirrors email-manager's bump-core.
 */

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** "patch" | "minor" | "major" | explicit "x.y.z" → next version string. */
export function nextVersion(current: string, arg: string): string {
  const m = SEMVER_RE.exec(current);
  if (!m) throw new Error(`current version is not x.y.z: ${current}`);
  const maj = Number(m[1]);
  const min = Number(m[2]);
  const pat = Number(m[3]);
  switch (arg) {
    case "patch":
      return `${maj}.${min}.${pat + 1}`;
    case "minor":
      return `${maj}.${min + 1}.0`;
    case "major":
      return `${maj + 1}.0.0`;
    default: {
      if (!SEMVER_RE.test(arg)) {
        throw new Error(`expected patch|minor|major|x.y.z, got: ${arg}`);
      }
      return arg;
    }
  }
}

/** Branch the release commit goes on: main only takes pull requests. */
export function releaseBranch(version: string): string {
  return `release/v${version}`;
}

function replaceOnce(raw: string, from: string, to: string, file: string): string {
  const at = raw.indexOf(from);
  if (at < 0) throw new Error(`${file}: could not find ${JSON.stringify(from)}`);
  return raw.slice(0, at) + to + raw.slice(at + from.length);
}

export function bumpPackageJson(raw: string, from: string, to: string): string {
  return replaceOnce(raw, `"version": "${from}"`, `"version": "${to}"`, "package.json");
}

/**
 * Moves the [Unreleased] body under a new `## [version] - date` heading and
 * leaves a fresh empty [Unreleased] above it. entryCount = `- ` bullets moved.
 */
export function cutRelease(
  raw: string,
  version: string,
  date: string,
): { out: string; entryCount: number } {
  // Keeps the file's own line endings: a CRLF checkout stays CRLF.
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+\[Unreleased\]\s*$/i.test(l));
  if (start < 0) throw new Error("CHANGELOG.md: no ## [Unreleased] section");
  if (hasRelease(raw, version)) throw new Error(`CHANGELOG.md: ## [${version}] already exists`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start + 1, end);
  const entryCount = body.filter((l) => /^-\s/.test(l)).length;

  // Trim blank padding around the body, then rebuild with canonical spacing.
  while (body.length > 0 && (body[0] ?? "").trim() === "") body.shift();
  while (body.length > 0 && (body.at(-1) ?? "").trim() === "") body.pop();

  const out = [
    ...lines.slice(0, start),
    "## [Unreleased]",
    "",
    `## [${version}] - ${date}`,
    "",
    ...body,
    "",
    ...lines.slice(end),
  ].join(eol);
  return { out, entryCount };
}

/** True when CHANGELOG.md already has a `## [version]` heading. */
export function hasRelease(raw: string, version: string): boolean {
  const escaped = version.replaceAll(".", "\\.");
  return new RegExp(`^##\\s+\\[${escaped}\\](\\s|$)`, "m").test(raw);
}
