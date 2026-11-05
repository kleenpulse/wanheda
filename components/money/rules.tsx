"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shell/page-frame";
import { byId, TAG_MAX, TAGS_MAX, type Category, type MoneyPayload } from "@/lib/money/money";
import { nextPriority, orderRules, pastMatches, RULE_TEXT_MAX, ruleMatches, type Rule } from "@/lib/money/rules";
import { cn } from "@/lib/utils";
import { FIELD, LABEL } from "./form-kit";
import { MoneyLoadFailed } from "./money-app";
import { CategoryMark } from "./money-text";
import { grouped } from "./txn-form";
import { useMoney, useRuleApi } from "./use-money";

// Rules (FR-MONEY-13): "payee contains X → category Y, tags Z", first match
// wins from the top. They run on new entries left uncategorised and on every
// imported row. "Matches N" counts the entries this device holds (the last
// three months), so the owner sees what a rule would catch before saving it.

export function RulesApp() {
  const { data, failed, refetch } = useMoney();
  if (!data) {
    if (failed) return <MoneyLoadFailed onRetry={() => void refetch()} />;
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label="Loading rules">
        <div className="h-10 w-72 max-w-full rounded-pill bg-card-nested" />
        <div className="h-[260px] rounded-card bg-card-nested" />
      </div>
    );
  }
  return <RulesView payload={data} />;
}

interface Editing {
  rule: Rule | null;
  origin: DOMRect | null;
}

const stamp = () => Date.now();
const NONE = "none";

function RulesView({ payload }: { payload: MoneyPayload }) {
  const api = useRuleApi();
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const rules = React.useMemo(() => orderRules(payload.rules ?? []), [payload.rules]);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [shown, setShown] = React.useState(editing);
  if (editing && editing !== shown) setShown(editing);

  const open = (rule: Rule | null) => (e: React.MouseEvent<HTMLElement>) => {
    setEditing({ rule, origin: e.currentTarget.getBoundingClientRect() });
  };

  /** Moves a rule one place, renumbering the list so equal priorities can't make a swap a no-op. */
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    const a = rules[i];
    const b = rules[j];
    if (!a || !b) return;
    const order = rules.map((r) => r.id);
    order[i] = b.id;
    order[j] = a.id;
    order.forEach((id, n) => {
      const r = rules.find((x) => x.id === id);
      if (r && r.priority !== n) api.save({ ...r, priority: n });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-[13px] text-ink-2">
          The first rule that matches wins, from the top. Rules fill in the category of a new entry you leave without one, and of every imported row.
        </p>
        <button type="button" onClick={open(null)} className={buttonClass("inverse", "pill-sm")}>
          <Plus aria-hidden />
          New rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="bento p-5">
          <EmptyState title="No rules yet" body={'Try "payee contains uber → Transport". It runs on imports and on anything you add without a category.'} />
        </div>
      ) : (
        <ol className="bento flex flex-col p-1.5">
          {rules.map((r, i) => (
            <RuleRow
              key={r.id}
              rule={r}
              index={i}
              count={rules.length}
              category={r.categoryId ? (categories.get(r.categoryId) ?? null) : null}
              matches={pastMatches(r, payload.txns)}
              onEdit={open(r)}
              onMove={(by) => {
                move(i, by);
              }}
              onToggle={() => {
                api.save({ ...r, enabled: !r.enabled });
              }}
            />
          ))}
        </ol>
      )}

      <GrowDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={shown?.rule ? "Edit rule" : "New rule"}
        originRect={shown?.origin ?? null}
      >
        {shown ? (
          <RuleForm
            key={shown.rule?.id ?? "new"}
            payload={payload}
            initial={shown.rule}
            priority={nextPriority(rules)}
            onDone={(r) => {
              api.save(r);
              setEditing(null);
            }}
            onDelete={(r) => {
              api.remove(r);
              setEditing(null);
            }}
          />
        ) : null}
      </GrowDialog>
    </div>
  );
}

function RuleRow({
  rule,
  index,
  count,
  category,
  matches,
  onEdit,
  onMove,
  onToggle,
}: {
  rule: Rule;
  index: number;
  count: number;
  category: Category | null;
  matches: number;
  onEdit: (e: React.MouseEvent<HTMLElement>) => void;
  onMove: (by: -1 | 1) => void;
  onToggle: () => void;
}) {
  return (
    <li className={cn("flex items-center gap-3 rounded-[14px] px-3 py-2.5 hover:bg-card-nested", !rule.enabled && "opacity-60")}>
      <span className="readout tabular w-5 shrink-0 text-center">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-foreground">
          <span className="text-ink-2">Payee contains </span>
          <span className="font-medium">&ldquo;{rule.payeeContains}&rdquo;</span>
        </p>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
          {category ? (
            <span className="inline-flex items-center gap-1.5">
              <CategoryMark category={category} className="size-5 text-[11px]" />
              {category.name}
            </span>
          ) : null}
          {rule.tags.map((t) => (
            <span key={t} className="rounded-pill bg-signal-soft px-2 py-0.5 text-[11.5px] text-foreground">
              #{t}
            </span>
          ))}
          <span className="tabular text-ink-3">· matches {matches === 1 ? "1 entry" : `${String(matches)} entries`}</span>
        </p>
      </div>
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-ink-2">
        <input type="checkbox" checked={rule.enabled} onChange={onToggle} className="size-4 accent-signal" />
        <span className="hidden @xl:inline">On</span>
        <span className="sr-only">Rule for {rule.payeeContains} is on</span>
      </label>
      <div className="flex shrink-0 items-center">
        <Tip
          label="Move up"
          render={
            <button type="button" disabled={index === 0} onClick={() => { onMove(-1); }} className={buttonClass("ghost", "circle-sm", "size-8")}>
              <ArrowUp aria-hidden />
              <span className="sr-only">Move the rule for {rule.payeeContains} up</span>
            </button>
          }
        />
        <Tip
          label="Move down"
          render={
            <button type="button" disabled={index === count - 1} onClick={() => { onMove(1); }} className={buttonClass("ghost", "circle-sm", "size-8")}>
              <ArrowDown aria-hidden />
              <span className="sr-only">Move the rule for {rule.payeeContains} down</span>
            </button>
          }
        />
        <button type="button" onClick={onEdit} aria-label={`Edit the rule for ${rule.payeeContains}`} className={buttonClass("ghost", "circle-sm", "size-8")}>
          <Pencil aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** "work, Late night" → ["work", "late night"]: trimmed, lower case, no repeats, capped. */
function parseTags(text: string): string[] {
  const out = text
    .split(",")
    .map((t) => t.trim().replace(/^#/, "").toLowerCase())
    .filter((t) => t !== "")
    .map((t) => t.slice(0, TAG_MAX));
  return [...new Set(out)].slice(0, TAGS_MAX);
}

function RuleForm({
  payload,
  initial,
  priority,
  onDone,
  onDelete,
}: {
  payload: MoneyPayload;
  initial: Rule | null;
  priority: number;
  onDone: (r: Rule) => void;
  onDelete: (r: Rule) => void;
}) {
  const id = React.useId();
  const [text, setText] = React.useState(initial?.payeeContains ?? "");
  const [categoryId, setCategoryId] = React.useState<string>(initial?.categoryId ?? NONE);
  const [tagText, setTagText] = React.useState(initial ? initial.tags.join(", ") : "");
  const [tried, setTried] = React.useState(false);

  const tags = parseTags(tagText);
  const needle = text.trim();
  const textError = needle === "" ? "Enter part of the payee's name" : null;
  const actionError = categoryId === NONE && tags.length === 0 ? "Pick a category or add a tag" : null;
  const options = [...grouped(payload.categories, "expense"), ...grouped(payload.categories, "income")];
  const items = [{ value: NONE, label: "Leave as is" }, ...options.map((o) => ({ value: o.c.id, label: `${o.c.emoji} ${o.c.name}` }))];

  // What it would catch among the entries on this device, newest first.
  const hits = React.useMemo(() => {
    if (needle === "") return { count: 0, payees: [] as string[] };
    const matched = payload.txns.filter((t) => ruleMatches({ payeeContains: needle, enabled: true }, t.payee));
    return { count: matched.length, payees: [...new Set(matched.map((t) => t.payee.trim()))].slice(0, 3) };
  }, [needle, payload.txns]);

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setTried(true);
    if (textError || actionError) return;
    onDone({
      id: initial?.id ?? crypto.randomUUID(),
      createdAt: initial?.createdAt ?? stamp(),
      payeeContains: needle.slice(0, RULE_TEXT_MAX),
      categoryId: categoryId === NONE ? null : categoryId,
      tags,
      priority: initial?.priority ?? priority,
      enabled: initial?.enabled ?? true,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${id}-text`} className={LABEL}>
          Payee contains
        </label>
        <input
          id={`${id}-text`}
          value={text}
          maxLength={RULE_TEXT_MAX}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
          }}
          placeholder="uber, shoprite, netflix…"
          aria-invalid={tried && textError !== null}
          aria-describedby={`${id}-hits`}
          className={FIELD}
        />
        <p id={`${id}-hits`} className="tabular mt-1 min-h-[18px] text-[12px] text-ink-2" aria-live="polite">
          {tried && textError ? (
            <span className="text-destructive">{textError}</span>
          ) : needle === "" ? null : hits.count === 0 ? (
            "Matches nothing in the last 3 months"
          ) : (
            <>
              <Wand2 aria-hidden className="mr-1 inline size-3.5 align-[-2px] text-signal" />
              Matches {hits.count === 1 ? "1 entry" : `${String(hits.count)} entries`} in the last 3 months: {hits.payees.join(", ")}
            </>
          )}
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-cat`} className={LABEL}>
          Set category
        </label>
        <Select
          items={items}
          value={categoryId}
          onValueChange={(v) => {
            if (v) setCategoryId(v);
          }}
        >
          <SelectTrigger id={`${id}-cat`} className="h-10 pl-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Leave as is</SelectItem>
            {options.map(({ c, child }) => (
              <SelectItem key={c.id} value={c.id} className={child ? "pl-7" : undefined}>
                {c.emoji} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label htmlFor={`${id}-tags`} className={LABEL}>
          Add tags
        </label>
        <input
          id={`${id}-tags`}
          value={tagText}
          autoComplete="off"
          onChange={(e) => {
            setTagText(e.target.value);
          }}
          placeholder="work, weekly"
          aria-describedby={`${id}-action-note`}
          className={FIELD}
        />
        <p id={`${id}-action-note`} className="mt-1 min-h-[18px] text-[12px] text-ink-2" aria-live="polite">
          {tried && actionError ? <span className="text-destructive">{actionError}</span> : "Comma between tags. A category you picked yourself is never changed."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {initial ? (
          <button
            type="button"
            onClick={() => {
              onDelete(initial);
            }}
            className={buttonClass("ghost", "pill-sm", "text-destructive hover:text-destructive")}
          >
            <Trash2 aria-hidden />
            Delete
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className={buttonClass("inverse", "pill")}>
          {initial ? "Save" : "Add rule"}
        </button>
      </div>
    </form>
  );
}
