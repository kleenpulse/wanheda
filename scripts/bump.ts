/**
 * Release cutter: syncs package.json, cuts CHANGELOG.md, commits, tags.
 * Mirrors email-manager's `bun run bump`, with one change: main here only
 * takes pull requests, so the cut and the tag are two steps.
 *
 *   bun run bump patch|minor|major|<x.y.z> [--allow-empty]
 *     From an up-to-date main: creates release/vX.Y.Z, moves [Unreleased]
 *     under a new version heading, syncs package.json and commits
 *     `chore(release): vX.Y.Z`. Push it and open a PR; the user merges.
 *
 *   bun run bump --tag
 *     On main after that merge: annotated tag vX.Y.Z (version read from
 *     package.json) on HEAD. Tagging after the merge keeps the tag on main
 *     whatever merge method was used.
 *
 * Refuses on a dirty tree and on an empty [Unreleased] (--allow-empty
 * overrides that for emergency re-cuts). Never pushes.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bumpPackageJson, cutRelease, hasRelease, nextVersion, releaseBranch } from "./bump-core";

// Run via `bun run bump`: package.json scripts always execute from the repo root.
const root = process.cwd();
// Relative names: git add on Windows chokes on JSON-escaped absolute paths.
const FILES = ["package.json", "CHANGELOG.md"] as const;
const pkgPath = join(root, FILES[0]);
const changelogPath = join(root, FILES[1]);

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function fail(message: string): never {
  console.error(`refusing: ${message}`);
  process.exit(1);
}

function requireCleanTree(): void {
  const dirty = git("status", "--porcelain");
  if (dirty) fail(`working tree is dirty. Commit or stash first:\n${dirty}`);
}

function requireMainAtUpstream(): void {
  const upstream = spawnSync("git", ["rev-parse", "@{u}"], { cwd: root, encoding: "utf8" });
  if (upstream.status !== 0) fail("main has no upstream branch.");
  if (git("rev-parse", "HEAD") !== upstream.stdout.trim()) {
    fail(
      "main is not at its upstream. Run `git fetch`, check the incoming commits " +
        "(sh scripts/forged-commits.sh HEAD..@{u}), fast-forward, then run this again.",
    );
  }
}

function currentVersion(): string {
  return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
}

function cut(arg: string, allowEmpty: boolean): void {
  requireCleanTree();
  const current = currentVersion();
  const next = nextVersion(current, arg);
  const branch = releaseBranch(next);
  const onBranch = git("branch", "--show-current");
  if (onBranch === "main") requireMainAtUpstream();
  else if (onBranch !== branch) fail(`cut releases from main (you are on ${onBranch || "a detached HEAD"}).`);

  // Computed before any write: the empty-Unreleased guard aborts with nothing touched.
  const date = new Date().toISOString().slice(0, 10);
  const { out: changelogOut, entryCount } = cutRelease(readFileSync(changelogPath, "utf8"), next, date);
  if (entryCount === 0 && !allowEmpty) {
    fail("[Unreleased] has no entries. Write the changelog first (--allow-empty to override).");
  }

  if (onBranch === "main") git("switch", "-c", branch);
  writeFileSync(pkgPath, bumpPackageJson(readFileSync(pkgPath, "utf8"), current, next));
  writeFileSync(changelogPath, changelogOut);
  git("add", ...FILES);
  git("commit", "-m", `chore(release): v${next}`);

  console.log(`v${current} -> v${next} (${entryCount} changelog entries), committed on ${branch}.`);
  console.log(`Next: git push -u origin ${branch}, open a PR, merge it, then on main: bun run bump --tag`);
}

function tag(): void {
  requireCleanTree();
  if (git("branch", "--show-current") !== "main") fail("tag on main, after the release PR is merged.");
  requireMainAtUpstream();
  const version = currentVersion();
  const name = `v${version}`;
  const exists = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${name}`], { cwd: root });
  if (exists.status === 0) fail(`tag ${name} already exists.`);
  if (!hasRelease(readFileSync(changelogPath, "utf8"), version)) {
    fail(`CHANGELOG.md on main has no ## [${version}] heading. Is the release PR merged and pulled?`);
  }
  git("tag", "-a", name, "-m", name);
  console.log(`Tagged ${name} on ${git("rev-parse", "--short", "HEAD")}. Push it with: git push origin ${name}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--tag")) {
    tag();
  } else {
    const arg = args.find((a) => !a.startsWith("--"));
    if (!arg) {
      console.error("usage: bun run bump patch|minor|major|<x.y.z> [--allow-empty]\n       bun run bump --tag");
      process.exit(1);
    }
    cut(arg, args.includes("--allow-empty"));
  }
}
