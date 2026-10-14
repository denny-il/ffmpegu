import * as Cause from "effect/Cause"
import type * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as ChildProcess from "effect/process/ChildProcess"
import {
  type ChildProcessHandle,
  ChildProcessSpawner
} from "effect/process/ChildProcessSpawner"
import * as Ref from "effect/Ref"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import {
  ExitError,
  type FFmpegError,
  OutputError,
  PipeError,
  SpawnError
} from "../errors.ts"
import type { Progress, RunResult } from "../types/index.ts"
import {
  type CompiledCommand,
  type CompiledInputStream,
  type CompiledOutputStream,
  type FFmpeguCommand,
  PROGRESS_FD
} from "./command.ts"
import { ByteTail, ProgressParser } from "./diagnostics.ts"
import {
  awaitExit,
  byteLimit,
  DEFAULT_FORCE_KILL_AFTER,
  DEFAULT_STDERR_TAIL_BYTES,
  drainToTail,
  durationOption,
  failureReasons,
  firstFailure,
  isClosedByReader,
  mapEffectErrors,
  mapStreamErrors,
  settle,
  uniqueReasons
} from "./process.ts"

export interface RunOptions<PE = never, PR = never> {
  /**
   * Called serially with the latest progress block. Updates that arrive while
   * a call is running are coalesced to the most recent one, so a slow
   * callback never stalls media. On success the last pending update is
   * delivered and awaited; failures of the callback fail the run.
   */
  readonly onProgress?:
    | ((progress: Progress) => Effect.Effect<void, PE, PR>)
    | undefined
}

export interface FFmpegOptions {
  /** Binary name or path. Defaults to `"ffmpeg"`. */
  readonly binary?: string | undefined
  /** Grace period after SIGTERM before SIGKILL. Defaults to 5 seconds. */
  readonly forceKillAfter?: Duration.Input | undefined
  /** Bytes of stderr kept for results and errors. Defaults to 64 KiB. */
  readonly stderrTailBytes?: number | undefined
}

export interface FFmpegService {
  readonly run: <E, R, PE = never, PR = never>(
    command: FFmpeguCommand<E, R>,
    options?: RunOptions<PE, PR>
  ) => Effect.Effect<RunResult, FFmpegError | E | PE, R | PR>
}

export class FFmpeg extends Context.Service<FFmpeg, FFmpegService>()(
  "ffmpegu/FFmpeg"
) {
  /** Layer running `ffmpeg` through the provided `ChildProcessSpawner`. */
  static layer = (
    options: FFmpegOptions = {}
  ): Layer.Layer<FFmpeg, never, ChildProcessSpawner> =>
    Layer.effect(FFmpeg, make(options))

  /** Like {@link FFmpeg.layer}, reading options from `Config`. */
  static layerConfig = (
    options: Config.Config<FFmpegOptions>
  ): Layer.Layer<FFmpeg, Config.ConfigError, ChildProcessSpawner> =>
    Layer.effect(FFmpeg, Effect.flatMap(options, make))
}

/** Run a command with the `FFmpeg` service from the context. */
export const run = <E, R, PE = never, PR = never>(
  command: FFmpeguCommand<E, R>,
  options?: RunOptions<PE, PR>
): Effect.Effect<RunResult, FFmpegError | E | PE, FFmpeg | R | PR> =>
  FFmpeg.use((ffmpeg) => ffmpeg.run(command, options))

interface Settings {
  readonly binary: string
  readonly forceKillAfter: Duration.Duration
  readonly stderrTailBytes: number
}

const make = Effect.fnUntraced(function* (options: FFmpegOptions) {
  const spawner = yield* ChildProcessSpawner
  const settings: Settings = {
    binary: options.binary ?? "ffmpeg",
    forceKillAfter: yield* durationOption(
      "forceKillAfter",
      options.forceKillAfter,
      DEFAULT_FORCE_KILL_AFTER
    ),
    stderrTailBytes: yield* byteLimit(
      "stderrTailBytes",
      options.stderrTailBytes,
      DEFAULT_STDERR_TAIL_BYTES
    )
  }

  const run = Effect.fn("ffmpegu/FFmpeg.run")(function* (
    command: FFmpeguCommand<unknown, unknown>,
    options?: RunOptions<unknown, unknown>
  ) {
    const compiled = yield* Effect.fromResult(command.compile())
    return yield* execute(spawner, settings, compiled, options?.onProgress)
  })

  // The implementation is checked against `unknown` error/requirement types;
  // callers get their own `E`/`R` back, which `execute` passes through.
  return FFmpeg.of({ run: run as FFmpegService["run"] })
})

const execute = (
  spawner: ChildProcessSpawner["Service"],
  settings: Settings,
  compiled: CompiledCommand<unknown, unknown>,
  onProgress:
    | ((progress: Progress) => Effect.Effect<void, unknown, unknown>)
    | undefined
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const args = [
        "-nostdin",
        ...(onProgress ? ["-progress", `pipe:${PROGRESS_FD}`, "-nostats"] : []),
        ...compiled.args
      ]

      const additionalFds: Record<
        `fd${number}`,
        ChildProcess.AdditionalFdConfig
      > = {}
      if (onProgress) {
        additionalFds[ChildProcess.fdName(PROGRESS_FD)] = { type: "output" }
      }
      for (const { fd } of compiled.inputStreams) {
        additionalFds[ChildProcess.fdName(fd)] = { type: "input" }
      }
      for (const { fd } of compiled.outputStreams) {
        additionalFds[ChildProcess.fdName(fd)] = { type: "output" }
      }

      // Media only travels over dedicated descriptors; stdin/stdout are unused.
      const handle = yield* spawner
        .spawn(
          ChildProcess.make(settings.binary, args, {
            stdin: "ignore",
            stdout: "ignore",
            stderr: "pipe",
            forceKillAfter: settings.forceKillAfter,
            additionalFds
          })
        )
        .pipe(
          mapEffectErrors(
            (cause) => new SpawnError({ binary: settings.binary, cause })
          )
        )

      const stderr = new ByteTail(settings.stderrTailBytes)
      const closeInputs = yield* Deferred.make<void>()

      const stderrFiber = yield* Effect.forkScoped(
        drainToTail(handle.stderr, 2, stderr)
      )
      const inputsFiber = yield* Effect.forkScoped(
        Effect.forEach(
          compiled.inputStreams,
          (input) => feedInput(handle, input, closeInputs),
          { concurrency: "unbounded", discard: true }
        )
      )
      const pumpsFiber = yield* Effect.forkScoped(
        Effect.all(
          [
            Effect.forEach(
              compiled.outputStreams,
              (output) => drainOutput(handle, output),
              { concurrency: "unbounded", discard: true }
            ),
            onProgress ? deliverProgress(handle, onProgress) : Effect.void
          ],
          { concurrency: "unbounded", discard: true }
        )
      )
      const fibers = [stderrFiber, inputsFiber, pumpsFiber] as const

      // Inputs are always stopped by closing them rather than by interrupting
      // the feeders: the source is interrupted and the descriptor ended, so a
      // process blocked on reading sees EOF, and defects raised by the
      // source's finalizers are still reported. Completes once the end is
      // flushed or the pipe breaks (after exit, or through the kill).
      const stopInputs = Deferred.succeed(closeInputs, undefined).pipe(
        Effect.andThen(Fiber.await(inputsFiber))
      )
      // Abandons the run: output readers and the progress callback stop,
      // inputs are closed, and a still-running process is terminated with the
      // configured SIGKILL escalation.
      const abandon = Effect.gen(function* () {
        const running = yield* Effect.orElseSucceed(
          handle.isRunning,
          () => false
        )
        yield* Fiber.interrupt(pumpsFiber)
        yield* Effect.all(
          [
            stopInputs,
            running
              ? Effect.ignore(
                  handle.kill({ forceKillAfter: settings.forceKillAfter })
                )
              : Effect.void
          ],
          { concurrency: "unbounded", discard: true }
        )
      })
      // Runs before the scoped fibers are interrupted and the platform
      // releases the handle. Failed and successful runs have already settled
      // and reported every task; a cancelled run (only interruptions) reports
      // the failures and cleanup defects of its tasks here, next to the
      // original interruption.
      yield* Effect.addFinalizer((runExit) =>
        Effect.gen(function* () {
          yield* abandon
          if (
            !(Exit.isFailure(runExit) && Cause.hasInterruptsOnly(runExit.cause))
          ) {
            return
          }
          const exits = yield* Effect.forEach(fibers, settle)
          const reasons = uniqueReasons(exits.flatMap(failureReasons))
          if (reasons.length > 0) {
            // Finalizers have no typed error channel; these reasons belong to
            // the run's own error type and are merged into its cause.
            yield* Effect.failCause(
              Cause.fromReasons(reasons)
            ) as Effect.Effect<never>
          }
        })
      )

      /**
       * Fails with every reason reported by the settled fibers plus `first`,
       * dropping the supervisor's own interruptions.
       */
      const failWith = (
        first: ReadonlyArray<Cause.Reason<unknown>>,
        exits: ReadonlyArray<Exit.Exit<unknown, unknown>>
      ) =>
        Effect.failCause(
          Cause.fromReasons(
            uniqueReasons([...first, ...exits.flatMap(failureReasons)])
          )
        )

      const raced = yield* Effect.exit(
        Effect.raceFirst(awaitExit(handle), firstFailure(fibers))
      )
      if (Exit.isFailure(raced)) {
        if (Cause.hasInterruptsOnly(raced.cause)) {
          return yield* Effect.failCause(raced.cause)
        }
        // A supervised task failed while the process was running.
        // The triggering failure comes first, then whatever the other tasks
        // report while being stopped.
        yield* abandon
        const exits = yield* Effect.forEach(fibers, settle)
        return yield* failWith(failureReasons(raced), exits)
      }
      const exit = raced.value

      // Once ffmpeg has exited nothing reads its inputs anymore, so pending
      // (possibly infinite) sources are stopped and their finalizers awaited.
      // Failures already observed and cleanup defects are kept.
      const inputsExit = yield* stopInputs

      if (exit.exitCode !== 0) {
        // Outputs are not awaited for a failed process; stderr is, for the
        // diagnostics. The exit is reported first, along with any genuine
        // failure of the other tasks.
        const pumpsExit = yield* settle(pumpsFiber)
        const stderrExit = yield* Fiber.await(stderrFiber)
        const exitError = new ExitError({
          exitCode: exit.exitCode,
          stderr: stderr.text(),
          cause: exit.cause
        })
        return yield* failWith(
          [Cause.makeFailReason(exitError), ...exit.reasons],
          [inputsExit, pumpsExit, stderrExit]
        )
      }

      if (failureReasons(inputsExit).length > 0) {
        const others = yield* Effect.forEach([pumpsFiber, stderrFiber], settle)
        return yield* failWith([], [inputsExit, ...others])
      }

      // Remaining output, the last progress update and stderr are still in
      // flight; they stay supervised until they complete.
      const drained = yield* Effect.exit(
        Effect.forEach([pumpsFiber, stderrFiber], Fiber.join, {
          concurrency: "unbounded",
          discard: true
        })
      )
      if (Exit.isFailure(drained)) {
        if (Cause.hasInterruptsOnly(drained.cause)) {
          return yield* Effect.failCause(drained.cause)
        }
        const exits = yield* Effect.forEach([pumpsFiber, stderrFiber], settle)
        return yield* failWith(failureReasons(drained), exits)
      }
      return { args, stderr: stderr.text() } satisfies RunResult
    })
  )

/**
 * Write a caller stream into an input descriptor.
 *
 * The source and the descriptor run in separate fibers joined by a one-chunk
 * queue:
 * - the producer runs the caller stream into the queue; it is only ever
 *   stopped by plain fiber interruption, which keeps defects raised by the
 *   source's finalizers in its exit (`Stream.interruptWhen` would drop them);
 * - the consumer writes the queue into the library-owned sink, so only sink
 *   failures are classified and caller errors never pass through it. Ending
 *   the queue ends the descriptor, so a process blocked on reading sees EOF.
 *
 * Closing stops the producer and ends the queue; the consumer then flushes
 * what was queued and ends the descriptor, which completes once the end is
 * flushed or the pipe breaks. The reader closing its end is not an error by
 * itself: the exit code decides the outcome. All waiting is interruptible;
 * collecting and combining the fibers' exits is not, so every failure and
 * cleanup defect is reported.
 */
const feedInput = (
  handle: ChildProcessHandle,
  { fd, source }: CompiledInputStream<unknown, unknown>,
  close: Deferred.Deferred<void>
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const queue = yield* Queue.bounded<Uint8Array, Cause.Done>(1)
      // Started immediately so that a source is always running (and owns its
      // resources) by the time the feeder can be stopped.
      const producer = yield* Effect.forkChild(
        Effect.interruptible(
          Stream.runForEach(source, (chunk) => Queue.offer(queue, chunk)).pipe(
            Effect.andThen(Queue.end(queue))
          )
        ),
        { startImmediately: true }
      )
      const consumer = yield* Effect.forkChild(
        Effect.interruptible(
          Stream.run(
            Stream.fromQueue(queue),
            handle.getInputFd(fd).pipe(
              Sink.catchCause((cause) =>
                Effect.failCause(
                  Cause.map(cause, (error) =>
                    isClosedByReader(error)
                      ? new InputClosed()
                      : new PipeError({
                          fd,
                          direction: "input",
                          cause: error
                        })
                  )
                )
              )
            )
          )
        )
      )
      const consumerReasons = (exit: Exit.Exit<unknown, unknown>) =>
        failureReasons(exit).filter(
          (reason) =>
            !(reason._tag === "Fail" && reason.error instanceof InputClosed)
        )
      const done = (
        first: ReadonlyArray<Cause.Reason<unknown>>,
        producerExit: Exit.Exit<unknown, unknown>,
        consumerExit: Exit.Exit<unknown, unknown>
      ) => {
        const reasons = uniqueReasons([
          ...first,
          ...failureReasons(producerExit),
          ...consumerReasons(consumerExit)
        ])
        return reasons.length === 0
          ? Effect.void
          : Effect.failCause(Cause.fromReasons(reasons))
      }

      const producerFailed = Fiber.await(producer).pipe(
        Effect.flatMap((exit) =>
          Exit.isSuccess(exit) ? Effect.never : Effect.succeed(exit)
        )
      )
      const waited = yield* Effect.exit(
        restore(
          Effect.raceFirst(
            Fiber.await(consumer).pipe(Effect.as("written" as const)),
            Effect.raceFirst(
              producerFailed.pipe(Effect.as("failed" as const)),
              Deferred.await(close).pipe(Effect.as("closed" as const))
            )
          )
        )
      )

      if (Exit.isFailure(waited)) {
        // The feeder itself was interrupted (run cancelled, sibling failed).
        return yield* done(
          waited.cause.reasons,
          yield* settle(producer),
          yield* settle(consumer)
        )
      }
      switch (waited.value) {
        case "written":
          // Source ended and everything was written, or the descriptor
          // failed or was closed by the reader.
          return yield* done(
            [],
            yield* settle(producer),
            yield* Fiber.await(consumer)
          )
        case "failed": {
          // All reasons: a source interrupting itself interrupts the run.
          const producerExit = yield* Fiber.await(producer)
          return yield* done(
            Exit.isFailure(producerExit) ? producerExit.cause.reasons : [],
            producerExit,
            yield* settle(consumer)
          )
        }
        case "closed": {
          const producerExit = yield* settle(producer)
          yield* Queue.end(queue)
          const consumerExit = yield* Effect.exit(
            restore(Fiber.await(consumer))
          )
          return yield* Exit.isSuccess(consumerExit)
            ? done([], producerExit, consumerExit.value)
            : done(
                consumerExit.cause.reasons,
                producerExit,
                yield* settle(consumer)
              )
        }
      }
    })
  )

/** Private marker; caller errors can never be instances of it. */
class InputClosed {}

/**
 * Read an output descriptor into a caller sink. A `Sink` may complete before
 * its upstream ends (even within a chunk), so completion is only accepted
 * after the upstream reached its end marker.
 */
const drainOutput = (
  handle: ChildProcessHandle,
  { fd, sink }: CompiledOutputStream<unknown, unknown>
) =>
  Effect.gen(function* () {
    const ended = yield* Ref.make(false)
    const upstream = handle.getOutputFd(fd).pipe(
      mapStreamErrors(
        (cause) => new PipeError({ fd, direction: "output", cause })
      ),
      Stream.concat(Stream.drain(Stream.fromEffect(Ref.set(ended, true))))
    )
    yield* Stream.run(upstream, sink)
    if (!(yield* Ref.get(ended))) {
      return yield* new OutputError({ reason: "SinkEndedEarly", fd })
    }
  })

/**
 * Parse the progress descriptor and hand updates to the callback through a
 * sliding buffer of one: the descriptor is always drained, the callback runs
 * serially and only ever sees the most recent pending update.
 */
const deliverProgress = (
  handle: ChildProcessHandle,
  onProgress: (progress: Progress) => Effect.Effect<void, unknown, unknown>
) =>
  handle.getOutputFd(PROGRESS_FD).pipe(
    mapStreamErrors(
      (cause) => new PipeError({ fd: PROGRESS_FD, direction: "output", cause })
    ),
    Stream.mapAccum(
      () => new ProgressParser(),
      (parser, chunk: Uint8Array) => [parser, parser.push(chunk)] as const,
      { onHalt: (parser) => parser.end() }
    ),
    Stream.buffer({ capacity: 1, strategy: "sliding" }),
    Stream.runForEach(onProgress)
  )
