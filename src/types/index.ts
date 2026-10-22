import type * as Duration from "effect/Duration"
import type { FFmpeguArgument } from "../core/argument.ts"

/**
 * Resolves command-owned objects (inputs) to their positional ffmpeg index.
 */
export interface FFmpeguReferencesInterface {
  get(ref: object): number
  has(ref: object): boolean
}

export type FFmpeguPrimitiveUserArgValue = string | FFmpeguArgument

export type FFmpeguUserArgValue =
  | FFmpeguPrimitiveUserArgValue
  | number
  | boolean

export type FFmpeguUserArg =
  | FFmpeguPrimitiveUserArgValue
  | [string, FFmpeguUserArgValue?]
  | Record<string, FFmpeguUserArgValue>

/**
 * One `-progress` block reported by ffmpeg.
 *
 * Typed fields are parsed from `raw`; values ffmpeg reports as `N/A`, or that
 * are not finite numbers, are left `undefined`. `raw` keeps every key of the
 * block with its original string value.
 */
export interface Progress {
  /**
   * `"end"` for ffmpeg's final block, `"continue"` otherwise. Unrecognized
   * markers count as `"continue"`, so a final block is never inferred;
   * `raw.progress` keeps the original.
   */
  readonly progress: "continue" | "end"
  readonly frame?: number
  readonly fps?: number
  /** As reported, for example `"1234.5kbits/s"`. */
  readonly bitrate?: string
  /** Bytes written so far. */
  readonly totalSize?: number
  /** Output position, from `out_time_us`. */
  readonly outTime?: Duration.Duration
  readonly dupFrames?: number
  readonly dropFrames?: number
  /** Multiple of real time; `1.5` for `speed=1.5x`. */
  readonly speed?: number
  readonly raw: Readonly<Record<string, string>>
}

export interface RunResult {
  /** Full argv passed to the binary, including runner-owned flags. */
  readonly args: ReadonlyArray<string>
  /** Bounded tail of stderr, see `stderrTailBytes`. */
  readonly stderr: string
}
