"use client";

import * as React from "react";
import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { AutoScrollSpeed } from "@/components/reader/chrome";
import { Cover } from "@/components/reader/cover";
import { PaperPicker } from "@/components/reader/paper";
import {
  TEXT_SIZES,
  TEXT_SIZE_LABELS,
  bookPagesPref,
  coverFitPref,
  coverStylePref,
  pageTurnPref,
  paperPref,
  textSizePref,
  type BookPages,
  type CoverFit,
  type CoverStyle,
  type PageTurn,
} from "@/components/reader/prefs";
import { useReaderPrefsSync } from "@/components/reader/reader-prefs-sync";
import { prefsNote } from "@/components/settings/appearance-prefs";
import { useReader } from "@/components/reader/use-reader";
import { Segmented } from "@/components/ui/segmented";
import { useHydrated } from "@/hooks/use-hydrated";

/*
  Settings → Reader (user 2026-11-06): the reader's preferences in one place,
  the same ones its bars set, plus the library's covers. Read from this device
  (components/reader/prefs.ts), so a change shows at once, here and in the
  reader, and kept in the owner's account (reader-prefs-sync.tsx).
*/

const COVER_STYLES: readonly { value: CoverStyle; label: string }[] = [
  { value: "page", label: "Page one" },
  { value: "title", label: "Title card" },
];
const COVER_FITS: readonly { value: CoverFit; label: string }[] = [
  { value: "fill", label: "Fill" },
  { value: "whole", label: "Whole page" },
];
const BOOK_PAGES: readonly { value: BookPages; label: string }[] = [
  { value: "spread", label: "Spread" },
  { value: "single", label: "One page" },
];
const TURNS: readonly { value: PageTurn; label: string }[] = [
  { value: "curl", label: "Curl" },
  { value: "instant", label: "Instant" },
];
const TEXT_SIZE_OPTIONS = TEXT_SIZES.map((v, i) => ({ value: String(v), label: TEXT_SIZE_LABELS[i] ?? String(v) }));

/** A few of the library's own covers, PDFs first, so a cover setting shows on real books. */
function CoverPreview() {
  const { data } = useReader();
  const docs = React.useMemo(() => {
    const list = data?.documents ?? [];
    return [...list.filter((d) => d.kind === "pdf"), ...list.filter((d) => d.kind !== "pdf")].slice(0, 4);
  }, [data]);
  if (docs.length === 0) return null;
  return (
    <ul aria-label="Covers in your library, as they'll look" className="grid grid-cols-4 gap-3 px-5 pt-1 pb-4">
      {docs.map((d) => (
        <li key={d.id} className="min-w-0">
          <Cover doc={d} className="shadow-[0_8px_20px_-12px] shadow-foreground/40" />
          <p className="mt-1.5 truncate text-[11.5px] text-ink-2">{d.title}</p>
        </li>
      ))}
    </ul>
  );
}

export function ReaderSection() {
  const hydrated = useHydrated();
  const coverStyle = coverStylePref.use();
  const coverFit = coverFitPref.use();
  const bookPages = bookPagesPref.use();
  const turn = pageTurnPref.use();
  const textSize = textSizePref.use();
  const paper = paperPref.use();
  // Device prefs read localStorage: nothing is pressed until the client knows them.
  const shown = <T,>(v: T) => (hydrated ? v : null);

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="Library covers">
        <CoverPreview />
        <SettingRow label="Cover" description="A PDF shows its first page, made on this device. A title card is the same on every device." layout="wide">
          {() => <Segmented label="Cover" value={shown(coverStyle)} options={COVER_STYLES} onChange={coverStylePref.set} />}
        </SettingRow>
        <SettingRow label="Page one" description="Fill crops it to the cover's shape and keeps the top. Whole page shows all of it, nothing cut." layout="wide">
          {() => <Segmented label="Page one" value={shown(coverFit)} options={COVER_FITS} onChange={coverFitPref.set} disabled={coverStyle === "title"} />}
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Reading">
        <SettingRow label="Book pages" description="On a wide screen. A phone, and a document of one page, always show one page." layout="wide">
          {() => <Segmented label="Book pages" value={shown(bookPages)} options={BOOK_PAGES} onChange={bookPagesPref.set} />}
        </SettingRow>
        <SettingRow label="Page turn" description="Instant swaps the page with no curl. It's always instant when your system asks for reduced motion." layout="wide">
          {() => <Segmented label="Page turn" value={shown(turn)} options={TURNS} onChange={pageTurnPref.set} />}
        </SettingRow>
        <SettingRow label="Text size" description="Markdown and text, in the scroll and the book. + and − change it while reading." layout="stack">
          {() => (
            <Segmented
              label="Text size"
              value={shown(String(textSize))}
              options={TEXT_SIZE_OPTIONS}
              onChange={(v) => {
                textSizePref.set(Number(v));
              }}
            />
          )}
        </SettingRow>
        <SettingRow label="Paper" description="The page's colour in every document: light papers tint it, dark ones turn it over." layout="wide">
          {(labelId) => <PaperPicker paper={paper} onPaper={paperPref.set} labelledBy={labelId} />}
        </SettingRow>
        <SettingRow label="Auto-scroll speed" description="Where the page scrolls. The wheel over the control changes it while reading." layout="wide">
          {(labelId) => <AutoScrollSpeed labelledBy={labelId} />}
        </SettingRow>
      </SettingsCard>
    </div>
  );
}

/** Beside the section title: where the reader's prefs are saved and whether the last change was. */
export function ReaderPrefsNote() {
  const { source, saveState } = useReaderPrefsSync();
  return <span aria-live="polite">{prefsNote(source, saveState)}</span>;
}
