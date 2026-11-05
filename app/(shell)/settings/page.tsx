import { SettingsBoard } from "@/components/settings/settings-board";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";

// Settings: appearance, timers, keyboard shortcuts and the account, in
// Raven's section-rail layout. The board reads `?s=` on the client. The page
// awaits nothing, so a hop here paints at once (CLAUDE.md: native-app feel).
export default function SettingsPage() {
  return (
    <PageFrame
      title="Settings"
      subtitle={
        <ModeText
          owner="Changes apply right away and follow you to your other devices"
          demo="Demo: changes apply right away, on this device only"
        />
      }
    >
      <SettingsBoard />
    </PageFrame>
  );
}
