// Pictures kept in this device's OPFS (V58 covers, T72 video thumbnails):
// one file per key, read once into an object URL for the tab. Only a found
// picture is remembered: a miss is asked again next time (a thumbnail made
// after the first look must still show), and a write tells every reader.

export const THUMBS_DIR = "media-thumbs";

const EXTS = ["webp", "png", "jpg"] as const;

/** The file extension for a picture's MIME type (whatever the encoder really gave). */
export function extFor(type: string): (typeof EXTS)[number] {
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  return "webp";
}

/**
 * A cache of found URLs only. `load` resolves the URL or null; a null is never
 * kept, so the next `get` asks again. Pure (the loader is injected) for its test.
 */
export function createImageCache(load: (dir: string, key: string) => Promise<string | null>) {
  const found = new Map<string, Promise<string | null>>();
  const id = (dir: string, key: string) => `${dir}/${key}`;
  return {
    get(dir: string, key: string): Promise<string | null> {
      const k = id(dir, key);
      const known = found.get(k);
      if (known) return known;
      const p = load(dir, key).then((url) => {
        if (url === null) found.delete(k);
        return url;
      });
      found.set(k, p);
      return p;
    },
    /** Forgets a key (rewritten or removed): its old URL is revoked once read. */
    drop(dir: string, key: string, revoke: (url: string) => void): void {
      const k = id(dir, key);
      const p = found.get(k);
      found.delete(k);
      void p?.then((url) => {
        if (url) revoke(url);
      });
    },
  };
}

async function folder(dir: string, create = false): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(dir, { create });
}

async function loadUrl(dir: string, key: string): Promise<string | null> {
  try {
    const d = await folder(dir);
    for (const ext of EXTS) {
      try {
        const file = await (await d.getFileHandle(`${key}.${ext}`)).getFile();
        return URL.createObjectURL(file);
      } catch {
        // Not this extension.
      }
    }
    return null;
  } catch {
    return null;
  }
}

const cache = createImageCache(loadUrl);
const EVENT = "wanheda:opfs-image";

/** The picture's object URL, or null when there is none (yet). */
export function opfsImageUrl(dir: string, key: string): Promise<string | null> {
  return cache.get(dir, key);
}

/** Saves a picture under `key`, replacing any other format of it, and tells the readers. */
export async function writeOpfsImage(dir: string, key: string, blob: Blob): Promise<void> {
  const d = await folder(dir, true);
  const ext = extFor(blob.type);
  for (const other of EXTS) if (other !== ext) await d.removeEntry(`${key}.${other}`).catch(() => undefined);
  const w = await (await d.getFileHandle(`${key}.${ext}`, { create: true })).createWritable();
  await w.write(blob);
  await w.close();
  changed(dir, key);
}

export async function removeOpfsImage(dir: string, key: string): Promise<void> {
  try {
    const d = await folder(dir);
    for (const ext of EXTS) await d.removeEntry(`${key}.${ext}`).catch(() => undefined);
  } catch {
    // No folder: nothing to remove.
  }
  changed(dir, key);
}

function changed(dir: string, key: string): void {
  cache.drop(dir, key, (url) => {
    URL.revokeObjectURL(url);
  });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { dir, key } }));
}

/** Calls `listener` when the picture at `dir/key` is written or removed. */
export function onOpfsImage(dir: string, key: string, listener: () => void): () => void {
  const fn = (e: Event) => {
    const d = (e as CustomEvent<{ dir: string; key: string }>).detail;
    if (d.dir === dir && d.key === key) listener();
  };
  window.addEventListener(EVENT, fn);
  return () => {
    window.removeEventListener(EVENT, fn);
  };
}

/** A thumbnail's key: the sha256 of the item's fp (an fp may be a URL or `youtube:<id>`). */
export async function thumbKey(fp: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fp));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
