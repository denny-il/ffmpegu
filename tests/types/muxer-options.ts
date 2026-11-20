/**
 * Type-level contract of the open `hls()` and `dash()` helpers. Compiled by
 * `tsc -p tsconfig.test.json`, never executed.
 */
import { Duration } from "effect"
import { Options } from "../../src/index.ts"

// Keys outside the typed hints pass through as raw FFmpeg values.
Options.hls({ hls_time: 4, hls_enc: true, hls_enc_key: "0123" })
Options.dash({ seg_duration: 4, availability_start_time_ms: 0 })
declare const raw: Record<string, string | number>
Options.hls(raw)
// Duration keys accept time values next to raw keys.
Options.hls({ hls_time: Duration.seconds(4), max_seg_size: 1_000_000 })
Options.dash({ seg_duration: { seconds: 2 }, frag_type: "duration" })
// Wrappers typed with the known options still compile.
const forwardKnown = <T extends Options.DashOptions>(settings: T) =>
  Options.dash(settings)
void forwardKnown
const dash: Parameters<typeof Options.dash>[0] = { use_template: true }
void dash

// @ts-expect-error known keys keep their value types
Options.hls({ hls_list_size: { seconds: 1 } })
// @ts-expect-error time values are only converted on duration keys, so the
// old camelCase `time` key cannot carry one
Options.hls({ time: Duration.seconds(4) })

// The suggested literals are FFmpeg's `frag_type` constants. "auto" belongs
// to `dash_segment_type`, and FFmpeg rejects it here. The record fails to
// compile if a literal is added or removed.
type Literals<T> = T extends string ? (string extends T ? never : T) : never
type FragTypeHints = Literals<Options.DashOptions["frag_type"]>
const fragTypeHints: Record<FragTypeHints, true> = {
  none: true,
  every_frame: true,
  duration: true,
  pframes: true
}
void fragTypeHints
