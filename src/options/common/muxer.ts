import type { FFmpeguArgument } from "../../core/argument.ts"
import type { FFmpeguUserArgValue } from "../../types/index.ts"
import { resolveSecondsOptions } from "../../utils.ts"
import { format } from "../common.ts"
import { FFmpeguOptions } from "../core.ts"

/** Arrays are joined with `+`, the separator of FFmpeg's flag options. */
export type FFmpeguMuxerOptionValue =
  | FFmpeguUserArgValue
  | ReadonlyArray<string>

type WithArguments<Known> = {
  [K in keyof Known]?: Known[K] | FFmpeguArgument
}

/**
 * A muxer helper whose `Known` keys are FFmpeg's own option names, typed as
 * hints rather than a closed set: any other key passes through as-is. Mirrors
 * `OpenFilterHelper`, including the plain signature that keeps typed wrappers
 * and `Parameters<typeof helper>` working.
 */
export type OpenMuxerHelper<Known> = {
  <
    T extends WithArguments<Known> & {
      [K in keyof T as Exclude<K, keyof Known>]:
        | FFmpeguMuxerOptionValue
        | undefined
    }
  >(
    options?: T
  ): FFmpeguOptions
  (options?: WithArguments<Known>): FFmpeguOptions
}

/**
 * `-f <name>` followed by the options in key order. Booleans render `1`/`0`
 * because a bare flag would read the next argument as the value, and time
 * objects are converted to seconds only on `durationKeys`.
 */
export const muxerOptions = (
  name: string,
  options: Readonly<Record<string, unknown>>,
  durationKeys: ReadonlyArray<string>
) => {
  const args: Record<string, FFmpeguUserArgValue> = {}

  for (const [key, value] of Object.entries(
    resolveSecondsOptions(options, [...durationKeys])
  )) {
    if (value === undefined) continue
    args[key] =
      typeof value === "boolean"
        ? value
          ? 1
          : 0
        : Array.isArray(value)
          ? value.join("+")
          : (value as FFmpeguUserArgValue)
  }

  return FFmpeguOptions.create(format(name), args)
}
