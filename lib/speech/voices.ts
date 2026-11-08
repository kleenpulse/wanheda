// Piper voices (SPEC V45, V46): a pinned catalog and this device's copies in
// OPFS. Voice files come from Hugging Face at a pinned revision and are
// checked by size and sha256 before they're kept; everything after that is
// offline. A voice model is untrusted input: only the ONNX runtime reads it.
//
// Layout: `wanheda-voices/<voice-id>/<voice-id>.onnx{,.json}`. T54 kept files
// flat in `wanheda-voices/`; those are still read, and delete removes them.
// This module is light (no engine): the shell's island imports it.

export const VOICE_DIR = "wanheda-voices";
const HF_REPO = "rhasspy/piper-voices";
/** The piper-voices commit the whole catalog is pinned to (T53, T55). */
const REVISION = "b4e358ffcb232591bf73a540e70f7de528e4174a";

export type VoiceQuality = "x_low" | "low" | "medium" | "high";

export interface VoiceFile {
  /** Path in the Hugging Face repo. */
  path: string;
  size: number;
  /** Hex sha256 (the LFS oid for the model). */
  sha256: string;
}

/** From the voice's MODEL_CARD (V46): the voice manager shows it. */
export interface VoiceLicence {
  /** The recordings the voice was trained on. */
  dataset: string;
  /** The dataset's terms, as the card gives them. */
  terms: string;
  url: string;
  /** The voice it was fine-tuned from, whose terms may carry over. */
  basedOn?: string;
  /** Not cleared for commercial use: its own data's terms or its base voice's. Flagged in the manager. */
  nonCommercial: boolean;
  note?: string;
}

export interface CatalogVoice {
  id: string;
  name: string;
  /** BCP 47. */
  lang: string;
  quality: VoiceQuality;
  /** The piper-voices commit every file is pinned to. */
  revision: string;
  model: VoiceFile;
  config: VoiceFile;
  licence: VoiceLicence;
}

/**
 * Pinned voices: English (the phonemizer is English-only, ADR-0012) and one
 * speaker each. Every size and digest was checked against the revision's
 * files: the model's size and sha256 are its LFS size and oid; the config was
 * downloaded and hashed, and its git blob id and md5 matched the revision's.
 */
export const CATALOG: readonly CatalogVoice[] = [
  {
    id: "en_US-lessac-medium",
    name: "Lessac",
    lang: "en-US",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_US/lessac/medium/en_US-lessac-medium.onnx", size: 63_201_294, sha256: "5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f" },
    config: { path: "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json", size: 4_885, sha256: "efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0" },
    licence: { dataset: "Blizzard 2013 Lessac", terms: "Research only", url: "https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html", nonCommercial: true, note: "Research use only; not for voice synthesis products or services." },
  },
  {
    id: "en_US-lessac-high",
    name: "Lessac",
    lang: "en-US",
    quality: "high",
    revision: REVISION,
    model: { path: "en/en_US/lessac/high/en_US-lessac-high.onnx", size: 113_895_201, sha256: "4cabf7c3a638017137f34a1516522032d4fe3f38228a843cc9b764ddcbcd9e09" },
    config: { path: "en/en_US/lessac/high/en_US-lessac-high.onnx.json", size: 4_883, sha256: "db42b97d9859f257bc1561b8ed980e7fb2398402050a74ddd6cbec931a92412f" },
    licence: { dataset: "Blizzard 2013 Lessac", terms: "Research only", url: "https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html", nonCommercial: true, note: "Research use only; not for voice synthesis products or services." },
  },
  {
    // Left out at T55 (the card says only "License: See URL"); added on the owner's word (2026-11-08), flagged.
    id: "en_US-amy-medium",
    name: "Amy",
    lang: "en-US",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_US/amy/medium/en_US-amy-medium.onnx", size: 63_201_294, sha256: "b3a6e47b57b8c7fbe6a0ce2518161a50f59a9cdd8a50835c02cb02bdd6206c18" },
    config: { path: "en/en_US/amy/medium/en_US-amy-medium.onnx.json", size: 4_882, sha256: "95a23eb4d42909d38df73bb9ac7f45f597dbfcde2d1bf9526fdeaf5466977d77" },
    licence: { dataset: "Mimic 3 Amy", terms: "Not stated (the card says \"See URL\")", url: "https://github.com/MycroftAI/mimic3-voices", basedOn: "Lessac", nonCommercial: true, note: "Its data's terms aren't stated. Fine-tuned from Lessac, whose data is for research use only." },
  },
  {
    id: "en_US-ljspeech-medium",
    name: "LJ Speech",
    lang: "en-US",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx", size: 63_531_379, sha256: "6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22" },
    config: { path: "en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx.json", size: 4_972, sha256: "141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860" },
    licence: { dataset: "LJ Speech", terms: "Public domain", url: "https://keithito.com/LJ-Speech-Dataset/", nonCommercial: false },
  },
  {
    id: "en_US-ljspeech-high",
    name: "LJ Speech",
    lang: "en-US",
    quality: "high",
    revision: REVISION,
    model: { path: "en/en_US/ljspeech/high/en_US-ljspeech-high.onnx", size: 114_199_011, sha256: "5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a" },
    config: { path: "en/en_US/ljspeech/high/en_US-ljspeech-high.onnx.json", size: 4_970, sha256: "7e1f4634af596d83cca997fb7a931ba80b70f8a316a2655ee69c55365e0ace14" },
    licence: { dataset: "LJ Speech", terms: "Public domain", url: "https://keithito.com/LJ-Speech-Dataset/", nonCommercial: false },
  },
  {
    id: "en_US-kristin-medium",
    name: "Kristin",
    lang: "en-US",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_US/kristin/medium/en_US-kristin-medium.onnx", size: 63_531_379, sha256: "5849957f929cbf720c258f8458692d6103fff2f0e3d3b19c8259474bb06a18d4" },
    config: { path: "en/en_US/kristin/medium/en_US-kristin-medium.onnx.json", size: 4_968, sha256: "5681426d4aead22195de70531eeeeddb46493cfaffc5764b2ea3db73428b651c" },
    licence: { dataset: "LibriVox recordings", terms: "Public domain", url: "https://librivox.org", nonCommercial: false },
  },
  {
    id: "en_US-norman-medium",
    name: "Norman",
    lang: "en-US",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_US/norman/medium/en_US-norman-medium.onnx", size: 63_531_379, sha256: "b9739443232a80a59c7d18810dd856899bf16a7964725f5ab81ea49b1351cb71" },
    config: { path: "en/en_US/norman/medium/en_US-norman-medium.onnx.json", size: 4_968, sha256: "6c2db7f558a4a8deb9fe822583c1c5105f6c4e834dd0f9de8ad17a888ee9fe1d" },
    licence: { dataset: "LibriVox recordings", terms: "Public domain", url: "https://librivox.org", nonCommercial: false },
  },
  {
    id: "en_US-joe-medium",
    name: "Joe",
    lang: "en-US",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_US/joe/medium/en_US-joe-medium.onnx", size: 63_201_294, sha256: "58afce0321b8d9c46d7cdf9c16500cc55a793b4220212dba6b70fb788b3baf06" },
    config: { path: "en/en_US/joe/medium/en_US-joe-medium.onnx.json", size: 4_794, sha256: "3d6d5410b3795cb1950595247ef8f06190719e6fdbfa3a2356d8ec368e1aad33" },
    licence: { dataset: "OHF voice datasets", terms: "CC0", url: "https://github.com/OHF-Voice/voice-datasets", basedOn: "Lessac", nonCommercial: true, note: "Fine-tuned from Lessac, whose data is for research use only." },
  },
  {
    id: "en_US-kathleen-low",
    name: "Kathleen",
    lang: "en-US",
    quality: "low",
    revision: REVISION,
    model: { path: "en/en_US/kathleen/low/en_US-kathleen-low.onnx", size: 63_104_526, sha256: "87adf17f5326bc0782282147a8b9788406236245f0f9b0e68dacb651bc1de8b6" },
    config: { path: "en/en_US/kathleen/low/en_US-kathleen-low.onnx.json", size: 4_169, sha256: "39ebab88416edce0f63781754651788620cb97b9bb73ddf3c01f28e29a648feb" },
    licence: { dataset: "Kathleen", terms: "CC0", url: "https://github.com/rhasspy/dataset-voice-kathleen", basedOn: "Ryan", nonCommercial: true, note: "Fine-tuned from Ryan, whose data is for non-commercial use only." },
  },
  {
    id: "en_US-ryan-medium",
    name: "Ryan",
    lang: "en-US",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_US/ryan/medium/en_US-ryan-medium.onnx", size: 63_201_294, sha256: "abf4c274862564ed647ba0d2c47f8ee7c9b717d27bdad9219100eb310db4047a" },
    config: { path: "en/en_US/ryan/medium/en_US-ryan-medium.onnx.json", size: 4_883, sha256: "44034c056cb15681b2ad494307c7f3f2e4499d1253c700c711fa0a4607ffe78d" },
    licence: { dataset: "RyanSpeech", terms: "CC BY-NC-SA 4.0", url: "https://www.kaggle.com/datasets/roholazandie/ryanspeech", basedOn: "Lessac", nonCommercial: true, note: "Its data is for non-commercial use only. Fine-tuned from Lessac, whose data is for research use only." },
  },
  {
    id: "en_GB-alba-medium",
    name: "Alba",
    lang: "en-GB",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_GB/alba/medium/en_GB-alba-medium.onnx", size: 63_201_294, sha256: "401369c4a81d09fdd86c32c5c864440811dbdcc66466cde2d64f7133a66ad03b" },
    config: { path: "en/en_GB/alba/medium/en_GB-alba-medium.onnx.json", size: 4_888, sha256: "aa965a2f02ecced632c2694e1fc72bbff6d65f265fab567ca945918c73dd89f4" },
    licence: { dataset: "Edinburgh DataShare 10283/3270", terms: "CC BY 4.0", url: "https://datashare.ed.ac.uk/handle/10283/3270", basedOn: "Lessac", nonCommercial: true, note: "Fine-tuned from Lessac, whose data is for research use only." },
  },
  {
    id: "en_GB-cori-medium",
    name: "Cori",
    lang: "en-GB",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_GB/cori/medium/en_GB-cori-medium.onnx", size: 63_531_379, sha256: "1899f98e5fb8310154f3c2973f4b8a929ba7245e722b3d3a85680b833d95f10d" },
    config: { path: "en/en_GB/cori/medium/en_GB-cori-medium.onnx.json", size: 4_966, sha256: "e262c16d7f192f69d4edd6b4ef8a5915379e67495fcc402f1ab15eeb33da3d36" },
    licence: { dataset: "LibriVox recordings", terms: "Public domain", url: "https://librivox.org", nonCommercial: false },
  },
  {
    id: "en_GB-cori-high",
    name: "Cori",
    lang: "en-GB",
    quality: "high",
    revision: REVISION,
    model: { path: "en/en_GB/cori/high/en_GB-cori-high.onnx", size: 114_219_352, sha256: "470b4dd634c98f8a4850d7626ffc3dfc90774628eeef6605a6dd8f88f30a5903" },
    config: { path: "en/en_GB/cori/high/en_GB-cori-high.onnx.json", size: 4_963, sha256: "9e7fb5b5671612c22f3c81cbe46c1ae87b031a4632bcb509e499dad6f1e2adec" },
    licence: { dataset: "LibriVox recordings", terms: "Public domain", url: "https://librivox.org", nonCommercial: false },
  },
  {
    id: "en_GB-northern_english_male-medium",
    name: "Northern English male",
    lang: "en-GB",
    quality: "medium",
    revision: REVISION,
    model: { path: "en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx", size: 63_201_294, sha256: "57a219ae8e638873db7d18893304be5069c42868f392bb95c3ff17f0690d0689" },
    config: { path: "en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx.json", size: 4_847, sha256: "69557ed3d974463453e9b0c09dd99a7ed0e52b8b87b64b357dbeeb2540a97d47" },
    licence: { dataset: "OpenSLR 83, British Isles accents", terms: "CC BY-SA 4.0", url: "https://www.openslr.org/83/", basedOn: "Lessac", nonCommercial: true, note: "Fine-tuned from Lessac, whose data is for research use only." },
  },
  {
    id: "en_GB-southern_english_female-low",
    name: "Southern English female",
    lang: "en-GB",
    quality: "low",
    revision: REVISION,
    model: { path: "en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx", size: 63_104_526, sha256: "f2f37aed1b3a093476f719d1379ba0c0b1b1cf6f1ef99288e2ebf502971a07c3" },
    config: { path: "en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx.json", size: 4_189, sha256: "a1af43310f8756161506e849a2863d342a98b0853af9e2437581d39e9922d0e5" },
    licence: { dataset: "OpenSLR 83, British Isles accents", terms: "CC BY-SA 4.0", url: "https://www.openslr.org/83/", basedOn: "Ryan", nonCommercial: true, note: "Fine-tuned from Ryan, whose data is for non-commercial use only." },
  },
];

export const DEFAULT_VOICE = "en_US-lessac-medium";

export function catalogVoice(id: string): CatalogVoice | null {
  return CATALOG.find((v) => v.id === id) ?? null;
}

/** Bytes a voice takes on the device. */
export const voiceSize = (v: CatalogVoice) => v.model.size + v.config.size;

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

async function subdir(dir: FileSystemDirectoryHandle, name: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await dir.getDirectoryHandle(name, { create });
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

async function filesIn(dir: FileSystemDirectoryHandle, voice: CatalogVoice): Promise<{ model: File; config: File } | null> {
  const [model, config] = await Promise.all([fileOf(dir, modelName(voice.id)), fileOf(dir, configName(voice.id))]);
  if (model?.size !== voice.model.size || config?.size !== voice.config.size) return null;
  return { model, config };
}

/** A voice's model and config on this device, or null when either is missing or isn't the size the catalog pins. */
export async function readVoiceFiles(id: string): Promise<{ model: File; config: File } | null> {
  const voice = catalogVoice(id);
  return voice ? readFilesFor(voice) : null;
}

/** `readVoiceFiles` for a voice record (tests use small ones). Its own folder first, then T54's flat copy. */
export async function readFilesFor(voice: CatalogVoice): Promise<{ model: File; config: File } | null> {
  const root = await voiceDir(false);
  if (!root) return null;
  const own = await subdir(root, voice.id, false);
  return (own && (await filesIn(own, voice))) ?? (await filesIn(root, voice));
}

export async function isInstalled(id: string): Promise<boolean> {
  return (await readVoiceFiles(id)) !== null;
}

/** The catalog voices on this device, in catalog order. */
export async function installedVoices(): Promise<string[]> {
  const here = await Promise.all(CATALOG.map(async (v) => ((await isInstalled(v.id)) ? v.id : null)));
  return here.filter((id) => id !== null);
}

/** True when the voice has a folder that isn't a whole install: a download cut short (closed tab, crash). */
export async function hasPartial(id: string): Promise<boolean> {
  const voice = catalogVoice(id);
  const root = voice ? await voiceDir(false) : null;
  const own = root ? await subdir(root, id, false) : null;
  return own !== null && voice !== null && (await filesIn(own, voice)) === null;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Downloads one file into memory, reporting bytes as they arrive, then checks its size and sha256. */
async function fetchChecked(voice: CatalogVoice, file: VoiceFile, signal: AbortSignal, onBytes: (n: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(hfUrl(voice, file), { signal, credentials: "omit" });
  if (!res.ok) throw new Error(`voice download failed: ${String(res.status)}`);
  const bytes = new Uint8Array(file.size);
  let at = 0;
  const take = (chunk: Uint8Array) => {
    if (at + chunk.byteLength > file.size) throw new Error("voice download has the wrong size");
    bytes.set(chunk, at);
    at += chunk.byteLength;
    onBytes(chunk.byteLength);
  };
  if (res.body) {
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        take(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    }
  } else {
    take(new Uint8Array(await res.arrayBuffer()));
  }
  if (at !== file.size) throw new Error("voice download has the wrong size");
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== file.sha256) throw new Error("voice download failed its checksum");
  signal.throwIfAborted();
  return bytes;
}

type MovableHandle = FileSystemFileHandle & { move?: (name: string) => Promise<void> };

/** Writes checked bytes as `<name>.part` and renames it into place. */
async function keep(dir: FileSystemDirectoryHandle, name: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
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

export interface InstallProgress {
  received: number;
  total: number;
}

/**
 * Puts a catalog voice on this device. Both files are downloaded and checked
 * before anything is kept; the config is kept first and the model last, so an
 * interrupted install never reads as installed. On failure or abort the
 * voice's folder is removed (V46: cancel ⇒ partial removed).
 */
export async function installVoice(id: string, signal: AbortSignal, onProgress?: (p: InstallProgress) => void): Promise<void> {
  const voice = catalogVoice(id);
  if (!voice) throw new Error(`unknown voice ${id}`);
  await installFor(voice, signal, onProgress);
}

/** `installVoice` for a voice record (tests use small ones). */
export async function installFor(voice: CatalogVoice, signal: AbortSignal, onProgress?: (p: InstallProgress) => void): Promise<void> {
  const { id } = voice;
  const root = await voiceDir(true);
  if (!root) throw new Error("this browser can't keep files (no OPFS)");
  const total = voiceSize(voice);
  let received = 0;
  const onBytes = (n: number) => {
    received += n;
    onProgress?.({ received, total });
  };
  try {
    const config = await fetchChecked(voice, voice.config, signal, onBytes);
    const model = await fetchChecked(voice, voice.model, signal, onBytes);
    const dir = await root.getDirectoryHandle(id, { create: true });
    await keep(dir, configName(id), config);
    signal.throwIfAborted();
    await keep(dir, modelName(id), model);
    // Cancelled while the model was being written: the owner said no, so it isn't kept.
    signal.throwIfAborted();
  } catch (error) {
    await root.removeEntry(id, { recursive: true }).catch(() => undefined);
    throw error;
  }
}

/** Removes a voice from this device: its folder, and T54's flat copy if that's what it is. */
export async function removeVoice(id: string): Promise<void> {
  if (!catalogVoice(id)) return;
  const root = await voiceDir(false);
  if (!root) return;
  await Promise.all([
    root.removeEntry(id, { recursive: true }),
    root.removeEntry(modelName(id)),
    root.removeEntry(configName(id)),
    root.removeEntry(`${modelName(id)}.part`),
    root.removeEntry(`${configName(id)}.part`),
  ].map((p) => p.catch(() => undefined)));
}
