import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/account-actions";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClass } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/gate";
import { getOwner } from "@/lib/auth/owner";

export const metadata: Metadata = { title: "Sign in · Wanheda" };

// No global data fetch runs here while signed out (SPEC V8, rawstash §B14).
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="bento entrance w-full max-w-sm p-8">
        <div className="flex items-start justify-between gap-3">
          <p className="readout">Wanheda · Sign in</p>
          <ThemeToggle />
        </div>
        <Suspense fallback={<LoginFallback />}>
          <LoginBody searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const ERRORS: Record<string, string> = {
  "not-owner": "That account is not the owner of this Wanheda.",
};

async function LoginBody({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const [owner, params] = await Promise.all([getOwner(), searchParams]);
  const next = safeNextPath(first(params.next));
  const errorCode = first(params.error);

  // A valid owner session goes straight in: one redirect, never a loop (SPEC V8).
  // A signed-in non-owner stays here, or the shell would bounce them back.
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

  if (owner.kind === "not-owner") {
    return (
      <>
        <h1 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.02em]">Not this one</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-2">
          <span className="font-mono text-[13px] text-foreground">{owner.user.email}</span> is not the owner of
          this Wanheda. Sign out and use the owner&apos;s account.
        </p>
        <div className="mt-8">
          <SignOutButton />
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.02em]">Welcome back</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-2">Only the owner can sign in.</p>
      <SignInPanel
        next={next}
        error={errorCode ? (ERRORS[errorCode] ?? "Sign-in failed. Try again.") : null}
      />
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
