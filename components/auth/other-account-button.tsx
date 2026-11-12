"use client";

import { UserRoundCog } from "lucide-react";
import { useState } from "react";
import { leaveAfterSignOut, signOutOk } from "@/components/auth/account-actions";
import { buttonClass } from "@/components/ui/button";

/** Signs this browser out, then back to the sign-in page, which returns to `next`. */
export function OtherAccountButton({ next }: { next: string }) {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");

  async function switchAccount() {
    setState("pending");
    if (await signOutOk()) leaveAfterSignOut(`/login?next=${encodeURIComponent(next)}`);
    else setState("failed");
  }

  return (
    <button
      type="button"
      onClick={() => void switchAccount()}
      disabled={state === "pending"}
      aria-live="polite"
      className={buttonClass("surface", "pill", "w-full")}
    >
      <UserRoundCog aria-hidden />
      {{ idle: "Use another account", pending: "Signing out", failed: "Sign-out failed, try again" }[state]}
    </button>
  );
}
