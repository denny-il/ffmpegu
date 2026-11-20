/**
 * Type-level contract of the typed filter helpers. Compiled by
 * `tsc -p tsconfig.test.json`, never executed.
 */
import { Filter } from "../../src/index.ts"

// Keys outside a helper's typed hints pass through as raw FFmpeg values.
Filter.aresample({ sample_rate: 48000, min_hard_comp: 0.1 })
Filter.scale({ w: 640, h: -2, in_range: "tv" })
declare const raw: Record<string, string | number>
Filter.drawtext(raw)
declare const either: { w: number } | { h: number; in_range: string }
Filter.scale(either)
// Wrappers typed with raw records or with the known options still compile.
const forwardRaw = <T extends Record<string, string | number>>(options: T) =>
  Filter.scale(options)
const forwardKnown = <T extends Filter.ScaleOptions>(options: T) =>
  Filter.scale(options)
void [forwardRaw, forwardKnown]

// Time keys still accept time objects next to raw keys.
Filter.atrim({ start: { seconds: 1 }, duration: { seconds: 2 }, end_pts: 9 })
Filter.afade({ start_time: { seconds: 2 }, silence: 0.1 })
Filter.fps({ fps: 30, start_time: { milliseconds: 250 } })
const trim: Parameters<typeof Filter.atrim>[0] = { start: { seconds: 1 } }
void trim

// @ts-expect-error known keys keep their value types
Filter.volume({ volume: { seconds: 1 } })
// @ts-expect-error time objects are only accepted on time keys
Filter.atrim({ start_pts: { seconds: 1 } })
// @ts-expect-error raw keys take FFmpeg values, not time objects
Filter.atrim({ start_frame: { seconds: 1 } })
