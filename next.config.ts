import type { NextConfig } from "next";
// Validate the environment at build and start (a bad production env fails the build, SPEC V6).
import "./env/server";
import "./env/client";
import { contentSecurityPolicy, CSP_HEADER } from "./lib/security/csp";

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
			// The speech worker's ONNX Runtime (ADR-0012): the plain wasm build, which loads
			// ort-wasm-simd-threaded.{mjs,wasm} from this origin. The package's default here is
			// a bundle with that glue inlined, which isn't the build the eval check clears.
			"onnxruntime-web/wasm": "./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs",
		},
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
	devIndicators: false,
	// One policy for the web and the desktop app (SPEC V67). Not in `next dev`,
	// which needs eval and its hot-reload websocket.
	headers() {
		const dev = process.env.NODE_ENV === "development";
		return Promise.resolve(dev ? [] : [{ source: "/:path*", headers: [{ key: CSP_HEADER, value: contentSecurityPolicy() }] }]);
	},
};

export default nextConfig;
