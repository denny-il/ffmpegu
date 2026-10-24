/**
 * Type-level contract of the bitrate unit argument. Compiled by
 * `tsc -p tsconfig.test.json`, never executed.
 */
import { options } from "../../src/index.ts"

options.videoBitrate(2, "k")
options.videoBitrate(2, "M")
options.audioBitrate(192, "K")
options.bufferSize(4, "G")
// Strings carry their own unit and pass through unchecked.
options.videoBitrate("2.5M")

// @ts-expect-error lowercase m is milli, not mega
options.videoBitrate(2, "m")
// @ts-expect-error FFmpeg rejects a lowercase g suffix
options.videoBitrate(2, "g")
// @ts-expect-error FFmpeg rejects a lowercase t suffix
options.videoBitrate(2, "t")
