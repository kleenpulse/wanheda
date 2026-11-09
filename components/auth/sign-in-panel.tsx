"use client";

import { Fingerprint, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Route } from "next";
import { buttonClass } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import type { SignInMethod } from "@/lib/auth/last-method";
import { isDesktop } from "@/lib/platform/desktop";

type Provider = "github" | "google";
type Pending = Provider | "passkey" | null;

const NAME: Record<Provider, string> = { github: "GitHub", google: "Google" };

export function SignInPanel({
  next,
  error,
  google,
  lastUsed,
}: {
  next: string;
  error: string | null;
  google: boolean;
  /** How this browser last signed in (V81), read from a cookie by the page. */
  lastUsed: SignInMethod | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(error);
  // Desktop: the provider opened in the default browser, and this window waits for it to come back.
  const [inBrowser, setInBrowser] = useState<Provider | null>(null);

  async function withProvider(provider: Provider) {
    setPending(provider);
    setMessage(null);
    setInBrowser(null);
    const { error: failure } = await authClient.signIn.social({
      provider,
      callbackURL: next,
      errorCallbackURL: "/login",
    });
    if (failure) {
      setMessage(`${NAME[provider]} sign-in could not start. Try again.`);
      setPending(null);
      return;
    }
    // On the web the page is already leaving for the provider. The desktop app
    // opens it in the default browser instead and comes back here by itself.
    if (isDesktop()) {
      setInBrowser(provider);
      setPending(null);
    }
  }

  async function withPasskey() {
    setPending("passkey");
    setMessage(null);
    setInBrowser(null);
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setMessage(`No passkey sign-in. Use ${google ? "GitHub or Google" : "GitHub"}, then add a passkey.`);
      setPending(null);
      return;
    }
    router.replace(next as Route);
    router.refresh();
  }

  const providers: Provider[] = google ? ["github", "google"] : ["github"];

  return (
    <div className="mt-8 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void withPasskey()}
        disabled={pending !== null}
        className={buttonClass("inverse", "pill", "relative")}
      >
        <Fingerprint aria-hidden />
        {pending === "passkey" ? "Waiting for passkey" : "Sign in with a passkey"}
        {lastUsed === "passkey" ? <LastUsed /> : null}
      </button>
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => void withProvider(provider)}
          disabled={pending !== null}
          className={buttonClass("surface", "pill", "relative")}
        >
          <LogIn aria-hidden />
          {pending === provider
            ? `Opening ${NAME[provider]}`
            : inBrowser === provider
              ? `Open ${NAME[provider]} again`
              : `Continue with ${NAME[provider]}`}
          {lastUsed === provider ? <LastUsed /> : null}
        </button>
      ))}
      <p role="status" aria-live="polite" className={`min-h-5 text-center text-[13px] ${message ? "text-critical" : "text-ink-2"}`}>
        {message ?? (inBrowser ? `Finish signing in on ${NAME[inBrowser]}. Wanheda picks it up from there.` : null)}
      </p>
    </div>
  );
}

/**
 * A quiet duo-tone tag on the button's top-right edge. Out of the label's
 * flow, so even the longest label fits a 320 px phone. The opaque base under
 * the tint keeps it the same over the button's edge and the card in both
 * themes. The button needs `relative`.
 */
function LastUsed() {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute -top-2 right-4 rounded-pill bg-background">
        <span className="font-label block rounded-pill bg-signal-soft px-2 py-[3px] text-[10px] leading-none font-medium tracking-[0.06em] text-signal-ink uppercase">
          Last used
        </span>
      </span>
      <span className="sr-only">, last used</span>
    </>
  );
}
