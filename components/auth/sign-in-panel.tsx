"use client";

import { Fingerprint, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Route } from "next";
import { buttonClass } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

type Pending = "github" | "passkey" | null;

export function SignInPanel({ next, error }: { next: string; error: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(error);

  async function withGitHub() {
    setPending("github");
    setMessage(null);
    const { error: failure } = await authClient.signIn.social({
      provider: "github",
      callbackURL: next,
      errorCallbackURL: "/login",
    });
    // On success the browser is already leaving for GitHub.
    if (failure) {
      setMessage("GitHub sign-in could not start. Try again.");
      setPending(null);
    }
  }

  async function withPasskey() {
    setPending("passkey");
    setMessage(null);
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setMessage("No passkey sign-in. Use GitHub, then add a passkey.");
      setPending(null);
      return;
    }
    router.replace(next as Route);
    router.refresh();
  }

  return (
    <div className="mt-8 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void withPasskey()}
        disabled={pending !== null}
        className={buttonClass("inverse", "pill")}
      >
        <Fingerprint aria-hidden />
        {pending === "passkey" ? "Waiting for passkey" : "Sign in with a passkey"}
      </button>
      <button
        type="button"
        onClick={() => void withGitHub()}
        disabled={pending !== null}
        className={buttonClass("surface", "pill")}
      >
        <LogIn aria-hidden />
        {pending === "github" ? "Opening GitHub" : "Continue with GitHub"}
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-center text-[13px] text-critical">
        {message}
      </p>
    </div>
  );
}
