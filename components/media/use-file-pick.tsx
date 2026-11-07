"use client";

import * as React from "react";
import { AUDIO_ACCEPT, PICKER_TYPES, VIDEO_ACCEPT, fsaPicker } from "@/lib/media/local";

// One file at a time. With File System Access the handle comes back too, so
// the file opens again after a reload (V54); elsewhere a hidden <input> is the
// fallback and the file is known to this tab only.

export function useFilePick(onFile: (file: File, handle: FileSystemFileHandle | null) => void | Promise<void>) {
  const ref = React.useRef<HTMLInputElement>(null);
  const latest = React.useRef(onFile);
  React.useEffect(() => {
    latest.current = onFile;
  }, [onFile]);

  const open = React.useCallback(() => {
    const picker = fsaPicker();
    if (!picker) {
      ref.current?.click();
      return;
    }
    void picker({ multiple: false, types: PICKER_TYPES })
      .then(async ([handle]) => {
        if (!handle) return;
        await latest.current(await handle.getFile(), handle);
      })
      .catch((e: unknown) => {
        // AbortError = the owner closed the picker. Anything else: try the plain input.
        if (!(e instanceof DOMException && e.name === "AbortError")) ref.current?.click();
      });
  }, []);

  const input = (
    <input
      ref={ref}
      type="file"
      accept={`${VIDEO_ACCEPT},${AUDIO_ACCEPT},video/*,audio/*`}
      hidden
      onChange={(e) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = "";
        if (file) void latest.current(file, null);
      }}
    />
  );

  return { input, open };
}
