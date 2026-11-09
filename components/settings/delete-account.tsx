"use client";

import * as React from "react";
import { LogIn, Trash2 } from "lucide-react";
import { deleteAccount, type DeleteAccountResult } from "@/actions/account";
import { leaveAfterDelete, leaveAfterSignOut, signOutOk } from "@/components/auth/account-actions";
import { FIELD, LABEL } from "@/components/money/form-kit";
import { buttonClass } from "@/components/ui/button";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { cn } from "@/lib/utils";

// Self-service account deletion (V79). A confirm dialog, never an Undo toast:
// nothing can bring the account back, so the typed email is the pause.

const DANGER = "bg-critical/10 text-critical hover:bg-critical/16 hover:text-critical dark:hover:bg-critical/16";

type State = "idle" | "pending" | "signing-out" | Exclude<DeleteAccountResult, { ok: true }>["reason"];

const MESSAGE: Partial<Record<State, string>> = {
  mismatch: "That isn't this account's email.",
  stale: "You signed in over a day ago. Sign in again, then delete within a day.",
  failed: "The account was not deleted. Try again.",
  demo: "There is no account in demo mode.",
  invalid: "The account was not deleted. Try again.",
};

export function DeleteAccountButton({ email }: { email: string }) {
  const [open, setOpen] = React.useState(false);
  const [origin, setOrigin] = React.useState<DOMRect | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          setOrigin(e.currentTarget.getBoundingClientRect());
          setOpen(true);
        }}
        className={buttonClass("ghost", "pill-sm", DANGER)}
      >
        <Trash2 aria-hidden />
        Delete account
      </button>
      <GrowDialog open={open} onOpenChange={setOpen} title="Delete your account?" originRect={origin} initialFocus="input">
        <DeleteAccountForm
          email={email}
          onCancel={() => {
            setOpen(false);
          }}
        />
      </GrowDialog>
    </>
  );
}

function DeleteAccountForm({ email, onCancel }: { email: string; onCancel: () => void }) {
  const id = React.useId();
  const [typed, setTyped] = React.useState("");
  const [state, setState] = React.useState<State>("idle");
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (!matches || state === "pending") return;
    setState("pending");
    let result: DeleteAccountResult;
    try {
      result = await deleteAccount({ confirm: typed });
    } catch {
      result = { ok: false, reason: "failed" };
    }
    if (result.ok) {
      await leaveAfterDelete();
      return;
    }
    setState(result.reason);
  }

  async function signInAgain() {
    setState("signing-out");
    if (await signOutOk()) leaveAfterSignOut(`/login?next=${encodeURIComponent("/settings?s=account")}`);
    else setState("failed");
  }

  const message = MESSAGE[state];

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      <p className="text-[14px] leading-relaxed text-pretty text-ink-2">
        This deletes your account and everything in it: money, notes, your library and reading progress, media, connections and settings. It also
        clears them from this browser. It can&apos;t be undone.
      </p>
      <div>
        <label htmlFor={`${id}-email`} className={LABEL}>
          Type your email to confirm
        </label>
        <input
          id={`${id}-email`}
          type="email"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            if (state !== "pending" && state !== "signing-out") setState("idle");
          }}
          placeholder={email}
          autoComplete="off"
          spellCheck={false}
          disabled={state === "pending" || state === "signing-out"}
          aria-describedby={`${id}-status`}
          className={cn(FIELD, "font-mono")}
        />
      </div>
      <p id={`${id}-status`} role="status" aria-live="polite" className="min-h-5 text-[13px] text-critical">
        {message ?? null}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass("ghost", "pill-sm")}>
          Cancel
        </button>
        {state === "stale" || state === "signing-out" ? (
          <button type="button" onClick={() => void signInAgain()} disabled={state === "signing-out"} className={buttonClass("inverse", "pill-sm")}>
            <LogIn aria-hidden />
            {state === "signing-out" ? "Signing out" : "Sign in again"}
          </button>
        ) : (
          <button type="submit" disabled={!matches || state === "pending"} className={buttonClass("ghost", "pill-sm", DANGER)}>
            <Trash2 aria-hidden />
            {state === "pending" ? "Deleting" : "Delete for good"}
          </button>
        )}
      </div>
    </form>
  );
}
