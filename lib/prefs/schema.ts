import { z } from "zod";
import { TIMER_MODES } from "@/lib/activity/timer";
import { SCENES, SKINS, WALLPAPERS, WALLPAPER_COVERS, WALLPAPER_PAGES, WALLPAPER_SCOPES } from "./prefs";

/** The whole prefs row as the save action takes it: untrusted, checked field by field, nothing extra. */
export const prefsSchema = z
  .object({
    skin: z.enum(SKINS),
    accent: z
      .string()
      .regex(/^#[0-9a-f]{6}$/)
      .nullable(),
    wallpaper: z.enum(WALLPAPERS),
    timerMode: z.enum(TIMER_MODES),
    wallpaperScope: z.enum(WALLPAPER_SCOPES),
    wallpaperCover: z.enum(WALLPAPER_COVERS),
    // partialRecord: zod 4's z.record with enum keys demands every key (SPEC V64).
    wallpaperPages: z.partialRecord(z.enum(WALLPAPER_PAGES), z.enum(SCENES)),
  })
  .strict();
