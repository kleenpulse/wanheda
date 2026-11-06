"use client";

import * as React from "react";
import { create } from "zustand";
import { readCover, writeCover } from "@/lib/reader/device";
import type { ReaderDoc } from "@/lib/reader/reader";

// Page-one covers for PDFs (T47): a small webp kept in OPFS beside the file
// (`<sha256>.cover.webp`), made the first time the PDF is added or opened on
// this device. Demo keeps them in this tab. Until there is one, the library
// draws the generated cover (cover.tsx).

/** sha256 → object URL, or null once looked for and not found. */
const useCoverUrls = create<{ bySha: Readonly<Record<string, string | null>> }>(() => ({ bySha: {} }));

const looking = new Set<string>();

function remember(sha256: string, url: string | null) {
  useCoverUrls.setState((s) => {
    const old = s.bySha[sha256];
    if (old && old !== url) URL.revokeObjectURL(old);
    return { bySha: { ...s.bySha, [sha256]: url } };
  });
}

/** A PDF's cover URL on this device, or null (none yet, or not a PDF). */
export function useCover(doc: Pick<ReaderDoc, "kind" | "sha256">, demo: boolean): string | null {
  const url = useCoverUrls((s) => s.bySha[doc.sha256]);
  const pdf = doc.kind === "pdf";
  React.useEffect(() => {
    if (!pdf || demo || url !== undefined || looking.has(doc.sha256)) return;
    looking.add(doc.sha256);
    void readCover(doc.sha256)
      .then((blob) => {
        remember(doc.sha256, blob ? URL.createObjectURL(blob) : null);
      })
      .finally(() => looking.delete(doc.sha256));
  }, [pdf, demo, url, doc.sha256]);
  return pdf ? (url ?? null) : null;
}

/** Whether this device already has a cover for a hash (looked up if needed). */
export async function hasCover(sha256: string, demo: boolean): Promise<boolean> {
  const known = useCoverUrls.getState().bySha[sha256];
  if (known) return true;
  if (demo) return false;
  const blob = await readCover(sha256);
  if (blob) remember(sha256, URL.createObjectURL(blob));
  return blob !== null;
}

/** Keeps a freshly made cover: OPFS for the owner, this tab for demo. Shows at once either way. */
export async function keepCover(sha256: string, blob: Blob, demo: boolean): Promise<void> {
  remember(sha256, URL.createObjectURL(blob));
  if (!demo) await writeCover(sha256, blob);
}

/** Forgets a cover (its document was deleted). */
export function forgetCover(sha256: string): void {
  remember(sha256, null);
}
