import type { Metadata } from "next";
import { AppWindow } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { OtherAccountButton } from "@/components/auth/other-account-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClass } from "@/components/ui/button";
import { handoffPath, isHandoffValue, signInPagePath } from "@/lib/auth/desktop-link";
import { getOwner } from "@/lib/auth/owner";

export const metadata: Metadata = { title: "Sign in to the app · Wanheda" };

// The desktop app's sign-in, in the system browser (ADR-0016). The app opens
// this page with a nonce; signed in here (any method), "Open the Wanheda app"
// mints a single-use token and hands it to the app (app/api/desktop/handoff).
// Nothing is minted until that click.
export default function DesktopSignInPage({ searchParams }: PageProps<"/desktop/sign-in">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="bento entrance w-full max-w-sm p-8">
        <div className="flex items-start justify-between gap-3">
          <p className="readout">Wanheda · Desktop app</p>
          <ThemeToggle />
        </div>
        <Suspense fallback={<Fallback />}>
          <Body searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function Body({ searchParams }: { searchParams: PageProps<"/desktop/sign-in">["searchParams"] }) {
  const [owner, params] = await Promise.all([getOwner(), searchParams]);
  const nonce = first(params.nonce);

  if (!isHandoffValue(nonce)) {
    return (
      <Message title="Start in the app">
        This page signs in the Wanheda desktop app. Open the app and choose Sign in with your browser.
      </Message>
    );
  }
  if (owner.kind === "anonymous") redirect(`/login?next=${encodeURIComponent(signInPagePath(nonce))}`);
  if (owner.kind === "demo") return <Message title="No sign-in needed">Demo mode: no database and no sign-in are set up.</Message>;
  if (owner.kind === "locked") return <Message title="Locked">Sign-in is not configured yet.</Message>;

  return (
    <>
      <h1 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.02em]">Open the app</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-2">
        You&apos;re signed in as <span className="text-ink">{owner.user.email}</span>. Continue to sign in the Wanheda app on this computer
        with the same account.
      </p>
      {/* A plain link: a prefetch must never mint a token. */}
      <a href={handoffPath(nonce)} className={buttonClass("inverse", "pill", "mt-8 w-full")}>
        <AppWindow aria-hidden />
        Open the Wanheda app
      </a>
      <div className="mt-3">
        <OtherAccountButton next={signInPagePath(nonce)} />
      </div>
      <p className="mt-4 text-center text-[13px] text-pretty text-ink-2">Your browser may ask to open Wanheda. Then you can close this tab.</p>
    </>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h1 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.02em]">{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-2">{children}</p>
    </>
  );
}

function Fallback() {
  return (
    <div aria-busy>
      <div className="mt-4 h-8 w-44 rounded-pill bg-card-nested" />
      <div className="mt-4 h-4 w-52 rounded-pill bg-card-nested opacity-60" />
      <div className="mt-8 h-10 w-full rounded-pill bg-card-nested opacity-50" />
    </div>
  );
}
