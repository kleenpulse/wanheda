"use client";

import { Fingerprint, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import type { Route } from "next";
import { useAuthWord } from "@/components/auth/auth-word";
import { buttonClass } from "@/components/ui/button";
import { pickFromDom, resolveWord, wordDelay } from "@/lib/auth/auth-word";
import { authClient } from "@/lib/auth/client";
import { parseLastMethod, type SignInMethod } from "@/lib/auth/last-method";
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
  // What the sign-in swarm spells (V82). Hover and keyboard focus are kept
  // apart: the mouse leaving must not drop a word the keyboard still holds.
  const [hovered, setHovered] = useState<SignInMethod | null>(null);
  const [focused, setFocused] = useState<SignInMethod | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const setWord = useAuthWord()?.setWord;
  const word = resolveWord({ pending, inBrowser, hovered, focused });

  useEffect(() => {
    if (!setWord) return;
    const delay = wordDelay(word);
    if (delay === 0) {
      setWord(word);
      return;
    }
    const timer = setTimeout(() => {
      setWord(word);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [word, setWord]);

  /**
   * Ends an attempt. The buttons were disabled while it ran and can miss
   * their leave and blur events, so hover and focus are read back from them.
   */
  function settle() {
    setPending(null);
    const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button[data-method]") ?? [];
    const picked = pickFromDom(
      [...buttons].flatMap((el) => {
        const method = parseLastMethod(el.dataset.method);
        return method ? [[method, { hover: el.matches(":hover"), focusVisible: el.matches(":focus-visible") }] as const] : [];
      }),
    );
    setHovered(picked.hovered);
    setFocused(picked.focused);
  }

  function track(method: SignInMethod) {
    return {
      "data-method": method,
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType === "mouse") setHovered(method);
      },
      onPointerLeave: (event: PointerEvent) => {
        if (event.pointerType === "mouse") setHovered((current) => (current === method ? null : current));
      },
      // Keyboard focus only: a mouse click focuses the button too, and its
      // word would stick after the pointer left.
      onFocus: (event: FocusEvent<HTMLButtonElement>) => {
        if (event.currentTarget.matches(":focus-visible")) setFocused(method);
      },
      onBlur: () => {
        setFocused((current) => (current === method ? null : current));
      },
    };
  }

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
      settle();
      return;
    }
    // On the web the page is already leaving for the provider. The desktop app
    // opens it in the default browser instead and comes back here by itself.
    if (isDesktop()) {
      setInBrowser(provider);
      settle();
    }
  }

  async function withPasskey() {
    setPending("passkey");
    setMessage(null);
    setInBrowser(null);
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setMessage(`No passkey sign-in. Use ${google ? "GitHub or Google" : "GitHub"}, then add a passkey.`);
      settle();
      return;
    }
    router.replace(next as Route);
    router.refresh();
  }

  const providers: Provider[] = google ? ["github", "google"] : ["github"];

  return (
    <div ref={panel} className="mt-8 flex flex-col gap-3">
      <button
        type="button"
        {...track("passkey")}
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
          {...track(provider)}
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
