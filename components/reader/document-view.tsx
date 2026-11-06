"use client";

import * as React from "react";
import { ArrowLeft, CloudOff, FolderOpen } from "lucide-react";
import { Notice } from "@/components/income/parts";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import { useAccount } from "@/components/shell/account";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { formatLocator, parseLocator, type ReaderDoc } from "@/lib/reader/reader";
import { kindLabel } from "./cover";
import { closeDoc, useFilePicker } from "./open-file";
import { useReaderRuntime } from "./reader-provider";
import { onDevice, readDocFile, useDeviceFiles, useReader, useReaderApi } from "./use-reader";

// One document (T46). Markdown and text are read here and keep their place
// (V41: `md:<heading>:<y‰>`, resumed by the locator, not the percent). PDFs
// show in the browser's own viewer until the PDF reader lands (T47), which
// brings page-level places, search and covers. An entry whose bytes aren't
// on this device asks for the file and relinks it by its hash (V39).

const REPORT_MS = 400;

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
            {kindLabel(doc.kind)}
            {doc.progress ? ` · ${String(doc.progress.percent)}%` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The bytes read for one hash: the File, or null when this device doesn't have them after all. */
type Read = { sha256: string; file: File | null };

function Reading({ doc }: { doc: ReaderDoc }) {
  const demo = useAccount().kind !== "owner";
  const device = useDeviceFiles();
  const here = onDevice(doc, device);
  const [read, setRead] = React.useState<Read | null>(null);

  React.useEffect(() => {
    if (!here) return;
    let live = true;
    void readDocFile(doc, demo).then((file) => {
      // Already reading these bytes: keep the same File, so the text and its place aren't reloaded.
      if (live) setRead((prev) => (prev?.sha256 === doc.sha256 && prev.file && file ? prev : { sha256: doc.sha256, file }));
    });
    return () => {
      live = false;
    };
    // The bytes are named by the hash: nothing else about the doc changes them. A new device listing (a relink) reads again.
  }, [doc.sha256, doc.sizeBytes, here, demo, device]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = read?.sha256 === doc.sha256 ? read : null;
  const missing = here === false || current?.file === null;
  const file = here ? (current?.file ?? null) : null;
  return (
    <div className="flex flex-col gap-5">
      <BackBar doc={doc} />
      {missing ? <Relink doc={doc} /> : file ? doc.kind === "pdf" ? <PdfFrame doc={doc} file={file} /> : <TextReader doc={doc} file={file} /> : <div aria-busy aria-label="Opening" className="h-[60svh] rounded-card bg-foreground/5 dark:bg-card-nested" />}
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

/** The browser's own PDF viewer, as a stopgap. Its place isn't readable from here, so opening only marks the document opened. */
function PdfFrame({ doc, file }: { doc: ReaderDoc; file: File }) {
  const runtime = useReaderRuntime();
  const frame = React.useRef<HTMLIFrameElement>(null);
  React.useEffect(() => {
    const el = frame.current;
    if (!el) return;
    // Typed as PDF whatever the picked file said, so the bytes can only ever render as a PDF.
    const u = URL.createObjectURL(new Blob([file], { type: "application/pdf" }));
    el.src = u;
    return () => {
      el.removeAttribute("src");
      URL.revokeObjectURL(u);
    };
  }, [file]);
  React.useEffect(() => {
    const p = doc.progress;
    runtime.report({
      documentId: doc.id,
      locator: p && parseLocator(p.locator)?.kind === "pdf" ? p.locator : formatLocator({ kind: "pdf", page: 1, y: 0 }),
      percent: p?.percent ?? 0,
      at: Date.now(),
    });
    // Once per open.
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-ink-2">Shown in your browser&apos;s viewer for now. The Wanheda PDF reader, which keeps your page, comes next.</p>
      <iframe ref={frame} title={doc.title} className="h-[calc(100svh-15rem)] min-h-[420px] w-full rounded-card bg-foreground/5 dark:bg-card-nested" />
    </div>
  );
}

/** Where the reader is in the article: 0–1 through its scrollable length. Short ones count as read. */
function fractionOf(el: HTMLElement): number {
  const top = el.getBoundingClientRect().top + window.scrollY;
  const range = el.offsetHeight - window.innerHeight;
  if (range <= 0) return 1;
  return Math.min(1, Math.max(0, (window.scrollY - top) / range));
}

function TextReader({ doc, file }: { doc: ReaderDoc; file: File }) {
  const runtime = useReaderRuntime();
  const [text, setText] = React.useState<string | null>(null);
  const article = React.useRef<HTMLElement>(null);
  const resumeFrom = React.useRef(doc.progress);

  React.useEffect(() => {
    let live = true;
    void file.text().then((t) => {
      if (live) setText(t);
    });
    return () => {
      live = false;
    };
  }, [file]);

  React.useEffect(() => {
    const el = article.current;
    if (text === null || !el) return;
    const report = () => {
      const f = fractionOf(el);
      runtime.report({
        documentId: doc.id,
        locator: formatLocator({ kind: "md", heading: "", y: f * 1000 }),
        percent: Math.round(f * 100),
        at: Date.now(),
      });
    };
    // Resume by the locator (V41), then record the open from where it landed.
    const from = resumeFrom.current ? parseLocator(resumeFrom.current.locator) : null;
    if (from?.kind === "md") {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const range = Math.max(0, el.offsetHeight - window.innerHeight);
      window.scrollTo({ top: top + (range * from.y) / 1000, behavior: "instant" });
    }
    report();

    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      const now = performance.now();
      if (trailing) clearTimeout(trailing);
      if (now - last >= REPORT_MS) {
        last = now;
        report();
      } else {
        trailing = setTimeout(() => {
          last = performance.now();
          report();
        }, REPORT_MS);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (trailing) clearTimeout(trailing);
    };
  }, [text, doc.id, runtime]);

  if (text === null) return <div aria-busy aria-label="Opening" className="h-[60svh] rounded-card bg-foreground/5 dark:bg-card-nested" />;
  return (
    <article ref={article} className="mx-auto w-full max-w-[68ch] pb-24 text-[15.5px] leading-[1.7] text-foreground">
      {doc.kind === "md" ? (
        <NoteMarkdown body={text} />
      ) : (
        <div className="flex flex-col gap-[1em]">
          {text.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
