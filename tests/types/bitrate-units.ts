/**
 * Type-level contract of the bitrate unit argument. Compiled by
 * `tsc -p tsconfig.test.json`, never executed.
 */
import { Options } from "../../src/index.ts"

Options.videoBitrate(2, "k")
Options.videoBitrate(2, "M")
Options.audioBitrate(192, "K")
Options.bufferSize(4, "G")
// Strings carry their own unit and pass through unchecked.
Options.videoBitrate("2.5M")

// @ts-expect-error lowercase m is milli, not mega
Options.videoBitrate(2, "m")
// @ts-expect-error FFmpeg rejects a lowercase g suffix
Options.videoBitrate(2, "g")
// @ts-expect-error FFmpeg rejects a lowercase t suffix
Options.videoBitrate(2, "t")
