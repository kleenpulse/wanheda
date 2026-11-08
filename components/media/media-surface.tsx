"use client";

import * as React from "react";
import { Video, VideoPlayer } from "@videojs/react/video";
import { fitPref } from "@/lib/media/cinema";

// The only file that imports Video.js (V51, ADR-0013): a breaking 11.x stays
// in here. Loaded with a dynamic import on /media only, so the shell bundle
// never carries it. Since T72 Video.js hosts the element and nothing more:
// the controls are the app's own chrome (video-chrome.tsx, V65), which works
// on the forwarded `<video>`. The caller sets the source on it: `src` for
// native play, `srcObject` for the remux's MSE handle.

export type MediaSurfaceProps = {
  title: string;
  className?: string;
  /** The real `<video>` element, once mounted. */
  onElement: (el: HTMLVideoElement | null) => void;
};

export default function MediaSurface({ title, className, onElement }: MediaSurfaceProps) {
  // The skin's CSS used to size the element; Fit|Fill is a device pref now.
  const fit = fitPref.use();
  return (
    <VideoPlayer title={title}>
      <Video
        ref={onElement}
        playsInline
        preload="metadata"
        {...(className ? { className } : {})}
        style={{ display: "block", width: "100%", height: "100%", objectFit: fit, objectPosition: "center" }}
      />
    </VideoPlayer>
  );
}
