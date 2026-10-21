import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Exit, Fiber, Layer, Schema, Tracer } from "effect"
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
import { makeFakeSpawner, platformError } from "./fake-spawner.ts"

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
      assert.strictEqual(error.exitCode, 1)
      assert.strictEqual(
        error.stderr,
        "/test/input.mp4: No such file or directory"
      )
    })
  )

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

  it.effect("rejects invalid limits", () =>
    Effect.gen(function* () {
      const { layer } = yield* setup({ maxOutputBytes: Number.NaN })
      const exit = yield* Effect.exit(probe("x").pipe(Effect.provide(layer)))
      assert.isTrue(
        Exit.isFailure(exit) && exit.cause.reasons[0]?._tag === "Die"
      )
    })
  )
})
