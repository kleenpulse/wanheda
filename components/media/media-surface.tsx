"use client";

import "@videojs/react/video/skin.css";
import * as React from "react";
import { Video, VideoPlayer, VideoSkin } from "@videojs/react/video";

// The only file that imports Video.js (V51, ADR-0013): a breaking 11.x stays
// in here. Loaded with a dynamic import on /media only, so the shell bundle
// never carries it. The caller sets the source on the forwarded `<video>`:
// `src` for native play, `srcObject` for the remux's MSE handle.

export type MediaSurfaceProps = {
  title: string;
  className?: string;
  /** The real `<video>` element, once mounted. */
  onElement: (el: HTMLVideoElement | null) => void;
};

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

export default function MediaSurface({ title, className, onElement }: MediaSurfaceProps) {
  return (
    <VideoPlayer title={title}>
      <VideoSkin {...(className ? { className } : {})} style={SKIN_TOKENS}>
        <Video ref={onElement} playsInline preload="metadata" />
      </VideoSkin>
    </VideoPlayer>
  );
}
