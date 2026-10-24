/**
 * Type-level contract of the `time` adapters. Compiled by
 * `tsc -p tsconfig.test.json`, never executed.
 */
import { Duration } from "effect"
import { Options, filters, options, time } from "../../src/index.ts"

const start = time.timestamp(Duration.seconds(1))
// Adapters are values for raw options, helpers, muxer keys, and filters.
Options.create({ ss: start }, ["t", time.seconds({ seconds: 2 })])
options.startTime(start)
options.hls({ hls_time: time.seconds(Duration.seconds(4)) })
options.dash({ suggested_presentation_delay: time.seconds({ seconds: 2 }) })
filters.atrim({ start })
filters.custom("trim", { start })

// @ts-expect-error strings are already FFmpeg syntax and have nothing to convert
time.timestamp("00:01")
// @ts-expect-error numbers are ambiguous: Effect reads them as milliseconds
time.seconds(1500)
