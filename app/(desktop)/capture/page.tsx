import type { Metadata } from "next";
import { QuickCapture } from "@/components/notes/quick-capture";

export const metadata: Metadata = { title: "Quick note · Wanheda" };

// The desktop shell's quick-capture window (SPEC V71). It reads nothing from
// the server: the main window saves what's typed here through the notes outbox.
export default function CapturePage() {
  return <QuickCapture />;
}
