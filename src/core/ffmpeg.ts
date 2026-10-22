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
  CommandError,
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
  /**
   * Run a command with exactly one `Output.toStream` output, emitting that
   * output's bytes as the consumer pulls them. The stream ends once the
   * output reached EOF and ffmpeg exited successfully; it fails like `run`
   * after the chunks already emitted. Ending consumption early terminates
   * ffmpeg and releases the inputs.
   */
  readonly stream: <E, R, PE = never, PR = never>(
    command: FFmpeguCommand<E, R>,
    options?: RunOptions<PE, PR>
  ) => Stream.Stream<Uint8Array, FFmpegError | E | PE, R | PR>
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

/** Stream a command's output with the `FFmpeg` service from the context. */
export const stream = <E, R, PE = never, PR = never>(
  command: FFmpeguCommand<E, R>,
  options?: RunOptions<PE, PR>
): Stream.Stream<Uint8Array, FFmpegError | E | PE, FFmpeg | R | PR> =>
  Stream.unwrap(
    FFmpeg.use((ffmpeg) => Effect.succeed(ffmpeg.stream(command, options)))
  )

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
    if (compiled.streamOutputFds.length > 0) {
      return yield* new CommandError({
        reason: "StreamOutput",
        message:
          "The command has an Output.toStream output, which run cannot consume. Use stream(command) instead."
      })
    }
    return yield* execute(
      spawner,
      settings,
      compiled,
      options?.onProgress,
      undefined
    )
  })

  const stream = (
    command: FFmpeguCommand<unknown, unknown>,
    options?: RunOptions<unknown, unknown>
  ) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const compiled = yield* Effect.fromResult(command.compile())
        const fds = compiled.streamOutputFds
        if (fds.length !== 1) {
          return yield* new CommandError({
            reason: "StreamOutput",
            message:
              fds.length === 0
                ? "The command has no Output.toStream output to stream."
                : `The command has ${fds.length} Output.toStream outputs; stream reads exactly one. Write the others to files or sinks.`
          })
        }
        // A single chunk in flight: the forwarder waits for the consumer to
        // take each chunk, so ffmpeg's writes are paced through the pipe. The
        // queue only carries chunks; it ends with the run, whose outcome the
        // consumer then reads from the run itself.
        const queue = yield* Queue.bounded<Uint8Array, Cause.Done>(1)
        // Set once the consumer has read the run's outcome.
        const observed = yield* Ref.make(false)
        // A consumer that stops before reading the outcome interrupts the run
        // (if still running), which terminates ffmpeg and releases the
        // inputs. Failures and cleanup defects it reports have no other
        // observer, so they fail the stream, as they would fail a cancelled
        // `run`. Forked and guarded without an interruption point in between,
        // so that no run escapes the finalizer; the run stays interruptible.
        const running = yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const fiber = yield* execute(
              spawner,
              settings,
              compiled,
              options?.onProgress,
              { fd: fds[0]!, queue }
            ).pipe(
              Effect.withSpan("ffmpegu/FFmpeg.stream"),
              Effect.onExit(() => Queue.end(queue)),
              Effect.interruptible,
              Effect.forkScoped
            )
            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                if (yield* Ref.get(observed)) return
                const reasons = failureReasons(yield* settle(fiber))
                if (reasons.length > 0) {
                  // Finalizers have no typed error channel; see `execute`.
                  yield* Effect.failCause(
                    Cause.fromReasons(reasons)
                  ) as Effect.Effect<never>
                }
              })
            )
            return fiber
          })
        )
        const outcome = Effect.uninterruptibleMask((restore) =>
          restore(Fiber.await(running)).pipe(
            Effect.tap(Ref.set(observed, true)),
            Effect.flatMap((exit) =>
              Exit.isSuccess(exit) ? Effect.void : Effect.failCause(exit.cause)
            )
          )
        )
        return Stream.concat(
          Stream.fromQueue(queue),
          Stream.drain(Stream.fromEffect(outcome))
        )
      })
    )

  // The implementation is checked against `unknown` error/requirement types;
  // callers get their own `E`/`R` back, which `execute` passes through.
  return FFmpeg.of({
    run: run as FFmpegService["run"],
    stream: stream as FFmpegService["stream"]
  })
})

/** Destination of an `Output.toStream` output: the queue behind the stream. */
interface StreamTarget {
  readonly fd: number
  readonly queue: Queue.Enqueue<Uint8Array, Cause.Done>
}

const execute = (
  spawner: ChildProcessSpawner["Service"],
  settings: Settings,
  compiled: CompiledCommand<unknown, unknown>,
  onProgress:
    | ((progress: Progress) => Effect.Effect<void, unknown, unknown>)
    | undefined,
  target: StreamTarget | undefined
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
      if (target) {
        additionalFds[ChildProcess.fdName(target.fd)] = { type: "output" }
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
      const draining = yield* Deferred.make<void>()

      // Sink outputs are read like the stream output: by a forwarder into a
      // one-chunk queue the sink consumes, so that the descriptor keeps being
      // drained when the sink is interrupted (see `forwardOutput`).
      const sinkOutputs = yield* Effect.forEach(
        compiled.outputStreams,
        (output) =>
          Effect.map(
            Queue.bounded<Uint8Array, PipeError | Cause.Done>(1),
            (queue) => ({ output, queue })
          )
      )

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
              sinkOutputs,
              ({ output, queue }) => drainOutput(output, queue),
              { concurrency: "unbounded", discard: true }
            ),
            onProgress ? deliverProgress(handle, onProgress) : Effect.void
          ],
          { concurrency: "unbounded", discard: true }
        )
      )
      // One fiber per descriptor: interrupting a reader stops it from reading,
      // so a forwarder failing must not interrupt the others. Forked before the
      // finalizer below is added, so that they still drain while it runs.
      const forwardFibers = yield* Effect.forEach(
        [
          ...(target ? [forwardOutput(handle, target, draining)] : []),
          ...sinkOutputs.map(({ output, queue }) =>
            forwardToSink(handle, output.fd, queue, draining, pumpsFiber)
          )
        ],
        (forward) => Effect.forkScoped(forward)
      )
      const fibers = [
        stderrFiber,
        inputsFiber,
        pumpsFiber,
        ...forwardFibers
      ] as const

      // Inputs are always stopped by closing them rather than by interrupting
      // the feeders: the source is interrupted and the descriptor ended, so a
      // process blocked on reading sees EOF, and defects raised by the
      // source's finalizers are still reported. Completes once the end is
      // flushed or the pipe breaks (after exit, or through the kill).
      const stopInputs = Deferred.succeed(closeInputs, undefined).pipe(
        Effect.andThen(Fiber.await(inputsFiber))
      )
      // Abandons the run: output descriptors are drained (see
      // `forwardOutput`), sinks and the progress callback stop, inputs are
      // closed, and a still-running process is terminated with the configured
      // SIGKILL escalation. The last three start together and are all
      // awaited: a caller's finalizer may wait for another caller resource
      // (e.g. a sink for the source sharing its connection) that is only
      // released by one of the others.
      const abandon = Effect.gen(function* () {
        const running = yield* Effect.orElseSucceed(
          handle.isRunning,
          () => false
        )
        yield* Deferred.succeed(draining, undefined)
        yield* Effect.all(
          [
            Fiber.interrupt(pumpsFiber),
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
        const outputExits = yield* Effect.forEach(
          [pumpsFiber, ...forwardFibers],
          settle
        )
        const stderrExit = yield* Fiber.await(stderrFiber)
        const exitError = new ExitError({
          exitCode: exit.exitCode,
          stderr: stderr.text(),
          cause: exit.cause
        })
        return yield* failWith(
          [Cause.makeFailReason(exitError), ...exit.reasons],
          [inputsExit, ...outputExits, stderrExit]
        )
      }

      if (failureReasons(inputsExit).length > 0) {
        const others = yield* Effect.forEach(
          [pumpsFiber, ...forwardFibers, stderrFiber],
          settle
        )
        return yield* failWith([], [inputsExit, ...others])
      }

      // Remaining output, the last progress update and stderr are still in
      // flight; they stay supervised until they complete. A stream output
      // completes as its consumer takes the rest.
      const remaining = [pumpsFiber, ...forwardFibers, stderrFiber] as const
      const drained = yield* Effect.exit(
        Effect.forEach(remaining, Fiber.join, {
          concurrency: "unbounded",
          discard: true
        })
      )
      if (Exit.isFailure(drained)) {
        if (Cause.hasInterruptsOnly(drained.cause)) {
          return yield* Effect.failCause(drained.cause)
        }
        const exits = yield* Effect.forEach(remaining, settle)
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
          const consumerExit = yield* settle(consumer)
          // The interrupted consumer leaves the descriptor open, and ffmpeg
          // blocked reading it does not act on SIGTERM, so stopping would
          // wait out `forceKillAfter`. Ending it gives ffmpeg EOF. The end
          // waits for buffered writes to flush, which ffmpeg may never read,
          // so it runs in the background for the rest of the run instead of
          // delaying the failure. Started immediately, so the end is requested
          // even if the run is torn down right after.
          //
          // Not for a source that interrupted itself: EOF could let ffmpeg
          // exit successfully before the interruption is observed, and
          // interruptions are dropped once ffmpeg exited (see
          // `failureReasons`), turning the run into a success.
          if (
            Exit.isFailure(producerExit) &&
            !Cause.hasInterruptsOnly(producerExit.cause)
          ) {
            yield* Effect.forkScoped(
              Effect.interruptible(
                Effect.ignore(Stream.run(Stream.empty, handle.getInputFd(fd)))
              ),
              { startImmediately: true }
            )
          }
          return yield* done(
            Exit.isFailure(producerExit) ? producerExit.cause.reasons : [],
            producerExit,
            consumerExit
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
 * Run an output descriptor's chunks, read by `forwardToSink`, into a caller
 * sink. A `Sink` may complete before its upstream ends (even within a chunk),
 * so completion is only accepted after the upstream reached its end marker.
 */
const drainOutput = (
  { fd, sink }: CompiledOutputStream<unknown, unknown>,
  queue: Queue.Dequeue<Uint8Array, PipeError | Cause.Done>
) =>
  Effect.gen(function* () {
    const ended = yield* Ref.make(false)
    const upstream = Stream.fromQueue(queue).pipe(
      Stream.concat(Stream.drain(Stream.fromEffect(Ref.set(ended, true))))
    )
    yield* Stream.run(upstream, sink)
    if (!(yield* Ref.get(ended))) {
      return yield* new OutputError({ reason: "SinkEndedEarly", fd })
    }
  })

/**
 * Read an output descriptor into a queue, one chunk at a time: the queue
 * behind the stream returned by `stream`, or the one a sink reads from.
 *
 * Once the run is abandoned (cancelled, a consumer stopped, or the run
 * failed) chunks are discarded instead of interrupting the reader: a pipe
 * nobody reads stays full, and ffmpeg blocked writing to it does not act on
 * SIGTERM, so termination would wait out `forceKillAfter`. Draining unblocks
 * it.
 */
const forwardOutput = (
  handle: ChildProcessHandle,
  { fd, queue }: StreamTarget,
  draining: Deferred.Deferred<void>
) =>
  handle.getOutputFd(fd).pipe(
    mapStreamErrors(
      (cause) => new PipeError({ fd, direction: "output", cause })
    ),
    // Once draining, nothing is offered anymore: a later chunk reaching the
    // consumer after discarded ones would leave a gap in its output.
    Stream.runForEach((chunk) =>
      Effect.flatMap(Deferred.isDone(draining), (done) =>
        done
          ? Effect.void
          : Effect.raceFirst(
              Queue.offer(queue, chunk),
              Deferred.await(draining)
            )
      )
    )
  )

/**
 * `forwardOutput` for a sink output, which sees the end of the descriptor or
 * the reader's failure through the queue. Once draining, chunks may have been
 * discarded, so the queue is not ended: the sink must not complete on a cut
 * output, it is interrupted instead.
 *
 * A failure is reported by the sink once it takes it from the queue; failing
 * right away would make the supervisor interrupt a sink still busy with a
 * chunk, which would then not observe it. The forwarder still fails with it
 * after the sinks stopped (the same error, reported once), so that it is
 * kept should the sink have stopped before taking it.
 */
const forwardToSink = (
  handle: ChildProcessHandle,
  fd: number,
  queue: Queue.Enqueue<Uint8Array, PipeError | Cause.Done>,
  draining: Deferred.Deferred<void>,
  sinks: Fiber.Fiber<unknown, unknown>
) =>
  forwardOutput(handle, { fd, queue }, draining).pipe(
    Effect.onExit((exit) =>
      Exit.isSuccess(exit)
        ? Effect.flatMap(Deferred.isDone(draining), (done) =>
            done ? Effect.void : Queue.end(queue)
          )
        : Queue.failCause(queue, exit.cause)
    ),
    // Failed from a finalizer, so also when the wait is interrupted: a sink
    // stopped while still busy never took the failure. Finalizers have no
    // typed error channel; the cause is merged into the forwarder's exit.
    Effect.catchCause((cause) =>
      Fiber.await(sinks).pipe(
        Effect.ensuring(Effect.failCause(cause) as Effect.Effect<never>)
      )
    )
  )

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
