import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Test file patterns
		include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

		// Test environment
		environment: "node",

		// Coverage settings
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules/", "tests/", "dist/", "*.config.*"],
		},

		// Test timeout (useful for integration tests with FFmpeg)
		testTimeout: 10000,

		// Run tests in sequence to avoid conflicts when testing with actual FFmpeg
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
	},
});
