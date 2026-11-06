import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG, DEFAULT_VOICE, VOICE_DIR, hasPartial, installFor, readFilesFor, removeVoice, type CatalogVoice } from "./voices";

// ── A small in-memory OPFS ───────────────────────────────────────────────

const notFound = () => new DOMException("not found", "NotFoundError");
/** Called as a writable closes, with the file's name. */
let onClose: ((name: string) => void) | null = null;

class FakeFileHandle {
  readonly kind = "file";
  data = new Uint8Array(0);
  constructor(
    public name: string,
    private readonly parent: FakeDir,
  ) {}
  getFile() {
    return Promise.resolve(new File([this.data], this.name));
  }
  createWritable() {
    const chunks: Uint8Array[] = [];
    return Promise.resolve({
      write: (b: Uint8Array) => {
        chunks.push(new Uint8Array(b));
        return Promise.resolve();
      },
      close: () => {
        this.data = new Uint8Array(Buffer.concat(chunks));
        onClose?.(this.name);
        return Promise.resolve();
      },
      abort: () => Promise.resolve(),
    });
  }
  move(name: string) {
    this.parent.entries.delete(this.name);
    this.name = name;
    this.parent.entries.set(name, this);
    return Promise.resolve();
  }
}

class FakeDir {
  readonly kind = "directory";
  readonly entries = new Map<string, FakeDir | FakeFileHandle>();
  getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let e = this.entries.get(name);
    if (!e && opts?.create) this.entries.set(name, (e = new FakeDir()));
    return e instanceof FakeDir ? Promise.resolve(e) : Promise.reject(notFound());
  }
  getFileHandle(name: string, opts?: { create?: boolean }) {
    let e = this.entries.get(name);
    if (!e && opts?.create) this.entries.set(name, (e = new FakeFileHandle(name, this)));
    return e instanceof FakeFileHandle ? Promise.resolve(e) : Promise.reject(notFound());
  }
  removeEntry(name: string, opts?: { recursive?: boolean }) {
    const e = this.entries.get(name);
    if (!e) return Promise.reject(notFound());
    if (e instanceof FakeDir && e.entries.size > 0 && !opts?.recursive) return Promise.reject(new DOMException("not empty", "InvalidModificationError"));
    this.entries.delete(name);
    return Promise.resolve();
  }
  /** Names in this folder and below, as paths. */
  tree(prefix = ""): string[] {
    return [...this.entries].flatMap(([name, e]) => (e instanceof FakeDir ? [`${prefix}${name}/`, ...e.tree(`${prefix}${name}/`)] : [`${prefix}${name}`]));
  }
}

// ── A tiny voice and its fake Hugging Face ───────────────────────────────

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const MODEL = new Uint8Array(Array.from({ length: 5000 }, (_, i) => i % 251));
const CONFIG = new TextEncoder().encode('{"audio":{"sample_rate":22050}}');

function tinyVoice(over: Partial<CatalogVoice> = {}): CatalogVoice {
  return {
    id: "xx_XX-tiny-low",
    name: "Tiny",
    lang: "en-US",
    quality: "low",
    revision: "0".repeat(40),
    model: { path: "tiny.onnx", size: MODEL.byteLength, sha256: sha(MODEL) },
    config: { path: "tiny.onnx.json", size: CONFIG.byteLength, sha256: sha(CONFIG) },
    licence: { dataset: "Test", terms: "CC0", url: "https://example.org", nonCommercial: false },
    ...over,
  };
}

let root: FakeDir;
/** Bytes served per file path. */
let served: Record<string, Uint8Array>;
/** The model's stream stops after its first chunk until the fetch is aborted. */
let stallModel = false;

function respond(bytes: Uint8Array, signal: AbortSignal | undefined, stall: boolean): Response {
  let at = 0;
  const CHUNK = 1024;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (at > 0 && stall) {
        await new Promise<void>((_, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }).catch((e: unknown) => {
          controller.error(e);
        });
        return;
      }
      if (at >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + CHUNK));
      at += CHUNK;
    },
  });
  return new Response(stream);
}

beforeEach(() => {
  root = new FakeDir();
  served = { "tiny.onnx": MODEL, "tiny.onnx.json": CONFIG };
  stallModel = false;
  onClose = null;
  vi.stubGlobal("navigator", { storage: { getDirectory: () => Promise.resolve(root) } });
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    const path = url.split("/").at(-1) ?? "";
    const bytes = served[path];
    return Promise.resolve(bytes ? respond(bytes, init?.signal ?? undefined, stallModel && path === "tiny.onnx") : new Response(null, { status: 404 }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const voices = () => root.entries.get(VOICE_DIR) as FakeDir | undefined;

describe("installFor", () => {
  it("keeps both files in the voice's own folder, reporting progress up to the total", async () => {
    const voice = tinyVoice();
    const seen: number[] = [];
    await installFor(voice, new AbortController().signal, (p) => {
      expect(p.total).toBe(MODEL.byteLength + CONFIG.byteLength);
      seen.push(p.received);
    });
    expect(seen.at(-1)).toBe(MODEL.byteLength + CONFIG.byteLength);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(voices()?.tree()).toEqual([`${voice.id}/`, `${voice.id}/${voice.id}.onnx.json`, `${voice.id}/${voice.id}.onnx`]);
    const files = await readFilesFor(voice);
    expect(files?.model.size).toBe(MODEL.byteLength);
    expect(sha(new Uint8Array((await files?.config.arrayBuffer()) ?? new ArrayBuffer(0)))).toBe(sha(CONFIG));
  });

  it("refuses a tampered model and removes the folder", async () => {
    served["tiny.onnx"] = MODEL.map((b, i) => (i === 10 ? b ^ 1 : b));
    await expect(installFor(tinyVoice(), new AbortController().signal)).rejects.toThrow(/checksum/);
    expect(voices()?.tree()).toEqual([]);
  });

  it("refuses a download longer or shorter than the catalog says", async () => {
    served["tiny.onnx"] = new Uint8Array([...MODEL, 0]);
    await expect(installFor(tinyVoice(), new AbortController().signal)).rejects.toThrow(/wrong size/);
    served["tiny.onnx"] = MODEL.slice(1);
    await expect(installFor(tinyVoice(), new AbortController().signal)).rejects.toThrow(/wrong size/);
    expect(voices()?.tree()).toEqual([]);
  });

  it("fails on an HTTP error and keeps nothing", async () => {
    delete served["tiny.onnx"];
    await expect(installFor(tinyVoice(), new AbortController().signal)).rejects.toThrow(/404/);
    expect(await readFilesFor(tinyVoice())).toBeNull();
  });

  it("cancel mid-download rejects with AbortError and removes the partial voice", async () => {
    stallModel = true;
    const ctrl = new AbortController();
    let started!: () => void;
    const onFirst = new Promise<void>((r) => (started = r));
    // The config arrives whole; the model stalls after its first chunk.
    const run = installFor(tinyVoice(), ctrl.signal, (p) => {
      if (p.received > CONFIG.byteLength) started();
    });
    await onFirst;
    ctrl.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(voices()?.tree()).toEqual([]);
  });

  it("cancel while the model is being written still keeps nothing", async () => {
    const voice = tinyVoice();
    const ctrl = new AbortController();
    onClose = (name) => {
      if (name === `${voice.id}.onnx.part`) ctrl.abort();
    };
    await expect(installFor(voice, ctrl.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(voices()?.tree()).toEqual([]);
  });
});

describe("reading and removing", () => {
  it("reads T54's flat copy when the voice has no folder", async () => {
    const voice = tinyVoice();
    const dir = await root.getDirectoryHandle(VOICE_DIR, { create: true });
    (await dir.getFileHandle(`${voice.id}.onnx`, { create: true })).data = MODEL;
    (await dir.getFileHandle(`${voice.id}.onnx.json`, { create: true })).data = CONFIG;
    expect(await readFilesFor(voice)).not.toBeNull();
    // A file of the wrong size is not a voice.
    (await dir.getFileHandle(`${voice.id}.onnx`)).data = MODEL.slice(1);
    expect(await readFilesFor(voice)).toBeNull();
  });

  it("removeVoice clears the folder, the flat copy and stray .part files", async () => {
    const id = DEFAULT_VOICE;
    const dir = await root.getDirectoryHandle(VOICE_DIR, { create: true });
    const own = await dir.getDirectoryHandle(id, { create: true });
    await own.getFileHandle(`${id}.onnx`, { create: true });
    for (const name of [`${id}.onnx`, `${id}.onnx.json`, `${id}.onnx.part`]) await dir.getFileHandle(name, { create: true });
    await dir.getDirectoryHandle("other", { create: true });
    await removeVoice(id);
    expect(voices()?.tree()).toEqual(["other/"]);
  });

  it("hasPartial is true only for a folder that isn't a whole voice", async () => {
    const id = DEFAULT_VOICE;
    expect(await hasPartial(id)).toBe(false);
    const dir = await root.getDirectoryHandle(VOICE_DIR, { create: true });
    const own = await dir.getDirectoryHandle(id, { create: true });
    await own.getFileHandle(`${id}.onnx.json`, { create: true });
    expect(await hasPartial(id)).toBe(true);
  });
});

describe("CATALOG", () => {
  it("pins every voice to one revision, by id-shaped paths and full digests", () => {
    const ids = new Set<string>();
    for (const v of CATALOG) {
      expect(ids.has(v.id)).toBe(false);
      ids.add(v.id);
      const [lang, name, quality] = v.id.split("-");
      expect(v.lang).toBe(lang?.replace("_", "-"));
      expect(v.quality).toBe(quality);
      const dir = `${lang?.slice(0, 2) ?? ""}/${lang ?? ""}/${name ?? ""}/${quality ?? ""}`;
      expect(v.model.path).toBe(`${dir}/${v.id}.onnx`);
      expect(v.config.path).toBe(`${dir}/${v.id}.onnx.json`);
      expect(v.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(v.model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(v.config.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(v.model.size).toBeGreaterThan(10_000_000);
      expect(v.config.size).toBeLessThan(20_000);
      expect(v.licence.url).toMatch(/^https:\/\//);
    }
    expect(ids.has(DEFAULT_VOICE)).toBe(true);
  });

  it("flags every voice whose own data or base voice isn't cleared for commercial use", () => {
    for (const v of CATALOG) {
      const restricted = /research|NC/i.test(v.licence.terms) || v.licence.basedOn === "Lessac" || v.licence.basedOn === "Ryan";
      expect(v.licence.nonCommercial, v.id).toBe(restricted);
      if (v.licence.nonCommercial) expect(v.licence.note, v.id).toBeTruthy();
    }
  });

  it("keeps T54's lessac pins (the owner's device already holds it)", () => {
    const lessac = CATALOG.find((v) => v.id === "en_US-lessac-medium");
    expect(lessac?.revision).toBe("b4e358ffcb232591bf73a540e70f7de528e4174a");
    expect(lessac?.model).toEqual({
      path: "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
      size: 63_201_294,
      sha256: "5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f",
    });
    expect(lessac?.config.sha256).toBe("efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0");
  });
});
