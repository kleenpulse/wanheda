"use client";

import * as React from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
	const mql = window.matchMedia(QUERY);
	mql.addEventListener("change", onChange);
	return () => {
		mql.removeEventListener("change", onChange);
	};
}

/** The OS asks for reduced motion, or the in-app setting does. */
export function useReducedMotion(appSetting?: "reduce" | "system"): boolean {
	const system = React.useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
	return appSetting === "reduce" || system;
}
