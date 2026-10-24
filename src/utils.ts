import * as Duration from "effect/Duration"
import { FFmpeguArgument } from "./core/argument.ts"

export type FFmpeguTimeObject = {
  hours?: number
  minutes?: number
  seconds?: number
  milliseconds?: number
}

/**
 * `Temporal.Duration` when the TypeScript lib declares `Temporal`, otherwise
 * `never`, so the declarations also compile without `esnext.temporal`.
 */
export type FFmpeguTemporalDuration = typeof globalThis extends {
  Temporal: { Duration: new (...args: any[]) => infer T }
}
  ? T
  : never

/** Converted when the command is compiled, so invalid values fail there. */
export type FFmpeguDurationValue = Duration.Duration | FFmpeguTemporalDuration

const MS_IN_SECOND = 1_000
const MS_IN_MINUTE = 60 * MS_IN_SECOND
const MS_IN_HOUR = 60 * MS_IN_MINUTE
// Bigint keeps durations beyond 2^53 microseconds exact.
const US_IN_MS = 1_000n
const US_IN_SECOND = 1_000_000n
const US_IN_MINUTE = 60n * US_IN_SECOND
const US_IN_HOUR = 60n * US_IN_MINUTE
const NS_IN_SECOND = 1_000_000_000n
const NS_IN_MINUTE = 60n * NS_IN_SECOND
const NS_IN_HOUR = 60n * NS_IN_MINUTE
const NS_IN_DAY = 24n * NS_IN_HOUR
// FFmpeg's av_parse_time reads at most four hour digits in HH:MM:SS, so
// longer values render as decimal seconds, which it parses exactly.
const MAX_TIMESTAMP_HOURS = 9_999

export const isTimeObject = (value: unknown): value is FFmpeguTimeObject =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !("getArgs" in value)

// Native getters throw for anything without Temporal.Duration's internal
// slots, so they recognise Durations from other realms (where `instanceof`
// fails) and reject lookalike objects and proxies.
const temporalDurationSign = Object.getOwnPropertyDescriptor(
  Temporal.Duration.prototype,
  "sign"
)!.get!

const isTemporalDuration = (value: object): value is Temporal.Duration => {
  try {
    temporalDurationSign.call(value)
    return true
  } catch {
    return false
  }
}

// `isDuration` probes with `in`, which a proxy's `has` trap may make throw.
// Such a value is not an Effect Duration, and builders must not throw.
const isEffectDuration = (value: object): value is Duration.Duration => {
  try {
    return Duration.isDuration(value)
  } catch {
    return false
  }
}

/**
 * Must be checked before `isTimeObject`, which both kinds also satisfy:
 * `Temporal.Duration` even has the time object's fields. The native check
 * runs first because it never consults the prototype chain.
 */
export const isDurationValue = (
  value: unknown
): value is FFmpeguDurationValue =>
  typeof value === "object" &&
  value !== null &&
  (isTemporalDuration(value) || isEffectDuration(value))

type ResolvedTimeOptions<T, K extends keyof T> = {
  [P in keyof T]: P extends K
    ? Exclude<T[P], FFmpeguTimeObject | FFmpeguDurationValue> | FFmpeguArgument
    : T[P]
}

const timeObjectToMilliseconds = (t: FFmpeguTimeObject): number =>
  Math.trunc(
    (t.hours ?? 0) * MS_IN_HOUR +
      (t.minutes ?? 0) * MS_IN_MINUTE +
      (t.seconds ?? 0) * MS_IN_SECOND +
      (t.milliseconds ?? 0)
  )

// FFmpeg parses a time's magnitude into an int64 before applying the sign,
// so -2^63 µs is out of range as well.
const MAX_MICROSECONDS = 9_223_372_036_854_775_807n

/**
 * ffmpeg's time base is microseconds; finer precision is truncated. A number
 * is a time object's total, already truncated to milliseconds.
 */
const toMicroseconds = (value: FFmpeguDurationValue | number): bigint => {
  const microseconds =
    typeof value === "number"
      ? millisecondsToMicroseconds(value)
      : durationToMicroseconds(value)
  if (microseconds > MAX_MICROSECONDS || microseconds < -MAX_MICROSECONDS) {
    throw new RangeError(
      `A time value must be within ±${MAX_MICROSECONDS} microseconds.`
    )
  }
  return microseconds
}

const millisecondsToMicroseconds = (milliseconds: number): bigint => {
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError("A time object's fields must be finite numbers.")
  }
  return BigInt(milliseconds) * US_IN_MS
}

const durationToMicroseconds = (value: FFmpeguDurationValue): bigint => {
  // Same order as `isDurationValue`: anything else is an Effect Duration.
  if (!isTemporalDuration(value)) {
    if (!Duration.isFinite(value)) {
      throw new RangeError("A time value must be a finite Duration.")
    }
    return Duration.toNanosUnsafe(value) / 1_000n
  }
  // `from` copies the internal slots into this realm's Duration, so the
  // fields below come from native getters even for foreign Durations.
  const d = Temporal.Duration.from(value)
  // Calendar units have no fixed length without a reference date.
  if (d.years !== 0 || d.months !== 0 || d.weeks !== 0) {
    throw new RangeError(
      `A Temporal.Duration time value cannot contain years, months, or weeks: ${d}`
    )
  }
  // `total()` returns a number, which rounds beyond 2^53 units. The fields
  // are integers sharing one sign, so their bigint sum is exact. Days are 24
  // hours without a reference date.
  const nanoseconds =
    BigInt(d.days) * NS_IN_DAY +
    BigInt(d.hours) * NS_IN_HOUR +
    BigInt(d.minutes) * NS_IN_MINUTE +
    BigInt(d.seconds) * NS_IN_SECOND +
    BigInt(d.milliseconds) * 1_000_000n +
    BigInt(d.microseconds) * 1_000n +
    BigInt(d.nanoseconds)
  // Bigint division truncates toward zero, matching Effect durations and
  // keeping negative values symmetric with positive ones.
  return nanoseconds / 1_000n
}

const pad = (n: bigint, length: number) => String(n).padStart(length, "0")

/**
 * `[-]HH:MM:SS.mmm`, or `.uuuuuu` with sub-millisecond precision. Beyond
 * 9999 hours, `[-]S.mmm` or `[-]S.uuuuuu` with the same fraction.
 */
const formatTimestamp = (microseconds: bigint): string => {
  const sign = microseconds < 0n ? "-" : ""
  const absolute = microseconds < 0n ? -microseconds : microseconds
  const h = absolute / US_IN_HOUR
  const m = (absolute % US_IN_HOUR) / US_IN_MINUTE
  const s = (absolute % US_IN_MINUTE) / US_IN_SECOND
  const fraction = absolute % US_IN_SECOND
  const digits =
    fraction % US_IN_MS === 0n ? pad(fraction / US_IN_MS, 3) : pad(fraction, 6)
  if (h > BigInt(MAX_TIMESTAMP_HOURS)) {
    return `${sign}${absolute / US_IN_SECOND}.${digits}`
  }
  return `${sign}${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${digits}`
}

/** Decimal seconds without trailing zeros, like `String(seconds)`. */
const formatSeconds = (microseconds: bigint): string => {
  const sign = microseconds < 0n ? "-" : ""
  const absolute = microseconds < 0n ? -microseconds : microseconds
  const fraction = pad(absolute % US_IN_SECOND, 6).replace(/0+$/, "")
  return `${sign}${absolute / US_IN_SECOND}${fraction && `.${fraction}`}`
}

/**
 * A single time value. Filters escape it like a string, unlike other
 * arguments, whose rendered values are spliced into the filter unescaped.
 */
export class FFmpeguTimeArgument extends FFmpeguArgument {
  // Time objects are mutable, so their total is captured here, matching how
  // option bundles copy their inputs. Validation still waits for compile.
  private readonly value: FFmpeguDurationValue | number

  constructor(
    value: FFmpeguDurationValue | FFmpeguTimeObject,
    private readonly format: (microseconds: bigint) => string
  ) {
    super()
    this.value = isDurationValue(value)
      ? value
      : timeObjectToMilliseconds(value)
  }

  getArgs(): string[] {
    return [this.format(toMicroseconds(this.value))]
  }
}

export const timestampArgument = (
  value: FFmpeguDurationValue | FFmpeguTimeObject
) => new FFmpeguTimeArgument(value, formatTimestamp)

export const secondsArgument = (
  value: FFmpeguDurationValue | FFmpeguTimeObject
) => new FFmpeguTimeArgument(value, formatSeconds)

export const resolveSecondsOptions = <
  T extends Record<string, unknown>,
  K extends keyof T
>(
  options: T,
  keys: K[]
): ResolvedTimeOptions<T, K> => {
  const resolved = { ...options } as ResolvedTimeOptions<T, K>

  for (const key of keys) {
    const value = resolved[key]

    // Filter options such as fps.start_time require seconds, not HH:MM:SS,
    // and muxer durations such as hls_time take seconds as well.
    if (isDurationValue(value) || isTimeObject(value)) {
      resolved[key] = secondsArgument(value) as ResolvedTimeOptions<T, K>[K]
    }
  }

  return resolved
}

export const formatBitrate = (value: string | number, unit?: string) =>
  typeof unit === "undefined" ? value : `${value}${unit}`
