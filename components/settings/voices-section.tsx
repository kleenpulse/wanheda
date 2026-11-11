"use client";

import * as React from "react";
import { Download, ExternalLink, Play, RotateCcw, RotateCw, Square, Trash2, X } from "lucide-react";
import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { formatBytes, useVoiceManager, type VoiceDownload } from "@/components/settings/voice-manager";
import { getVoices, opfsAvailable, useMissingVoices } from "@/components/speech/voice-offer";
import { useAccountVoices } from "@/components/settings/account-voices";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHydrated } from "@/hooks/use-hydrated";
import { ratePref, SPEEDS, voicePref } from "@/lib/speech/prefs";
import { useSpeech } from "@/lib/speech/store";
import { CATALOG, voiceSize, type CatalogVoice, type VoiceQuality } from "@/lib/speech/voices";
import { bytesOf, voiceNames } from "@/lib/speech/account-voices";

/*
  Settings → Voices (SPEC V46, T55): the read-aloud voices this device holds,
  the default voice and speed, and the pinned catalog to download from. Voices
  and both prefs are per device. Downloads keep going after leaving this page
  (the island's transfer activity follows them).
*/

const LANGS: Record<string, string> = { "en-US": "US English", "en-GB": "UK English" };
const QUALITIES: Record<VoiceQuality, string> = { x_low: "Extra low", low: "Low", medium: "Medium", high: "High" };

type LangFilter = "all" | "en-US" | "en-GB";
type QualityFilter = "all" | VoiceQuality;
type ShowFilter = "all" | "here";

const LANG_OPTIONS: readonly { value: LangFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "en-US", label: "US" },
  { value: "en-GB", label: "UK" },
];
const QUALITY_OPTIONS: readonly { value: QualityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const SHOW_OPTIONS: readonly { value: ShowFilter; label: string }[] = [
  { value: "all", label: "Catalog" },
  { value: "here", label: "On this device" },
];
const SPEED_OPTIONS = SPEEDS.map((s) => ({ value: String(s), label: `${String(s)}×` }));

/** Download and Retry: a tinted fill, no border (house rule). */
const FILL_BUTTON = buttonClass("ghost", "pill-sm", "bg-foreground/[0.06] text-foreground hover:bg-foreground/10 dark:bg-foreground/[0.08] dark:hover:bg-foreground/[0.12]");

const SAMPLE = ["This is how I sound reading your documents.", "A short sentence, then a longer one, with a pause or two along the way."];
const sampleId = (id: string) => `voice-sample:${id}`;

/** Installed voices, minus deletes waiting on their Undo. */
function useHere(): readonly string[] | null {
  const installed = useVoiceManager((s) => s.installed);
  const deleting = useVoiceManager((s) => s.deleting);
  return React.useMemo(() => installed?.filter((id) => !deleting.includes(id)) ?? null, [installed, deleting]);
}

function DefaultVoice({ labelId, here }: { labelId: string; here: readonly string[] | null }) {
  const hydrated = useHydrated();
  const chosen = voicePref.use();
  const voices = CATALOG.filter((v) => here?.includes(v.id));
  if (here !== null && voices.length === 0) {
    return <p className="text-[13px] text-ink-2">The browser&apos;s own voice, until you download one.</p>;
  }
  const value = hydrated && here?.includes(chosen) ? chosen : null;
  return (
    <div className="w-60 max-w-full">
      <Select
        items={voices.map((v) => ({ value: v.id, label: `${v.name} · ${QUALITIES[v.quality]}` }))}
        value={value}
        disabled={here === null}
        onValueChange={(v) => {
          if (v) useSpeech.getState().setVoice(v);
        }}
      >
        <SelectTrigger aria-labelledby={labelId} className="h-10 pl-3">
          <SelectValue placeholder="Choose a voice" />
        </SelectTrigger>
        <SelectContent align="end">
          {voices.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name} · {QUALITIES[v.quality]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Progress({ d }: { d: VoiceDownload }) {
  const share = d.total > 0 ? Math.min(1, d.received / d.total) : 0;
  const pct = Math.floor(share * 100);
  return (
    <div className="flex items-center gap-2.5">
      <div
        role="progressbar"
        aria-label="Download progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 w-24 overflow-hidden rounded-full bg-signal/15"
      >
        <div className="h-full rounded-full bg-signal transition-[width] duration-150 ease-linear motion-reduce:transition-none" style={{ width: `${String(pct)}%` }} />
      </div>
      <span className="tabular w-9 text-right text-[12px] text-ink-2">{d.phase === "queued" ? "Next" : `${String(pct)}%`}</span>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={buttonClass("ghost", "circle-sm")}>
      {children}
    </button>
  );
}

function VoiceActions({ voice, here, isDefault }: { voice: CatalogVoice; here: readonly string[] | null; isDefault: boolean }) {
  const d = useVoiceManager((s) => s.downloads[voice.id]);
  const deleting = useVoiceManager((s) => s.deleting.includes(voice.id));
  const { download, cancel, remove, keep } = useVoiceManager.getState();
  const sampling = useSpeech((s) => s.status !== "idle" && s.source?.id === sampleId(voice.id));

  if (here === null) return <span className="h-9" />;
  if (d?.phase === "failed") {
    return (
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => { download(voice.id); }} className={FILL_BUTTON}>
          <RotateCw aria-hidden />
          Retry
        </button>
        <IconButton label={`Dismiss ${voice.name}'s failed download`} onClick={() => { cancel(voice.id); }}>
          <X aria-hidden />
        </IconButton>
      </div>
    );
  }
  if (d) {
    return (
      <div className="flex items-center gap-1">
        <Progress d={d} />
        <IconButton label={`Cancel ${voice.name}'s download`} onClick={() => { cancel(voice.id); }}>
          <X aria-hidden />
        </IconButton>
      </div>
    );
  }
  if (deleting) {
    return (
      <button type="button" onClick={() => { keep(voice.id); }} className={FILL_BUTTON}>
        <RotateCcw aria-hidden />
        Keep
      </button>
    );
  }
  if (!here.includes(voice.id)) {
    return (
      <button type="button" disabled={!opfsAvailable()} onClick={() => { download(voice.id); }} className={FILL_BUTTON}>
        <Download aria-hidden />
        Download
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {isDefault ? (
        <span className="mr-1 rounded-pill bg-signal-soft px-2.5 py-1 text-[11.5px] font-medium text-signal-ink dark:text-signal">Default</span>
      ) : (
        <button type="button" onClick={() => { useSpeech.getState().setVoice(voice.id); }} className={buttonClass("ghost", "pill-sm")}>
          Use
        </button>
      )}
      <IconButton
        label={sampling ? "Stop the sample" : `Hear ${voice.name}`}
        onClick={() => {
          const speech = useSpeech.getState();
          if (sampling) speech.stop();
          else speech.play({ kind: "note", id: sampleId(voice.id), title: `${voice.name} sample` }, SAMPLE, 0, { voice: voice.id });
        }}
      >
        {sampling ? <Square aria-hidden className="fill-current" /> : <Play aria-hidden className="translate-x-px" />}
      </IconButton>
      <IconButton label={`Delete ${voice.name}`} onClick={() => { remove(voice.id); }}>
        <Trash2 aria-hidden />
      </IconButton>
    </div>
  );
}

function VoiceRow({ voice, here, isDefault }: { voice: CatalogVoice; here: readonly string[] | null; isDefault: boolean }) {
  const { licence } = voice;
  return (
    <li className="grid grid-cols-1 items-center gap-x-6 gap-y-3 px-5 py-4 @lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-medium text-foreground">
          {voice.name}
          <span className="text-[12.5px] font-normal text-ink-2">
            {LANGS[voice.lang] ?? voice.lang} · {QUALITIES[voice.quality]} · <span className="tabular">{formatBytes(voiceSize(voice))}</span>
          </span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
          {licence.nonCommercial ? (
            <span className="rounded-pill bg-signal-soft px-2 py-0.5 text-[11px] font-medium text-signal-ink dark:text-signal">Non-commercial</span>
          ) : null}
          <a
            href={licence.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {licence.dataset} · {licence.terms}
            <ExternalLink aria-hidden className="size-3" />
          </a>
        </p>
        {licence.note ? <p className="mt-0.5 max-w-[52ch] text-[12px] leading-snug text-ink-3">{licence.note}</p> : null}
      </div>
      <div className="min-w-0 @lg:justify-self-end">
        <VoiceActions voice={voice} here={here} isDefault={isDefault} />
      </div>
    </li>
  );
}

/** The account's voices this device lacks (SPEC V83), with one button for all of them. */
function VoiceOfferRow() {
  const missing = useMissingVoices();
  if (!missing || missing.length === 0 || !opfsAvailable()) return null;
  return (
    <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card bg-signal/8 px-4 py-3">
      <p className="min-w-0 text-[13px] text-foreground">
        From your other devices: {voiceNames(missing)} <span className="tabular text-ink-2">· {formatBytes(bytesOf(missing))}</span>
      </p>
      <button type="button" onClick={() => { getVoices(missing); }} className={FILL_BUTTON}>
        <Download aria-hidden />
        {missing.length === 1 ? "Get it" : "Get them"}
      </button>
    </div>
  );
}

function Catalog({ here }: { here: readonly string[] | null }) {
  const [lang, setLang] = React.useState<LangFilter>("all");
  const [quality, setQuality] = React.useState<QualityFilter>("all");
  const [show, setShow] = React.useState<ShowFilter>("all");
  const hydrated = useHydrated();
  const chosen = voicePref.use();
  const downloads = useVoiceManager((s) => s.downloads);

  const list = CATALOG.filter(
    (v) =>
      (lang === "all" || v.lang === lang) &&
      (quality === "all" || v.quality === quality) &&
      (show === "all" || here?.includes(v.id) === true || v.id in downloads),
  );
  const kept = CATALOG.filter((v) => here?.includes(v.id));
  const bytes = kept.reduce((n, v) => n + voiceSize(v), 0);

  return (
    <SettingsCard
      title={
        <span className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span>Voices</span>
          {kept.length > 0 ? (
            <span className="tabular">
              {kept.length} on this device · {formatBytes(bytes)}
            </span>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <Segmented label="Language" value={lang} options={LANG_OPTIONS} onChange={setLang} />
        <Segmented label="Quality" value={quality} options={QUALITY_OPTIONS} onChange={setQuality} />
        <Segmented label="Show" value={show} options={SHOW_OPTIONS} onChange={setShow} />
      </div>
      <VoiceOfferRow />
      {!opfsAvailable() && hydrated ? (
        <p className="px-5 py-4 text-[13px] text-ink-2">This browser can&apos;t keep voices, so the browser&apos;s own voice reads instead.</p>
      ) : null}
      {list.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-ink-2">{show === "here" ? "No voice on this device matches. Downloads land here." : "No voice matches these filters."}</p>
      ) : (
        <ul className="divide-y divide-border/70 dark:divide-glass-border">
          {list.map((v) => (
            <VoiceRow key={v.id} voice={v} here={here} isDefault={hydrated && chosen === v.id} />
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

export function VoicesSection() {
  const here = useHere();
  const hydrated = useHydrated();
  const rate = ratePref.use();

  React.useEffect(() => {
    void useVoiceManager.getState().refresh();
    void useAccountVoices.getState().load();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="Read aloud">
        <SettingRow
          label="Voice"
          description="Reads documents and notes when it's on this device. Without one, the browser's own voice reads."
          layout="wide"
        >
          {(labelId) => <DefaultVoice labelId={labelId} here={here} />}
        </SettingRow>
        <SettingRow label="Speed" description="Where speech starts. Changing it while listening keeps the new speed." layout="stack">
          {() => (
            <Segmented
              label="Speed"
              value={hydrated ? String(rate) : null}
              options={SPEED_OPTIONS}
              onChange={(v) => {
                useSpeech.getState().setRate(Number(v));
              }}
            />
          )}
        </SettingRow>
      </SettingsCard>
      <Catalog here={here} />
      <p className="px-1 text-[12px] leading-snug text-ink-3">
        Voices come from Piper&apos;s catalog at a pinned version and are checked by size and checksum before they&apos;re kept. Low and medium voices are about 63 MB;
        high ones are about 114 MB, clearer, and slower to start on a phone.
      </p>
    </div>
  );
}
