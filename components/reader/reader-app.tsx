"use client";

import { useUrlParam } from "@/hooks/use-url-param";
import { DocumentView } from "./document-view";
import { Library } from "./library";

// /reader: the library, or one document (`?d=<id>`). One page, so a hop
// between them keeps the library's cache and paints at once (V24). The param
// is read from the location (hooks/use-url-param.ts), not useSearchParams, so
// no Suspense boundary sits in front of the first paint.
export function ReaderApp() {
  const id = useUrlParam("d");
  return id ? <DocumentView id={id} /> : <Library />;
}
