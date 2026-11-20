import type { Argument } from "../../core/argument.ts"
import { resolveSecondsOptions } from "../../utils.ts"
import { format } from "../common.ts"
import { type ArgValue, make, type Options } from "../core.ts"

/** Arrays are joined with `+`, the separator of FFmpeg's flag options. */
export type MuxerOptionValue = ArgValue | ReadonlyArray<string>

type WithArguments<Known> = {
  [K in keyof Known]?: Known[K] | Argument
}

/**
 * A muxer helper whose `Known` keys are FFmpeg's own option names, typed as
 * hints rather than a closed set: any other key passes through as-is. Mirrors
 * `Filter.OpenHelper`, including the plain signature that keeps typed wrappers
 * and `Parameters<typeof helper>` working.
 */
export type OpenMuxerHelper<Known> = {
  <
    T extends WithArguments<Known> & {
      [K in keyof T as Exclude<K, keyof Known>]: MuxerOptionValue | undefined
    }
  >(
    options?: T
  ): Options
  (options?: WithArguments<Known>): Options
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
  const args: Record<string, ArgValue> = {}

  for (const [key, value] of Object.entries(
    resolveSecondsOptions(options, durationKeys)
  )) {
    if (value === undefined) continue
    args[key] =
      typeof value === "boolean"
        ? value
          ? 1
          : 0
        : Array.isArray(value)
          ? value.join("+")
          : (value as ArgValue)
  }

  return make(format(name), args)
}
