"use client";

import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { Segmented } from "@/components/ui/segmented";
import { BRIGHTNESS_LABELS, GLOW_BRIGHTNESS, GLOW_MOVEMENT, glowPref, MOVEMENT_LABELS } from "@/lib/media/glow";
import { RESUME_MODE_LABELS, RESUME_MODES, resumeModePref } from "@/lib/media/resume-mode";
import { DUCK_LEVELS, SOUND_MODE_LABELS, SOUND_MODES, soundMixPref, type DuckLevel } from "@/lib/media/sound-mix";

const MODE_OPTIONS = SOUND_MODES.map((value) => ({ value, label: SOUND_MODE_LABELS[value] }));
const LEVEL_OPTIONS = DUCK_LEVELS.map((n) => ({ value: String(n) as `${DuckLevel}`, label: `${String(n)}%` }));
const BRIGHTNESS_OPTIONS = GLOW_BRIGHTNESS.map((value) => ({ value, label: BRIGHTNESS_LABELS[value] }));
const MOVEMENT_OPTIONS = GLOW_MOVEMENT.map((value) => ({ value, label: MOVEMENT_LABELS[value] }));
const RESUME_OPTIONS = RESUME_MODES.map((value) => ({ value, label: RESUME_MODE_LABELS[value] }));

const RESUME_HELP = {
  ask: "It opens paused where you stopped, with Resume and Start over. Pressing play resumes.",
  resume: "It picks up where you stopped.",
  start: "It always plays from the beginning, and saves your new place as you watch.",
} as const;

const MODE_HELP = {
  pause: "Starting one pauses the other.",
  duck: "Music or a video gets quieter while speech plays, and comes back when it stops or pauses.",
  mix: "Both play at full volume.",
} as const;

/** Settings → Sound (V60): how read-aloud shares the speakers with music and video, where a video picks up, and the glow behind a song without art. Kept on this device. */
export function SoundSection() {
  const mix = soundMixPref.use();
  const glow = glowPref.use();
  const resume = resumeModePref.use();
  return (
    <div className="flex flex-col gap-4">
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
      <SettingsCard title="Videos">
        <SettingRow label="A video you've started" description={RESUME_HELP[resume]} layout="wide">
          {() => (
            <Segmented
              label="A video you've started"
              value={resume}
              options={RESUME_OPTIONS}
              onChange={(mode) => {
                resumeModePref.set(mode);
              }}
            />
          )}
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="Songs without cover art">
        <SettingRow label="Glow" description="A light in your accent colour behind the player that moves with the music." layout="wide">
          {() => (
            <Segmented
              label="Glow"
              value={glow.brightness}
              options={BRIGHTNESS_OPTIONS}
              onChange={(brightness) => {
                glowPref.set({ ...glow, brightness });
              }}
            />
          )}
        </SettingRow>
        {glow.brightness !== "off" ? (
          <SettingRow label="Movement" description="How much the music moves the glow." layout="wide">
            {() => (
              <Segmented
                label="Movement"
                value={glow.movement}
                options={MOVEMENT_OPTIONS}
                onChange={(movement) => {
                  glowPref.set({ ...glow, movement });
                }}
              />
            )}
          </SettingRow>
        ) : null}
      </SettingsCard>
    </div>
  );
}
