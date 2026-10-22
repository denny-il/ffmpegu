import * as NodeSink from "@effect/platform-node/NodeSink"
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
  SpawnError,
  stream
} from "../../src/index.ts"
import {
  type FakeProcess,
  type FakeSpawnerOptions,
  makeFakeSpawner,
  platformError
} from "./fake-spawner.ts"
import { Writable } from "node:stream"

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

  it.effect("writes the batches of a stream input whole, without copying", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const [a, b, c] = [bytes(1), bytes(2, 3), bytes(4)]
      const command = Command.make({
        inputs: [Input.fromStream(Stream.fromArrays([a, b], [c]))],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process
        .inputEnded(4)
        .pipe(Effect.repeat({ until: (ended) => ended }))
      yield* process.exit(0)
      yield* Fiber.join(fiber)

      const batches = yield* process.batches(4)
      assert.deepStrictEqual(batches, [[a, b], [c]])
      // The very chunks the source emitted.
      assert.strictEqual(batches[0]![0], a)
      assert.strictEqual(batches[0]![1], b)
      assert.strictEqual(batches[1]![0], c)
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
        for (const code of [
          "EPIPE",
          "ECONNRESET",
          "ENOTCONN",
          "ERR_STREAM_DESTROYED"
        ]) {
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
      assert.strictEqual(error.binary, "ffmpeg")
      assert.strictEqual(error.exitCode, 1)
      assert.strictEqual(error.stderr, "Invalid data found")
      assert.strictEqual(
        error.message,
        "ffmpeg exited with exit code 1: Invalid data found"
      )
    })
  )

  describe("settles a write pending on a descriptor closed without error", () => {
    /**
     * Inputs written through the platform adapter to a descriptor destroyed
     * during the first write, as Node does once the reader's end reports EOF.
     * The adapter waits for a `drain` that never comes.
     */
    const closingInput = Effect.gen(function* () {
      const attempted = yield* Deferred.make<void>()
      const { ffmpeg, next } = yield* setup(undefined, {
        inputSink: (fd) =>
          NodeSink.fromWritable({
            evaluate: () =>
              new Writable({
                highWaterMark: 1,
                write() {
                  Deferred.doneUnsafe(attempted, Effect.void)
                  this.destroy()
                }
              }),
            onError: () => platformError(`fromWritable(fd${fd})`)
          })
      })
      const finalized = yield* Ref.make(false)
      const fiber = yield* Effect.forkChild(
        ffmpeg.run(
          Command.make({
            inputs: [Input.fromStream(endless(finalized))],
            outputs: [Output.toFile("out.mp4")]
          })
        )
      )
      const process = yield* next
      yield* Deferred.await(attempted)
      return { fiber, process, finalized }
    })

    it.effect("once ffmpeg exits", () =>
      Effect.gen(function* () {
        const { fiber, process, finalized } = yield* closingInput
        yield* process.exit(0)
        yield* Fiber.join(fiber)
        assert.isTrue(yield* Ref.get(finalized))
      })
    )

    it.effect("when the run is cancelled", () =>
      Effect.gen(function* () {
        const { fiber, process, finalized } = yield* closingInput
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(
          Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
        )
        assert.strictEqual((yield* process.kills).length, 1)
        assert.isTrue(yield* Ref.get(finalized))
      })
    )
  })

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
      // Closed-input codes are only ignored for our descriptor writes.
      const sourceError = platformError("readFile", "ENOTCONN")
      const command = Command.make({
        inputs: [Input.fromStream(Stream.fail(sourceError))],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.strictEqual(error, sourceError)
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("ends the descriptor of a failed source", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sourceError = new Error("source failed")
      const command = Command.make({
        inputs: [Input.fromStream(Stream.fail(sourceError))],
        outputs: [Output.toFile("out.mp4")]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next

      assert.strictEqual(
        yield* Fiber.join(fiber).pipe(Effect.flip),
        sourceError
      )
      // ffmpeg sees EOF rather than waiting for more input.
      assert.isTrue(yield* process.inputEnded(4))
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
        const outputDefect = new Error("output cleanup defect")
        const sourceDefect = new Error("source cleanup defect")
        const consuming = yield* Deferred.make<void>()
        const command = Command.make({
          inputs: [
            Input.fromStream(
              Stream.never.pipe(Stream.ensuring(Effect.die(sourceDefect)))
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
        // The source fails while being stopped after the exit.
        yield* process.exit(0)

        assert.deepStrictEqual(describeCause(yield* Fiber.await(fiber)), [
          ["Die", sourceDefect],
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
        assert.strictEqual(error.reason._tag, "SinkEndedEarly")
        assert.strictEqual(error.reason.fd, 4)
        assert.strictEqual((yield* process.kills).length, 1)
      }
    })
  )

  it.effect("exposes reasons to Effect.catchReason", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const reserved = yield* ffmpeg
        .run(Command.make({ inputs: [Input.fromFile("pipe:4")] }))
        .pipe(
          Effect.catchReason("CommandError", "ReservedPath", (reason) =>
            Effect.succeed(reason.path)
          )
        )
      assert.strictEqual(reserved, "pipe:4")

      const fiber = yield* Effect.forkChild(
        ffmpeg
          .run(
            Command.make({
              inputs: [Input.fromFile("in.mp4")],
              outputs: [Output.toSink(Sink.fromEffect(Effect.void))]
            })
          )
          .pipe(
            Effect.catchReason("OutputError", "SinkEndedEarly", (reason) =>
              Effect.succeed(reason.fd)
            )
          )
      )
      const process = yield* next
      yield* process.emit(4, bytes(1))
      assert.strictEqual(yield* Fiber.join(fiber), 4)
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

  it.live("lets a sink busy with a chunk observe an output read error", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const busy = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const observed: Array<Exit.Exit<void, unknown>> = []
      const sink = Sink.forEach(() =>
        Deferred.succeed(busy, undefined).pipe(
          Effect.andThen(Deferred.await(release))
        )
      ).pipe(
        Sink.onExit((exit) =>
          Effect.sync(() => {
            observed.push(exit)
          })
        )
      )
      const command = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [Output.toSink(sink)]
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(command))
      const process = yield* next
      yield* process.emit(4, bytes(1))
      yield* Deferred.await(busy)
      yield* process.failOutput(4)
      // Time for the failure to stop the run, had it bypassed the sink.
      yield* Effect.sleep("50 millis")
      yield* Deferred.succeed(release, undefined)

      const exit = yield* Fiber.await(fiber)
      const reasons = describeCause(exit)
      assert.strictEqual(reasons.length, 1)
      assert.instanceOf(reasons[0]![1], PipeError)
      // The sink saw the read error itself, not an interruption.
      assert.strictEqual(observed.length, 1)
      assert.deepStrictEqual(describeCause(observed[0]!), reasons)
    })
  )

  it.live(
    "keeps an output read error a busy sink never took when another sink fails",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const busy = yield* Deferred.make<void>()
        const failure = { kind: "sink-error" }
        const command = Command.make({
          inputs: [Input.fromFile("in.mp4")],
          outputs: [
            Output.toSink(
              Sink.forEach(() =>
                Deferred.succeed(busy, undefined).pipe(
                  Effect.andThen(Effect.never)
                )
              )
            ),
            Output.toSink(Sink.forEach(() => Effect.fail(failure)))
          ]
        })
        const fiber = yield* Effect.forkChild(ffmpeg.run(command))
        const process = yield* next
        yield* process.emit(4, bytes(1))
        yield* Deferred.await(busy)
        yield* process.failOutput(4)
        yield* Effect.sleep("50 millis")
        yield* process.emit(5, bytes(2))

        const reasons = describeCause(yield* Fiber.await(fiber))
        assert.strictEqual(reasons.length, 2)
        assert.strictEqual(reasons[0]![1], failure)
        assert.instanceOf(reasons[1]![1], PipeError)
        assert.strictEqual((reasons[1]![1] as PipeError).fd, 4)
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
        assert.strictEqual(error.message, "ffmpeg exited without an exit code")
      })
  )

  it.effect("names only the file name of a configured binary path", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup({
        binary: "/home/user/secret-token/bin/ffmpeg-7"
      })
      const fiber = yield* Effect.forkChild(ffmpeg.run(toFile))
      const process = yield* next
      yield* process.exit(1)

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ExitError)
      assert.strictEqual(error.binary, "/home/user/secret-token/bin/ffmpeg-7")
      assert.strictEqual(error.message, "ffmpeg-7 exited with exit code 1")
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

describe("FFmpeg.stream", () => {
  /** Runs the stream in a fiber, recording the chunks it emits. */
  const consume = <E>(output: Stream.Stream<Uint8Array, E>) =>
    Effect.gen(function* () {
      const received = yield* Ref.make<Array<Array<number>>>([])
      const fiber = yield* Effect.forkChild(
        Stream.runForEach(output, (chunk) =>
          Ref.update(received, (all) => [...all, [...chunk]])
        )
      )
      return { fiber, received: Ref.get(received) }
    })

  it.effect("emits the stream output and ends after a successful exit", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const sinkReceived = yield* Ref.make<Array<number>>([])
      const command = Command.make({
        inputs: [Input.fromStream(Stream.make(bytes(1)))],
        outputs: [
          Output.toSink(
            Sink.forEach((chunk: Uint8Array) =>
              Ref.update(sinkReceived, (all) => [...all, ...chunk])
            )
          ),
          Output.toStream()
        ]
      })
      const { fiber, received } = yield* consume(ffmpeg.stream(command))
      const process = yield* next

      assert.deepStrictEqual(process.args, [
        "-nostdin",
        "-i",
        "pipe:4",
        "pipe:5",
        "pipe:6"
      ])
      assert.deepStrictEqual(process.command.options.additionalFds, {
        fd4: { type: "input" },
        fd5: { type: "output" },
        fd6: { type: "output" }
      })
      yield* process.emit(5, bytes(9))
      yield* process.emit(6, bytes(1, 2), bytes(3))
      yield* process.endOutput(6)
      yield* received.pipe(
        Effect.repeat({ until: (chunks) => chunks.length === 2 })
      )
      // Output EOF alone does not end the stream: the exit decides.
      assert.isUndefined(fiber.pollUnsafe())

      yield* process.exit(0)
      yield* Fiber.join(fiber)
      assert.deepStrictEqual(yield* received, [[1, 2], [3]])
      assert.deepStrictEqual(yield* Ref.get(sinkReceived), [9])
      assert.isTrue(yield* process.released)
    })
  )

  it.effect("fails with the exit error after the emitted chunks", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const command = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [Output.toStream()]
      })
      const { fiber, received } = yield* consume(ffmpeg.stream(command))
      const process = yield* next

      yield* process.emit(4, bytes(1), bytes(2))
      yield* received.pipe(
        Effect.repeat({ until: (chunks) => chunks.length === 2 })
      )
      yield* process.emit(2, "boom")
      yield* process.exit(1)

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ExitError)
      assert.strictEqual(error.exitCode, 1)
      assert.strictEqual(error.stderr, "boom")
      assert.deepStrictEqual(yield* received, [[1], [2]])
    })
  )

  it.effect("fails with a caller input error unchanged and kills ffmpeg", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
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
        outputs: [Output.toStream()]
      })
      const { fiber, received } = yield* consume(ffmpeg.stream(command))
      const process = yield* next

      yield* process.emit(5, bytes(1))
      yield* received.pipe(
        Effect.repeat({ until: (chunks) => chunks.length === 1 })
      )
      yield* Deferred.succeed(failSource, undefined)

      assert.strictEqual(
        yield* Fiber.join(fiber).pipe(Effect.flip),
        sourceError
      )
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("fails on output read errors", () =>
    Effect.gen(function* () {
      const { ffmpeg, next } = yield* setup()
      const command = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [Output.toStream()]
      })
      const { fiber } = yield* consume(ffmpeg.stream(command))
      const process = yield* next

      yield* process.failOutput(4)
      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, PipeError)
      assert.strictEqual(error.fd, 4)
      assert.strictEqual(error.direction, "output")
    })
  )

  it.effect(
    "terminates ffmpeg and stops inputs when consumption ends early",
    () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const finalized = yield* Ref.make(false)
        const command = Command.make({
          inputs: [Input.fromStream(endless(finalized))],
          outputs: [Output.toStream()]
        })
        const fiber = yield* Effect.forkChild(
          Stream.runCollect(Stream.take(ffmpeg.stream(command), 1))
        )
        const process = yield* next
        yield* process.emit(5, bytes(1), bytes(2))

        const chunks = yield* Fiber.join(fiber)
        assert.deepStrictEqual(
          chunks.map((chunk) => [...chunk]),
          [[1]]
        )
        assert.strictEqual((yield* process.kills).length, 1)
        assert.isTrue(yield* Ref.get(finalized))
        assert.isTrue(yield* process.released)
      })
  )

  describe("reports cleanup defects of a run stopped early", () => {
    const defect = new Error("cleanup defect")
    const command = (started: Deferred.Deferred<void>) =>
      Command.make({
        inputs: [
          Input.fromStream(
            Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
              Stream.flatMap(() => Stream.never),
              Stream.ensuring(Effect.die(defect))
            )
          )
        ],
        outputs: [Output.toStream()]
      })

    it.effect("by Stream.take", () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const started = yield* Deferred.make<void>()
        const fiber = yield* Effect.forkChild(
          Stream.runDrain(Stream.take(ffmpeg.stream(command(started)), 1))
        )
        const process = yield* next
        yield* Deferred.await(started)
        yield* process.emit(5, bytes(1))

        const exit = yield* Fiber.await(fiber)
        assert.deepStrictEqual(describeCause(exit), [["Die", defect]])
      })
    )

    // The run already ended, but its outcome is still behind a chunk the
    // consumer holds when it stops.
    const heldAfterRunEnded = Effect.fnUntraced(function* (
      stop: (
        output: Stream.Stream<Uint8Array, unknown>
      ) => Stream.Stream<Uint8Array, unknown>
    ) {
      const { ffmpeg, next } = yield* setup()
      const held = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const command = Command.make({
        inputs: [
          // Ends, with a dying finalizer, once the consumer holds a chunk.
          Input.fromStream(
            Stream.fromEffect(Deferred.await(held)).pipe(
              Stream.drain,
              Stream.ensuring(Effect.die(defect))
            )
          )
        ],
        outputs: [Output.toStream()]
      })
      const fiber = yield* Effect.forkChild(
        ffmpeg.stream(command).pipe(
          Stream.tap(() =>
            Deferred.succeed(held, undefined).pipe(
              Effect.andThen(Deferred.await(release))
            )
          ),
          stop,
          Stream.runDrain
        )
      )
      const process = yield* next
      yield* process.emit(5, bytes(1))
      yield* Deferred.await(held)
      yield* process.released.pipe(Effect.repeat({ until: (done) => done }))
      return { fiber, release }
    })

    it.effect("by Stream.take after the run ended", () =>
      Effect.gen(function* () {
        const { fiber, release } = yield* heldAfterRunEnded(Stream.take(1))
        yield* Deferred.succeed(release, undefined)
        const exit = yield* Fiber.await(fiber)
        assert.deepStrictEqual(describeCause(exit), [["Die", defect]])
      })
    )

    it.effect("by interruption after the run ended", () =>
      Effect.gen(function* () {
        const { fiber } = yield* heldAfterRunEnded((output) => output)
        const exit = yield* Fiber.interrupt(fiber).pipe(
          Effect.andThen(Fiber.await(fiber))
        )
        assert.isTrue(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause))
        assert.deepStrictEqual(
          describeCause(exit).filter(([tag]) => tag !== "Interrupt"),
          [["Die", defect]]
        )
      })
    )

    it.effect("by interruption", () =>
      Effect.gen(function* () {
        const { ffmpeg, next } = yield* setup()
        const started = yield* Deferred.make<void>()
        const fiber = yield* Effect.forkChild(
          Stream.runDrain(ffmpeg.stream(command(started)))
        )
        yield* next
        yield* Deferred.await(started)

        const exit = yield* Fiber.interrupt(fiber).pipe(
          Effect.andThen(Fiber.await(fiber))
        )
        assert.isTrue(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause))
        assert.deepStrictEqual(
          describeCause(exit).filter(([tag]) => tag !== "Interrupt"),
          [["Die", defect]]
        )
      })
    )
  })

  // The compile-time count is unknown for widened commands, so the runtime
  // checks below are what rejects them.
  it.effect("requires exactly one stream output", () =>
    Effect.gen(function* () {
      const { ffmpeg } = yield* setup(
        {},
        { spawnError: platformError("spawn") }
      )
      const input = Input.fromFile("in.mp4")
      for (const outputs of [
        [Output.toFile("out.mp4")],
        [Output.toStream(), Output.toStream()]
      ]) {
        const command: FFmpeguCommand = Command.make({
          inputs: [input],
          outputs
        })
        const error = yield* Stream.runDrain(ffmpeg.stream(command)).pipe(
          Effect.flip
        )
        assert.instanceOf(error, CommandError)
        assert.strictEqual(error.reason._tag, "StreamOutput")
        assert.strictEqual(
          error.reason._tag === "StreamOutput" && error.reason.count,
          outputs.length === 1 ? 0 : 2
        )
      }
    })
  )

  it.effect("is rejected by run", () =>
    Effect.gen(function* () {
      const { ffmpeg } = yield* setup(
        {},
        { spawnError: platformError("spawn") }
      )
      const command: FFmpeguCommand = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [Output.toStream()]
      })
      const error = yield* ffmpeg.run(command).pipe(Effect.flip)
      assert.instanceOf(error, CommandError)
      assert.strictEqual(error.reason._tag, "StreamOutput")
    })
  )

  it.effect("is available from the context", () =>
    Effect.gen(function* () {
      const { layer, next } = yield* setup()
      const command = Command.make({
        inputs: [Input.fromFile("in.mp4")],
        outputs: [Output.toStream()]
      })
      const { fiber, received } = yield* consume(
        stream(command).pipe(Stream.provide(layer))
      )
      const process = yield* next
      yield* process.emit(4, bytes(5))
      yield* process.exit(0)
      yield* Fiber.join(fiber)
      assert.deepStrictEqual(yield* received, [[5]])
    })
  )
})
