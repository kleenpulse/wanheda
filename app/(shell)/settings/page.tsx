import { SettingsBoard } from "@/components/settings/settings-board";
import { PageFrame } from "@/components/shell/page-frame";
import { requireOwner } from "@/lib/auth/owner";

// Settings: appearance, timers, keyboard shortcuts and the account, in
// Raven's section-rail layout. The board reads `?s=` on the client.
export default async function SettingsPage() {
  const owner = await requireOwner();
  const subtitle =
    owner.kind === "owner"
      ? "Changes apply right away and follow you to your other devices"
      : "Demo: changes apply right away, on this device only";

  return (
    <PageFrame title="Settings" subtitle={subtitle}>
      <SettingsBoard />
    </PageFrame>
  );
}
