"use client";

import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { Segmented } from "@/components/ui/segmented";
import { DUCK_LEVELS, SOUND_MODE_LABELS, SOUND_MODES, soundMixPref, type DuckLevel } from "@/lib/media/sound-mix";

const MODE_OPTIONS = SOUND_MODES.map((value) => ({ value, label: SOUND_MODE_LABELS[value] }));
const LEVEL_OPTIONS = DUCK_LEVELS.map((n) => ({ value: String(n) as `${DuckLevel}`, label: `${String(n)}%` }));

const MODE_HELP = {
  pause: "Starting one pauses the other.",
  duck: "Music or a video gets quieter while speech plays, and comes back when it stops or pauses.",
  mix: "Both play at full volume.",
} as const;

/** Settings → Sound (V60): how read-aloud shares the speakers with music and video. Kept on this device. */
export function SoundSection() {
  const mix = soundMixPref.use();
  return (
    <SettingsCard title="When two things play">
      <SettingRow
        label="Read-aloud over music or video"
        description={`${MODE_HELP[mix.mode]} Music and a video always pause each other. The last one you started gets the media keys.`}
        layout="stack"
      >
        {() => (
          <Segmented
            label="Read-aloud over music or video"
            value={mix.mode}
            options={MODE_OPTIONS}
            onChange={(mode) => {
              soundMixPref.set({ ...mix, mode });
            }}
          />
        )}
      </SettingRow>
      {mix.mode === "duck" ? (
        <SettingRow label="Lower to" description="How loud music or a video stays under speech." layout="wide">
          {() => (
            <Segmented
              label="Lower to"
              value={String(mix.level) as `${DuckLevel}`}
              options={LEVEL_OPTIONS}
              onChange={(v) => {
                soundMixPref.set({ ...mix, level: Number(v) as DuckLevel });
              }}
            />
          )}
        </SettingRow>
      ) : null}
    </SettingsCard>
  );
}
