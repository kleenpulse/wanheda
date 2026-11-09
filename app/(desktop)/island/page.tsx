import type { Metadata } from "next";
import { FloatingIsland } from "@/components/island/floating-island";

export const metadata: Metadata = { title: "Island · Wanheda" };

// The desktop shell's floating island window (SPEC V70): transparent, so only
// the island shows over other apps. It reads nothing from the server; what's
// live comes from the main window through the shell.
export default function IslandPage() {
  return (
    <>
      {/* The window is see-through: no page colour behind the island. */}
      <style>{"html,body{background:transparent!important}"}</style>
      <FloatingIsland />
    </>
  );
}
