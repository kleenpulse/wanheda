"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { saveBaseCurrency } from "@/actions/plans";
import { setPrivacy, usePrivacy } from "@/components/money/privacy";
import { useMoney } from "@/components/money/use-money";
import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { CURRENCY_CODES, type Currency } from "@/lib/money/currency";
import { MONEY_KEY, type MoneyPayload } from "@/lib/money/money";
import { PRIVACY_SHORTCUT } from "@/lib/money/privacy";

// Settings › Money (T38): the base currency reports convert into (synced,
// FR-MONEY-14), privacy mode (this device only) and the export (FR-MONEY-18).

export function MoneySection() {
  return (
    <div className="flex flex-col gap-6">
      <SettingsCard title="Currency">
        <SettingRow
          label="Base currency"
          description="Totals, budgets and Home convert into it at each day's rate, with the original amounts beside them. Entries keep their own currency."
        >
          {(labelId) => <BaseCurrencyPicker labelId={labelId} />}
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="Privacy">
        <SettingRow
          label="Hide amounts"
          description={`Shows every amount as dots, for showing your screen to someone. This device only. Press ${PRIVACY_SHORTCUT.toUpperCase()} anywhere to switch it.`}
        >
          {(labelId) => <PrivacySwitch labelId={labelId} />}
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="Export">
        <SettingRow label="Ledger (CSV)" description="Every entry, oldest first: date, amount, currency, payee, category, account, tags and note." layout="wide">
          {() => <ExportLink format="csv" />}
        </SettingRow>
        <SettingRow label="Everything (JSON)" description="Accounts, categories, entries, subscriptions, budgets and rules, with exact amounts." layout="wide">
          {() => <ExportLink format="json" />}
        </SettingRow>
      </SettingsCard>
    </div>
  );
}

function BaseCurrencyPicker({ labelId }: { labelId: string }) {
  const { data } = useMoney();
  const qc = useQueryClient();
  const owner = useAccount().kind === "owner";
  const current = data?.baseCurrency ?? null;

  const setBase = (next: Currency) => {
    const before = qc.getQueryData<MoneyPayload>(MONEY_KEY)?.baseCurrency;
    if (!before || next === before) return;
    // Optimistic (V24): every view converts into it at once.
    qc.setQueryData<MoneyPayload>(MONEY_KEY, (p) => (p ? { ...p, baseCurrency: next } : p));
    if (!owner) return;
    void saveBaseCurrency({ currency: next })
      .catch(() => ({ ok: false as const, reason: "failed" as const }))
      .then((result) => {
        if (result.ok) return;
        qc.setQueryData<MoneyPayload>(MONEY_KEY, (p) => (p && p.baseCurrency === next ? { ...p, baseCurrency: before } : p));
        toast({ title: "Base currency not saved", body: "The server didn't take it. Try again." });
      });
  };

  return (
    <div className="w-28">
      <Select
        items={CURRENCY_CODES.map((c) => ({ value: c, label: c }))}
        value={current}
        disabled={current === null}
        onValueChange={(v) => {
          if (v) setBase(v);
        }}
      >
        <SelectTrigger aria-labelledby={labelId} className="h-10 pl-3">
          <SelectValue placeholder="…" />
        </SelectTrigger>
        <SelectContent align="end">
          {CURRENCY_CODES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PrivacySwitch({ labelId }: { labelId: string }) {
  const on = usePrivacy();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      onClick={() => {
        setPrivacy(!on);
      }}
      className="group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-signal-soft p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-signal"
    >
      <span
        aria-hidden
        className="size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out-quint motion-reduce:transition-none group-aria-checked:translate-x-5"
      />
    </button>
  );
}

function ExportLink({ format }: { format: "csv" | "json" }) {
  return (
    <a href={`/api/money/export?format=${format}`} download className={buttonClass("surface", "pill-sm")}>
      <Download aria-hidden />
      Download {format.toUpperCase()}
    </a>
  );
}
