import { AddPasskeyButton, SignOutButton } from "@/components/auth/account-actions";
import { AppearancePrefs, PrefsNote } from "@/components/settings/appearance-prefs";
import { TimerModeSetting } from "@/components/settings/timer-mode";
import { PageFrame, SheetHeading } from "@/components/shell/page-frame";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireOwner } from "@/lib/auth/owner";

// Settings: theme, the owner's prefs (skin, accent, wallpaper, timers) and account.
export default async function SettingsPage() {
  const owner = await requireOwner();

  return (
    <PageFrame title="Settings" subtitle="Theme, skin, timers, passkeys and account">
      <section className="flex flex-col gap-3">
        <SheetHeading title="Appearance" note={<PrefsNote />} />
        <div className="bento flex flex-col p-0">
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Light and dark</p>
              <p className="text-[13px] text-ink-2">The skin&rsquo;s day and night sides.</p>
            </div>
            <ThemeToggle />
          </div>
          <div className="mx-5 h-px bg-border dark:bg-glass-border" />
          <AppearancePrefs />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SheetHeading title="Timers" />
        <div className="bento flex flex-col gap-4 p-5 @lg:flex-row @lg:items-center @lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Starting a length that&rsquo;s already running</p>
            <p className="text-[13px] text-pretty text-ink-2">
              One per length brings the running timer forward. Allow repeats starts another, numbered.
            </p>
          </div>
          <TimerModeSetting />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SheetHeading title="Account" />
        <div className="bento flex flex-col gap-4 p-5 @lg:flex-row @lg:items-center @lg:justify-between">
          {owner.kind === "owner" ? (
            <>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{owner.user.name || owner.user.email}</p>
                <p className="truncate font-mono text-[13px] text-ink-2">{owner.user.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AddPasskeyButton />
                <SignOutButton />
              </div>
            </>
          ) : (
            <p className="text-[13px] text-ink-2">
              Demo mode: no database and no sign-in are set up, so there is no account here.
            </p>
          )}
        </div>
      </section>
    </PageFrame>
  );
}
