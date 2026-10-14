import { Layer } from "effect"
import { FFmpeg, FFprobe } from "../../src/index.ts"

export const runtime = process.versions.bun ? "bun" : "node"
// Import only the selected platform: Bun-specific modules cannot load on Node.
export const PlatformLive =
  runtime === "bun"
    ? (await import("@effect/platform-bun")).BunServices.layer
    : (await import("@effect/platform-node")).NodeServices.layer

export const MediaLive = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(
  Layer.provideMerge(PlatformLive)
)
