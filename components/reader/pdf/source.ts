import { PDFDataRangeTransport, type getDocument } from "pdfjs-dist";
import { CMAPS, STANDARD_FONTS } from "./pdf-data";

// How pdf.js gets a document's bytes and its helper data, for the reader
// (engine.ts) and the text extractor's worker (../text.worker.ts) alike.
// Everything about the PDF is hostile input (V40): wasm decoders, CMaps and
// standard fonts are this app's own hashed assets, served from this origin,
// and nothing else may be fetched for a document.

const WASM: Readonly<Record<string, URL>> = {
  "openjpeg.wasm": new URL("pdfjs-dist/wasm/openjpeg.wasm", import.meta.url),
  "jbig2.wasm": new URL("pdfjs-dist/wasm/jbig2.wasm", import.meta.url),
};

const DATA: Readonly<Record<string, Readonly<Record<string, URL>>>> = {
  wasmUrl: WASM,
  cMapUrl: CMAPS,
  standardFontDataUrl: STANDARD_FONTS,
};

/**
 * pdf.js asks for binary data by kind and file name: the image decoders,
 * CMaps and standard fonts, each a known asset of this app. Any other name is
 * refused, so a document can never make the reader fetch a URL.
 */
class SameOriginData {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const files = Object.hasOwn(DATA, kind) ? DATA[kind] : undefined;
    const url = files && Object.hasOwn(files, filename) ? files[filename] : undefined;
    if (!url) throw new Error(`No ${kind} data: ${filename}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${filename}: ${String(res.status)}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Big files are read in ranges straight from the File, so a 14,000-page book never sits whole in memory. */
const RANGE_FROM_BYTES = 16 * 1024 * 1024;

/**
 * Reads the ranges pdf.js asks for straight from the File. A read can fail
 * (the device copy was removed or replaced under an open document): pdf.js
 * would wait for that range forever, so the failure is reported instead and
 * the caller closes the document.
 */
class FileRange extends PDFDataRangeTransport {
  readonly #file: File;
  readonly #onFail: () => void;
  constructor(file: File, onFail: () => void) {
    super(file.size, null);
    this.#file = file;
    this.#onFail = onFail;
  }
  override requestDataRange(begin: number, end: number): void {
    this.#file
      .slice(begin, end)
      .arrayBuffer()
      .then(
        (b) => {
          this.onDataRange(begin, new Uint8Array(b));
        },
        () => {
          this.#onFail();
        },
      );
  }
}

export type PdfParams = NonNullable<Exclude<Parameters<typeof getDocument>[0], string | URL | ArrayBuffer | Uint8Array>>;

/** getDocument's options for a File: its bytes (in ranges when big) and the same-origin data, nothing fetched by URL. `onFail`: a later range read failed. */
export async function pdfParams(file: File, onFail: () => void): Promise<PdfParams> {
  const big = file.size > RANGE_FROM_BYTES;
  return {
    ...(big ? { range: new FileRange(file, onFail), length: file.size, disableAutoFetch: true, disableStream: true } : { data: new Uint8Array(await file.arrayBuffer()) }),
    BinaryDataFactory: SameOriginData,
    useWorkerFetch: false,
    enableXfa: false,
    stopAtErrors: false,
  };
}
