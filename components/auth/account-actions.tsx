"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { ACTIVITY_STORAGE_KEY } from "@/lib/activity/store";
import { authClient } from "@/lib/auth/client";
import { announceAccount } from "@/lib/device/account-channel";
import { WINDOWS_STORAGE_KEY } from "@/lib/windows/store";

/** Ends the session. False on an error response or a network failure, so callers can recover. */
export async function signOutOk(): Promise<boolean> {
  try {
    const result = await authClient.signOut();
    return !result.error;
  } catch {
    return false;
  }
}

/**
 * After a sign-out: other tabs reload (lib/device/account-channel.ts), this
 * account's timers and open windows leave the browser, and /login loads as a
 * new page, so no module-level store or in-tab memory carries over to whoever
 * signs in next (ADR-0015). The account's IndexedDB stores stay, under its own
 * name, for when it comes back.
 */
export function leaveAfterSignOut(): void {
  announceAccount(null);
  try {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
    localStorage.removeItem(WINDOWS_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was kept there either.
  }
  window.location.replace("/login");
}

export function SignOutButton() {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");

  async function signOut() {
    setState("pending");
    if (await signOutOk()) {
      leaveAfterSignOut();
    } else {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={state === "pending"}
      aria-live="polite"
      className={buttonClass("surface", "pill-sm")}
    >
      <LogOut aria-hidden />
      {{ idle: "Sign out", pending: "Signing out", failed: "Sign-out failed, try again" }[state]}
    </button>
  );
}

export function AddPasskeyButton() {
  const [state, setState] = useState<"idle" | "pending" | "added" | "failed">("idle");

  async function addPasskey() {
    setState("pending");
    const result = await authClient.passkey.addPasskey();
    setState(result.error ? "failed" : "added");
  }

  const label = {
    idle: "Add a passkey",
    pending: "Waiting for passkey",
    added: "Passkey added",
    failed: "Passkey not added",
  }[state];

  return (
    <button
      type="button"
      onClick={() => void addPasskey()}
      disabled={state === "pending"}
      aria-live="polite"
      className={buttonClass("inverse", "pill-sm")}
    >
      <KeyRound aria-hidden />
      {label}
    </button>
  );
}
