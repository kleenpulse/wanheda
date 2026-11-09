import type { Metadata, Route } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthSwarmSlot, AuthWordProvider } from "@/components/auth/auth-word";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClass } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/gate";
import { LAST_METHOD_COOKIE, parseLastMethod } from "@/lib/auth/last-method";
import { getOwner } from "@/lib/auth/owner";
import { googleSignIn } from "@/lib/capabilities";

export const metadata: Metadata = { title: "Sign in · Wanheda" };

// No global data fetch runs here while signed out (SPEC V8, rawstash §B14).
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthWordProvider>
      <main className="relative flex flex-1 items-center justify-center p-6">
        {/* The sign-in swarm (V82): page shell, outside the Suspense, under the card. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <AuthSwarmSlot />
        </div>
        <section className="bento entrance relative z-10 w-full max-w-sm p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="readout">Wanheda · Sign in</p>
            <ThemeToggle />
          </div>
          <Suspense fallback={<LoginFallback />}>
            <LoginBody searchParams={searchParams} />
          </Suspense>
        </section>
      </main>
    </AuthWordProvider>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function LoginBody({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const [owner, params, jar] = await Promise.all([getOwner(), searchParams, cookies()]);
  const next = safeNextPath(first(params.next));
  const errorCode = first(params.error);
  // Set by the account deletion (V79) on its way out.
  const deleted = first(params.deleted) === "1";
  const google = googleSignIn();
  const last = parseLastMethod(jar.get(LAST_METHOD_COOKIE)?.value);
  // A method no longer offered (Google switched off) gets no badge.
  const lastUsed = last === "google" && !google ? null : last;

  // A valid session goes straight in: one redirect, never a loop (SPEC V8).
  if (owner.kind === "owner") redirect(next as Route);

  if (owner.kind === "demo") {
    return (
      <>
        <h1 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.02em]">No sign-in needed</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-2">
          Demo mode: no database and no sign-in are set up.
        </p>
        <Link href="/" className={buttonClass("inverse", "pill", "mt-8 w-full")}>
          Open Wanheda
        </Link>
      </>
    );
  }

  if (owner.kind === "locked") {
    return (
      <>
        <h1 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.02em]">Locked</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-2">
          Sign-in is not configured yet.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.02em]">{deleted ? "Account deleted" : "Welcome"}</h1>
      <p role={deleted ? "status" : undefined} className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-2">
        {deleted
          ? "Your account and everything in it are gone. You can make a new one with the same button any time."
          : google
            ? "Sign in with GitHub or Google to open your own Wanheda. New here? Either button makes your account."
            : "Sign in with GitHub to open your own Wanheda. New here? The same button makes your account."}
      </p>
      <SignInPanel next={next} error={errorCode ? "Sign-in failed. Try again." : null} google={google} lastUsed={lastUsed} />
    </>
  );
}

function LoginFallback() {
  return (
    <div aria-busy>
      <div className="mt-4 h-8 w-44 rounded-pill bg-card-nested" />
      <div className="mt-4 h-4 w-52 rounded-pill bg-card-nested opacity-60" />
      <div className="mt-8 h-10 w-full rounded-pill bg-card-nested opacity-50" />
      <div className="mt-3 h-10 w-full rounded-pill bg-card-nested opacity-40" />
    </div>
  );
}
