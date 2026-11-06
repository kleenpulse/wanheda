// Piper voices (SPEC V45, V46): a pinned catalog and this device's copies in
// OPFS. Voice files come from Hugging Face at a pinned revision and are
// checked by size and sha256 before they're kept; everything after that is
// offline. A voice model is untrusted input: only the ONNX runtime reads it.
//
// T54 holds the core only: the catalog's first voice, reading it back, and a
// verified install. The voice manager (filters, progress, cancel, delete,
// licence view, default voice) is T55.

export const VOICE_DIR = "wanheda-voices";
const HF_REPO = "rhasspy/piper-voices";

export interface VoiceFile {
  /** Path in the Hugging Face repo. */
  path: string;
  size: number;
  /** Hex sha256 (the LFS oid for the model). */
  sha256: string;
}

export interface CatalogVoice {
  id: string;
  name: string;
  /** BCP 47. */
  lang: string;
  quality: "x_low" | "low" | "medium" | "high";
  /** The piper-voices commit every file is pinned to. */
  revision: string;
  model: VoiceFile;
  config: VoiceFile;
  /** From the voice's MODEL_CARD: the voice manager shows it (V46). */
  licence: { dataset: string; url: string; note: string };
}

/** Pinned voices. Each entry's sizes and digests were checked against the revision's files (T53, T54). */
export const CATALOG: readonly CatalogVoice[] = [
  {
    id: "en_US-lessac-medium",
    name: "Lessac",
    lang: "en-US",
    quality: "medium",
    revision: "b4e358ffcb232591bf73a540e70f7de528e4174a",
    model: {
      path: "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
      size: 63_201_294,
      sha256: "5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f",
    },
    config: {
      path: "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
      size: 4_885,
      sha256: "efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0",
    },
    licence: {
      dataset: "Blizzard 2013 Lessac",
      url: "https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html",
      note: "Research use only; not for voice synthesis products or services.",
    },
  },
];

export const DEFAULT_VOICE = "en_US-lessac-medium";

export function catalogVoice(id: string): CatalogVoice | null {
  return CATALOG.find((v) => v.id === id) ?? null;
}

export const modelName = (id: string) => `${id}.onnx`;
export const configName = (id: string) => `${id}.onnx.json`;

function hfUrl(voice: CatalogVoice, file: VoiceFile): string {
  return `https://huggingface.co/${HF_REPO}/resolve/${voice.revision}/${file.path}`;
}

/** The voice folder, or null (no OPFS here, or nothing kept yet and `create` is false). Works in a worker too. */
export async function voiceDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === "undefined" || typeof navigator.storage?.getDirectory !== "function") return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(VOICE_DIR, { create });
  } catch {
    return null;
  }
}

async function fileOf(dir: FileSystemDirectoryHandle, name: string): Promise<File | null> {
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

/** A voice's model and config on this device, or null when either is missing or isn't the size the catalog pins. */
export async function readVoiceFiles(id: string): Promise<{ model: File; config: File } | null> {
  const voice = catalogVoice(id);
  const dir = voice ? await voiceDir(false) : null;
  if (!voice || !dir) return null;
  const [model, config] = await Promise.all([fileOf(dir, modelName(id)), fileOf(dir, configName(id))]);
  if (model?.size !== voice.model.size || config?.size !== voice.config.size) return null;
  return { model, config };
}

export async function isInstalled(id: string): Promise<boolean> {
  return (await readVoiceFiles(id)) !== null;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

type MovableHandle = FileSystemFileHandle & { move?: (name: string) => Promise<void> };

/** Downloads one file, checks its size and sha256, writes `<name>.part` and renames it into place. */
async function installFile(dir: FileSystemDirectoryHandle, voice: CatalogVoice, file: VoiceFile, name: string, signal: AbortSignal): Promise<void> {
  const res = await fetch(hfUrl(voice, file), { signal, credentials: "omit" });
  if (!res.ok) throw new Error(`voice download failed: ${String(res.status)}`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength !== file.size) throw new Error("voice download has the wrong size");
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== file.sha256) throw new Error("voice download failed its checksum");
  signal.throwIfAborted();
  const part = (await dir.getFileHandle(`${name}.part`, { create: true })) as MovableHandle;
  const out = await part.createWritable();
  try {
    await out.write(bytes);
    await out.close();
  } catch (error) {
    await out.abort().catch(() => undefined);
    throw error;
  }
  if (part.move) {
    await part.move(name);
    return;
  }
  // No rename here: write the checked bytes under the real name. A copy cut short reads as missing (size check).
  const final = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await final.write(bytes);
  await final.close();
  await dir.removeEntry(`${name}.part`).catch(() => undefined);
}

/** Puts a catalog voice on this device: config first, model last, so an interrupted install never reads as installed. */
export async function installVoice(id: string, signal: AbortSignal): Promise<void> {
  const voice = catalogVoice(id);
  if (!voice) throw new Error(`unknown voice ${id}`);
  const dir = await voiceDir(true);
  if (!dir) throw new Error("this browser can't keep files (no OPFS)");
  await installFile(dir, voice, voice.config, configName(id), signal);
  await installFile(dir, voice, voice.model, modelName(id), signal);
}
