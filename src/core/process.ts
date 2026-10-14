import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as PlatformError from "effect/PlatformError"
import type { ChildProcessHandle } from "effect/process/ChildProcessSpawner"
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
 * Validates a byte limit. Invalid limits (negative, fractional, NaN or
 * infinite) are programmer errors and make layer construction die.
 */
export const byteLimit = (
  name: string,
  value: number | undefined,
  fallback: number
): Effect.Effect<number> => {
  const limit = value ?? fallback
  return Number.isSafeInteger(limit) && limit >= 0
    ? Effect.succeed(limit)
    : Effect.die(
        new Cause.IllegalArgumentError(
          `${name} must be a non-negative safe integer, got: ${limit}`
        )
      )
}

/** Validates a duration option; invalid input makes layer construction die. */
export const durationOption = (
  name: string,
  value: Duration.Input | undefined,
  fallback: Duration.Input
): Effect.Effect<Duration.Duration> => {
  const duration = Duration.fromInput(value ?? fallback)
  return Option.isSome(duration)
    ? Effect.succeed(duration.value)
    : Effect.die(
        new Cause.IllegalArgumentError(
          `${name} must be a valid duration, got: ${String(value)}`
        )
      )
}

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
