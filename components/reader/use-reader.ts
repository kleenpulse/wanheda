"use client";

import * as React from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { createDocument, deleteCollection, deleteDocument, saveCollection, updateDocument } from "@/actions/reader";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { useHydrated } from "@/hooks/use-hydrated";
import { fetchJson } from "@/lib/fetch-json";
import { askToPersist, hashFile, listDeviceFiles, readDeviceFile, removeDeviceFile, type DeviceFiles } from "@/lib/reader/device";
import {
  READER_KEY,
  checkFile,
  defaultModeFor,
  titleFromFileName,
  upsertCollection,
  upsertDoc,
  type Collection,
  type DocumentPatch,
  type ReaderDoc,
  type ReaderPayload,
} from "@/lib/reader/reader";
import { forgetCover, hasCover, keepCover } from "./covers";
import { forgetDoc } from "./doc-cache";
import { usePendingProgress, withPending } from "./reader-runtime";

// The reader cache (V24): /reader and Home's "Continue reading" read one
// TanStack Query entry, filled by the page's Prefetch, /api/reader, or the
// device's last copy. Writes show at once and are sent after; a failed one
// is put back and said. Deletes wait for their undo toast to run out.
// File bytes stay on this device (V38): OPFS for the owner, this tab's memory
// for demo.

export const DEVICE_KEY = ["reader-device"] as const;

/** Demo's files: this tab only, never stored (G4). */
const demoFiles = new Map<string, File>();

/** Documents and collections hidden by a running undo toast. */
const useHidden = create<{ ids: ReadonlySet<string>; hide: (id: string) => void; show: (id: string) => void }>((set) => ({
  ids: new Set(),
  hide: (id) => {
    set((s) => ({ ids: new Set([...s.ids, id]) }));
  },
  show: (id) => {
    set((s) => ({ ids: new Set([...s.ids].filter((x) => x !== id)) }));
  },
}));

/** The library, or null before the first load: unconfirmed positions laid over, undo-hidden rows left out. */
export function useReader(options: { enabled?: boolean } = {}) {
  const demo = useAccount().kind !== "owner";
  const query = useQuery({
    queryKey: READER_KEY,
    queryFn: () => fetchJson<ReaderPayload>("/api/reader"),
    staleTime: demo ? Infinity : 30_000,
    enabled: options.enabled ?? true,
  });
  const pending = usePendingProgress((s) => s.byDoc);
  const hidden = useHidden((s) => s.ids);
  // A sibling Prefetch may fill the cache before this view's hydration pass (B15).
  const hydrated = useHydrated();
  const raw = hydrated ? (query.data ?? null) : null;
  const data = React.useMemo(() => {
    if (!raw) return null;
    const laid = withPending(raw, pending);
    if (hidden.size === 0) return laid;
    return {
      ...laid,
      documents: laid.documents.filter((d) => !hidden.has(d.id)),
      collections: laid.collections.filter((c) => !hidden.has(c.id)),
    };
  }, [raw, pending, hidden]);
  return { data, failed: hydrated && query.isError && !query.data, refetch: query.refetch };
}

/** What this device holds, by sha256; null until read. Demo: samples and this tab's files. */
export function useDeviceFiles(): DeviceFiles | null {
  const demo = useAccount().kind !== "owner";
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: [...DEVICE_KEY, demo ? "demo" : "owner"],
    queryFn: async (): Promise<DeviceFiles> =>
      demo ? { available: true, files: new Map([...demoFiles].map(([sha, f]) => [sha, f.size])) } : listDeviceFiles(),
    staleTime: Infinity,
    enabled: hydrated,
  });
  return query.data ?? null;
}

/** Whether a document can be read here: its bytes are on this device, or it's a demo sample. */
export function onDevice(doc: ReaderDoc, device: DeviceFiles | null): boolean | null {
  if (doc.sample !== undefined) return true;
  if (!device) return null;
  return device.files.get(doc.sha256) === doc.sizeBytes;
}

/** The document's bytes on this device, or null. */
export async function readDocFile(doc: ReaderDoc, demo: boolean): Promise<File | null> {
  if (doc.sample !== undefined) return new File([doc.sample], doc.fileName, { type: doc.kind === "md" ? "text/markdown" : "text/plain" });
  if (demo) return demoFiles.get(doc.sha256) ?? null;
  return readDeviceFile(doc.sha256, doc.sizeBytes);
}

const REASON: Record<string, string> = {
  kind: "Only PDF, Markdown and text files open here.",
  unsupported: "EPUB arrives in a later update.",
  empty: "The file is empty.",
  "too-big": "It's over the size limit (200 MB for PDF, 5 MB for text).",
};

function refreshDevice(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: DEVICE_KEY });
}

function storeWarning(error: "unavailable" | "quota" | "failed" | null) {
  if (!error) return;
  toast({
    title: "Not kept on this device",
    body:
      error === "quota"
        ? "This browser is out of storage space. It's in your library; open it again once there's room."
        : "This browser won't keep files here (a private window?). It's in your library; open it again in a normal window.",
  });
}

/**
 * Reads a PDF just added, in the background and once: its page-one cover
 * (T47, unless this device has one) and its page count (T49). pdf.js loads
 * only now, on the first PDF added, so the library itself never pulls it in.
 */
function readNewPdf(sha256: string, file: File, demo: boolean): Promise<number | null> {
  return (async () => {
    const withCover = !(await hasCover(sha256, demo));
    const { pdfFactsOfFile } = await import("./pdf/engine");
    const facts = await pdfFactsOfFile(file, withCover);
    if (facts.cover) await keepCover(sha256, facts.cover, demo);
    return facts.pages;
  })().catch(() => null);
}

export function useReaderApi() {
  const qc = useQueryClient();
  const demo = useAccount().kind !== "owner";

  const patchCache = React.useCallback(
    (fn: (p: ReaderPayload) => ReaderPayload) => {
      qc.setQueryData<ReaderPayload>(READER_KEY, (p) => (p ? fn(p) : p));
    },
    [qc],
  );

  /**
   * A PDF's page count, read on this device (T49): in the cache at once, then
   * saved quietly. A failed save says nothing: the next open reads it again.
   */
  const setPages = React.useCallback(
    (id: string, pages: number) => {
      const doc = qc.getQueryData<ReaderPayload>(READER_KEY)?.documents.find((d) => d.id === id);
      if (!doc || doc.pages === pages) return;
      void qc.cancelQueries({ queryKey: READER_KEY });
      patchCache((p) => ({ ...p, documents: p.documents.map((d) => (d.id === id ? { ...d, pages } : d)) }));
      if (demo) return;
      void updateDocument({ id, pages }).then(
        (r) => {
          if (r.ok) patchCache((p) => upsertDoc(p, r.doc));
        },
        () => undefined,
      );
    },
    [qc, demo, patchCache],
  );

  /**
   * Adds picked files (V39): each is hashed and kept on this device in the
   * worker, then joins the library by its hash. A file already in the library
   * (added on another device, or before) links to that entry instead.
   * Resolves with the documents, in order, for the caller to open.
   */
  const addFiles = React.useCallback(
    async (files: readonly File[]): Promise<ReaderDoc[]> => {
      const added: ReaderDoc[] = [];
      if (!demo) askToPersist();
      for (const file of files) {
        const check = checkFile(file.name, file.type, file.size);
        if (!check.ok) {
          toast({ title: `Can't add ${file.name}`, body: REASON[check.reason] ?? "" });
          continue;
        }
        const hashed = await hashFile(file, !demo);
        if (!hashed.ok) {
          toast({ title: `Couldn't read ${file.name}`, body: "The file reader stopped. Try the file again." });
          continue;
        }
        if (demo) demoFiles.set(hashed.sha256, file);
        else storeWarning(hashed.storeError);
        refreshDevice(qc);
        const pagesRead = check.kind === "pdf" ? readNewPdf(hashed.sha256, file, demo) : null;
        const keepPages = (id: string) => {
          void pagesRead?.then((n) => {
            if (n !== null) setPages(id, n);
          });
        };

        const known = qc.getQueryData<ReaderPayload>(READER_KEY)?.documents.find((d) => d.sha256 === hashed.sha256);
        if (known) {
          toast({ title: `${known.title} is already in your library`, ...(hashed.stored || demo ? { body: "It's on this device now." } : {}) });
          added.push(known);
          keepPages(known.id);
          continue;
        }

        const doc: ReaderDoc = {
          id: crypto.randomUUID(),
          kind: check.kind,
          title: titleFromFileName(file.name),
          author: null,
          fileName: file.name.slice(0, 255),
          sha256: hashed.sha256,
          sizeBytes: hashed.size,
          pages: null,
          tags: [],
          mode: defaultModeFor(check.kind),
          collections: [],
          progress: null,
          lastOpenedAt: null,
          createdAt: Date.now(),
        };
        void qc.cancelQueries({ queryKey: READER_KEY });
        patchCache((p) => upsertDoc(p, doc));
        added.push(doc);
        if (demo) {
          keepPages(doc.id);
          continue;
        }

        const drop = () => {
          patchCache((p) => ({ ...p, documents: p.documents.filter((d) => d.id !== doc.id) }));
        };
        const r = await createDocument({
          id: doc.id,
          kind: doc.kind,
          title: doc.title,
          author: null,
          fileName: doc.fileName,
          sha256: doc.sha256,
          sizeBytes: doc.sizeBytes,
          pages: null,
          tags: [],
        }).catch(() => null);
        if (r?.ok) {
          // `existing`: another device added the same file first; that row wins.
          if (r.existing) drop();
          patchCache((p) => upsertDoc(p, r.doc));
          added[added.length - 1] = r.doc;
          keepPages(r.doc.id);
        } else {
          drop();
          added.pop();
          toast({
            title: `Couldn't add ${doc.title}`,
            body: r ? "The server didn't take it. Try again." : "You may be offline. It's kept on this device; add it again when you're back.",
          });
        }
      }
      return added;
    },
    [qc, demo, patchCache, setPages],
  );

  /**
   * "Not on this device": the owner picks the file again. The same bytes
   * (same sha256) are kept and the entry opens where it was left (V39, V41).
   * Different bytes keep nothing and say so, with a way to add them instead.
   */
  const relink = React.useCallback(
    async (doc: ReaderDoc, file: File): Promise<boolean> => {
      const hashed = await hashFile(file, !demo, doc.sha256);
      if (!hashed.ok) {
        toast({ title: `Couldn't read ${file.name}`, body: "The file reader stopped. Try the file again." });
        return false;
      }
      if (hashed.sha256 !== doc.sha256) {
        toast({
          title: "That's a different file",
          body: `It doesn't match ${doc.title}${doc.fileName ? ` (${doc.fileName})` : ""}.`,
          action: {
            label: "Add it instead",
            onClick: () => {
              void addFiles([file]);
            },
          },
        });
        return false;
      }
      if (demo) demoFiles.set(hashed.sha256, file);
      else if (!hashed.stored) {
        storeWarning(hashed.storeError ?? "failed");
        return false;
      }
      refreshDevice(qc);
      return true;
    },
    [qc, demo, addFiles],
  );

  const update = React.useCallback(
    (patch: DocumentPatch) => {
      const before = qc.getQueryData<ReaderPayload>(READER_KEY)?.documents.find((d) => d.id === patch.id);
      if (!before) return;
      const after: ReaderDoc = {
        ...before,
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.author === undefined ? {} : { author: patch.author || null }),
        ...(patch.tags === undefined ? {} : { tags: patch.tags }),
        ...(patch.mode === undefined ? {} : { mode: patch.mode }),
        ...(patch.pages === undefined ? {} : { pages: patch.pages }),
        ...(patch.collections === undefined ? {} : { collections: [...new Set(patch.collections)].sort() }),
      };
      void qc.cancelQueries({ queryKey: READER_KEY });
      patchCache((p) => upsertDoc(p, after));
      if (demo) return;
      void updateDocument(patch).then(
        (r) => {
          if (r.ok) {
            patchCache((p) => upsertDoc(p, r.doc));
            return;
          }
          if (r.reason === "gone") {
            patchCache((p) => ({ ...p, documents: p.documents.filter((d) => d.id !== patch.id) }));
            toast({ title: "That document was deleted on another device" });
            return;
          }
          patchCache((p) => upsertDoc(p, before));
          toast({ title: "Couldn't save the changes", body: "The server didn't take them. Try again." });
        },
        () => {
          patchCache((p) => upsertDoc(p, before));
          toast({ title: "Couldn't save the changes", body: "You may be offline. Try again." });
        },
      );
    },
    [qc, demo, patchCache],
  );

  /** Deletes on expiry of the undo toast only; × and Undo both cancel (user 2026-11-05). */
  const remove = React.useCallback(
    (doc: ReaderDoc) => {
      const { hide, show } = useHidden.getState();
      hide(doc.id);
      const cancel = () => {
        show(doc.id);
      };
      toast({
        id: `undo-delete-doc:${doc.id}`,
        title: `Deleted ${doc.title}`,
        body: "From your library and this device.",
        action: { label: "Undo", onClick: cancel },
        onClose: cancel,
        closeLabel: "Cancel delete",
        onExpire: () => {
          const drop = () => {
            patchCache((p) => ({ ...p, documents: p.documents.filter((d) => d.id !== doc.id) }));
            show(doc.id);
            // Another entry may share the bytes only if it's the same doc: the hash is unique per user.
            forgetCover(doc.sha256);
            forgetDoc(doc.sha256);
            if (demo) demoFiles.delete(doc.sha256);
            else void removeDeviceFile(doc.sha256).then(() => { refreshDevice(qc); });
          };
          if (demo) {
            drop();
            return;
          }
          void deleteDocument({ id: doc.id }).then(
            (r) => {
              if (r.ok) drop();
              else {
                show(doc.id);
                toast({ title: `Couldn't delete ${doc.title}`, body: "It's back in the library. Try again." });
              }
            },
            () => {
              show(doc.id);
              toast({ title: `Couldn't delete ${doc.title}`, body: "You may be offline. It's back in the library." });
            },
          );
        },
      });
    },
    [qc, demo, patchCache],
  );

  /** Creates or renames a collection. Resolves with it, or null when it was refused. */
  const saveCollectionWith = React.useCallback(
    async (c: Collection): Promise<Collection | null> => {
      const before = qc.getQueryData<ReaderPayload>(READER_KEY)?.collections.find((x) => x.id === c.id) ?? null;
      const taken = qc.getQueryData<ReaderPayload>(READER_KEY)?.collections.some((x) => x.id !== c.id && x.name.toLowerCase() === c.name.toLowerCase());
      if (taken) {
        toast({ title: `There's already a collection called ${c.name}` });
        return null;
      }
      patchCache((p) => upsertCollection(p, c));
      if (demo) return c;
      const undo = () => {
        patchCache((p) => (before ? upsertCollection(p, before) : { ...p, collections: p.collections.filter((x) => x.id !== c.id) }));
      };
      const r = await saveCollection(c).catch(() => null);
      if (r?.ok) {
        patchCache((p) => upsertCollection(p, r.collection));
        return r.collection;
      }
      undo();
      toast({
        title: "Couldn't save the collection",
        body: r?.ok === false && r.reason === "taken" ? `There's already one called ${c.name}.` : r ? "The server didn't take it. Try again." : "You may be offline. Try again.",
      });
      return null;
    },
    [qc, demo, patchCache],
  );

  const removeCollection = React.useCallback(
    (c: Collection) => {
      const { hide, show } = useHidden.getState();
      hide(c.id);
      const cancel = () => {
        show(c.id);
      };
      toast({
        id: `undo-delete-collection:${c.id}`,
        title: `Deleted the collection ${c.name}`,
        body: "Its documents stay in your library.",
        action: { label: "Undo", onClick: cancel },
        onClose: cancel,
        closeLabel: "Cancel delete",
        onExpire: () => {
          const drop = () => {
            patchCache((p) => ({
              ...p,
              collections: p.collections.filter((x) => x.id !== c.id),
              documents: p.documents.map((d) => (d.collections.includes(c.id) ? { ...d, collections: d.collections.filter((x) => x !== c.id) } : d)),
            }));
            show(c.id);
          };
          if (demo) {
            drop();
            return;
          }
          void deleteCollection({ id: c.id }).then(
            (r) => {
              if (r.ok) drop();
              else {
                show(c.id);
                toast({ title: "Couldn't delete the collection", body: "It's back. Try again." });
              }
            },
            () => {
              show(c.id);
              toast({ title: "Couldn't delete the collection", body: "You may be offline. It's back." });
            },
          );
        },
      });
    },
    [demo, patchCache],
  );

  return { addFiles, relink, update, setPages, remove, saveCollection: saveCollectionWith, removeCollection };
}
