import { expect, it } from "@effect/vitest"
import { NodeSink } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Scope, Stream } from "effect"
import { Writable } from "node:stream"
import {
  Command,
  FFmpeg,
  FFprobe,
  Input,
  Options,
  Output,
  probe,
  run
} from "../../src/index.ts"
import { MediaLive, PlatformLive } from "../helpers/platform.ts"

const live = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof MediaLive> | Scope.Scope>
) => Effect.scoped(effect).pipe(Effect.provide(MediaLive))

it.live.each(["missing", "not executable"] as const)(
  "reports SpawnError for %s FFmpeg and FFprobe binaries",
  (kind) =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const binary = `${dir}/binary`
        if (kind === "not executable") {
          yield* fs.writeFileString(binary, "#!/bin/sh\nexit 0\n")
          yield* fs.chmod(binary, 0o644)
        }
        const command = Command.make({
          inputs: [Input.fromFile("./assets/video.mp4")],
          outputs: [Output.toFile(`${dir}/output.mp4`)]
        })
        const ffmpegError = yield* Effect.flip(
          run(command).pipe(Effect.provide(FFmpeg.layer({ binary })))
        )
        const ffprobeError = yield* Effect.flip(
          probe("./assets/video.mp4").pipe(
            Effect.provide(FFprobe.layer({ binary }))
          )
        )
        expect(ffmpegError).toMatchObject({ _tag: "SpawnError", binary })
        expect(ffprobeError).toMatchObject({ _tag: "SpawnError", binary })
        expect(yield* fs.exists(`${dir}/output.mp4`)).toBe(false)
      })
    ).pipe(Effect.provide(PlatformLive))
)

it.live("preserves a Node writable's final flush failure", () =>
  live(
    Effect.gen(function* () {
      const failure = new Error("final flush failed")
      let received = 0
      let finalized = false
      const sink = NodeSink.fromWritable({
        evaluate: () =>
          new Writable({
            write(chunk, _encoding, callback) {
              received += chunk.length
              callback()
            },
            final(callback) {
              finalized = true
              callback(failure)
            }
          }),
        onError: (cause) => cause
      })
      const error = yield* Effect.flip(
        run(
          Command.make({
            inputs: [
              Input.fromStream(
                Stream.make(new Uint8Array(16000)),
                Options.create({ f: "s16le", ar: 8000, ac: 1 })
              )
            ],
            outputs: [
              Output.toSink(sink, Options.create({ f: "s16le", c: "copy" }))
            ]
          })
        )
      )
      expect(received).toBe(16000)
      expect(finalized).toBe(true)
      expect(error).toBe(failure)
    })
  )
)

it.live("preserves an input failure before it emits any bytes", () =>
  live(
    Effect.gen(function* () {
      const failure = new Error("source already destroyed")
      const error = yield* Effect.flip(
        run(
          Command.make({
            inputs: [
              Input.fromStream(
                Stream.fail(failure),
                Options.create({ f: "s16le", ar: 8000, ac: 1 })
              )
            ],
            outputs: [Output.toFile("/dev/null", Options.create({ f: "null" }))]
          })
        )
      )
      expect(error).toBe(failure)
    })
  )
)
