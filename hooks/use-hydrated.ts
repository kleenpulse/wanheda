"use client";

import * as React from "react";

const subscribeNone = () => () => {};

/** False on the server and in the hydration pass, true after: for values only the client knows. */
export function useHydrated(): boolean {
	return React.useSyncExternalStore(
		subscribeNone,
		() => true,
		() => false,
	);
}
