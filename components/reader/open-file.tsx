"use client";

import * as React from "react";
import { pushUrl } from "@/hooks/use-url-param";

// Opening files and documents. A document opens in place (`/reader?d=<id>`)
// with a history entry, so Back returns to the library.

export const ACCEPT = ".pdf,.md,.markdown,.txt,.text,application/pdf,text/markdown,text/plain";

export function openDoc(id: string) {
  pushUrl(`/reader?d=${encodeURIComponent(id)}`);
}

export function closeDoc() {
  pushUrl("/reader");
}

/** A hidden file input and a way to open it. `add` takes files from elsewhere (a drop) the same way. */
export function useFilePicker(onFiles: (files: File[]) => void, multiple = true) {
  const ref = React.useRef<HTMLInputElement>(null);
  const handler = React.useRef(onFiles);
  React.useEffect(() => {
    handler.current = onFiles;
  });
  const add = React.useCallback((files: File[]) => {
    handler.current(files);
  }, []);
  const open = React.useCallback(() => {
    ref.current?.click();
  }, []);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={ACCEPT}
      multiple={multiple}
      hidden
      onChange={(e) => {
        const files = [...(e.currentTarget.files ?? [])];
        // Cleared, so picking the same file again fires again.
        e.currentTarget.value = "";
        if (files.length > 0) add(files);
      }}
    />
  );
  return { input, open, add };
}
