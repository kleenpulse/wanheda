import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findShell } from "./tripwire";

const SCRIPT = join(import.meta.dirname, "forged-commits.sh");
const SHELL = findShell();
const tempDirs: string[] = [];

type Who = { name: string; email: string; date: string };
const OWNER = (date: string): Who => ({ name: "Owner", email: "owner@example.test", date });
const GITHUB = (date: string): Who => ({ name: "GitHub", email: "noreply@github.com", date });

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wanheda-forged-"));
  tempDirs.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  return dir;
}

function git(cwd: string, args: string[], author?: Who, committer?: Who): string {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(cwd) };
  if (author) Object.assign(env, { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_AUTHOR_DATE: author.date });
  if (committer) Object.assign(env, { GIT_COMMITTER_NAME: committer.name, GIT_COMMITTER_EMAIL: committer.email, GIT_COMMITTER_DATE: committer.date });
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd, env, encoding: "utf8" });
}

let counter = 0;
function commit(dir: string, author: Who, committer: Who): void {
  counter += 1;
  writeFileSync(join(dir, `f${counter}.txt`), `${counter}\n`);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", `c${counter}`], author, committer);
}

function run(dir: string, range: string) {
  return spawnSync(SHELL, [SCRIPT, range], { cwd: dir, encoding: "utf8" });
}

const LAGOS = "2026-11-04T10:00:00 +0100";

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("forged-commits.sh", { timeout: 30_000 }, () => {
  it("passes commits whose author and committer timezones match", () => {
    const dir = makeRepo();
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));
    commit(dir, OWNER("2026-11-04T09:00:00 +0000"), OWNER("2026-11-04T09:00:00 +0000"));

    const result = run(dir, "HEAD");

    expect(result.stdout).toContain("forged-commits: clean (2 commits");
    expect(result.status).toBe(0);
  });

  it("(a) fails when the committer timezone differs from the author's", () => {
    const dir = makeRepo();
    commit(dir, OWNER(LAGOS), OWNER("2026-11-04T01:00:00 -0800"));

    const result = run(dir, "HEAD");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("author tz +0100 != committer tz -0800");
  });

  it("(b) fails when author and committer are both at -0700", () => {
    const dir = makeRepo();
    const backdated = "2023-05-01T10:00:00 -0700";
    commit(dir, OWNER(backdated), OWNER(backdated));

    const result = run(dir, "HEAD");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("committer tz -0700 is flagged");
  });

  it("(c) gives no pass to a committer claiming to be GitHub", () => {
    const dir = makeRepo();
    commit(dir, OWNER(LAGOS), GITHUB("2026-11-04T01:00:00 -0800"));

    const result = run(dir, "HEAD");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("committer tz -0800");
  });

  it("(d) checks merge commits too", () => {
    const dir = makeRepo();
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));
    git(dir, ["checkout", "-q", "-b", "feature"]);
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));
    git(dir, ["checkout", "-q", "main"]);
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));
    const forged = "2026-11-04T02:00:00 -0700";
    git(dir, ["merge", "-q", "--no-ff", "-m", "merge feature", "feature"], OWNER(forged), OWNER(forged));

    const result = run(dir, "HEAD");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("merge feature");
  });

  it("(e) passes an honest merge at +0100 | +0100", () => {
    const dir = makeRepo();
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));
    git(dir, ["checkout", "-q", "-b", "feature"]);
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));
    git(dir, ["checkout", "-q", "main"]);
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));
    git(dir, ["merge", "-q", "--no-ff", "-m", "merge feature", "feature"], OWNER(LAGOS), GITHUB(LAGOS));

    const result = run(dir, "HEAD");

    expect(result.stdout).toContain("forged-commits: clean (4 commits");
    expect(result.status).toBe(0);
  });

  it("only checks the given range", () => {
    const dir = makeRepo();
    commit(dir, OWNER(LAGOS), OWNER("2026-11-04T01:00:00 -0800"));
    const base = git(dir, ["rev-parse", "HEAD"]).trim();
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));

    const result = run(dir, `${base}..HEAD`);

    expect(result.status).toBe(0);
  });

  it("exits 2 on a bad range or no range", () => {
    const dir = makeRepo();
    commit(dir, OWNER(LAGOS), OWNER(LAGOS));

    expect(run(dir, "no-such-ref..HEAD").status).toBe(2);
    expect(spawnSync(SHELL, [SCRIPT], { cwd: dir, encoding: "utf8" }).status).toBe(2);
  });
});
