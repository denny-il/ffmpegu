import { secondsArgument, timestampArgument } from "./utils.ts"

/**
 * Renders an Effect `Duration`, `Temporal.Duration`, or time object as decimal
 * seconds, such as `61.5`, when the command compiles. Usable as any option or
 * filter value.
 */
export const seconds = secondsArgument

/**
 * Renders an Effect `Duration`, `Temporal.Duration`, or time object as
 * `HH:MM:SS.mmm`, such as `00:01:01.500`, when the command compiles. Usable as
 * any option or filter value; filters escape its colons.
 */
export const timestamp = timestampArgument
