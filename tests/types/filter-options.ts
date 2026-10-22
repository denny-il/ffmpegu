/**
 * Type-level contract of the typed filter helpers. Compiled by
 * `tsc -p tsconfig.test.json`, never executed.
 */
import type { ScaleOptions } from "../../src/filters/index.ts"
import { filters } from "../../src/index.ts"

// Keys outside a helper's typed hints pass through as raw FFmpeg values.
filters.aresample({ sample_rate: 48000, min_hard_comp: 0.1 })
filters.scale({ w: 640, h: -2, in_range: "tv" })
declare const raw: Record<string, string | number>
filters.drawtext(raw)
declare const either: { w: number } | { h: number; in_range: string }
filters.scale(either)
// Wrappers typed with raw records or with the known options still compile.
const forwardRaw = <T extends Record<string, string | number>>(options: T) =>
  filters.scale(options)
const forwardKnown = <T extends ScaleOptions>(options: T) =>
  filters.scale(options)
void [forwardRaw, forwardKnown]

// Time keys still accept time objects next to raw keys.
filters.atrim({ start: { seconds: 1 }, duration: { seconds: 2 }, end_pts: 9 })
filters.afade({ start_time: { seconds: 2 }, silence: 0.1 })
filters.fps({ fps: 30, start_time: { milliseconds: 250 } })
const trim: Parameters<typeof filters.atrim>[0] = { start: { seconds: 1 } }
void trim

// @ts-expect-error known keys keep their value types
filters.volume({ volume: { seconds: 1 } })
// @ts-expect-error time objects are only accepted on time keys
filters.atrim({ start_pts: { seconds: 1 } })
// @ts-expect-error raw keys take FFmpeg values, not time objects
filters.atrim({ start_frame: { seconds: 1 } })
