import type { NextConfig } from "next";
// Validate the environment at build and start (a bad production env fails the build, SPEC V6).
import "./env/server";
import "./env/client";

const nextConfig: NextConfig = {
	cacheComponents: true,
	partialPrefetching: true,
	typedRoutes: true,
	poweredByHeader: false,
	// The Phase 8 Electron shell runs the standalone server (FRD D1).
	output: "standalone",
	turbopack: {
		// micromark's entity decoder picks a DOM build under the `browser` condition
		// (document.createElement), which throws in the reader's text worker (T50):
		// worker bundles resolve as `browser` too. The table build works everywhere.
		resolveAlias: {
			"decode-named-character-reference": "./node_modules/decode-named-character-reference/index.js",
		},
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
	devIndicators: false,
};

export default nextConfig;
