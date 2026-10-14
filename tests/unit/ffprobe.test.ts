import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Layer } from "effect"
import {
  ExitError,
  FFprobe,
  type FFprobeOptions,
  ProbeDecodeError,
  ProbeOutputError,
  probe,
  SpawnError
} from "../../src/index.ts"
import { makeFakeSpawner, platformError } from "./fake-spawner.ts"

const setup = Effect.fnUntraced(function* (options?: FFprobeOptions) {
  const spawner = yield* makeFakeSpawner()
  const layer = FFprobe.layer(options).pipe(Layer.provide(spawner.layer))
  return { layer, next: spawner.next }
})

/** Probe with a process that prints `stdout` and exits with `code`. */
const probeWith = (stdout: string, code = 0, stderr = "") =>
  Effect.gen(function* () {
    const { layer, next } = yield* setup()
    const fiber = yield* Effect.forkChild(
      probe("/test/input.mp4").pipe(Effect.provide(layer))
    )
    const process = yield* next
    yield* process.emit(1, stdout)
    if (stderr) yield* process.emit(2, stderr)
    yield* process.exit(code)
    return { exit: yield* Fiber.await(fiber), process }
  })

const decodeFailure = (stdout: string) =>
  Effect.gen(function* () {
    const { exit } = yield* probeWith(stdout)
    assert.isTrue(Exit.isFailure(exit))
    const error = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined
    assert.isTrue(
      error?._tag === "Fail" && error.error instanceof ProbeDecodeError
    )
  })

describe("FFprobe", () => {
  it.effect("runs ffprobe with JSON output and decodes the result", () =>
    Effect.gen(function* () {
      const { exit, process } = yield* probeWith(
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
      const { exit } = yield* probeWith(
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

  it.effect("reports non-zero exits with the stderr tail", () =>
    Effect.gen(function* () {
      const { exit } = yield* probeWith(
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
