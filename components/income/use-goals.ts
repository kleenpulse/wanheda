"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { deleteGoal, saveGoal } from "@/actions/goals";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { goalWriteOf, type Goal } from "@/lib/saas/goals";
import { INCOME_KEY, type IncomePayload } from "@/lib/saas/income";

// Goal writes (FR-INCOME-10): shown at once in the income cache (V24), then
// sent. A failed save puts the goal back as it was and says so. Deleting
// hides the goal and only sends the delete when the Undo toast runs out
// (user rule, 2026-11-05). Demo keeps its edits in the tab.

/**
 * Goals hidden by a running undo toast, and saves still on their way, so a
 * background refetch can't bring a deleted one back early or blink a new one
 * out before the server has it (review nit, T43).
 */
const useLocal = create<{
  hidden: ReadonlySet<string>;
  pending: Readonly<Record<string, Goal>>;
  hide: (id: string) => void;
  show: (id: string) => void;
  hold: (goal: Goal) => void;
  release: (id: string) => void;
}>((set) => ({
  hidden: new Set(),
  pending: {},
  hide: (id) => {
    set((s) => ({ hidden: new Set([...s.hidden, id]) }));
  },
  show: (id) => {
    set((s) => ({ hidden: new Set([...s.hidden].filter((x) => x !== id)) }));
  },
  hold: (goal) => {
    set((s) => ({ pending: { ...s.pending, [goal.id]: goal } }));
  },
  release: (id) => {
    set((s) => {
      const { [id]: _done, ...rest } = s.pending;
      return { pending: rest };
    });
  },
}));

/** The goals to show: the cache with saves in flight laid over, less any under an undo toast. */
export function useVisibleGoals(goals: readonly Goal[]): Goal[] {
  const hidden = useLocal((s) => s.hidden);
  const pending = useLocal((s) => s.pending);
  return React.useMemo(() => {
    const merged = goals.map((g) => pending[g.id] ?? g);
    const known = new Set(goals.map((g) => g.id));
    for (const g of Object.values(pending)) if (!known.has(g.id)) merged.push(g);
    return merged.filter((g) => !hidden.has(g.id));
  }, [goals, hidden, pending]);
}

function upsert(payload: IncomePayload, goal: Goal): IncomePayload {
  const goals = payload.goals.some((g) => g.id === goal.id) ? payload.goals.map((g) => (g.id === goal.id ? goal : g)) : [...payload.goals, goal];
  return { ...payload, goals };
}

export function useGoalApi() {
  const qc = useQueryClient();
  const demo = useAccount().kind !== "owner";

  const save = React.useCallback(
    (goal: Goal) => {
      const before = qc.getQueryData<IncomePayload>(INCOME_KEY)?.goals.find((g) => g.id === goal.id) ?? null;
      // A refetch already on its way would land without this goal: drop it.
      void qc.cancelQueries({ queryKey: INCOME_KEY });
      qc.setQueryData<IncomePayload>(INCOME_KEY, (p) => (p ? upsert(p, goal) : p));
      if (demo) return;
      const { hold, release } = useLocal.getState();
      hold(goal);
      const undo = () => {
        qc.setQueryData<IncomePayload>(INCOME_KEY, (p) => (p ? (before ? upsert(p, before) : { ...p, goals: p.goals.filter((g) => g.id !== goal.id) }) : p));
      };
      void saveGoal(goalWriteOf(goal)).then(
        (r) => {
          if (r.ok) {
            qc.setQueryData<IncomePayload>(INCOME_KEY, (p) => (p ? upsert(p, r.goal) : p));
            release(goal.id);
            return;
          }
          release(goal.id);
          undo();
          toast({ title: "Couldn't save the goal", body: r.reason === "invalid" ? "Something in it wasn't valid." : "The server didn't take it. Try again." });
        },
        () => {
          release(goal.id);
          undo();
          toast({ title: "Couldn't save the goal", body: "You may be offline. Try again." });
        },
      );
    },
    [qc, demo],
  );

  const remove = React.useCallback(
    (goal: Goal) => {
      const { hide, show } = useLocal.getState();
      hide(goal.id);
      const cancel = () => {
        show(goal.id);
      };
      toast({
        id: `undo-delete-goal:${goal.id}`,
        title: `Deleted ${goal.title || "the goal"}`,
        action: { label: "Undo", onClick: cancel },
        // Closing the toast cancels too: only running out commits (user 2026-11-05).
        onClose: cancel,
        closeLabel: "Cancel delete",
        onExpire: () => {
          const drop = () => {
            qc.setQueryData<IncomePayload>(INCOME_KEY, (p) => (p ? { ...p, goals: p.goals.filter((g) => g.id !== goal.id) } : p));
            show(goal.id);
          };
          if (demo) {
            drop();
            return;
          }
          void deleteGoal({ id: goal.id }).then(
            (r) => {
              if (r.ok) drop();
              else {
                show(goal.id);
                toast({ title: "Couldn't delete the goal", body: "It's back in the list. Try again." });
              }
            },
            () => {
              show(goal.id);
              toast({ title: "Couldn't delete the goal", body: "You may be offline. It's back in the list." });
            },
          );
        },
      });
    },
    [qc, demo],
  );

  return { save, remove };
}
