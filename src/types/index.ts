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
  /** `"continue"` while running, `"end"` for ffmpeg's final block. */
  readonly progress: string
  readonly frame?: number
  readonly fps?: number
  readonly bitrate?: string
  readonly total_size?: number
  readonly out_time_us?: number
  readonly out_time_ms?: number
  readonly out_time?: string
  readonly dup_frames?: number
  readonly drop_frames?: number
  readonly speed?: number
  readonly raw: Readonly<Record<string, string>>
}

export interface RunResult {
  /** Full argv passed to the binary, including runner-owned flags. */
  readonly args: ReadonlyArray<string>
  /** Bounded tail of stderr, see `stderrTailBytes`. */
  readonly stderr: string
}
