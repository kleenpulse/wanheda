import { z } from "zod";
import { TAG_MAX, TAGS_MAX, type Txn } from "./money";

/*
  Rules (FR-MONEY-13): "payee contains X → category Y, tags Z". Applied to a
  new entry the owner left uncategorised, and to every imported row. Rules
  run in priority order (lowest number first, then oldest) and the first one
  that matches wins, so the outcome never depends on how many match. Matching
  ignores case and runs of spaces.
*/

export const RULE_TEXT_MAX = 100;

export interface Rule {
  id: string;
  /** Matched against the payee, case and spacing ignored. */
  payeeContains: string;
  /** The category to set, or null to only add tags. */
  categoryId: string | null;
  tags: string[];
  /** Lower runs first. */
  priority: number;
  enabled: boolean;
  createdAt: number;
}

const tags = z
  .array(z.string().trim().toLowerCase().min(1).max(TAG_MAX))
  .max(TAGS_MAX)
  .transform((t) => [...new Set(t)]);

export const ruleWriteSchema = z
  .object({
    id: z.uuid(),
    payeeContains: z.string().trim().min(1).max(RULE_TEXT_MAX),
    categoryId: z.uuid().nullable(),
    tags,
    priority: z.number().int().min(0).max(1_000_000),
    enabled: z.boolean(),
  })
  .strict()
  .refine((r) => r.categoryId !== null || r.tags.length > 0, "A rule must set a category or a tag");

export type RuleWrite = z.infer<typeof ruleWriteSchema>;

export function ruleWriteOf(r: Rule): RuleWrite {
  return { id: r.id, payeeContains: r.payeeContains, categoryId: r.categoryId, tags: r.tags, priority: r.priority, enabled: r.enabled };
}

/** How rows are kept in `rule.match` and `rule.action` (jsonb). */
export const ruleMatchSchema = z.object({ payeeContains: z.string().min(1).max(RULE_TEXT_MAX) });
export const ruleActionSchema = z.object({ categoryId: z.uuid().nullable(), tags: z.array(z.string().min(1).max(TAG_MAX)).max(TAGS_MAX) });

const squash = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function ruleMatches(rule: Pick<Rule, "payeeContains" | "enabled">, payee: string): boolean {
  if (!rule.enabled) return false;
  const needle = squash(rule.payeeContains);
  return needle !== "" && squash(payee).includes(needle);
}

/** Priority order: lowest number first, then oldest, then id, so it is total. */
export function orderRules(rules: readonly Rule[]): Rule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The first enabled rule that matches the payee, in priority order. */
export function firstMatch(rules: readonly Rule[], payee: string): Rule | null {
  if (payee.trim() === "") return null;
  return orderRules(rules).find((r) => ruleMatches(r, payee)) ?? null;
}

/**
 * A txn with the first matching rule applied: its category if the txn has
 * none (an owner's pick always stands), and its tags added. `usable` drops a
 * rule's category that is archived or gone.
 */
export function applyRules<T extends Pick<Txn, "payee" | "categoryId" | "tags">>(txn: T, rules: readonly Rule[], usable: (categoryId: string) => boolean = () => true): T {
  const rule = firstMatch(rules, txn.payee);
  if (!rule) return txn;
  const categoryId = txn.categoryId ?? (rule.categoryId && usable(rule.categoryId) ? rule.categoryId : null);
  const merged = [...new Set([...txn.tags, ...rule.tags])].slice(0, TAGS_MAX);
  if (categoryId === txn.categoryId && merged.length === txn.tags.length) return txn;
  return { ...txn, categoryId, tags: merged };
}

/** How many past entries a rule would match ("matches N past"). */
export function pastMatches(rule: Pick<Rule, "payeeContains">, txns: readonly Pick<Txn, "payee">[]): number {
  let n = 0;
  for (const t of txns) if (ruleMatches({ ...rule, enabled: true }, t.payee)) n++;
  return n;
}

/** The priority a new rule gets: after every rule there is. */
export function nextPriority(rules: readonly Rule[]): number {
  return rules.reduce((max, r) => Math.max(max, r.priority + 1), 0);
}

/** Replaces or adds a rule in a list. */
export function upsertRuleIn(list: readonly Rule[], r: Rule): Rule[] {
  const i = list.findIndex((x) => x.id === r.id);
  return i < 0 ? [...list, r] : list.map((x) => (x.id === r.id ? r : x));
}
