import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Config,
  ConfigProvider,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Ref,
  Sink,
  Stream
} from "effect"
import {
  Command,
  CommandError,
  ExitError,
  FFmpeg,
  type FFmpegOptions,
  Input,
  Output,
  type FFmpeguCommand,
  OutputError,
  PipeError,
  type Progress,
  run,
  type RunOptions,
  SpawnError
} from "../../src/index.ts"
import {
  type FakeProcess,
  type FakeSpawnerOptions,
  makeFakeSpawner,
  platformError
} from "./fake-spawner.ts"

const setup = Effect.fnUntraced(function* (
  options?: FFmpegOptions,
  fake?: FakeSpawnerOptions
) {
  const spawner = yield* makeFakeSpawner(fake)
  const layer = FFmpeg.layer(options).pipe(Layer.provide(spawner.layer))
  const ffmpeg = yield* Effect.service(FFmpeg).pipe(Effect.provide(layer))
  return { ffmpeg, layer, next: spawner.next }
})

const millis = (input: Duration.Input | undefined) =>
  input === undefined
    ? undefined
    : Duration.toMillis(Duration.fromInputUnsafe(input))

/** Reasons of a failed exit as `[tag, error | defect]` pairs. */
const describeCause = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isSuccess(exit)
    ? []
    : exit.cause.reasons.map((reason) =>
        reason._tag === "Fail"
          ? (["Fail", reason.error] as const)
          : reason._tag === "Die"
            ? (["Die", reason.defect] as const)
            : (["Interrupt", undefined] as const)
      )

const bytes = (...values: Array<number>) => new Uint8Array(values)

/** An endless source that records when its finalizer ran. */
const endless = (finalized: Ref.Ref<boolean>) =>
  Stream.scoped(
    Stream.fromEffect(
      Effect.acquireRelease(Effect.succeed(bytes(1)), () =>
        Ref.set(finalized, true)
      )
    )
  ).pipe(Stream.flatMap((chunk) => Stream.forever(Stream.make(chunk))))

const toFile = Command.make({
  inputs: [Input.fromFile("in.mp4")],
  outputs: [Output.toFile("out.mp4")]
})

describe("FFmpeg", () => {
  it.effect("spawns with owned descriptors and returns the stderr tail", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup({ stderrTailBytes: 8 })
      const fiber = yield* Effect.forkChild(ffmpeg.run(toFile))
      const process = yield* next

      assert.deepStrictEqual(process.args, [
        "-nostdin",
        "-i",
        "in.mp4",
        "out.mp4"
      ])
      assert.strictEqual(process.command.command, "ffmpeg")
      assert.strictEqual(process.command.options.stdin, "ignore")
      assert.strictEqual(process.command.options.stdout, "ignore")
      assert.strictEqual(millis(process.command.options.forceKillAfter), 5000)
      assert.deepStrictEqual(process.command.options.additionalFds, {})

      yield* process.emit(2, "frame=1 lots of log\n", "done!\n")
      yield* process.exit(0)
      const result = yield* Fiber.join(fiber)

      assert.deepStrictEqual(result, {
        args: ["-nostdin", "-i", "in.mp4", "out.mp4"],
        stderr: "g\ndone!"
      })
      assert.isTrue(yield* process.released)
    })
  )

  it.effect("writes stream inputs and ends them, reads sink outputs", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const received = yield* Ref.make<Array<number>>([])
      const command = Command.make({
        inputs: [Input.fromStream(Stream.make(bytes(1, 2), bytes(3)))],
        outputs: [
          Output.toSink(
            Sink.forEach((chunk: Uint8Array) =>
              Ref.update(received, (all) => [...all, ...chunk])
            )
          )
        ]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next

      assert.deepStrictEqual(process.command.options.additionalFds, {
        fd4: { type: "input" },
        fd5: { type: "output" }
      })
      yield* process
        .inputEnded(4)
        .pipe(Effect.repeat({ until: (ended) => ended }))
      yield* process.emit(5, bytes(7), bytes(8, 9))
      yield* process.exit(0)
      yield* Fiber.join(fiber)

      assert.deepStrictEqual(yield* process.written(4), [1, 2, 3])
      assert.isTrue(yield* process.inputEnded(4))
      assert.deepStrictEqual(yield* Ref.get(received), [7, 8, 9])
    })
  )

  it.effect(
    "stops endless inputs when ffmpeg exits and awaits their finalizers",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const finalized = yield* Ref.make(false)
        const command = Command.make({
          inputs: [Input.fromStream(endless(finalized))],
          outputs: [Output.toFile("out.mp4")]
        })
        const fiber = yield* Effect.forkChild(ffmpeg.run(command))
        const process = yield* next

        yield* process.awaitWrite(4)
        yield* process.exit(0)
        yield* Fiber.join(fiber)

        assert.isTrue(yield* Ref.get(finalized))
        assert.deepStrictEqual(yield* process.kills, [])
      })
  )

  it.effect(
    "treats the reader closing an input as normal when ffmpeg succeeds",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const finalized = yield* Ref.make(false)
        const command = Command.make({
          inputs: [Input.fromStream(endless(finalized))],
          outputs: [Output.toFile("out.mp4")]
        })
        for (const code of ["EPIPE", "ECONNRESET", "ERR_STREAM_DESTROYED"]) {
          const fiber = yield* Effect.forkChild(ffmpeg.run(command))
          const process = yield* next
          yield* process.awaitWrite(4)
          yield* process.closeInput(4, code)
          yield* process.exit(0)
          assert.strictEqual((yield* Fiber.join(fiber)).stderr, "")
        }
      })
  )

  it.effect("reports the exit status rather than a closed input pipe", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const finalized = yield* Ref.make(false)
      const command = Command.make({
        inputs: [Input.fromStream(endless(finalized))],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process.awaitWrite(4)
      yield* process.closeInput(4)
      yield* process.emit(2, "Invalid data found\n")
      yield* process.exit(1)

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ExitError)
      assert.strictEqual(error.exitCode, 1)
      assert.strictEqual(error.stderr, "Invalid data found")
    })
  )

  it.effect(
    "fails immediately on other input pipe errors and kills ffmpeg",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const finalized = yield* Ref.make(false)
        const command = Command.make({
          inputs: [Input.fromStream(endless(finalized))],
          outputs: [Output.toFile("out.mp4")]
        })
        const fiber = yield* Effect.forkChild(ffmpeg.run(command))
        const process = yield* next
        yield* process.awaitWrite(4)
        yield* process.closeInput(4, "EIO")

        const error = yield* Fiber.join(fiber).pipe(Effect.flip)
        assert.instanceOf(error, PipeError)
        assert.strictEqual(error.fd, 4)
        assert.strictEqual(error.direction, "input")
        assert.strictEqual((yield* process.kills).length, 1)
        assert.isTrue(yield* Ref.get(finalized))
      })
  )

  it.effect("preserves source errors unchanged, even platform errors", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sourceError = platformError("readFile", "ENOENT")
      const command = Command.make({
        inputs: [
          Input.fromStream(
            Stream.concat(Stream.make(bytes(1)), Stream.fail(sourceError))
          )
        ],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.strictEqual(error, sourceError)
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("preserves source defects and kills ffmpeg", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const defect = new Error("bug in source")
      const command = Command.make({
        inputs: [Input.fromStream(Stream.die(defect))],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next

      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        assert.strictEqual(Cause.squash(exit.cause), defect)
        assert.isTrue(Cause.hasDies(exit.cause))
      }
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("preserves every reason of a composite source cause", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sourceError = new Error("source error")
      const defect = new Error("source defect")
      const command = Command.make({
        inputs: [
          Input.fromStream(
            Stream.failCause(
              Cause.combine(Cause.fail(sourceError), Cause.die(defect))
            )
          )
        ],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      yield* next

      assert.deepStrictEqual(describeCause(yield* Fiber.await(fiber)), [
        ["Fail", sourceError],
        ["Die", defect]
      ])
    })
  )

  it.effect("preserves every reason of a composite sink cause", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sinkError = new Error("sink error")
      const defect = new Error("sink defect")
      const command = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [
          Output.toSink(
            Sink.forEach(() =>
              Effect.failCause(
                Cause.combine(Cause.fail(sinkError), Cause.die(defect))
              )
            )
          )
        ]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process.emit(4, bytes(1))

      assert.deepStrictEqual(describeCause(yield* Fiber.await(fiber)), [
        ["Fail", sinkError],
        ["Die", defect]
      ])
    })
  )

  it.effect("keeps cleanup defects of other tasks when one fails", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sinkError = new Error("sink error")
      const defect = new Error("source cleanup defect")
      const command = Command.make({
        inputs: [
          Input.fromStream(
            Stream.never.pipe(Stream.ensuring(Effect.die(defect)))
          )
        ],
        outputs: [Output.toSink(Sink.forEach(() => Effect.fail(sinkError)))]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process.emit(5, bytes(1))

      assert.deepStrictEqual(describeCause(yield* Fiber.await(fiber)), [
        ["Fail", sinkError],
        ["Die", defect]
      ])
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("reports a non-zero exit together with cleanup defects", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const inputDefect = new Error("input cleanup defect")
      const outputDefect = new Error("output cleanup defect")
      const consuming = yield* Deferred.make<void>()
      const command = Command.make({
        inputs: [
          Input.fromStream(
            Stream.never.pipe(Stream.ensuring(Effect.die(inputDefect)))
          )
        ],
        outputs: [
          Output.toSink(
            Sink.forEach(() =>
              Deferred.succeed(consuming, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.ensuring(Effect.die(outputDefect))
              )
            )
          )
        ]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process.emit(5, bytes(1))
      yield* Deferred.await(consuming)
      yield* process.emit(2, "failed")
      yield* process.exit(1)

      const exit = yield* Fiber.await(fiber)
      const reasons = describeCause(exit)
      assert.strictEqual(reasons.length, 3)
      assert.strictEqual(reasons[0]?.[0], "Fail")
      assert.instanceOf(reasons[0]?.[1], ExitError)
      assert.deepStrictEqual(reasons.slice(1), [
        ["Die", inputDefect],
        ["Die", outputDefect]
      ])
      // The exit stays the primary, typed error.
      const error = yield* Effect.flip(exit)
      assert.instanceOf(error, ExitError)
      assert.strictEqual(error.stderr, "failed")
    })
  )

  it.effect(
    "keeps cleanup defects of pending outputs when an input failure follows the exit",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const sourceError = new Error("source error")
        const outputDefect = new Error("output cleanup defect")
        const consuming = yield* Deferred.make<void>()
        const spawned = yield* Deferred.make<FakeProcess>()
        const command = Command.make({
          inputs: [
            Input.fromStream(
              // Fails right after the process exited, before the runner stops it.
              Stream.fromEffect(
                Deferred.await(consuming).pipe(
                  Effect.andThen(Deferred.await(spawned)),
                  Effect.flatMap((process) => process.exit(0)),
                  Effect.andThen(Effect.fail(sourceError)),
                  Effect.uninterruptible
                )
              )
            )
          ],
          outputs: [
            Output.toSink(
              Sink.forEach(() =>
                Deferred.succeed(consuming, undefined).pipe(
                  Effect.andThen(Effect.never),
                  Effect.ensuring(Effect.die(outputDefect))
                )
              )
            )
          ]
        })
        const fiber = yield* Effect.forkChild(ffmpeg.run(command))
        const process = yield* next
        yield* Deferred.succeed(spawned, process)
        yield* process.emit(5, bytes(1))

        const reasons = describeCause(yield* Fiber.await(fiber))
        assert.deepStrictEqual(reasons, [
          ["Fail", sourceError],
          ["Die", outputDefect]
        ])
      })
  )

  it.effect("preserves sink errors and kills ffmpeg", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sinkError = { _tag: "DiskFull" as const }
      const command = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [Output.toSink(Sink.forEach(() => Effect.fail(sinkError)))]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process.emit(4, bytes(1))

      assert.strictEqual(yield* Fiber.join(fiber).pipe(Effect.flip), sinkError)
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("fails when a sink completes before the output ends", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sinks = [
        Sink.fromEffect(Effect.void),
        // Stops on the second element of a single batched chunk.
        Sink.forEachWhile((chunk: Uint8Array) => Effect.succeed(chunk[0] !== 2))
      ]
      for (const sink of sinks) {
        const command = Command.make({
          inputs: [Input.fromFile("in.mp4")],
          outputs: [Output.toSink(sink)]
        })
        const fiber = yield* Effect.forkChild(ffmpeg.run(command))
        const process = yield* next
        yield* process.emit(4, bytes(1), bytes(2), bytes(3))

        const error = yield* Fiber.join(fiber).pipe(Effect.flip)
        assert.instanceOf(error, OutputError)
        assert.strictEqual(error.reason, "SinkEndedEarly")
        assert.strictEqual(error.fd, 4)
        assert.strictEqual((yield* process.kills).length, 1)
      }
    })
  )

  it.effect("fails on output read errors", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const command = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [Output.toSink(Sink.drain)]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process.failOutput(4)

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, PipeError)
      assert.strictEqual(error.direction, "output")
    })
  )

  it.effect("reports non-zero exits without waiting for pending outputs", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const interrupted = yield* Ref.make(false)
      const consuming = yield* Deferred.make<void>()
      const command = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [
          Output.toSink(
            Sink.forEach(() =>
              Deferred.succeed(consuming, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => Ref.set(interrupted, true))
              )
            )
          )
        ]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process.emit(4, bytes(1))
      yield* Deferred.await(consuming)
      yield* process.emit(2, "Conversion failed!")
      yield* process.exit(69)

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ExitError)
      assert.strictEqual(error.exitCode, 69)
      assert.strictEqual(error.stderr, "Conversion failed!")
      assert.isTrue(yield* Ref.get(interrupted))
    })
  )

  it.effect(
    "reports signal termination with a null exit code and the cause",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const fiber = yield* Effect.forkChild(ffmpeg.run(toFile))
        const process = yield* next
        const cause = yield* process.exitWithSignal()

        const error = yield* Fiber.join(fiber).pipe(Effect.flip)
        assert.instanceOf(error, ExitError)
        assert.isNull(error.exitCode)
        assert.strictEqual(error.cause, cause)
      })
  )

  it.effect("keeps defects reported with a signal termination", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const fiber = yield* Effect.forkChild(ffmpeg.run(toFile))
      const process = yield* next
      const signal = platformError("exitCode")
      const defect = new Error("exit wait defect")
      yield* process.exitWithCause(
        Cause.combine(Cause.fail(signal), Cause.die(defect))
      )

      const exit = yield* Fiber.await(fiber)
      const reasons = describeCause(exit)
      assert.strictEqual(reasons.length, 2)
      assert.deepStrictEqual(reasons[1], ["Die", defect])
      const error = yield* Effect.flip(exit)
      assert.instanceOf(error, ExitError)
      assert.isNull(error.exitCode)
      assert.strictEqual(error.cause, signal)
    })
  )

  it.effect("propagates a defect of the exit wait unchanged", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const fiber = yield* Effect.forkChild(ffmpeg.run(toFile))
      const process = yield* next
      const defect = new Error("exit wait defect")
      yield* process.exitWithCause(Cause.die(defect))

      assert.deepStrictEqual(describeCause(yield* Fiber.await(fiber)), [
        ["Die", defect]
      ])
    })
  )

  it.effect("interrupts the run when a caller source interrupts itself", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const command = Command.make({
        inputs: [Input.fromStream(Stream.fromEffect(Effect.interrupt))],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next

      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("fails with SpawnError when the binary cannot start", () =>
    Effect.gen(function* () {
      const cause = platformError("spawn", "ENOENT")
      const { ffmpeg } = yield* setup(
        { binary: "/missing/ffmpeg" },
        { spawnError: cause }
      )

      const error = yield* ffmpeg.run(toFile).pipe(Effect.flip)
      assert.instanceOf(error, SpawnError)
      assert.strictEqual(error.binary, "/missing/ffmpeg")
      assert.strictEqual(error.cause, cause)
    })
  )

  it.effect("fails with CommandError before spawning", () =>
    Effect.gen(function* () {
      const { ffmpeg } = yield* setup(
        {},
        { spawnError: platformError("spawn") }
      )
      const command = Command.make({ outputs: [Output.toFile("pipe:1")] })

      const error = yield* ffmpeg.run(command).pipe(Effect.flip)
      assert.instanceOf(error, CommandError)
    })
  )

  it.effect(
    "closes inputs, stops outputs and kills ffmpeg when interrupted",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup({ forceKillAfter: "2 seconds" })
        const sinkInterrupted = yield* Ref.make(false)
        const pending = yield* Deferred.make<void>()
        const consuming = yield* Deferred.make<void>()
        const command = Command.make({
          inputs: [
            Input.fromStream(
              Stream.fromEffect(
                Deferred.await(pending).pipe(Effect.as(bytes(1)))
              )
            )
          ],
          outputs: [
            Output.toSink(
              Sink.forEach(() =>
                Deferred.succeed(consuming, undefined).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onInterrupt(() => Ref.set(sinkInterrupted, true))
                )
              )
            )
          ]
        })
        const fiber = yield* Effect.forkChild(ffmpeg.run(command))
        const process = yield* next
        yield* process.emit(5, bytes(1))
        yield* Deferred.await(consuming)
        yield* Fiber.interrupt(fiber)

        const exit = yield* Fiber.await(fiber)
        assert.isTrue(
          Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
        )
        assert.isTrue(yield* process.inputEnded(4))
        assert.isTrue(yield* Ref.get(sinkInterrupted))
        const kills = yield* process.kills
        assert.strictEqual(kills.length, 1)
        assert.strictEqual(millis(kills[0]?.forceKillAfter), 2000)
        assert.isTrue(yield* process.released)
      })
  )

  describe("cancellation keeps cleanup defects", () => {
    const defect = new Error("cleanup defect")
    /** Waits for `started`, interrupts the run and checks its cause. */
    const cancel = (
      command: FFmpeguCommand<unknown, never>,
      started: Deferred.Deferred<void>,
      options?: RunOptions<unknown, never>,
      beforeStart?: (process: FakeProcess) => Effect.Effect<void>
    ) =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const fiber = yield* Effect.forkChild(ffmpeg.run(command, options))
        const process = yield* next
        if (beforeStart) yield* beforeStart(process)
        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)

        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause))
        assert.deepStrictEqual(
          describeCause(exit).filter(([tag]) => tag !== "Interrupt"),
          [["Die", defect]]
        )
        return process
      })
    const pendingWithDyingFinalizer = (started: Deferred.Deferred<void>) =>
      Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Effect.die(defect))
      )

    it.effect("of a running input", () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const command = Command.make({
          inputs: [
            Input.fromStream(
              Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
                Stream.flatMap(() => Stream.never),
                Stream.ensuring(Effect.die(defect))
              )
            )
          ],
          outputs: [Output.toFile("out.mp4")]
        })
        const process = yield* cancel(command, started)
        assert.strictEqual((yield* process.kills).length, 1)
      })
    )

    it.effect("of a pending output sink", () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const command = Command.make({
          inputs: [Input.fromFile("in.mp4")],
          outputs: [
            Output.toSink(
              Sink.forEach(() => pendingWithDyingFinalizer(started))
            )
          ]
        })
        yield* cancel(command, started, undefined, (process) =>
          process.emit(4, bytes(1))
        )
      })
    )

    it.effect("of a pending progress callback", () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const command = Command.make({
          inputs: [Input.fromFile("in.mp4")],
          outputs: [Output.toFile("out.mp4")]
        })
        yield* cancel(
          command,
          started,
          { onProgress: () => pendingWithDyingFinalizer(started) },
          (process) => process.emit(3, "progress=continue\n")
        )
      })
    )

    it.effect("while draining outputs after a successful exit", () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const command = Command.make({
          inputs: [Input.fromFile("in.mp4")],
          outputs: [
            Output.toSink(
              Sink.forEach(() => pendingWithDyingFinalizer(started))
            )
          ]
        })
        const process = yield* cancel(command, started, undefined, (process) =>
          process
            .emit(4, bytes(1))
            .pipe(
              Effect.andThen(Deferred.await(started)),
              Effect.andThen(process.exit(0))
            )
        )
        // The process had already exited; nothing to kill.
        assert.deepStrictEqual(yield* process.kills, [])
      })
    )
  })

  it.effect("keeps a sibling input's cleanup defect when one input fails", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sourceError = new Error("source error")
      const defect = new Error("sibling cleanup defect")
      const started = yield* Deferred.make<void>()
      const command = Command.make({
        inputs: [
          Input.fromStream(
            Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
              Stream.flatMap(() => Stream.never),
              Stream.ensuring(Effect.die(defect))
            )
          ),
          Input.fromStream(
            Stream.fromEffect(
              Deferred.await(started).pipe(
                Effect.andThen(Effect.fail(sourceError))
              )
            )
          )
        ],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next

      assert.deepStrictEqual(describeCause(yield* Fiber.await(fiber)), [
        ["Fail", sourceError],
        ["Die", defect]
      ])
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("relies on the platform kill when ffmpeg ignores termination", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup({}, { ignoreKill: true })
      const fiber = yield* Effect.forkChild(ffmpeg.run(toFile))
      const process = yield* next
      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)

      // Our teardown and the platform release both request termination with
      // the SIGKILL escalation configured on the command.
      const kills = yield* process.kills
      assert.strictEqual(kills.length, 2)
      assert.isTrue(kills.every((kill) => kill?.forceKillAfter !== undefined))
    })
  )

  it.effect("re-executes stream inputs on every run", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const acquisitions = yield* Ref.make(0)
      const command = Command.make({
        inputs: [
          Input.fromStream(
            Stream.fromEffect(
              Ref.updateAndGet(acquisitions, (n) => n + 1)
            ).pipe(Stream.map((n) => bytes(n)))
          )
        ],
        outputs: [Output.toFile("out.mp4")]
      })
      for (const expected of [1, 2]) {
        const fiber = yield* Effect.forkChild(ffmpeg.run(command))
        const process = yield* next
        yield* process.awaitWrite(4)
        yield* process.exit(0)
        yield* Fiber.join(fiber)
        assert.deepStrictEqual(yield* process.written(4), [expected])
      }
    })
  )

  it.effect(
    "keeps supervising stderr while outputs are still draining after exit",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const command = Command.make({
          inputs: [Input.fromFile("in.mp4")],
          outputs: [Output.toSink(Sink.drain)]
        })
        const fiber = yield* Effect.forkChild(ffmpeg.run(command))
        const process = yield* next
        yield* process.failOutput(2)
        yield* process.exit(0).pipe(Effect.forkChild)

        const error = yield* Fiber.join(fiber).pipe(Effect.flip)
        assert.instanceOf(error, PipeError)
        assert.strictEqual(error.fd, 2)
      })
  )

  it.effect(
    "is available through the module-level run and a Config layer",
    () =>
      Effect.gen(function* () {
        const spawner = yield* makeFakeSpawner()
        const layer = FFmpeg.layerConfig(
          Config.all({
            binary: Config.String("FFMPEG_BINARY"),
            stderrTailBytes: Config.Int("FFMPEG_STDERR_TAIL")
          })
        ).pipe(
          Layer.provide(spawner.layer),
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                FFMPEG_BINARY: "/opt/ffmpeg",
                FFMPEG_STDERR_TAIL: 3
              })
            )
          )
        )
        const fiber = yield* Effect.forkChild(
          run(toFile).pipe(Effect.provide(layer))
        )
        const process = yield* spawner.next
        assert.strictEqual(process.command.command, "/opt/ffmpeg")
        yield* process.emit(2, "abcdef")
        yield* process.exit(0)
        assert.strictEqual((yield* Fiber.join(fiber)).stderr, "def")
      })
  )

  it.effect.each([
    [{ stderrTailBytes: Number.NaN }],
    [{ stderrTailBytes: Number.POSITIVE_INFINITY }],
    [{ stderrTailBytes: -1 }],
    [{ stderrTailBytes: 1.5 }],
    [{ forceKillAfter: "soon" as never }]
  ])("rejects invalid options %j", ([options]) =>
    Effect.gen(function* () {
      const exit = yield* setup(options).pipe(Effect.exit)
      assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause))
    })
  )
})

describe("FFmpeg progress", () => {
  const progressCommand = Command.make({
    inputs: [Input.fromFile("in.mp4")],
    outputs: [Output.toSink(Sink.drain)]
  })

  it.effect("only enables the progress descriptor with a callback", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const fiber = yield* Effect.forkChild(
        ffmpeg.run(progressCommand, { onProgress: () => Effect.void })
      )
      const process = yield* next
      assert.deepStrictEqual(process.args.slice(0, 4), [
        "-nostdin",
        "-progress",
        "pipe:3",
        "-nostats"
      ])
      assert.deepStrictEqual(process.command.options.additionalFds, {
        fd3: { type: "output" },
        fd4: { type: "output" }
      })
      yield* process.exit(0)
      yield* Fiber.join(fiber)
    })
  )

  it.effect(
    "coalesces updates for a slow callback without stalling media",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const seen = yield* Ref.make<Array<Progress>>([])
        const received = yield* Ref.make(0)
        const firstCall = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const command = Command.make({
          inputs: [Input.fromFile("in.mp4")],
          outputs: [
            Output.toSink(
              Sink.forEach(() => Ref.update(received, (n) => n + 1))
            )
          ]
        })
        const fiber = yield* Effect.forkChild(
          ffmpeg.run(command, {
            onProgress: (progress) =>
              Ref.update(seen, (all) => [...all, progress]).pipe(
                Effect.andThen(Deferred.succeed(firstCall, undefined)),
                Effect.andThen(Deferred.await(release))
              )
          })
        )
        const process = yield* next
        yield* process.emit(3, "frame=1\nprogress=continue\n")
        yield* Deferred.await(firstCall)

        // The callback is blocked; media and further progress keep flowing.
        for (let frame = 2; frame <= 50; frame++) {
          yield* process.emit(3, `frame=${frame}\nprogress=continue\n`)
          yield* process.emit(4, bytes(frame))
        }
        yield* process.emit(3, "frame=51\nprogress=end\n")
        yield* process.exit(0)
        yield* Ref.get(received).pipe(Effect.repeat({ until: (n) => n === 49 }))
        assert.isUndefined(fiber.pollUnsafe())

        // Success waits for the pending (latest) update to be delivered.
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(fiber)

        const frames = (yield* Ref.get(seen)).map((progress) => [
          progress.frame,
          progress.progress
        ])
        assert.deepStrictEqual(frames, [
          [1, "continue"],
          [51, "end"]
        ])
      })
  )

  it.effect("does not fabricate a final update", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const seen = yield* Ref.make<Array<string>>([])
      const fiber = yield* Effect.forkChild(
        ffmpeg.run(progressCommand, {
          onProgress: (progress) =>
            Ref.update(seen, (all) => [...all, progress.progress])
        })
      )
      const process = yield* next
      yield* process.emit(3, "frame=1\nprogress=continue\nframe=2\n")
      yield* process.exit(0)
      yield* Fiber.join(fiber)

      assert.deepStrictEqual(yield* Ref.get(seen), ["continue"])
    })
  )

  it.effect("fails with the callback error and kills ffmpeg", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const callbackError = { _tag: "ProgressRejected" as const }
      const fiber = yield* Effect.forkChild(
        ffmpeg.run(progressCommand, {
          onProgress: () => Effect.fail(callbackError)
        })
      )
      const process = yield* next
      yield* process.emit(3, "progress=continue\n")

      assert.strictEqual(
        yield* Fiber.join(fiber).pipe(Effect.flip),
        callbackError
      )
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("interrupts a pending callback when the run fails", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Ref.make(false)
      const sourceError = new Error("source failed")
      const failSource = yield* Deferred.make<void>()
      const command = Command.make({
        inputs: [
          Input.fromStream(
            Stream.fromEffect(
              Deferred.await(failSource).pipe(
                Effect.andThen(Effect.fail(sourceError))
              )
            )
          )
        ],
        outputs: [Output.toSink(Sink.drain)]
      })
      const fiber = yield* Effect.forkChild(
        ffmpeg.run(command, {
          onProgress: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Ref.set(interrupted, true))
            )
        })
      )
      const process = yield* next
      yield* process.emit(3, "progress=continue\n")
      yield* Deferred.await(started)
      yield* Deferred.succeed(failSource, undefined)

      assert.strictEqual(
        yield* Fiber.join(fiber).pipe(Effect.flip),
        sourceError
      )
      assert.isTrue(yield* Ref.get(interrupted))
    })
  )
})
