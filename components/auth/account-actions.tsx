"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

/** Ends the session. False on an error response or a network failure, so callers can recover. */
export async function signOutOk(): Promise<boolean> {
  try {
    const result = await authClient.signOut();
    return !result.error;
  } catch {
    return false;
  }
}

export function SignOutButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");

  async function signOut() {
    setState("pending");
    if (await signOutOk()) {
      router.replace("/login");
      router.refresh();
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
