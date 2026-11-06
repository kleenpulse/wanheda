"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpDown, FileSpreadsheet, Upload } from "lucide-react";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { importStatement, undoImport } from "@/actions/import";
import { fetchJson } from "@/lib/fetch-json";
import { shortDayLabel } from "@/lib/money/dates";
import type { ColumnMapping, DateOrder } from "@/lib/money/import/mapping";
import { PRESETS, presetMapping } from "@/lib/money/import/presets";
import {
  BANK_NAME_MAX,
  blankMapping,
  flipSigns,
  MAX_IMPORT_ROWS,
  savedMappingSchema,
  type KeyedRow,
  type MappingPick,
  type StatementAnalysis,
} from "@/lib/money/import/statement";
import { IMPORT_SETUP_KEY, splitByPresence, type ImportBatchInfo, type ImportCheck, type ImportSetup } from "@/lib/money/import/write";
import { defaultAccount, MONEY_KEY, MONEY_RANGE_KEY, removeTxn, upsertTxn, type Account, type MoneyPayload, type Txn } from "@/lib/money/money";
import { applyRules } from "@/lib/money/rules";
import { cn } from "@/lib/utils";
import { MoneyLoadFailed } from "../money-app";
import { MoneyText } from "../money-text";
import { lastAccountId, useMoney } from "../use-money";
import { useStatementWorker } from "./use-statement-worker";

// Statement import (SPEC T37, V32): a file is read on this device, in a
// worker; the owner checks the columns and the rows (new, already here,
// skipped), then confirms, and the rows land in one transaction. Undo removes
// the whole import after a confirm (user rule: a cascading delete is
// confirmed). Demo imports stay in this tab.

const FIELD =
  "h-10 w-full min-w-0 rounded-[12px] bg-sheet px-3 text-[14px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested dark:ring-glass-border";
const LABEL = "readout mb-1.5 block";
const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
/** Rows the preview draws; the counts above it cover them all. */
const PREVIEW_ROWS = 150;
const NONE = "__none";

const CHECK_KEY = "money-import-check";

interface PickedFile {
  id: number;
  name: string;
  bytes: ArrayBuffer;
}

interface Done {
  batch: ImportBatchInfo;
  txns: Txn[];
  accountName: string;
}

/** Demo imports, this tab only: the same file twice is refused here too. */
const demoImports = new Map<string, { at: number }>();

let nextFileId = 1;

/** When a demo import landed: outside render, like `newTxn`. */
const stamp = () => Date.now();

export function ImportApp() {
  const { data, failed, refetch } = useMoney();
  if (!data) {
    if (failed) return <MoneyLoadFailed onRetry={() => void refetch()} />;
    return (
      <div className="flex flex-col gap-4" aria-busy aria-label="Loading import">
        <div className="h-[220px] rounded-card bg-card-nested" />
      </div>
    );
  }
  return <ImportView payload={data} />;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", cache: "no-store", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} answered ${String(res.status)}`);
  return (await res.json()) as T;
}

const dateTime = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** Lays imported txns into the money cache (V24) and refreshes what the server derives (balances before the window). */
function showImported(qc: QueryClient, txns: readonly Txn[], owner: boolean) {
  qc.setQueryData<MoneyPayload>(MONEY_KEY, (prev) => (prev ? txns.filter((t) => t.postedOn >= prev.since).reduce(upsertTxn, prev) : prev));
  if (!owner) return;
  void qc.invalidateQueries({ queryKey: MONEY_KEY, exact: true });
  void qc.invalidateQueries({ queryKey: [MONEY_RANGE_KEY] });
  void qc.invalidateQueries({ queryKey: IMPORT_SETUP_KEY });
}

function hideImported(qc: QueryClient, txns: readonly Txn[], owner: boolean) {
  qc.setQueryData<MoneyPayload>(MONEY_KEY, (prev) => (prev ? txns.reduce((p, t) => removeTxn(p, t.id), prev) : prev));
  if (!owner) return;
  void qc.invalidateQueries({ queryKey: MONEY_KEY, exact: true });
  void qc.invalidateQueries({ queryKey: [MONEY_RANGE_KEY] });
  void qc.invalidateQueries({ queryKey: IMPORT_SETUP_KEY });
}

function ImportView({ payload }: { payload: MoneyPayload }) {
  const owner = useAccount().kind === "owner";
  const qc = useQueryClient();
  const analyse = useStatementWorker();
  const setup = useQuery({
    queryKey: IMPORT_SETUP_KEY,
    queryFn: () => fetchJson<ImportSetup>("/api/money/import"),
    enabled: owner,
    staleTime: 30_000,
  });
  const saved = React.useMemo(
    () =>
      (setup.data?.mappings ?? []).flatMap((m) => {
        const p = savedMappingSchema.safeParse(m);
        return p.success ? [p.data] : [];
      }),
    [setup.data],
  );

  const openAccounts = payload.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = React.useState<string | null>(() => defaultAccount(payload.accounts, lastAccountId())?.id ?? null);
  const account = openAccounts.find((a) => a.id === accountId) ?? openAccounts[0] ?? null;
  const [file, setFile] = React.useState<PickedFile | null>(null);
  const [override, setOverride] = React.useState<MappingPick | null>(null);
  const [bankName, setBankName] = React.useState<string | null>(null);
  const [remember, setRemember] = React.useState(true);
  const [done, setDone] = React.useState<Done | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [alreadyOn, setAlreadyOn] = React.useState<number | null>(null);

  // One string for everything the analysis depends on: a result is shown only for the inputs it was made from.
  const savedSig = saved.map((s) => s.id).join(",");
  const sig = file && account ? `${String(file.id)}|${account.id}|${savedSig}|${JSON.stringify(override)}` : null;
  const [result, setResult] = React.useState<{ sig: string; fileId: number; analysis: StatementAnalysis | null; error: string | null } | null>(null);

  React.useEffect(() => {
    if (!file || !account || sig === null) return;
    let live = true;
    void analyse(file.id, file.bytes, { accountId: account.id, currency: account.currency, saved, mapping: override }).then((r) => {
      if (live) setResult({ sig, fileId: file.id, analysis: r.ok ? r.analysis : null, error: r.ok ? null : r.error });
    });
    return () => {
      live = false;
    };
  }, [analyse, file, account, saved, override, sig]);

  const current = result && file && result.fileId === file.id ? result : null;
  const reading = sig !== null && current?.sig !== sig;
  const analysis = current?.analysis ?? null;
  const fileError = current?.error ?? null;

  const keys = React.useMemo(() => analysis?.rows.map((r) => r.key) ?? [], [analysis]);
  const check = useQuery({
    queryKey: [CHECK_KEY, current?.sig ?? ""],
    queryFn: () => postJson<ImportCheck>("/api/money/import", { accountId: account?.id, fileKey: analysis?.fileKey, keys }),
    enabled: owner && !reading && analysis !== null && account !== null && analysis.rows.length > 0,
    staleTime: Infinity,
    gcTime: 60_000,
  });

  const reset = () => {
    setFile(null);
    setOverride(null);
    setBankName(null);
    setResult(null);
    setSendError(null);
    setAlreadyOn(null);
    setDone(null);
  };

  const pickFile = async (f: File) => {
    const bytes = await f.arrayBuffer();
    setOverride(null);
    setBankName(null);
    setSendError(null);
    setAlreadyOn(null);
    setDone(null);
    setFile({ id: nextFileId++, name: f.name, bytes });
  };

  if (done) {
    return (
      <ImportDone
        done={done}
        onAnother={reset}
        onUndone={() => {
          hideImported(qc, done.txns, owner);
          reset();
        }}
        owner={owner}
      />
    );
  }

  const pick = analysis?.pick ?? null;
  const header = analysis?.table.header ?? [];
  const mapping = pick?.mapping ?? blankMapping(header);
  const shownBank = bankName ?? pick?.bankName ?? "";
  const editMapping = (m: ColumnMapping) => {
    setOverride({ source: "custom", bankName: shownBank, presetId: null, mapping: m });
  };

  const present = new Set(check.data?.present ?? []);
  const rows = analysis?.rows ?? [];
  const { fresh, already } = splitByPresence(rows, present);
  const importedOn = alreadyOn ?? check.data?.importedOn ?? (analysis ? (demoImports.get(analysis.fileKey)?.at ?? null) : null);
  const tooMany = rows.length > MAX_IMPORT_ROWS;
  const canImport = !reading && !busy && analysis !== null && account !== null && rows.length > 0 && !tooMany && importedOn === null && (!owner || check.isSuccess) && fresh.length > 0;

  const confirm = async () => {
    if (!analysis || !account || !file) return;
    setBusy(true);
    setSendError(null);
    const name = shownBank.trim().slice(0, BANK_NAME_MAX);
    try {
      if (!owner) {
        const at = stamp();
        // Rules apply as on the server (FR-MONEY-13): category and tags from the first match.
        const open = new Set(payload.categories.filter((c) => !c.archived).map((c) => c.id));
        const txns: Txn[] = fresh.map((r) =>
          applyRules<Txn>(
            {
              id: crypto.randomUUID(),
              accountId: account.id,
              postedOn: r.postedOn,
              amountMinor: r.amountMinor,
              currency: account.currency,
              payee: r.payee,
              categoryId: null,
              note: "",
              tags: [],
              source: "import",
              transferId: null,
              createdAt: at,
            },
            payload.rules ?? [],
            (id) => open.has(id),
          ),
        );
        demoImports.set(analysis.fileKey, { at });
        showImported(qc, txns, false);
        setDone({
          batch: { id: crypto.randomUUID(), accountId: account.id, filename: file.name, rowsTotal: rows.length + analysis.skipped.length, rowsImported: txns.length, rowsSkipped: analysis.skipped.length, createdAt: at },
          txns,
          accountName: account.name,
        });
        return;
      }
      const res = await importStatement({
        batchId: crypto.randomUUID(),
        accountId: account.id,
        filename: file.name.slice(0, 200) || "statement",
        fileKey: analysis.fileKey,
        rows: rows.map((r) => ({ key: r.key, rowNo: r.rowNo, postedOn: r.postedOn, amountMinor: r.amountMinor, payee: r.payee })),
        skipped: analysis.skipped.map((s) => ({ rowNo: s.rowNo, reason: s.reason.slice(0, 120) })),
        mapping: remember && name !== "" ? { bankName: name, columns: pick?.mapping ?? mapping } : null,
      });
      if (res.ok) {
        showImported(qc, res.txns, true);
        setDone({ batch: res.batch, txns: res.txns, accountName: account.name });
      } else if (res.reason === "already") setAlreadyOn(res.importedOn);
      else
        setSendError(
          res.reason === "archived-account"
            ? "That account is archived. Restore it or pick another."
            : res.reason === "invalid"
              ? "The server refused these rows. Check the columns and try again."
              : "The import didn't go through. Nothing was added. Try again.",
        );
    } catch {
      setSendError("The import didn't go through. Nothing was added. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/money" className={buttonClass("ghost", "pill-sm", "-ml-2")}>
          <ArrowLeft aria-hidden />
          Entries
        </Link>
        <p className="text-[12.5px] text-ink-2">The file is read on this device and never uploaded. Only the rows you import are sent.</p>
      </div>

      <section aria-labelledby="import-file" className="bento flex flex-col gap-4 p-5">
        <h2 id="import-file" className="font-display text-[17px] leading-tight text-foreground">
          Import a statement
        </h2>
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1fr)_260px]">
          <DropZone file={file} onFile={(f) => void pickFile(f)} />
          <div>
            <label className={LABEL} id="import-account-label">
              Into account
            </label>
            {openAccounts.length === 0 ? (
              <p className="text-[13px] text-ink-2">Add an account first, on the Entries page.</p>
            ) : (
              <Select
                items={openAccounts.map((a) => ({ value: a.id, label: a.name }))}
                value={account?.id ?? null}
                onValueChange={(v) => {
                  if (v) setAccountId(v);
                }}
              >
                <SelectTrigger aria-labelledby="import-account-label" className="pl-3">
                  <SelectValue placeholder="Pick an account" />
                </SelectTrigger>
                <SelectContent>
                  {openAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="readout">{a.currency}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="mt-2 text-[12px] text-ink-3">Amounts are read in the account&apos;s currency{account ? ` (${account.currency})` : ""}.</p>
          </div>
        </div>
        {fileError && !reading ? (
          <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {fileError}
          </p>
        ) : null}
        {file && reading && !analysis ? <p className="text-[13px] text-ink-2">Reading {file.name}…</p> : null}
      </section>

      {analysis && account ? (
        <div className={cn("flex flex-col gap-6 transition-opacity", reading && "opacity-60")} aria-busy={reading}>
          <MappingCard
            analysis={analysis}
            mapping={mapping}
            pick={pick}
            bankName={shownBank}
            onBankName={(name) => {
              setBankName(name);
            }}
            remember={remember}
            onRemember={setRemember}
            onMapping={editMapping}
            onPreset={(next) => {
              setOverride(next);
              setBankName(null);
            }}
            showSaveOption={owner}
          />

          <section aria-labelledby="import-rows" className="bento flex flex-col gap-4 p-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="import-rows" className="font-display text-[17px] leading-tight text-foreground">
                  Rows
                </h2>
                <p className="tabular mt-1 text-[13px] text-ink-2" aria-live="polite">
                  {rows.length === 0
                    ? "No rows to import with these columns."
                    : owner && !check.isSuccess && importedOn === null
                      ? check.isError
                        ? `${plural(rows.length, "row")} · couldn't check which are already here`
                        : `${plural(rows.length, "row")} · checking which are already here…`
                      : `${plural(fresh.length, "new entry", "new entries")} · ${plural(already.length, "already here", "already here")} · ${plural(analysis.skipped.length, "line")} skipped`}
                </p>
              </div>
              <SignCheck rows={rows} account={account} mapping={mapping} onFlip={editMapping} />
            </header>

            {importedOn !== null ? (
              <p role="status" className="rounded-[12px] bg-signal-soft px-3 py-2 text-[13px] text-foreground">
                This file already went into {account.name} on {dateTime(importedOn)}. Nothing new to import.
              </p>
            ) : null}
            {tooMany ? (
              <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                More than {MAX_IMPORT_ROWS.toLocaleString("en-GB")} rows. Export a shorter date range and import it in parts.
              </p>
            ) : null}
            {check.isError ? (
              <button type="button" onClick={() => void check.refetch()} className={buttonClass("surface", "pill-sm", "self-start")}>
                Check again
              </button>
            ) : null}

            {rows.length > 0 ? <RowTable rows={rows} present={present} currency={account.currency} checked={!owner || check.isSuccess} /> : null}
            {analysis.skipped.length > 0 ? <SkippedList skipped={analysis.skipped} /> : null}

            {sendError ? (
              <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                {sendError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={!canImport} onClick={() => void confirm()} className={buttonClass("inverse", "pill")}>
                <Upload aria-hidden />
                {busy ? "Importing…" : fresh.length > 0 ? `Import ${plural(fresh.length, "entry", "entries")}` : "Import"}
              </button>
              <button type="button" onClick={reset} className={buttonClass("ghost", "pill-sm")}>
                Cancel
              </button>
              {!owner ? <span className="text-[12.5px] text-ink-3">Demo: imported rows stay in this tab.</span> : null}
            </div>
          </section>
        </div>
      ) : null}

      {owner && !file ? <History setup={setup.data} accounts={payload.accounts} onUndone={() => {
            hideImported(qc, [], true);
          }}
        /> : null}
    </div>
  );
}

function DropZone({ file, onFile }: { file: PickedFile | null; onFile: (f: File) => void }) {
  const [over, setOver] = React.useState(false);
  const id = React.useId();
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={cn(
        "flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-card px-4 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring",
        over ? "bg-signal-soft" : "bg-card-nested hover:bg-signal-soft/60",
      )}
    >
      <FileSpreadsheet aria-hidden className="size-6 text-signal" />
      {file ? (
        <span className="max-w-full truncate text-[14px] font-medium text-foreground">{file.name}</span>
      ) : (
        <span className="text-[14px] font-medium text-foreground">Drop a statement here, or choose a file</span>
      )}
      <span className="text-[12px] text-ink-2">{file ? "Choose another file to replace it" : "CSV or Excel (.xlsx). PDFs can't be read: export CSV instead."}</span>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

const SOURCE_TEXT: Record<MappingPick["source"], string> = {
  saved: "Your saved columns",
  preset: "Matched a bank's export",
  guess: "Guessed from the headers: check them",
  custom: "Set by you",
};

function MappingCard({
  analysis,
  mapping,
  pick,
  bankName,
  onBankName,
  remember,
  onRemember,
  onMapping,
  onPreset,
  showSaveOption,
}: {
  analysis: StatementAnalysis;
  mapping: ColumnMapping;
  pick: MappingPick | null;
  bankName: string;
  onBankName: (name: string) => void;
  remember: boolean;
  onRemember: (on: boolean) => void;
  onMapping: (m: ColumnMapping) => void;
  onPreset: (p: MappingPick | null) => void;
  showSaveOption: boolean;
}) {
  const id = React.useId();
  const { header } = analysis.table;
  const [open, setOpen] = React.useState(pick === null || pick.source === "guess");
  const fitting = PRESETS.flatMap((p) => {
    const m = presetMapping(p, analysis.table);
    return m ? [{ preset: p, mapping: m }] : [];
  });
  const presetValue = pick?.source === "preset" && pick.presetId ? pick.presetId : "auto";
  const columns = header.map((h) => ({ value: h, label: h }));
  const sampleOf = (h: string) => {
    const i = header.indexOf(h);
    return analysis.sample.map((r) => r[i] ?? "").find((v) => v !== "") ?? "";
  };
  const amount = mapping.amount;

  const columnSelect = (label: string, value: string | null, onChange: (v: string | null) => void, optional = false) => (
    <ColumnSelect label={label} value={value} options={columns} optional={optional} sample={value ? sampleOf(value) : ""} onChange={onChange} />
  );

  return (
    <section aria-labelledby={`${id}-title`} className="bento flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-display text-[17px] leading-tight text-foreground">
            Columns
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">
            {pick ? SOURCE_TEXT[pick.source] : "No date or amount column found: pick them below."}
            {pick?.source === "preset" && pick.presetId ? ` · ${PRESETS.find((p) => p.id === pick.presetId)?.name ?? ""}` : ""}
            {pick?.source === "preset" && PRESETS.find((p) => p.id === pick.presetId)?.confidence === "unverified" ? " (from one public source: check the rows)" : ""}
          </p>
          {analysis.missing.length > 0 ? (
            <p role="alert" className="mt-1 text-[13px] text-destructive">
              This file has no {analysis.missing.map((m) => `“${m}”`).join(", ")} column. Pick the right ones below.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
          }}
          className={buttonClass("surface", "pill-sm")}
        >
          {open ? "Hide columns" : "Edit columns"}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <div>
          <label htmlFor={`${id}-bank`} className={LABEL}>
            Bank
          </label>
          <input
            id={`${id}-bank`}
            value={bankName}
            maxLength={BANK_NAME_MAX}
            placeholder="e.g. GTBank savings"
            onChange={(e) => {
              onBankName(e.currentTarget.value);
            }}
            className={FIELD}
          />
          {showSaveOption ? (
            <label className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => {
                  onRemember(e.currentTarget.checked);
                }}
                className="size-4 accent-[var(--color-signal)]"
              />
              Remember these columns for this bank
            </label>
          ) : null}
        </div>
        {fitting.length > 0 ? (
          <div>
            <span className={LABEL} id={`${id}-preset-label`}>
              Bank format
            </span>
            <Select
              items={[{ value: "auto", label: "Automatic" }, ...fitting.map((f) => ({ value: f.preset.id, label: f.preset.name }))]}
              value={presetValue}
              onValueChange={(v) => {
                const f = fitting.find((x) => x.preset.id === v);
                onPreset(f ? { source: "preset", bankName: f.preset.name, presetId: f.preset.id, mapping: f.mapping } : null);
              }}
            >
              <SelectTrigger aria-labelledby={`${id}-preset-label`} className="pl-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic</SelectItem>
                {fitting.map((f) => (
                  <SelectItem key={f.preset.id} value={f.preset.id}>
                    {f.preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
          {columnSelect("Date", mapping.date, (v) => {
            if (v) onMapping({ ...mapping, date: v });
          })}
          <div>
            <span className={LABEL}>Date order</span>
            <Segmented<DateOrder>
              label="Date order"
              value={mapping.dateOrder}
              options={[
                { value: "dmy", label: "Day first" },
                { value: "mdy", label: "Month first" },
              ]}
              onChange={(v) => {
                onMapping({ ...mapping, dateOrder: v });
              }}
              layoutId={`${id}-order`}
            />
          </div>
          <div className="@2xl:col-span-2">
            <span className={LABEL}>Amount</span>
            <Segmented<ColumnMapping["amount"]["kind"]>
              label="Amount columns"
              value={amount.kind}
              options={[
                { value: "signed", label: "One column" },
                { value: "split", label: "Debit and credit" },
                { value: "typed", label: "Amount and type" },
              ]}
              onChange={(kind) => {
                const first = amount.kind === "split" ? amount.out : amount.column;
                const second = amount.kind === "split" ? amount.in : amount.kind === "typed" ? amount.type : (header.find((h) => h !== first && h !== mapping.date) ?? first);
                onMapping({
                  ...mapping,
                  amount:
                    kind === "signed"
                      ? { kind, column: first, outflow: "negative" }
                      : kind === "split"
                        ? { kind, out: first, in: second }
                        : { kind, column: first, type: second },
                });
              }}
              layoutId={`${id}-amount`}
            />
          </div>
          {amount.kind === "signed" ? (
            <>
              {columnSelect("Amount column", amount.column, (v) => {
                if (v) onMapping({ ...mapping, amount: { ...amount, column: v } });
              })}
              <div>
                <span className={LABEL}>Money out shows as</span>
                <Segmented<"negative" | "positive">
                  label="Money out shows as"
                  value={amount.outflow}
                  options={[
                    { value: "negative", label: "Minus (−50)" },
                    { value: "positive", label: "Plus (50)" },
                  ]}
                  onChange={(v) => {
                    onMapping({ ...mapping, amount: { ...amount, outflow: v } });
                  }}
                  layoutId={`${id}-outflow`}
                />
              </div>
            </>
          ) : amount.kind === "split" ? (
            <>
              {columnSelect("Money out (debit)", amount.out, (v) => {
                if (v) onMapping({ ...mapping, amount: { ...amount, out: v } });
              })}
              {columnSelect("Money in (credit)", amount.in, (v) => {
                if (v) onMapping({ ...mapping, amount: { ...amount, in: v } });
              })}
            </>
          ) : (
            <>
              {columnSelect("Amount column", amount.column, (v) => {
                if (v) onMapping({ ...mapping, amount: { ...amount, column: v } });
              })}
              {columnSelect("Debit / credit column", amount.type, (v) => {
                if (v) onMapping({ ...mapping, amount: { ...amount, type: v } });
              })}
            </>
          )}
          {columnSelect("Payee or description", mapping.payee[0] ?? null, (v) => {
            if (v) onMapping({ ...mapping, payee: [v] });
          })}
          {columnSelect(
            "Running balance",
            mapping.balance,
            (v) => {
              onMapping({ ...mapping, balance: v });
            },
            true,
          )}
          {columnSelect(
            "Bank reference",
            mapping.reference,
            (v) => {
              onMapping({ ...mapping, reference: v });
            },
            true,
          )}
        </div>
      ) : null}
    </section>
  );
}

function ColumnSelect({
  label,
  value,
  options,
  optional,
  sample,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  optional: boolean;
  sample: string;
  onChange: (v: string | null) => void;
}) {
  const id = React.useId();
  const items = optional ? [{ value: NONE, label: "None" }, ...options] : options;
  return (
    <div className="min-w-0">
      <span className={LABEL} id={id}>
        {label}
      </span>
      <Select
        items={items}
        value={value ?? (optional ? NONE : null)}
        onValueChange={(v) => {
          onChange(v === NONE || v === null ? null : v);
        }}
      >
        <SelectTrigger aria-labelledby={id} className="pl-3">
          <SelectValue placeholder="Pick a column" />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sample ? <p className="mt-1 truncate text-[12px] text-ink-3">e.g. {sample}</p> : null}
    </div>
  );
}

/**
 * The sign check: money out should show as minus. A card account whose rows
 * are mostly money in usually means the export prints charges as positive.
 */
function SignCheck({ rows, account, mapping, onFlip }: { rows: readonly KeyedRow[]; account: Account; mapping: ColumnMapping; onFlip: (m: ColumnMapping) => void }) {
  const flipped = flipSigns(mapping);
  if (rows.length === 0 || !flipped) return null;
  const ins = rows.filter((r) => r.amountMinor > 0).length;
  const suspicious = account.kind === "card" && ins * 2 > rows.length;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => {
          onFlip(flipped);
        }}
        className={buttonClass(suspicious ? "inverse" : "surface", "pill-sm")}
      >
        <ArrowUpDown aria-hidden />
        Flip in and out
      </button>
      {suspicious ? <p className="max-w-[280px] text-right text-[12px] text-ink-2">Most rows are money in. On a card that usually means charges are printed as positive.</p> : null}
    </div>
  );
}

function RowTable({ rows, present, currency, checked }: { rows: readonly KeyedRow[]; present: ReadonlySet<string>; currency: Account["currency"]; checked: boolean }) {
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div className="-mx-2 overflow-x-auto scroll-fade-x">
      <table className="w-full min-w-[520px] text-left text-[13.5px]">
        <thead>
          <tr className="readout">
            <th scope="col" className="px-2 py-1.5 font-normal">
              Line
            </th>
            <th scope="col" className="px-2 py-1.5 font-normal">
              Date
            </th>
            <th scope="col" className="w-full px-2 py-1.5 font-normal">
              Payee
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-normal">
              Amount
            </th>
            <th scope="col" className="px-2 py-1.5 font-normal">
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const here = present.has(r.key);
            return (
              <tr key={r.key} className={cn("align-baseline", here && "text-ink-3")}>
                <td className="tabular px-2 py-1.5 text-ink-3">{r.rowNo}</td>
                <td className="tabular px-2 py-1.5 whitespace-nowrap">{shortDayLabel(r.postedOn)}</td>
                <td className="max-w-0 truncate px-2 py-1.5">{r.payee || <span className="text-ink-3">No payee</span>}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <MoneyText value={{ minor: r.amountMinor, currency }} sign="always" />
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {checked ? (
                    <span className={cn("rounded-pill px-2 py-0.5 text-[11.5px] font-medium", here ? "bg-muted text-ink-2" : "bg-signal-soft text-foreground")}>
                      {here ? "Already here" : "New"}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > shown.length ? (
        <p className="tabular px-2 pt-2 text-[12.5px] text-ink-2">And {plural(rows.length - shown.length, "more row")}, all counted above.</p>
      ) : null}
    </div>
  );
}

function SkippedList({ skipped }: { skipped: StatementAnalysis["skipped"] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="tabular self-start rounded-pill px-1 text-[12.5px] font-medium text-ink-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? "Hide skipped lines" : `Skipped lines (${String(skipped.length)}): not txns, like totals and opening balances`}
      </button>
      {open ? (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-[12px] bg-card-nested p-3 text-[12.5px]">
          {skipped.map((s) => (
            <li key={s.rowNo} className="flex gap-3">
              <span className="tabular w-14 shrink-0 text-ink-3">Line {s.rowNo}</span>
              <span className="min-w-0 truncate text-ink-2">{s.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Undo for an import: a confirm first, since it removes every row it added (user rule: cascading deletes are confirmed). */
function UndoImport({ batch, owner, onUndone, label = "Undo import" }: { batch: ImportBatchInfo; owner: boolean; onUndone: () => void; label?: string }) {
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (owner) {
        const res = await undoImport({ id: batch.id });
        if (!res.ok) {
          setError("Couldn't undo it. Try again.");
          return;
        }
      }
      toast({ title: `Removed ${plural(batch.rowsImported, "entry", "entries")} from ${batch.filename}` });
      onUndone();
    } catch {
      setError("Couldn't undo it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => {
          setAsking(true);
        }}
        className={buttonClass("ghost", "pill-sm", "text-destructive hover:text-destructive")}
      >
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-label="Confirm undo" className="flex flex-wrap items-center gap-2 rounded-pill bg-destructive/10 py-1 pr-1 pl-3">
      <span className="tabular text-[12.5px] text-foreground">Remove the {plural(batch.rowsImported, "entry", "entries")} it added?</span>
      <button type="button" disabled={busy} onClick={() => void run()} className={buttonClass("inverse", "pill-sm")}>
        {busy ? "Removing…" : "Remove"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setAsking(false);
        }}
        className={buttonClass("ghost", "pill-sm")}
      >
        Keep
      </button>
      {error ? (
        <span role="alert" className="text-[12.5px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function ImportDone({ done, owner, onAnother, onUndone }: { done: Done; owner: boolean; onAnother: () => void; onUndone: () => void }) {
  const { batch } = done;
  const txnRows = batch.rowsTotal - batch.rowsSkipped;
  const already = txnRows - batch.rowsImported;
  return (
    <section aria-labelledby="import-done" className="bento flex flex-col items-start gap-4 p-5">
      <h2 id="import-done" className="font-display text-[17px] leading-tight text-foreground">
        Imported {plural(batch.rowsImported, "entry", "entries")} into {done.accountName}
      </h2>
      <p className="tabular text-[13.5px] text-ink-2" role="status">
        {already > 0 ? `${plural(already, "row was", "rows were")} already here and left as they were. ` : ""}
        {batch.rowsSkipped > 0 ? `${plural(batch.rowsSkipped, "line")} skipped (not txns). ` : ""}
        From {batch.filename}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/money" className={buttonClass("inverse", "pill")}>
          See entries
        </Link>
        <button type="button" onClick={onAnother} className={buttonClass("surface", "pill")}>
          Import another file
        </button>
        {batch.rowsImported > 0 ? <UndoImport batch={batch} owner={owner} onUndone={onUndone} /> : null}
      </div>
    </section>
  );
}

function History({ setup, accounts, onUndone }: { setup: ImportSetup | undefined; accounts: readonly Account[]; onUndone: () => void }) {
  const batches = setup?.batches ?? [];
  if (batches.length === 0) return null;
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? "An account";
  return (
    <section aria-labelledby="import-history" className="bento flex flex-col gap-3 p-5">
      <h2 id="import-history" className="font-display text-[17px] leading-tight text-foreground">
        Recent imports
      </h2>
      <ul className="flex flex-col">
        {batches.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] text-foreground">{b.filename}</p>
              <p className="tabular text-[12.5px] text-ink-2">
                {name(b.accountId)} · {dateTime(b.createdAt)} · {plural(b.rowsImported, "entry", "entries")} added
              </p>
            </div>
            {b.rowsImported > 0 ? <UndoImport batch={b} owner onUndone={onUndone} label="Undo" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
