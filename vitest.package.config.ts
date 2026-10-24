import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/package/**/*.test.ts"],
    // Packing and installing the tarball dominates; the consumer runs ffmpeg.
    hookTimeout: 120_000,
    testTimeout: 60_000
  }
})
