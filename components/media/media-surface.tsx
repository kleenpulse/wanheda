"use client";

import "@videojs/react/video/skin.css";
import * as React from "react";
import { Video, VideoPlayer, VideoSkin, usePlayer } from "@videojs/react/video";
import type { SurfaceControls } from "./player-store";

// The only file that imports Video.js (V51, ADR-0013): a breaking 11.x stays
// in here. Loaded with a dynamic import on /media only, so the shell bundle
// never carries it. The caller sets the source on the forwarded `<video>`:
// `src` for native play, `srcObject` for the remux's MSE handle.

export type MediaSurfaceProps = {
  title: string;
  className?: string;
  /** The real `<video>` element, once mounted. */
  onElement: (el: HTMLVideoElement | null) => void;
  /** The skin's fullscreen and picture-in-picture, so they stay in step with its buttons. */
  onControls?: (controls: SurfaceControls | null) => void;
};

function ControlsBridge({ onControls }: { onControls: (controls: SurfaceControls | null) => void }) {
  const isFullscreen = usePlayer((s) => s.isFullscreen);
  const requestFullscreen = usePlayer((s) => s.requestFullscreen);
  const exitFullscreen = usePlayer((s) => s.exitFullscreen);
  const isPip = usePlayer((s) => s.isPictureInPicture);
  const requestPip = usePlayer((s) => s.requestPictureInPicture);
  const exitPip = usePlayer((s) => s.exitPictureInPicture);
  React.useEffect(() => {
    onControls({
      toggleFullscreen: () => {
        void (isFullscreen ? exitFullscreen() : requestFullscreen()).catch(() => undefined);
      },
      togglePictureInPicture: () => {
        void (isPip ? exitPip() : requestPip()).catch(() => undefined);
      },
    });
  }, [onControls, isFullscreen, requestFullscreen, exitFullscreen, isPip, requestPip, exitPip]);
  React.useEffect(
    () => () => {
      onControls(null);
    },
    [onControls],
  );
  return null;
}

// Role tokens only (C5): the skin's controls stay dark in both themes, so the
// signal hue fills and the stage colour is the ink on it.
const SKIN_TOKENS = {
  "--media-accent-color": "var(--signal)",
  "--media-accent-text-color": "var(--stage)",
  "--media-font-family": "var(--font-sans)",
  "--media-border-radius": "var(--radius)",
  "--media-object-fit": "contain",
  "--media-object-position": "center",
  width: "100%",
  height: "100%",
} as React.CSSProperties;

export default function MediaSurface({ title, className, onElement, onControls }: MediaSurfaceProps) {
  return (
    <VideoPlayer title={title}>
      {onControls ? <ControlsBridge onControls={onControls} /> : null}
      <VideoSkin {...(className ? { className } : {})} style={SKIN_TOKENS}>
        <Video ref={onElement} playsInline preload="metadata" />
      </VideoSkin>
    </VideoPlayer>
  );
}
