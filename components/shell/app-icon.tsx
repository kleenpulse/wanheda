"use client";

import type { LucideIcon, LucideProps } from "lucide-react";
import { MediaIcon } from "@/components/media/media-icon";

/** An app's glyph in the rail, the dock and the tab bar: the manifest's icon, or a live one (Media's morphs while music plays). */
export function AppIcon({ id, icon: Icon, ...props }: LucideProps & { id: string; icon: LucideIcon }) {
  return id === "media" ? <MediaIcon {...props} /> : <Icon {...props} />;
}
