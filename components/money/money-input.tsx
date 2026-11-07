"use client";

import * as React from "react";
import { Diff } from "lucide-react";
import { applyEdit, cleanPaste, currencySymbol, isPlain, normalize, plainText, readAmount, type AmountRule } from "@/lib/money/amount-input";
import { exponentOf, formatMoney, type Currency } from "@/lib/money/currency";
import { cn } from "@/lib/utils";

// Every money field in Money and Income (amounts, opening balances, budgets,
// charges, targets). The field only takes what can make an amount, groups
// thousands as you type, reads short forms and sums ("20k", "2.5k + 800"),
// and turns them into the plain amount when you leave it. The logic lives in
// lib/money/amount-input.ts.

export interface MoneyFieldOptions {
  /** Edit mode: the stored amount (signed only when `allowNegative`). */
  initialMinor: number | null;
  currency: Currency;
  rule: AmountRule;
  allowNegative?: boolean;
  /** Makes the field required, with this message when it is empty. Without it, empty is 0. */
  emptyMessage?: string;
}

export function useMoneyField({ initialMinor, currency, rule, allowNegative = false, emptyMessage }: MoneyFieldOptions) {
  const [text, setText] = React.useState(() => (initialMinor === null ? "" : plainText(allowNegative ? initialMinor : Math.abs(initialMinor), currency)));
  // Set on blur, so an error shows once the person leaves the field, not mid-typing.
  const [touched, setTouched] = React.useState(false);
  const read = readAmount(text, currency, rule, emptyMessage);
  const plain = isPlain(text);

  return {
    text,
    setText,
    currency,
    allowNegative,
    /** The amount to save, or null while the field has an error. */
    minor: read.minor,
    /** What the text comes to, before the rule. */
    value: read.value,
    error: read.error,
    touched,
    /** True when the text is a sum or short form, so the note shows what it comes to. */
    expression: !plain && read.value !== null,
    /** Read the field as the person leaves it: show its error, or write the plain amount. */
    commit() {
      if (text.trim() === "") return;
      setTouched(true);
      if (read.value !== null) setText(plainText(read.value, currency));
    },
    reset() {
      setText("");
      setTouched(false);
    },
    /** The error to show: after a blur, or after the form was submitted once. */
    shownError(tried: boolean): string | null {
      return tried || touched ? read.error : null;
    },
  };
}

export type MoneyField = ReturnType<typeof useMoneyField>;

/** The field shell: the house field, with focus shown on the shell since the input inside has none. */
const SHELL =
  "flex h-10 w-full min-w-0 cursor-text items-center gap-1.5 rounded-[12px] bg-sheet px-3 text-[14px] text-foreground ring-1 ring-border has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring dark:bg-card-nested dark:ring-glass-border";

export function MoneyInput({
  field,
  invalid,
  className,
  inputRef,
  ...props
}: {
  field: MoneyField;
  /** Mark the input invalid (pass `field.shownError(tried) !== null`). */
  invalid: boolean;
  className?: string;
  /** The form's own ref to the input (to focus it after a save). */
  inputRef?: React.RefObject<HTMLInputElement | null>;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "ref" | "className" | "type" | "inputMode">) {
  const { currency, allowNegative, text, setText } = field;
  const ownRef = React.useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const caret = React.useRef<number | null>(null);
  // Bumped on every edit, so the caret is placed even when a refused keystroke leaves the text unchanged.
  const [edits, setEdits] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = ref.current;
    const at = caret.current;
    caret.current = null;
    if (el && at !== null && document.activeElement === el) el.setSelectionRange(at, at);
  }, [edits, ref]);

  const write = (next: { text: string; caret: number }) => {
    caret.current = next.caret;
    setText(next.text);
    setEdits((n) => n + 1);
  };

  const options = { currency, allowNegative };
  const negative = normalize(text).startsWith("-");

  const step = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const up = e.key === "ArrowUp";
    if (!up && e.key !== "ArrowDown") return;
    const start = normalize(text) === "" ? 0 : field.value;
    if (start === null) return;
    e.preventDefault();
    const exp = exponentOf(currency);
    const unit = e.altKey && exp >= 2 ? 10 ** (exp - 2) : 10 ** exp * (e.shiftKey ? 10 : 1);
    let next = start + (up ? unit : -unit);
    if (!allowNegative && next < 0) next = 0;
    if (!Number.isSafeInteger(next)) return;
    const shown = plainText(next, currency);
    write({ text: shown, caret: shown.length });
  };

  const flipSign = () => {
    if (normalize(text) === "") write({ text: "-", caret: 1 });
    else if (isPlain(text)) {
      const shown = negative ? text.replace(/^\s*-/, "") : `-${text}`;
      write({ text: shown, caret: shown.length });
    } else if (field.value !== null) {
      const shown = plainText(field.value === 0 ? 0 : -field.value, currency);
      write({ text: shown, caret: shown.length });
    }
  };

  return (
    <div
      className={cn(SHELL, className)}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.focus();
      }}
    >
      <span aria-hidden className="shrink-0 text-ink-3 select-none">
        {currencySymbol(currency)}
      </span>
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        aria-invalid={invalid}
        onChange={(e) => {
          // Typing over a selection is an insert too, so it is checked like any keystroke.
          const kind = (e.nativeEvent as InputEvent).inputType;
          const mode = typeof kind === "string" && kind.startsWith("delete") ? "delete" : "insert";
          write(applyEdit(text, e.target.value, e.target.selectionStart ?? e.target.value.length, options, mode));
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!pasted) return;
          e.preventDefault();
          const el = e.currentTarget;
          const from = el.selectionStart ?? text.length;
          const to = el.selectionEnd ?? from;
          const cleaned = cleanPaste(pasted, allowNegative);
          write(applyEdit(text, text.slice(0, from) + cleaned + text.slice(to), from + cleaned.length, options, "paste"));
        }}
        onBlur={(e) => {
          field.commit();
          props.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") field.commit();
          else step(e);
          props.onKeyDown?.(e);
        }}
        className="tabular h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
      />
      {allowNegative ? (
        <button
          type="button"
          aria-label={negative ? "Make positive" : "Make negative"}
          aria-pressed={negative}
          onClick={flipSign}
          className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-[8px] text-ink-2 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-signal-soft aria-pressed:text-foreground"
        >
          <Diff aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * The line under a money field: its error once shown, else what a sum or
 * short form comes to ("= ₦3,300"), else the form's own note.
 */
export function MoneyNote({
  field,
  tried,
  note,
  format = (minor) => formatMoney({ minor, currency: field.currency }),
  className,
  id,
}: {
  field: MoneyField;
  tried: boolean;
  note?: React.ReactNode;
  format?: (minor: number) => string;
  className?: string;
  id: string;
}) {
  const error = field.shownError(tried);
  return (
    <p id={id} className={cn("tabular text-[12px] text-ink-2", className)} aria-live="polite">
      {error ? <span className="text-destructive">{error}</span> : field.expression && field.value !== null ? `= ${format(field.value)}` : note}
    </p>
  );
}
