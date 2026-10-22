import * as ByteSize from "effect/ByteSize"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as PlatformError from "effect/PlatformError"
import type { ChildProcessHandle } from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import * as Stream from "effect/Stream"
import { PipeError } from "../errors.ts"
import { ByteTail } from "./diagnostics.ts"

export const DEFAULT_FORCE_KILL_AFTER = "5 seconds"
export const DEFAULT_STDERR_TAIL_BYTES = 64 * 1024

export interface ProcessExit {
  /** `null` when the platform reported no exit code (signal termination). */
  readonly exitCode: number | null
  /** The platform error reported instead of an exit code. */
  readonly cause?: unknown
  /** Defects reported along with it, to be kept. */
  readonly reasons: ReadonlyArray<Cause.Die>
}

/**
 * Waits for the process to exit. The platform fails `exitCode` when the
 * process was terminated by a signal; that is reported as a `null` exit code
 * with the original error, without interpreting its message. Defects of the
 * same cause are kept; a cause without typed failure (only defects or
 * interruptions) propagates unchanged.
 */
export const awaitExit = (
  handle: ChildProcessHandle
): Effect.Effect<ProcessExit> =>
  handle.exitCode.pipe(
    Effect.map((exitCode): ProcessExit => ({ exitCode, reasons: [] })),
    Effect.catchCause((cause) => {
      const failure = cause.reasons.find(Cause.isFailReason)
      // Without a typed failure the cause holds only defects/interruptions.
      if (failure === undefined)
        return Effect.failCause(cause as Cause.Cause<never>)
      return Effect.succeed<ProcessExit>({
        exitCode: null,
        cause: failure.error,
        reasons: cause.reasons.filter(Cause.isDieReason)
      })
    })
  )

/**
 * Records the exit code on the current span if the handle already reports
 * it. Called once cleanup has terminated the process. A code not reported yet
 * (the process is still running, or the spawner reports it later) is not
 * awaited, as that could delay teardown; it is not recorded, nor is a signal
 * exit. Never fails: tracing must not change the outcome.
 */
export const annotateExitCode = (
  handle: ChildProcessHandle
): Effect.Effect<void> =>
  Effect.gen(function* () {
    // Started immediately, so an exit code already known is read synchronously.
    const reader = yield* Effect.forkDetach(handle.exitCode, {
      startImmediately: true
    })
    const exit = reader.pollUnsafe()
    if (exit === undefined) {
      reader.interruptUnsafe()
      return
    }
    if (Exit.isSuccess(exit)) {
      yield* Effect.annotateCurrentSpan("process.exit.code", exit.value)
    }
  }).pipe(Effect.ignoreCause)

/** Drains a library-owned output stream into a bounded tail. */
export const drainToTail = (
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
  fd: number,
  tail: ByteTail
): Effect.Effect<void, PipeError> =>
  stream.pipe(
    mapStreamErrors(
      (cause) => new PipeError({ fd, direction: "output", cause })
    ),
    Stream.runForEach((chunk) => Effect.sync(() => tail.push(chunk)))
  )

/**
 * Never succeeds; fails as soon as any of the fibers fails (or dies, or is
 * interrupted). Raced against process exit so that no supervised task can
 * fail unnoticed while the process is running.
 */
export const firstFailure = <E>(
  fibers: ReadonlyArray<Fiber.Fiber<unknown, E>>
): Effect.Effect<never, E> =>
  Effect.forEach(fibers, Fiber.join, {
    concurrency: "unbounded",
    discard: true
  }).pipe(Effect.andThen(Effect.never))

const EXPECTED_CLOSE_CODES: ReadonlySet<unknown> = new Set([
  "EPIPE",
  "ECONNRESET",
  // macOS can report a disconnected child-process socket as ENOTCONN.
  "ENOTCONN",
  "ERR_STREAM_DESTROYED"
])

/**
 * Whether a write to a library-owned input descriptor failed because the
 * process closed its end, which is normal when ffmpeg stops reading early
 * (e.g. `-t`, `-frames`). Only the original errno-style `code` is inspected.
 */
export const isClosedByReader = (error: unknown): boolean => {
  if (!PlatformError.isPlatformError(error)) return false
  const original = error.reason.cause
  return (
    typeof original === "object" &&
    original !== null &&
    "code" in original &&
    EXPECTED_CLOSE_CODES.has(original.code)
  )
}

/**
 * The file name of a binary, for span attributes: a configured path can
 * reveal more than the executable.
 */
export const executableName = (binary: string): string =>
  binary.slice(binary.lastIndexOf("/") + 1)

/**
 * An invalid service option. Programmatic options are programmer errors (see
 * {@link orDieInvalid}); configured ones are recoverable (see
 * {@link validatedConfig}).
 */
export class InvalidOption {
  readonly _tag = "InvalidOption"
  constructor(
    readonly option: string,
    readonly value: unknown,
    readonly expected: string
  ) {}
  get message(): string {
    return `${this.option} must be ${this.expected}, got: ${String(this.value)}`
  }
}

/** Validates a byte limit: a non-negative safe integer or a byte size. */
export const byteLimit = (
  name: string,
  value: ByteSize.Input | undefined,
  fallback: number
): Effect.Effect<number, InvalidOption> => {
  if (value === undefined) return Effect.succeed(fallback)
  const limit = Option.flatMap(ByteSize.fromInput(value), ByteSize.toNumber)
  return Option.isSome(limit)
    ? Effect.succeed(limit.value)
    : Effect.fail(
        new InvalidOption(
          name,
          value,
          "a non-negative safe integer or byte size"
        )
      )
}

// Nanoseconds per unit of each field `Duration.fromInput` reads from a
// `DurationObject`.
const NANOS_PER_UNIT = {
  weeks: 604_800e9,
  days: 86_400e9,
  hours: 3_600e9,
  minutes: 60e9,
  seconds: 1e9,
  milliseconds: 1e6,
  microseconds: 1e3,
  nanoseconds: 1
} as const

// `Duration.fromInput` normalises with floating-point arithmetic. It reads NaN
// as zero, sums the parts of a tuple or object (so parts of opposite sign, or
// infinite ones, can cancel out) and rounds tiny values to zero. So no part
// may be negative or NaN, checked before normalisation; the number `-0`
// counts as zero. The parts of a tuple or object must also total at most a safe integer of
// nanoseconds (about 104 days), so that whole-unit parts sum exactly and a
// small part is not lost to a huge one. Single values are not summed, so
// `"Infinity"` stays allowed.
const isSafeInput = (input: Duration.Input): boolean => {
  switch (typeof input) {
    case "number":
      return input >= 0
    case "bigint":
      return input >= 0n
    case "string":
      // Parsing the numeric part could underflow to `-0`, so a leading `-`
      // is rejected, even in `"-0 seconds"`.
      return !input.startsWith("-")
  }
  if (Duration.isDuration(input)) return !Duration.isNegative(input)
  const parts: ReadonlyArray<readonly [unknown, number]> = Array.isArray(input)
    ? [
        [input[0], 1e9],
        [input[1], 1]
      ]
    : Object.entries(NANOS_PER_UNIT).map(([field, nanos]) => [
        (input as Record<string, unknown>)[field],
        nanos
      ])
  let total = 0
  for (const [value, nanos] of parts) {
    if (value === undefined) continue
    if (typeof value !== "number" || !(value >= 0)) return false
    total += value * nanos
  }
  // Also rejects infinite parts.
  return total <= Number.MAX_SAFE_INTEGER
}

/**
 * Validates a non-negative duration option. Zero and `"Infinity"` are
 * allowed; negative values and NaN, which `Duration` would silently read as
 * zero, are not. The parts of a tuple or object must all be non-negative and
 * total at most `Number.MAX_SAFE_INTEGER` nanoseconds, as `Duration` sums
 * them in floating point.
 */
export const durationOption = (
  name: string,
  value: Duration.Input | undefined,
  fallback: Duration.Input
): Effect.Effect<Duration.Duration, InvalidOption> => {
  const input = value ?? fallback
  const duration = isSafeInput(input)
    ? Duration.fromInput(input)
    : Option.none()
  return Option.isSome(duration)
    ? Effect.succeed(duration.value)
    : Effect.fail(new InvalidOption(name, value, "a non-negative duration"))
}

/** Invalid programmatic options make layer construction die. */
export const orDieInvalid = <A, R>(
  self: Effect.Effect<A, InvalidOption, R>
): Effect.Effect<A, never, R> =>
  Effect.catch(self, (invalid) =>
    Effect.die(new Cause.IllegalArgumentError(invalid.message))
  )

// `Config.unwrap` treats an `undefined` record field as a nested record and
// throws, so such fields are dropped: they mean an omitted option.
const omitUndefined = <Options>(
  options: Config.Wrap<Options>
): Config.Wrap<Options> =>
  Config.isConfig(options)
    ? options
    : (Object.fromEntries(
        Object.entries(options).filter(([, field]) => field !== undefined)
      ) as unknown as Config.Wrap<Options>)

/**
 * Unwraps configured options and validates them into settings, so that
 * invalid values fail as a `ConfigError` at the option's key.
 */
export const validatedConfig = <Options, Settings>(
  options: Config.Wrap<Options>,
  validate: (options: Options) => Effect.Effect<Settings, InvalidOption>
): Config.Config<Settings> =>
  Config.mapEffect(Config.unwrap(omitUndefined(options)), (unwrapped) =>
    Effect.mapError(
      validate(unwrapped),
      (invalid) =>
        new Config.ConfigError(
          new Schema.SchemaError(
            new SchemaIssue.Pointer(
              [invalid.option],
              new SchemaIssue.InvalidValue({ message: invalid.message })
            )
          )
        )
    )
  )

/**
 * Maps the typed errors of a stream at the cause level. Unlike
 * `Stream.mapError`, which keeps only the first typed error, composite causes
 * keep every reason (other failures, defects, interruptions).
 */
export const mapStreamErrors =
  <E, E2>(f: (error: E) => E2) =>
  <A, R>(self: Stream.Stream<A, E, R>): Stream.Stream<A, E2, R> =>
    Stream.catchCause(self, (cause) => Stream.failCause(Cause.map(cause, f)))

/** Cause-level counterpart of `Effect.mapError`, see {@link mapStreamErrors}. */
export const mapEffectErrors =
  <E, E2>(f: (error: E) => E2) =>
  <A, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E2, R> =>
    Effect.catchCause(self, (cause) => Effect.failCause(Cause.map(cause, f)))

/**
 * Interrupts a supervised fiber (a no-op if it already completed) and waits
 * for it, including its finalizers.
 */
export const settle = <A, E>(
  fiber: Fiber.Fiber<A, E>
): Effect.Effect<Exit.Exit<A, E>> =>
  Fiber.interrupt(fiber).pipe(Effect.andThen(Fiber.await(fiber)))

/**
 * The reasons of a settled fiber's exit, without interruptions.
 *
 * Fibers are settled by the supervisor once their outcome no longer matters
 * (the process exited, or another task failed), so interruptions at that
 * point are the supervisor's own and carry no information; that includes a
 * caller stream or callback interrupting itself after it stopped mattering.
 * Failures and defects, including ones raised by finalizers while being
 * interrupted, are kept. A caller interrupting itself while the process is
 * still running interrupts the run instead (see the supervisor).
 */
export const failureReasons = <E>(
  exit: Exit.Exit<unknown, E>
): ReadonlyArray<Cause.Reason<E>> =>
  Exit.isSuccess(exit)
    ? []
    : exit.cause.reasons.filter((reason) => !Cause.isInterruptReason(reason))

const sameReason = (a: Cause.Reason<unknown>, b: Cause.Reason<unknown>) =>
  a._tag === "Fail"
    ? b._tag === "Fail" && a.error === b.error
    : a._tag === "Die"
      ? b._tag === "Die" && a.defect === b.defect
      : a._tag === b._tag

/**
 * Concatenates reasons in order, dropping repeats of the same error or defect
 * (a reason can be observed both directly and through a settled fiber).
 */
export const uniqueReasons = <E>(
  reasons: ReadonlyArray<Cause.Reason<E>>
): Array<Cause.Reason<E>> =>
  reasons.reduce<Array<Cause.Reason<E>>>(
    (unique, reason) =>
      unique.some((known) => sameReason(known, reason))
        ? unique
        : [...unique, reason],
    []
  )
