"use client";

import { MotionConfig } from "motion/react";

export function MotionProvider({ children, appSetting }: { children: React.ReactNode; appSetting?: "reduce" | "system" }) {
	return <MotionConfig reducedMotion={appSetting === "reduce" ? "always" : "user"}>{children}</MotionConfig>;
}
