import { randomBytes } from "node:crypto";
import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { Readable } from "node:stream";
import type { Root } from "./files";
import { isMediaName, resolveInRoot } from "./files-io";
import { isGrantToken, MAX_GRANTS, MAX_JOBS, parseTranscodeUrl, transcodableFrom, transcodeArgs } from "./transcode";

/*
 * Native transcode (SPEC V74), the parts that touch the disk and run ffmpeg.
 * One ffmpeg per request, started with an argument array (never a shell),
 * with nothing in its environment but SystemRoot. Its stdout is the response
 * body; when the reader goes away (a seek, a closed player, a reload) the
 * process is killed. Nothing is written to disk.
 */

type Log = { info: (line: string) => void };
type Job = ChildProcessByStdio<null, Readable, Readable>;

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

export function createTranscoder(opts: { ffmpeg: string; log: Log }) {
  const env = { SystemRoot: process.env.SystemRoot ?? "C:\\Windows" };
  const jobs = new Set<Job>();
  /** One-file grants (a file the owner picked, outside the native folders): token → real path. This run only. */
  const grants = new Map<string, string>();
  let codecs: Promise<string[]> | null = null;

  const run = (args: string[]) =>
    new Promise<string>((resolve, reject) => {
      execFile(opts.ffmpeg, args, { env, windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(new Error(err.message));
        else resolve(stdout);
      });
    });

  /** The codecs the bundled build converts (`caps.transcodable`, V52): asked until it answers. Empty when ffmpeg isn't there or won't run. */
  function transcodable(): Promise<string[]> {
    codecs ??= (async () => {
      if (!existsSync(opts.ffmpeg)) {
        opts.log.info("transcode: ffmpeg isn't bundled with this build");
        return [];
      }
      try {
        const [decoders, encoders] = await Promise.all([run(["-hide_banner", "-decoders"]), run(["-hide_banner", "-encoders"])]);
        const list = transcodableFrom(decoders, encoders);
        opts.log.info(`transcode: ffmpeg converts ${list.join(", ") || "nothing"}`);
        return list;
      } catch {
        opts.log.info("transcode: ffmpeg didn't run");
        // A slow first start (a virus scan of the exe, say) mustn't switch conversion off for the whole run.
        codecs = null;
        return [];
      }
    })();
    return codecs;
  }

  /**
   * A token for one picked file, or null: an absolute path to a plain video
   * file, kept by its real path. The preload reads the path from a real File
   * object (`webUtils.getPathForFile`), so page script can't name a path itself.
   */
  async function grant(path: unknown): Promise<string | null> {
    if (typeof path !== "string" || path.length > 4096 || !isAbsolute(path)) return null;
    try {
      const real = await realpath(path);
      if (!isMediaName(real, "video") || !(await stat(real)).isFile()) return null;
      for (const [token, kept] of grants) if (kept === real) return token;
      if (grants.size >= MAX_GRANTS) {
        const oldest = grants.keys().next().value;
        if (oldest !== undefined) grants.delete(oldest);
      }
      const token = randomBytes(16).toString("hex");
      grants.set(token, real);
      return token;
    } catch {
      return null;
    }
  }

  function kill(job: Job): void {
    jobs.delete(job);
    if (job.exitCode === null && job.signalCode === null) job.kill();
  }

  function stopAll(): void {
    for (const job of [...jobs]) kill(job);
  }

  /** Answers a `wanheda-transcode:` request with ffmpeg's output, or a plain 404 that says nothing about what exists. */
  async function serve(request: Request, roots: readonly Root[], appOrigin: string | null): Promise<Response> {
    if (request.method !== "GET") return new Response(null, { status: 405 });
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== appOrigin) return NOT_FOUND();
    const req = parseTranscodeUrl(request.url);
    if (!req || !existsSync(opts.ffmpeg)) return NOT_FOUND();
    const root = roots.find((r) => r.id === req.source);
    const granted = isGrantToken(req.source) ? grants.get(req.source) : undefined;
    const input = root ? (await resolveInRoot(root.path, req.segments))?.path : granted;
    if (!input) return NOT_FOUND();

    // A seek replaces the job before it: the oldest go first.
    while (jobs.size >= MAX_JOBS) {
      const oldest = jobs.values().next().value;
      if (!oldest) break;
      kill(oldest);
    }
    const started = Date.now();
    const job = spawn(opts.ffmpeg, transcodeArgs(input, req), { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    jobs.add(job);
    let lastError = "";
    job.stderr.setEncoding("utf8");
    job.stderr.on("data", (text: string) => {
      lastError = (lastError + text).slice(-400);
    });
    job.on("error", () => {
      jobs.delete(job);
    });
    job.on("exit", (code, signal) => {
      jobs.delete(job);
      // The file's own path stays out of the log.
      const said = lastError.split(input).join("<file>").trim().split(/\r?\n/).pop() ?? "";
      opts.log.info(`transcode: ffmpeg ended (${signal ?? String(code)}) after ${((Date.now() - started) / 1000).toFixed(1)} s${code && said ? `: ${said.slice(0, 200)}` : ""}`);
    });
    // The reader went away, or the output ended: either way the process must not outlive it.
    job.stdout.on("close", () => {
      kill(job);
    });

    // Answer once there are bytes, so a job that fails at once (a track id ffmpeg doesn't find) is an error, not an empty film.
    const hasOutput = await new Promise<boolean>((resolve) => {
      // "readable" also fires at the end of an empty stream: only bytes count.
      const onReadable = () => {
        if (job.stdout.readableLength === 0) return;
        job.stdout.off("readable", onReadable);
        resolve(true);
      };
      job.stdout.on("readable", onReadable);
      job.once("exit", () => {
        job.stdout.off("readable", onReadable);
        resolve(job.stdout.readableLength > 0);
      });
      job.once("error", () => {
        job.stdout.off("readable", onReadable);
        resolve(false);
      });
    });
    // A seek can drop the request while ffmpeg is still starting: nobody will read this job.
    if (request.signal.aborted) {
      kill(job);
      return NOT_FOUND();
    }
    request.signal.addEventListener(
      "abort",
      () => {
        kill(job);
      },
      { once: true },
    );
    if (!hasOutput) {
      kill(job);
      return new Response("The converter couldn't read this file.", { status: 500, headers: { "cache-control": "no-store", ...(appOrigin ? { "access-control-allow-origin": appOrigin } : {}) } });
    }
    return new Response(Readable.toWeb(job.stdout) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        vary: "Origin",
        ...(appOrigin ? { "access-control-allow-origin": appOrigin } : {}),
      },
    });
  }

  return { transcodable, grant, serve, stopAll, running: () => jobs.size };
}
