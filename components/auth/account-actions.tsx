"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={() => void signOut()} disabled={pending} className={buttonClass("surface", "pill-sm")}>
      <LogOut aria-hidden />
      {pending ? "Signing out" : "Sign out"}
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
