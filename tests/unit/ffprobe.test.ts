import { assert, describe, it } from "@effect/vitest"
import {
  Config,
  ConfigProvider,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Schema,
  Tracer
} from "effect"
import { ChildProcessSpawner } from "effect/process"
import {
  ExitError,
  CommandError,
  FFprobe,
  Options,
  options,
  Input,
  type FFprobeOptions,
  ProbeDecodeError,
  ProbeOutputError,
  probe,
  probeWith,
  SpawnError
} from "../../src/index.ts"
import { FFmpeguArgument } from "../../src/core/argument.ts"
import type { FFmpeguReferencesInterface } from "../../src/types/index.ts"
import { makeFakeSpawner, platformError } from "./fake-spawner.ts"
import { makeRecordingTracer } from "./tracer.ts"

const setup = Effect.fnUntraced(function* (options?: FFprobeOptions) {
  const spawner = yield* makeFakeSpawner()
  const layer = FFprobe.layer(options).pipe(Layer.provide(spawner.layer))
  return { layer, next: spawner.next }
})

/** Probe with a process that prints `stdout` and exits with `code`. */
const probeOutput = (
  stdout: string,
  code = 0,
  stderr = "",
  options?: Options
) =>
  Effect.gen(function* () {
    const { layer, next } = yield* setup()
    const fiber = yield* Effect.forkChild(
      (options === undefined
        ? probe("/test/input.mp4")
        : probeWith("/test/input.mp4", options)
      ).pipe(Effect.provide(layer))
    )
    const process = yield* next
    yield* process.emit(1, stdout)
    if (stderr) yield* process.emit(2, stderr)
    yield* process.exit(code)
    return { exit: yield* Fiber.await(fiber), process }
  })

const decodeFailure = (stdout: string) =>
  Effect.gen(function* () {
    const { exit } = yield* probeOutput(stdout)
    assert.isTrue(Exit.isFailure(exit))
    const error = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined
    assert.isTrue(
      error?._tag === "Fail" && error.error instanceof ProbeDecodeError
    )
  })

describe("FFprobe", () => {
  it.effect("runs ffprobe with JSON output and decodes the result", () =>
    Effect.gen(function* () {
      const { exit, process } = yield* probeOutput(
        JSON.stringify({
          streams: [
            {
              index: 0,
              codec_name: "h264",
              width: 32,
              disposition: { default: 1 },
              tags: { language: "und" },
              side_data_list: [{ side_data_type: "Display Matrix" }]
            }
          ],
          format: {
            filename: "/test/input.mp4",
            nb_streams: 1,
            probe_score: 100,
            extra: true
          },
          programs: []
        })
      )

      assert.deepStrictEqual(process.args, [
        "-hide_banner",
        "-of",
        "json",
        "-show_format",
        "-show_streams",
        "-i",
        "/test/input.mp4"
      ])
      assert.strictEqual(process.command.options.stdin, "ignore")
      assert.deepStrictEqual(
        exit,
        Exit.succeed({
          streams: [
            {
              index: 0,
              codec_name: "h264",
              width: 32,
              disposition: { default: 1 },
              tags: { language: "und" },
              side_data_list: [{ side_data_type: "Display Matrix" }]
            }
          ],
          format: {
            filename: "/test/input.mp4",
            nb_streams: 1,
            probe_score: 100,
            extra: true
          },
          programs: []
        })
      )
    })
  )

  it.effect("defaults streams to an empty array", () =>
    Effect.gen(function* () {
      const { exit } = yield* probeOutput(
        JSON.stringify({ format: { filename: "x" } })
      )
      assert.deepStrictEqual(
        exit,
        Exit.succeed({ streams: [], format: { filename: "x" } })
      )
    })
  )

  it.effect("rejects malformed JSON", () => decodeFailure("not-json"))
  it.effect("rejects empty output", () => decodeFailure(""))
  it.effect("rejects a null document", () => decodeFailure("null"))
  it.effect("rejects a non-object document", () => decodeFailure("[1, 2]"))
  it.effect("rejects known fields of the wrong type", () =>
    decodeFailure(JSON.stringify({ streams: [{ index: 0, width: "32" }] }))
  )
  it.effect("rejects streams without index", () =>
    decodeFailure(JSON.stringify({ streams: [{ codec_name: "aac" }] }))
  )

  it.effect(
    "renders composed options and decodes projected streams without an index",
    () =>
      Effect.gen(function* () {
        const options = Options.merge(
          Options.create({ protocol_whitelist: "file", v: "quiet" }),
          Options.create({
            select_streams: "v:0",
            show_entries: "stream=codec_name:format=duration"
          })
        )
        const selected = {
          streams: [{ codec_name: "h264" }],
          format: { duration: "1.5" },
          chapters: [{ id: 1 }]
        }
        const { exit, process } = yield* probeOutput(
          JSON.stringify(selected),
          0,
          "",
          options
        )
        assert.deepStrictEqual(exit, Exit.succeed(selected))
        assert.deepStrictEqual(process.args, [
          "-hide_banner",
          "-of",
          "json",
          "-i",
          "/test/input.mp4",
          "-protocol_whitelist",
          "file",
          "-v",
          "quiet",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name:format=duration"
        ])
      })
  )

  it.effect("still validates known fields in a projection", () =>
    Effect.gen(function* () {
      for (const stream of [{ index: "0" }, { index: 0.5 }, { width: "32" }]) {
        const { exit } = yield* probeOutput(
          JSON.stringify({ streams: [stream] }),
          0,
          "",
          Options.create({ show_entries: "stream" })
        )
        assert.instanceOf(yield* Effect.flip(exit), ProbeDecodeError)
      }
    })
  )

  it.effect(
    "decodes raw output with a caller schema instead of the projected schema",
    () =>
      Effect.gen(function* () {
        const { layer, next } = yield* setup()
        // The projected schema rejects a string index; the caller's does not.
        const stdout = JSON.stringify({
          streams: [{ index: "0", width: "640" }]
        })
        const Widths = Schema.Struct({
          streams: Schema.Array(
            Schema.Struct({ width: Schema.NumberFromString })
          )
        })
        const options = Options.create({ show_entries: "stream=width" })
        const fiber = yield* Effect.forkChild(
          probeWith("/test/input.mp4", options, Widths).pipe(
            Effect.provide(layer)
          )
        )
        const process = yield* next
        yield* process.emit(1, stdout)
        yield* process.exit(0)
        assert.deepStrictEqual(yield* Fiber.join(fiber), {
          streams: [{ width: 640 }]
        })
      })
  )

  it.effect("ends the probe spans with decode failures", () =>
    Effect.gen(function* () {
      const { layer, next } = yield* setup()
      const spans: Array<Tracer.NativeSpan> = []
      const tracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options)
          spans.push(span)
          return span
        }
      })
      const failedSpans = () =>
        spans
          .filter(
            (span) =>
              span.status._tag === "Ended" && Exit.isFailure(span.status.exit)
          )
          .map((span) => span.name)
      const probes: Array<Effect.Effect<unknown, unknown, FFprobe>> = [
        probe("/test/input.mp4"),
        probeWith(
          "/test/input.mp4",
          Options.create("-show_streams"),
          Schema.Struct({ streams: Schema.Array(Schema.Number) })
        )
      ]
      const expected = [["ffmpegu/FFprobe.probe"], ["ffmpegu/probeWith"]]
      for (const [i, probed] of probes.entries()) {
        spans.length = 0
        const fiber = yield* Effect.forkChild(
          probed.pipe(Effect.provide(layer), Effect.withTracer(tracer))
        )
        const process = yield* next
        yield* process.emit(1, JSON.stringify({ streams: [{ index: "bad" }] }))
        yield* process.exit(0)
        yield* Fiber.await(fiber)
        assert.deepStrictEqual(failedSpans(), expected[i])
      }
    })
  )

  it.effect("returns the parsed JSON document undecoded from probeJson", () =>
    Effect.gen(function* () {
      const { layer, next } = yield* setup()
      const document = { streams: [{ index: "0" }], chapters: [] }
      const fiber = yield* Effect.forkChild(
        FFprobe.use((service) =>
          service.probeJson(
            "/test/input.mp4",
            Options.create({ show_entries: "stream=index" })
          )
        ).pipe(Effect.provide(layer))
      )
      const process = yield* next
      yield* process.emit(1, JSON.stringify(document))
      yield* process.exit(0)
      assert.deepStrictEqual(yield* Fiber.join(fiber), document)
    })
  )

  it.effect("rejects invalid JSON from probeJson as ProbeDecodeError", () =>
    Effect.gen(function* () {
      const { layer, next } = yield* setup()
      const fiber = yield* Effect.forkChild(
        FFprobe.use((service) =>
          service.probeJson("/test/input.mp4", Options.create("-show_streams"))
        ).pipe(Effect.provide(layer))
      )
      const process = yield* next
      yield* process.emit(1, "{")
      yield* process.exit(0)
      assert.instanceOf(yield* Effect.flip(Fiber.join(fiber)), ProbeDecodeError)
    })
  )

  it.effect(
    "decodes a custom service's raw output with the caller schema",
    () =>
      Effect.gen(function* () {
        // A mock returns raw JSON; the library decodes it, so a mismatch is a
        // typed ProbeDecodeError rather than a mistyped success or a defect.
        const fixture = { streams: [{ width: 640 }] }
        const mock = Layer.succeed(FFprobe, {
          probe: () => Effect.die("unused"),
          probeWith: () => Effect.die("unused"),
          probeJson: () => Effect.succeed(fixture)
        })
        const options = Options.create({ show_entries: "stream=width" })
        const Widths = Schema.Struct({
          streams: Schema.Array(Schema.Struct({ width: Schema.Number }))
        })
        assert.deepStrictEqual(
          yield* probeWith("/test/input.mp4", options, Widths).pipe(
            Effect.provide(mock)
          ),
          fixture
        )
        const mismatch = yield* probeWith(
          "/test/input.mp4",
          options,
          Schema.Number
        ).pipe(
          Effect.as("decoded"),
          Effect.catchTag("ProbeDecodeError", () => Effect.succeed("caught")),
          Effect.provide(mock)
        )
        assert.strictEqual(mismatch, "caught")
      })
  )

  it.effect("reports caller schema mismatches as ProbeDecodeError", () =>
    Effect.gen(function* () {
      const { layer, next } = yield* setup()
      const Dims = Schema.Struct({
        streams: Schema.Array(Schema.Struct({ height: Schema.Number }))
      })
      const fiber = yield* Effect.forkChild(
        probeWith(
          "/test/input.mp4",
          Options.create({ show_entries: "stream=width" }),
          Dims
        ).pipe(Effect.provide(layer))
      )
      const process = yield* next
      yield* process.emit(1, JSON.stringify({ streams: [{ width: 640 }] }))
      yield* process.exit(0)
      assert.instanceOf(yield* Effect.flip(Fiber.join(fiber)), ProbeDecodeError)
    })
  )

  it.effect(
    "preserves a leading dash and shell metacharacters in the input as one argument",
    () =>
      Effect.gen(function* () {
        const { layer, next } = yield* setup()
        const input = "-clip $(touch surprise); 'quoted'.mp4"
        const fiber = yield* Effect.forkChild(
          probe(input).pipe(Effect.provide(layer))
        )
        const process = yield* next
        assert.deepStrictEqual(process.args.slice(-2), ["-i", input])
        yield* process.emit(1, "{}")
        yield* process.exit(0)
        yield* Fiber.join(fiber)
      })
  )

  it.effect("rejects reserved option spellings before spawning", () =>
    Effect.gen(function* () {
      const spawner = yield* makeFakeSpawner({
        spawnError: platformError("must not spawn")
      })
      const layer = FFprobe.layer().pipe(Layer.provide(spawner.layer))
      for (const token of [
        "-i",
        "-o",
        "-of",
        "-output_format",
        "-print_format",
        "-/of",
        "-/i",
        "-/o",
        "-of:v",
        "--"
      ]) {
        const error = yield* probeWith(
          "x",
          Options.create(token, "value")
        ).pipe(Effect.provide(layer), Effect.flip)
        assert.instanceOf(error, CommandError)
        assert.deepInclude(error.reason, {
          _tag: "ReservedOption",
          option: token,
          location: { _tag: "Probe" }
        })
      }
    })
  )

  it.effect("rejects process descriptor paths and NULs before spawning", () =>
    Effect.gen(function* () {
      const spawner = yield* makeFakeSpawner({
        spawnError: platformError("must not spawn")
      })
      const layer = FFprobe.layer().pipe(Layer.provide(spawner.layer))
      for (const input of [
        "-",
        "pipe:0",
        "async:pipe:1",
        "fd:2",
        "/dev/stdin",
        "/dev/fd/3",
        "/proc/self/fd/1",
        "bad\0path"
      ]) {
        const error = yield* probe(input).pipe(
          Effect.provide(layer),
          Effect.flip
        )
        assert.instanceOf(error, CommandError)
        if (input.includes("\0")) {
          assert.strictEqual(error.reason._tag, "InvalidArgument")
        } else {
          assert.deepInclude(error.reason, {
            _tag: "ReservedPath",
            path: input,
            location: { _tag: "Probe" }
          })
        }
        const optionError = yield* probeWith(
          "x",
          Options.create({ custom: input })
        ).pipe(Effect.provide(layer), Effect.flip)
        assert.instanceOf(optionError, CommandError)
      }
    })
  )

  it.effect(
    "reports invalid time values in probe options before spawning",
    () =>
      Effect.gen(function* () {
        const spawner = yield* makeFakeSpawner({
          spawnError: platformError("must not spawn")
        })
        const layer = FFprobe.layer().pipe(Layer.provide(spawner.layer))
        const error = yield* probeWith(
          "x",
          options.duration(Duration.infinity)
        ).pipe(Effect.provide(layer), Effect.flip)
        assert.instanceOf(error, CommandError)
        assert.strictEqual(error.reason._tag, "InvalidArgument")
        assert.instanceOf(error.cause, RangeError)
      })
  )

  it.effect("rejects FFmpeg stream references in probe options", () =>
    Effect.gen(function* () {
      const { layer } = yield* setup()
      const error = yield* probeWith(
        "x",
        Options.create({ select_streams: Input.fromFile("x").video })
      ).pipe(Effect.provide(layer), Effect.flip)
      assert.instanceOf(error, CommandError)
      assert.strictEqual(error.reason._tag, "ForeignReference")
    })
  )

  it.effect("rejects an invalid track index in probe options", () =>
    Effect.gen(function* () {
      const { layer } = yield* setup()
      const error = yield* probeWith(
        "x",
        Options.create({ select_streams: Input.fromFile("x").video.track(-1) })
      ).pipe(Effect.provide(layer), Effect.flip)
      assert.instanceOf(error, CommandError)
      assert.strictEqual(error.reason._tag, "InvalidArgument")
      assert.instanceOf(error.cause, RangeError)
      assert.include(error.message, "Stream index must be")
      assert.include(error.message, "got: -1")
    })
  )

  it.effect(
    "keeps custom render failure messages out of the error message",
    () =>
      Effect.gen(function* () {
        const { layer } = yield* setup()
        const boom = new Error("https://user:secret@example.com")
        class Broken extends FFmpeguArgument {
          getArgs(): string[] {
            throw boom
          }
        }
        const error = yield* probeWith(
          "x",
          Options.create({ select_streams: new Broken() })
        ).pipe(Effect.provide(layer), Effect.flip)
        assert.instanceOf(error, CommandError)
        assert.strictEqual(error.reason._tag, "InvalidArgument")
        assert.strictEqual(error.message, "Failed to render probe options.")
        assert.strictEqual(error.cause, boom)
      })
  )

  it.effect("reports custom render failures with a throwing message", () =>
    Effect.gen(function* () {
      const { layer } = yield* setup()
      const boom = new Error()
      Object.defineProperty(boom, "message", {
        get() {
          throw new Error("unreadable")
        }
      })
      class Broken extends FFmpeguArgument {
        getArgs(): string[] {
          throw boom
        }
      }
      const error = yield* probeWith(
        "x",
        Options.create({ select_streams: new Broken() })
      ).pipe(Effect.provide(layer), Effect.flip)
      assert.instanceOf(error, CommandError)
      assert.strictEqual(error.reason._tag, "InvalidArgument")
      assert.strictEqual(error.cause, boom)
    })
  )

  it.effect("reports a tampered track index error in probe options", () =>
    Effect.gen(function* () {
      const { layer } = yield* setup()
      let tampered: unknown
      class Wrapper extends FFmpeguArgument {
        getArgs(refs: FFmpeguReferencesInterface): string[] {
          try {
            return Input.fromFile("x").video.track(-1).getArgs(refs)
          } catch (error) {
            Object.defineProperty(error, "message", {
              get() {
                throw new Error("unreadable")
              }
            })
            tampered = error
            throw error
          }
        }
      }
      const error = yield* probeWith(
        "x",
        Options.create({ select_streams: new Wrapper() })
      ).pipe(Effect.provide(layer), Effect.flip)
      assert.instanceOf(error, CommandError)
      assert.strictEqual(error.reason._tag, "InvalidArgument")
      assert.strictEqual(
        error.message,
        "Failed to render probe options: Stream index must be an integer from 0 to 2147483647, got: -1"
      )
      assert.strictEqual(error.cause, tampered)
    })
  )

  it.effect("does not copy an annotated track index error message", () =>
    Effect.gen(function* () {
      const { layer } = yield* setup()
      const input = Input.fromFile("https://user:secret@example.com/input.mp4")
      let annotated: unknown
      class Contextual extends FFmpeguArgument {
        getArgs(refs: FFmpeguReferencesInterface): string[] {
          try {
            return input.video.track(-1).getArgs(refs)
          } catch (error) {
            ;(error as Error).message += ` while reading ${input.source}`
            annotated = error
            throw error
          }
        }
      }
      const error = yield* probeWith(
        "x",
        Options.create({ select_streams: new Contextual() })
      ).pipe(Effect.provide(layer), Effect.flip)
      assert.instanceOf(error, CommandError)
      assert.strictEqual(error.reason._tag, "InvalidArgument")
      assert.notInclude(error.message, "secret")
      assert.include(error.message, "got: -1")
      assert.strictEqual(error.cause, annotated)
    })
  )

  it.effect(
    "interruption releases the process with the configured escalation budget",
    () =>
      Effect.gen(function* () {
        const { layer, next } = yield* setup({ forceKillAfter: "100 millis" })
        const fiber = yield* Effect.forkChild(
          probeWith("x", Options.create("-show_streams")).pipe(
            Effect.provide(layer)
          )
        )
        const process = yield* next
        yield* Fiber.interrupt(fiber)
        assert.isTrue(yield* process.released)
        assert.strictEqual((yield* process.kills).length, 1)
        assert.deepStrictEqual(
          process.command.options.forceKillAfter,
          (yield* process.kills)[0]?.forceKillAfter
        )
        assert.isTrue(Exit.isFailure(yield* Fiber.await(fiber)))
      })
  )

  it.effect("reports non-zero exits with the stderr tail", () =>
    Effect.gen(function* () {
      const { exit } = yield* probeOutput(
        "{}",
        1,
        "/test/input.mp4: No such file or directory\n"
      )
      const error = yield* Effect.flip(exit)
      assert.instanceOf(error, ExitError)
      assert.strictEqual(error.binary, "ffprobe")
      assert.strictEqual(error.exitCode, 1)
      assert.strictEqual(
        error.stderr,
        "/test/input.mp4: No such file or directory"
      )
      assert.strictEqual(
        error.message,
        "ffprobe exited with exit code 1: /test/input.mp4: No such file or directory"
      )
    })
  )

  it.effect("reports the configured binary in ExitError", () =>
    Effect.gen(function* () {
      const { layer, next } = yield* setup({
        binary: "/home/user/secret-token/bin/ffprobe-7"
      })
      const fiber = yield* Effect.forkChild(
        probe("x").pipe(Effect.provide(layer))
      )
      const process = yield* next
      yield* process.exitWithSignal()
      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ExitError)
      assert.strictEqual(error.binary, "/home/user/secret-token/bin/ffprobe-7")
      // Only the file name reaches the message, which tracing exports.
      assert.strictEqual(error.message, "ffprobe-7 exited without an exit code")
    })
  )

  it("keeps ExitError constructible without a binary", () => {
    const error = new ExitError({ exitCode: 1, stderr: "" })
    assert.strictEqual(error.binary, undefined)
    assert.strictEqual(error.message, "Process exited with exit code 1")
  })

  it.effect("fails and kills ffprobe when stdout exceeds the limit", () =>
    Effect.gen(function* () {
      const { layer, next } = yield* setup({ maxOutputBytes: 8 })
      const fiber = yield* Effect.forkChild(
        probe("/test/input.mp4").pipe(Effect.provide(layer))
      )
      const process = yield* next
      yield* process.emit(1, '{"streams":', "[]}")

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ProbeOutputError)
      assert.strictEqual(error.maxOutputBytes, 8)
      assert.strictEqual((yield* process.kills).length, 1)
    })
  )

  it.effect("fails with SpawnError when the binary cannot start", () =>
    Effect.gen(function* () {
      const cause = platformError("spawn", "ENOENT")
      const spawner = yield* makeFakeSpawner({ spawnError: cause })
      const error = yield* probe("/test/input.mp4").pipe(
        Effect.provide(
          FFprobe.layer({ binary: "/missing/ffprobe" }).pipe(
            Layer.provide(spawner.layer)
          )
        ),
        Effect.flip
      )
      assert.deepStrictEqual(
        error,
        new SpawnError({ binary: "/missing/ffprobe", cause })
      )
    })
  )

  it.effect("annotates the probe span without the input", () =>
    Effect.gen(function* () {
      const spawner = yield* makeFakeSpawner()
      const recorder = makeRecordingTracer()
      const fiber = yield* Effect.forkChild(
        probe("https://user:secret@example.com/in.mp4").pipe(
          Effect.provide(
            FFprobe.layer({ binary: "/opt/bin/ffprobe" }).pipe(
              Layer.provide(spawner.layer)
            )
          ),
          Effect.withTracer(recorder.tracer)
        )
      )
      const process = yield* spawner.next
      yield* process.emit(1, '{"streams":[]}')
      yield* process.exit(0)
      yield* Fiber.join(fiber)

      assert.deepStrictEqual(recorder.attributes("ffmpegu/FFprobe.probe"), {
        "process.executable.name": "ffprobe",
        "process.exit.code": 0
      })
    })
  )

  it.effect("records the exit code when the output fails after exit", () =>
    Effect.gen(function* () {
      const spawner = yield* makeFakeSpawner()
      const recorder = makeRecordingTracer()
      const fiber = yield* Effect.forkChild(
        probe("/test/input.mp4").pipe(
          Effect.provide(
            FFprobe.layer({ maxOutputBytes: 1 }).pipe(
              Layer.provide(spawner.layer)
            )
          ),
          Effect.withTracer(recorder.tracer)
        )
      )
      const process = yield* spawner.next
      yield* process.emit(1, '{"streams":[]}')
      yield* process.exit(0)

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ProbeOutputError)
      assert.strictEqual(
        recorder.attributes("ffmpegu/FFprobe.probe")["process.exit.code"],
        0
      )
    })
  )

  it.effect(
    "records the exit code of a process terminated on an output failure",
    () =>
      Effect.gen(function* () {
        // A process handling SIGTERM still exits with a code.
        const spawner = yield* makeFakeSpawner({ killExitCode: 23 })
        const recorder = makeRecordingTracer()
        const fiber = yield* Effect.forkChild(
          probe("/test/input.mp4").pipe(
            Effect.provide(
              FFprobe.layer({ maxOutputBytes: 1 }).pipe(
                Layer.provide(spawner.layer)
              )
            ),
            Effect.withTracer(recorder.tracer)
          )
        )
        const process = yield* spawner.next
        yield* process.emit(1, "xx")

        const error = yield* Fiber.join(fiber).pipe(Effect.flip)
        assert.instanceOf(error, ProbeOutputError)
        assert.isTrue(yield* process.released)
        assert.strictEqual(
          recorder.attributes("ffmpegu/FFprobe.probe")["process.exit.code"],
          23
        )
      })
  )

  /**
   * Probe through a fake spawner whose handles are altered by `alter`,
   * recording spans. Returns the probe fiber, the spawned process and the
   * probe span's attributes accessor.
   */
  const probeWithHandle = Effect.fnUntraced(function* (
    alter: (
      handle: ChildProcessSpawner.ChildProcessHandle
    ) => Partial<ChildProcessSpawner.ChildProcessHandle>,
    options?: FFprobeOptions
  ) {
    const spawner = yield* makeFakeSpawner()
    const altered = Layer.effect(
      ChildProcessSpawner.ChildProcessSpawner,
      Effect.gen(function* () {
        const fake = yield* ChildProcessSpawner.ChildProcessSpawner
        return ChildProcessSpawner.make((command) =>
          Effect.map(fake.spawn(command), (handle) =>
            ChildProcessSpawner.makeHandle({ ...handle, ...alter(handle) })
          )
        )
      })
    ).pipe(Layer.provide(spawner.layer))
    const recorder = makeRecordingTracer()
    const fiber = yield* Effect.forkChild(
      probe("/test/input.mp4").pipe(
        Effect.provide(FFprobe.layer(options).pipe(Layer.provide(altered))),
        Effect.withTracer(recorder.tracer)
      )
    )
    const process = yield* spawner.next
    return {
      fiber,
      process,
      attributes: () => recorder.attributes("ffmpegu/FFprobe.probe")
    }
  })

  it.effect("records an exit code the spawner reports asynchronously", () =>
    Effect.gen(function* () {
      const { fiber, process, attributes } = yield* probeWithHandle(
        (handle) => ({
          exitCode: Effect.flatMap(handle.exitCode, (code) =>
            Effect.promise(() => Promise.resolve(code))
          )
        })
      )
      yield* process.emit(1, '{"streams":[]}')
      yield* process.exit(0)
      yield* Fiber.join(fiber)

      assert.strictEqual(attributes()["process.exit.code"], 0)
    })
  )

  it.effect("does not wait for an exit code reported late", () =>
    Effect.gen(function* () {
      // The spawner reports the process stopped before its exit code is known.
      const { fiber, process, attributes } = yield* probeWithHandle(
        () => ({ exitCode: Effect.never, isRunning: Effect.succeed(false) }),
        { maxOutputBytes: 1 }
      )
      yield* process.emit(1, "xx")

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ProbeOutputError)
      assert.notProperty(attributes(), "process.exit.code")
    })
  )

  it.effect("reads byte sizes from a Config layer", () =>
    Effect.gen(function* () {
      const spawner = yield* makeFakeSpawner()
      const layer = FFprobe.layerConfig({
        maxOutputBytes: Config.ByteSize("FFPROBE_MAX_OUTPUT")
      }).pipe(
        Layer.provide(spawner.layer),
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ FFPROBE_MAX_OUTPUT: "8 B" })
          )
        )
      )
      const fiber = yield* Effect.forkChild(
        probe("/test/input.mp4").pipe(Effect.provide(layer))
      )
      const process = yield* spawner.next
      yield* process.emit(1, '{"streams":', "[]}")

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.instanceOf(error, ProbeOutputError)
      assert.strictEqual(error.maxOutputBytes, 8)
    })
  )

  it.effect("treats undefined fields of a Config record as omitted", () =>
    Effect.gen(function* () {
      const spawner = yield* makeFakeSpawner()
      const fiber = yield* Effect.forkChild(
        probe("/test/input.mp4").pipe(
          Effect.provide(
            FFprobe.layerConfig({ maxOutputBytes: undefined }).pipe(
              Layer.provide(spawner.layer)
            )
          )
        )
      )
      const process = yield* spawner.next
      yield* process.emit(1, '{"streams":[]}')
      yield* process.exit(0)
      assert.deepStrictEqual((yield* Fiber.join(fiber)).streams, [])
    })
  )

  it.effect("fails with ConfigError for invalid configured limits", () =>
    Effect.gen(function* () {
      const spawner = yield* makeFakeSpawner()
      const error = yield* probe("x").pipe(
        Effect.provide(
          FFprobe.layerConfig({
            maxOutputBytes: Config.Int("FFPROBE_MAX_OUTPUT")
          }).pipe(
            Layer.provide(spawner.layer),
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ FFPROBE_MAX_OUTPUT: -1 })
              )
            )
          )
        ),
        Effect.flip
      )
      assert.instanceOf(error, Config.ConfigError)
      assert.include(error.message, "maxOutputBytes must be")
    })
  )

  const weeksAndDays = Config.all({
    weeks: Config.Number("WEEKS"),
    days: Config.Number("DAYS")
  })

  it.effect.each<
    [string, Config.Config<Duration.Input>, Record<string, string>]
  >([
    [
      "infinite fields cancel out",
      weeksAndDays,
      { WEEKS: "Infinity", DAYS: "-Infinity" }
    ],
    ["total overflows", weeksAndDays, { WEEKS: "1e308", DAYS: "-1e308" }],
    [
      "negative finite fields round to zero",
      Config.all({
        weeks: Config.Number("WEEKS"),
        seconds: Config.Number("SECONDS"),
        milliseconds: Config.Number("MILLISECONDS")
      }),
      { WEEKS: "1e12", SECONDS: "-1", MILLISECONDS: "-604800000000000000000" }
    ],
    [
      "negative value rounds to zero",
      Config.Number("VALUE"),
      {
        VALUE: "-5e-324"
      }
    ]
  ])("fails with ConfigError for a grace period whose %s", ([, config, env]) =>
    Effect.gen(function* () {
      const spawner = yield* makeFakeSpawner()
      const error = yield* probe("x").pipe(
        Effect.provide(
          FFprobe.layerConfig({ forceKillAfter: config }).pipe(
            Layer.provide(spawner.layer),
            Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))
          )
        ),
        Effect.flip
      )
      assert.instanceOf(error, Config.ConfigError)
      assert.include(error.message, "forceKillAfter must be")
    })
  )

  it.effect.each<[FFprobeOptions]>([
    [{ maxOutputBytes: Number.NaN }],
    [{ forceKillAfter: -1 }],
    [{ forceKillAfter: { seconds: Infinity, milliseconds: -Infinity } }],
    [{ forceKillAfter: { weeks: 1e308, days: -1e308 } }],
    [
      {
        forceKillAfter: {
          weeks: 1e12,
          seconds: -1,
          milliseconds: -604800000000000000000
        }
      }
    ],
    [{ forceKillAfter: -Number.MIN_VALUE }],
    [{ forceKillAfter: [1, -1000000000.25] }],
    [{ forceKillAfter: "-0.0000000001 seconds" }]
  ])("rejects invalid options %j", ([options]) =>
    Effect.gen(function* () {
      const { layer } = yield* setup(options)
      const exit = yield* Effect.exit(probe("x").pipe(Effect.provide(layer)))
      assert.isTrue(
        Exit.isFailure(exit) && exit.cause.reasons[0]?._tag === "Die"
      )
    })
  )
})
