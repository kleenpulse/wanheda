"use client";

import { Fingerprint, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Route } from "next";
import { buttonClass } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { isDesktop } from "@/lib/platform/desktop";

type Pending = "github" | "passkey" | null;

export function SignInPanel({ next, error }: { next: string; error: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(error);
  // Desktop: GitHub opened in the default browser, and this window waits for it to come back.
  const [inBrowser, setInBrowser] = useState(false);

  async function withGitHub() {
    setPending("github");
    setMessage(null);
    setInBrowser(false);
    const { error: failure } = await authClient.signIn.social({
      provider: "github",
      callbackURL: next,
      errorCallbackURL: "/login",
    });
    if (failure) {
      setMessage("GitHub sign-in could not start. Try again.");
      setPending(null);
      return;
    }
    // On the web the page is already leaving for GitHub. The desktop app opens
    // GitHub in the default browser instead and comes back here by itself.
    if (isDesktop()) {
      setInBrowser(true);
      setPending(null);
    }
  }

  async function withPasskey() {
    setPending("passkey");
    setMessage(null);
    setInBrowser(false);
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
        {pending === "github" ? "Opening GitHub" : inBrowser ? "Open GitHub again" : "Continue with GitHub"}
      </button>
      <p role="status" aria-live="polite" className={`min-h-5 text-center text-[13px] ${message ? "text-critical" : "text-ink-2"}`}>
        {message ?? (inBrowser ? "Finish signing in on GitHub. Wanheda picks it up from there." : null)}
      </p>
    </div>
  );
}
