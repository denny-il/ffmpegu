/**
 * Type-level contract of the `time` adapters. Compiled by
 * `tsc -p tsconfig.test.json`, never executed.
 */
import { Duration } from "effect"
import { Filter, Options, Time } from "../../src/index.ts"

const start = Time.timestamp(Duration.seconds(1))
// Adapters are values for raw options, helpers, muxer keys, and filters.
Options.make({ ss: start }, ["t", Time.seconds({ seconds: 2 })])
Options.startTime(start)
Options.hls({ hls_time: Time.seconds(Duration.seconds(4)) })
Options.dash({ suggested_presentation_delay: Time.seconds({ seconds: 2 }) })
Filter.atrim({ start })
Filter.make("trim", { start })

// @ts-expect-error strings are already FFmpeg syntax and have nothing to convert
Time.timestamp("00:01")
// @ts-expect-error numbers are ambiguous: Effect reads them as milliseconds
Time.seconds(1500)
