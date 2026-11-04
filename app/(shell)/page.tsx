import { AddPasskeyButton, SignOutButton } from "@/components/auth/account-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireOwner } from "@/lib/auth/owner";

// Phase 0 placeholder. Phase 1 replaces this with the shell and the home board.
export default async function Home() {
  const owner = await requireOwner();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="bento entrance w-full max-w-md p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="readout">Phase 0 · Foundation</p>
          {owner.kind === "demo" && (
            <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill px-2.5 font-mono text-[10.5px] tracking-wide text-ink-2 uppercase ring-1 ring-border dark:ring-glass-border">
              <span aria-hidden className="size-1.5 rounded-full bg-ink-3" />
              Demo mode
            </span>
          )}
        </div>
        <h1 className="font-display mt-3 text-hero">Wanheda</h1>

        {owner.kind === "owner" ? (
          <>
            <p className="mt-4 text-[15px] leading-relaxed text-pretty text-ink-2">
              Signed in as <span className="font-mono text-[13px] text-foreground">{owner.user.email}</span>.
              The shell arrives in Phase 1.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <AddPasskeyButton />
              <SignOutButton />
              <ThemeToggle />
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-[15px] leading-relaxed text-pretty text-ink-2">
              No database and no sign-in are set up, so this runs on seed data and is open to anyone.
              The shell arrives in Phase 1.
            </p>
            <div className="mt-8 flex items-center gap-2">
              <ThemeToggle />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
