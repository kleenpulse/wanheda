"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { addMediaItem, deleteMediaItem } from "@/actions/media";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { useHydrated } from "@/hooks/use-hydrated";
import { fetchJson } from "@/lib/fetch-json";
import { forgetFile, keepHandle, rememberFile } from "@/lib/media/local";
import { MEDIA_KEY, TITLE_MAX, upsertItem, type MediaPayload } from "@/lib/media/media";
import type { MediaItem, MediaItemInput } from "@/lib/media/types";
import { parseMediaUrl } from "@/lib/media/url";

// The media cache (V24): /media reads one TanStack Query entry, filled by the
// page's Prefetch or /api/media. Writes show at once and are sent after; a
// failed one is put back and said. Deletes wait for their undo toast.

const useHidden = create<{ ids: ReadonlySet<string>; hide: (id: string) => void; show: (id: string) => void }>((set) => ({
  ids: new Set(),
  hide: (id) => {
    set((s) => ({ ids: new Set([...s.ids, id]) }));
  },
  show: (id) => {
    set((s) => ({ ids: new Set([...s.ids].filter((x) => x !== id)) }));
  },
}));

export function useMedia(options: { enabled?: boolean } = {}) {
  const demo = useAccount().kind !== "owner";
  const query = useQuery({
    queryKey: MEDIA_KEY,
    queryFn: () => fetchJson<MediaPayload>("/api/media"),
    staleTime: demo ? Infinity : 30_000,
    enabled: options.enabled ?? true,
  });
  const hidden = useHidden((s) => s.ids);
  // A sibling Prefetch may fill the cache before this view's hydration pass (B15).
  const hydrated = useHydrated();
  const raw = hydrated ? (query.data ?? null) : null;
  const data = React.useMemo(() => {
    if (!raw || hidden.size === 0) return raw;
    return { ...raw, items: raw.items.filter((i) => !hidden.has(i.id)) };
  }, [raw, hidden]);
  return { data, failed: hydrated && query.isError && !query.data, refetch: query.refetch };
}

export function titleFromName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "").trim();
  return (base || name).slice(0, TITLE_MAX);
}

/** Fingerprint + probe in a short-lived worker; the player opens its own. */
async function identify(file: File) {
  // Loaded on use, so the palette (in the shell) never carries the engine (V62).
  const { MediaEngine } = await import("@/lib/platform/media");
  const engine = new MediaEngine();
  try {
    return await engine.open(file);
  } finally {
    engine.close();
  }
}

export function useMediaApi() {
  const qc = useQueryClient();
  const demo = useAccount().kind !== "owner";

  const patchCache = React.useCallback(
    (fn: (p: MediaPayload) => MediaPayload) => {
      qc.setQueryData<MediaPayload>(MEDIA_KEY, (p) => (p ? fn(p) : p));
    },
    [qc],
  );

  /** Adds optimistically; resolves with the item the library ends up holding, or null. */
  const save = React.useCallback(
    async (input: MediaItemInput): Promise<MediaItem | null> => {
      const known = qc.getQueryData<MediaPayload>(MEDIA_KEY)?.items.find((i) => i.fp === input.fp);
      if (known) return known;
      const now = new Date().toISOString();
      const item: MediaItem = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
      void qc.cancelQueries({ queryKey: MEDIA_KEY });
      patchCache((p) => ({ ...p, items: upsertItem(p.items, item) }));
      if (demo) return item;
      const drop = () => {
        patchCache((p) => ({ ...p, items: p.items.filter((i) => i.id !== item.id) }));
      };
      const r = await addMediaItem({ ...input, id: item.id }).catch(() => null);
      if (r?.ok) {
        // `existing`: another device added the same fp first; that row wins.
        if (r.existing) drop();
        patchCache((p) => ({ ...p, items: upsertItem(p.items, r.item) }));
        return r.item;
      }
      drop();
      toast({
        title: `Couldn't add ${item.title}`,
        body: r ? "The server didn't take it. Try again." : "You may be offline. Try again when you're back.",
      });
      return null;
    },
    [qc, demo, patchCache],
  );

  /** A picked local file joins the library by its fp (V54); the same file again relinks. */
  const addFile = React.useCallback(
    async (file: File, handle: FileSystemFileHandle | null): Promise<MediaItem | null> => {
      let opened: Awaited<ReturnType<typeof identify>>;
      try {
        opened = await identify(file);
      } catch {
        toast({ title: `Couldn't read ${file.name}`, body: "The media reader stopped. Try the file again." });
        return null;
      }
      rememberFile(opened.fp, file);
      if (handle && !demo) void keepHandle(opened.fp, handle, file);
      const hasVideo = opened.probe ? opened.probe.tracks.some((t) => t.kind === "video") : !file.type.startsWith("audio/");
      return save({
        kind: hasVideo ? "video" : "audio",
        source: "local",
        fp: opened.fp,
        uri: file.name.slice(0, 255),
        title: titleFromName(file.name),
        durationS: opened.probe?.durationS ?? null,
        meta: { size: file.size, ...(opened.probe ? { format: opened.probe.format.slice(0, 40) } : {}) },
      });
    },
    [demo, save],
  );

  /** A pasted link: an allowlisted embed or a direct http(s) media URL (V56). */
  const addLink = React.useCallback(
    async (raw: string): Promise<MediaItem | { error: string }> => {
      const p = parseMediaUrl(raw);
      if (p.kind === "invalid") return { error: p.reason };
      const input: MediaItemInput =
        p.kind === "embed"
          ? { kind: p.mediaKind, source: "embed", fp: p.fp, uri: p.pageUrl, title: `${providerName(p.provider)} ${p.id}`, durationS: null, meta: { provider: p.provider } }
          : { kind: p.mediaKind, source: "url", fp: p.fp, uri: p.url, title: titleFromName(p.name), durationS: null, meta: {} };
      const item = await save(input);
      return item ?? { error: "It wasn't added." };
    },
    [save],
  );

  /** Deletes on expiry of the undo toast only; × and Undo both cancel (user 2026-11-05). */
  const remove = React.useCallback(
    (item: MediaItem, onGone?: () => void) => {
      const { hide, show } = useHidden.getState();
      hide(item.id);
      const cancel = () => {
        show(item.id);
      };
      toast({
        id: `undo-delete-media:${item.id}`,
        title: `Removed ${item.title}`,
        body: item.source === "local" ? "From your library. The file itself stays where it is." : "From your library.",
        action: { label: "Undo", onClick: cancel },
        onClose: cancel,
        closeLabel: "Cancel remove",
        onExpire: () => {
          const drop = () => {
            patchCache((p) => ({ ...p, items: p.items.filter((i) => i.id !== item.id) }));
            show(item.id);
            if (item.source === "local") forgetFile(item.fp);
            onGone?.();
          };
          if (demo) {
            drop();
            return;
          }
          void deleteMediaItem({ id: item.id }).then(
            (r) => {
              if (r.ok) drop();
              else {
                show(item.id);
                toast({ title: `Couldn't remove ${item.title}`, body: "It's back in the library. Try again." });
              }
            },
            () => {
              show(item.id);
              toast({ title: `Couldn't remove ${item.title}`, body: "You may be offline. It's back in the library." });
            },
          );
        },
      });
    },
    [demo, patchCache],
  );

  return { addFile, addLink, remove };
}

export function providerName(p: string): string {
  return p === "youtube" ? "YouTube" : p === "vimeo" ? "Vimeo" : p === "soundcloud" ? "SoundCloud" : p === "spotify" ? "Spotify" : p;
}
