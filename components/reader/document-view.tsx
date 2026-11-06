"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, CloudOff, FolderOpen } from "lucide-react";
import { Notice } from "@/components/income/parts";
import { useAccount } from "@/components/shell/account";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { parseLocator, type ReaderDoc } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";
import { kindLabel, pagesLabel } from "./cover";
import { onForget } from "./doc-cache";
import { MdReader } from "./md/md-reader";
import { closeDoc, useFilePicker } from "./open-file";
import { STAGE_BOX } from "./stage";
import { ensureText } from "./text";
import { onDevice, readDocFile, useDeviceFiles, useReader, useReaderApi } from "./use-reader";

// One document. PDFs open in the PDF reader (T47: pdf/pdf-reader.tsx), a book
// or a scroll, loaded only on the client with pdf.js. Markdown and text open in
// the Markdown reader (T48: md/md-reader.tsx) on the same stage, keeping their
// place by heading (V41: `md:<heading>:<y‰>`). An entry whose bytes aren't on
// this device asks for the file and relinks it by its hash (V39).

/** The reader's dark stage, empty, while the file or the PDF reader's code loads. Same box, so nothing jumps. */
function StageShell() {
  return <div aria-busy aria-label="Opening" className={cn(STAGE_BOX, "bg-stage")} />;
}

const PdfReader = dynamic(() => import("./pdf/pdf-reader"), { ssr: false, loading: StageShell });

/** Starts loading the PDF reader's code ahead of the first open (the library calls it when it holds a PDF). */
export function preloadPdfReader(): void {
  void import("./pdf/pdf-reader").catch(() => undefined);
}

export function DocumentView({ id }: { id: string }) {
  const { data, failed } = useReader();
  if (!data) {
    if (failed) return <Notice>Couldn&apos;t load your library. It will try again when you&apos;re back online.</Notice>;
    return <div aria-busy aria-label="Loading" className="h-[60svh] rounded-card bg-foreground/5 dark:bg-card-nested" />;
  }
  const doc = data.documents.find((d) => d.id === id);
  if (!doc) {
    return (
      <>
        <BackBar />
        <EmptyState title="Not in your library" body="It may have been deleted on another device." />
      </>
    );
  }
  return <Reading key={doc.id} doc={doc} />;
}

function BackBar({ doc }: { doc?: ReaderDoc }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button type="button" onClick={closeDoc} className={buttonClass("ghost", "pill-sm", "-ml-2 shrink-0")}>
        <ArrowLeft aria-hidden />
        Library
      </button>
      {doc ? (
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h2 className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-foreground">{doc.title}</h2>
          {doc.author ? <span className="hidden truncate text-[12.5px] text-ink-2 sm:inline">{doc.author}</span> : null}
          <span className="tabular ml-auto shrink-0 font-mono text-[10.5px] tracking-wide text-ink-3 uppercase">
            {[kindLabel(doc.kind), pagesLabel(doc.pages), doc.progress ? `${String(doc.progress.percent)}%` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** How long a document stays open before its text is extracted in the background. */
const TEXT_AFTER_MS = 3000;

/** The bytes read for one hash: the File, or null when this device doesn't have them after all. */
type Read = { sha256: string; file: File | null };

/** The last bytes read, so going back to the same document paints at once (V24), with no wait on the device read. */
let lastRead: Read | null = null;

// A deleted document's bytes are gone from the device: never hand back that File.
onForget((sha256) => {
  if (lastRead?.sha256 === sha256) lastRead = null;
});

function Reading({ doc }: { doc: ReaderDoc }) {
  const demo = useAccount().kind !== "owner";
  const device = useDeviceFiles();
  const here = onDevice(doc, device);
  const [read, setRead] = React.useState<Read | null>(() => (lastRead?.sha256 === doc.sha256 && lastRead.file ? lastRead : null));

  React.useEffect(() => {
    if (!here) return;
    let live = true;
    void readDocFile(doc, demo).then((file) => {
      // Already reading these bytes: keep the same File, so the text and its place aren't reloaded.
      if (!live) return;
      setRead((prev) => {
        const next = prev?.sha256 === doc.sha256 && prev.file && file ? prev : { sha256: doc.sha256, file };
        lastRead = next;
        return next;
      });
    });
    return () => {
      live = false;
    };
    // The bytes are named by the hash: nothing else about the doc changes them. A new device listing (a relink) reads again.
  }, [doc.sha256, doc.sizeBytes, here, demo, device]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = read?.sha256 === doc.sha256 ? read : null;
  const missing = here === false || current?.file === null;
  const file = here ? (current?.file ?? null) : null;

  // Sentences for voice (T50, V44), once the reader has settled: never in the way of the first paint (V24).
  React.useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(() => {
      ensureText(doc, file, demo);
    }, TEXT_AFTER_MS);
    return () => {
      window.clearTimeout(t);
    };
  }, [file, doc.sha256, doc.kind, demo]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-5">
      <BackBar doc={doc} />
      {missing ? (
        <Relink doc={doc} />
      ) : doc.kind === "pdf" ? (
        file ? (
          <PdfReader doc={doc} file={file} />
        ) : (
          <StageShell />
        )
      ) : file ? (
        <MdReader doc={doc} file={file} />
      ) : (
        <StageShell />
      )}
    </div>
  );
}

function Relink({ doc }: { doc: ReaderDoc }) {
  const api = useReaderApi();
  const [busy, setBusy] = React.useState(false);
  const picker = useFilePicker((files) => {
    const [file] = files;
    if (!file) return;
    setBusy(true);
    void api.relink(doc, file).finally(() => {
      setBusy(false);
    });
  }, false);
  const place = doc.progress ? parseLocator(doc.progress.locator) : null;
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-foreground/5 dark:bg-card-nested px-6 py-12 text-center">
      {picker.input}
      <span className="flex size-11 items-center justify-center rounded-full bg-signal-soft text-signal-ink">
        <CloudOff aria-hidden className="size-5" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="font-display text-xl leading-tight tracking-[-0.01em] text-foreground">Not on this device</p>
        <p className="text-[13px] leading-relaxed text-pretty text-ink-2">
          Open {doc.fileName ? <span className="font-medium text-foreground">{doc.fileName}</span> : "the same file"} from this device to read it here.
          {doc.progress ? (
            <>
              {" "}
              You&apos;ll pick up at <span className="tabular font-medium text-foreground">{place?.kind === "pdf" ? `page ${String(place.page)}` : `${String(doc.progress.percent)}%`}</span>.
            </>
          ) : null}
        </p>
      </div>
      <button type="button" onClick={picker.open} disabled={busy} className={buttonClass("inverse", "pill-sm")}>
        <FolderOpen aria-hidden />
        {busy ? "Checking…" : "Open file"}
      </button>
    </div>
  );
}
