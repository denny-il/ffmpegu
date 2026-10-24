/**
 * Type-level contract of the open `hls()` and `dash()` helpers. Compiled by
 * `tsc -p tsconfig.test.json`, never executed.
 */
import { Duration } from "effect"
import type { FFmpeguDashOptions } from "../../src/options/index.ts"
import { options } from "../../src/index.ts"

// Keys outside the typed hints pass through as raw FFmpeg values.
options.hls({ hls_time: 4, hls_enc: true, hls_enc_key: "0123" })
options.dash({ seg_duration: 4, availability_start_time_ms: 0 })
declare const raw: Record<string, string | number>
options.hls(raw)
// Duration keys accept time values next to raw keys.
options.hls({ hls_time: Duration.seconds(4), max_seg_size: 1_000_000 })
options.dash({ seg_duration: { seconds: 2 }, frag_type: "duration" })
// Wrappers typed with the known options still compile.
const forwardKnown = <T extends FFmpeguDashOptions>(settings: T) =>
  options.dash(settings)
void forwardKnown
const dash: Parameters<typeof options.dash>[0] = { use_template: true }
void dash

// @ts-expect-error known keys keep their value types
options.hls({ hls_list_size: { seconds: 1 } })
// @ts-expect-error time values are only converted on duration keys, so the
// old camelCase `time` key cannot carry one
options.hls({ time: Duration.seconds(4) })

// The suggested literals are FFmpeg's `frag_type` constants. "auto" belongs
// to `dash_segment_type`, and FFmpeg rejects it here. The record fails to
// compile if a literal is added or removed.
type Literals<T> = T extends string ? (string extends T ? never : T) : never
type FragTypeHints = Literals<FFmpeguDashOptions["frag_type"]>
const fragTypeHints: Record<FragTypeHints, true> = {
  none: true,
  every_frame: true,
  duration: true,
  pframes: true
}
void fragTypeHints
