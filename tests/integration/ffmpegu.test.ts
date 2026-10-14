import { it, expect } from "@effect/vitest"
import { NodeSink } from "@effect/platform-node"
import {
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Ref,
  Scope,
  Sink,
  Stream
} from "effect"
import { Writable } from "node:stream"
import {
  Command,
  FFmpeg,
  Input,
  Options,
  Output,
  filters,
  probe,
  run
} from "../../src/index.ts"
import { MediaLive, PlatformLive } from "../helpers/platform.ts"

const live = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof MediaLive> | Scope.Scope>
) => Effect.scoped(effect).pipe(Effect.provide(MediaLive))
const opts = Options.create
const video = () =>
  Input.fromFile(
    "testsrc2=size=64x48:rate=10:duration=0.5",
    opts({ f: "lavfi" })
  )

it.live(
  "transcodes a seekable file, applies filters, and re-executes the command",
  () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const source = `${dir}/source.mp4`
        yield* run(
          Command.make({
            inputs: [video()],
            outputs: [
              Output.toFile(source, opts({ "c:v": "libx264", threads: 1 }))
            ]
          })
        )
        const input = Input.fromFile(source)
        const target = `${dir}/scaled.mp4`
        const command = Command.make({
          global: opts("-y"),
          inputs: [input],
          outputs: [
            Output.toFile(
              target,
              opts({
                map: input.video,
                vf: filters.scale({ w: 32, h: 24 }),
                "c:v": "libx264",
                threads: 1
              })
            )
          ]
        })
        const progress: string[] = []
        yield* run(command, {
          onProgress: (p) =>
            Effect.sync(() => {
              progress.push(p.progress)
            })
        })
        yield* run(command)
        const result = yield* probe(target)
        expect(result.streams[0]).toMatchObject({
          codec_name: "h264",
          width: 32,
          height: 24
        })
        expect(progress).toContain("end")
      })
    )
)

it.live(
  "feeds two input descriptors and drains two independently mapped outputs",
  () =>
    live(
      Effect.gen(function* () {
        const videoInput = Input.fromStream(
          Stream.make(new Uint8Array(16 * 16 * 3)),
          opts({
            f: "rawvideo",
            pixel_format: "rgb24",
            video_size: "16x16",
            framerate: 1
          })
        )
        const audioInput = Input.fromStream(
          Stream.make(new Uint8Array(16_000)),
          opts({ f: "s16le", ar: 8000, ac: 1 })
        )
        const muxed = yield* Ref.make(0)
        const audio = yield* Ref.make(0)
        const count = (ref: Ref.Ref<number>) =>
          Sink.forEach((bytes: Uint8Array) =>
            Ref.update(ref, (n) => n + bytes.length)
          )
        yield* run(
          Command.make({
            inputs: [videoInput, audioInput],
            outputs: [
              Output.toSink(
                count(muxed),
                opts(["map", videoInput.video], ["map", audioInput.audio], {
                  c: "copy",
                  f: "nut"
                })
              ),
              Output.toSink(
                count(audio),
                opts({ map: audioInput.audio, c: "copy", f: "s16le" })
              )
            ]
          })
        )
        expect(yield* Ref.get(muxed)).toBeGreaterThan(16_000)
        expect(yield* Ref.get(audio)).toBe(16_000)
      })
    )
)

it.live(
  "uses Effect FileSystem streams and sinks with scoped file resources",
  () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const source = `${dir}/audio.pcm`
        const target = `${dir}/audio.wav`
        yield* fs.writeFile(source, new Uint8Array(16_000))
        yield* run(
          Command.make({
            inputs: [
              Input.fromStream(
                fs.stream(source),
                opts({ f: "s16le", ar: 8000, ac: 1 })
              )
            ],
            outputs: [
              Output.toSink(
                fs.sink(target),
                opts({ f: "wav", "c:a": "pcm_s16le" })
              )
            ]
          })
        )
        const result = yield* probe(target)
        expect(result.streams[0]).toMatchObject({
          codec_name: "pcm_s16le",
          sample_rate: "8000",
          channels: 1
        })
        expect(Number(result.format?.duration)).toBeCloseTo(1)
      })
    )
)

it.live(
  "interrupts an infinite input after FFmpeg reaches its duration limit",
  () =>
    live(
      Effect.gen(function* () {
        const released = yield* Ref.make(false)
        const source = Stream.forever(Stream.make(new Uint8Array(16_000))).pipe(
          Stream.ensuring(Ref.set(released, true))
        )
        yield* run(
          Command.make({
            inputs: [
              Input.fromStream(source, opts({ f: "s16le", ar: 8000, ac: 1 }))
            ],
            outputs: [Output.toFile("/dev/null", opts({ t: 0.1, f: "null" }))]
          })
        )
        expect(yield* Ref.get(released)).toBe(true)
      })
    )
)

it.live("waits for a Node writable's delayed finalization", () =>
  live(
    Effect.gen(function* () {
      let finalized = false
      const sink = NodeSink.fromWritable({
        evaluate: () =>
          new Writable({
            write(_chunk, _encoding, callback) {
              callback()
            },
            final(callback) {
              setTimeout(() => {
                finalized = true
                callback()
              }, 50)
            }
          }),
        onError: (cause) => cause
      })
      yield* run(
        Command.make({
          inputs: [video()],
          outputs: [
            Output.toSink(
              sink,
              opts({ f: "mpegts", "c:v": "libx264", threads: 1 })
            )
          ]
        })
      )
      expect(finalized).toBe(true)
    })
  )
)

it.live("rejects a sink that stops consuming output", () =>
  live(
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        run(
          Command.make({
            inputs: [video()],
            outputs: [
              Output.toSink(
                Sink.forEachWhile(() => Effect.succeed(false)),
                opts({ f: "rawvideo", "c:v": "rawvideo", threads: 1 })
              )
            ]
          })
        )
      )
      expect(error).toMatchObject({
        _tag: "OutputError",
        reason: "SinkEndedEarly"
      })
    })
  )
)

it.live("preserves a caller's sink error", () =>
  live(
    Effect.gen(function* () {
      const failure = {
        _tag: "UploadFailed",
        detail: "destination unavailable"
      } as const
      const error = yield* Effect.flip(
        run(
          Command.make({
            inputs: [video()],
            outputs: [
              Output.toSink(
                Sink.forEach(() => Effect.fail(failure)),
                opts({ f: "rawvideo", "c:v": "rawvideo", threads: 1 })
              )
            ]
          })
        )
      )
      expect(error).toBe(failure)
    })
  )
)

it.live(
  "fails with ExitError for missing input or an unspecified pipe format",
  () =>
    live(
      Effect.gen(function* () {
        const missing = yield* Effect.flip(
          run(
            Command.make({
              inputs: [Input.fromFile("/ffmpegu/missing-input.mp4")],
              outputs: [Output.toFile("/dev/null", opts({ f: "null" }))]
            })
          )
        )
        expect(missing).toMatchObject({ _tag: "ExitError" })
        const noFormat = yield* Effect.flip(
          run(
            Command.make({
              inputs: [video()],
              outputs: [Output.toSink(Sink.drain)]
            })
          )
        )
        expect(noFormat).toMatchObject({ _tag: "ExitError" })
      })
    )
)

it.live.each(["hls", "dash"] as const)(
  "writes %s manifests and media segments",
  (format) =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const target = `${dir}/stream.${format === "hls" ? "m3u8" : "mpd"}`
        yield* run(
          Command.make({
            inputs: [video()],
            outputs: [
              Output.toFile(
                target,
                opts({
                  f: format,
                  "c:v": "libx264",
                  threads: 1,
                  g: 2,
                  ...(format === "hls"
                    ? { hls_time: 0.2, hls_list_size: 0 }
                    : { seg_duration: 0.2 })
                })
              )
            ]
          })
        )
        const manifest = yield* fs.readFileString(target)
        expect(manifest).toContain(format === "hls" ? "#EXT-X-ENDLIST" : "<MPD")
        const files = yield* fs.readDirectory(dir)
        expect(
          files.some((name) =>
            format === "hls" ? name.endsWith(".ts") : name.endsWith(".m4s")
          )
        ).toBe(true)
      })
    )
)

it.live("interrupts and force-kills a child that ignores SIGTERM", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const binary = `${dir}/child.sh`
      const pidFile = `${dir}/pid`
      yield* fs.writeFileString(
        binary,
        `#!/bin/sh\ntrap '' TERM\nprintf '%s' "$$" > '${pidFile}'\nprintf 'progress=continue\\n' >&3\nwhile :; do sleep 1; done\n`
      )
      yield* fs.chmod(binary, 0o755)
      const ready = yield* Deferred.make<void>()
      const program = run(
        Command.make({ outputs: [Output.toFile("ignored")] }),
        {
          onProgress: () => Effect.asVoid(Deferred.succeed(ready, undefined))
        }
      ).pipe(
        Effect.provide(FFmpeg.layer({ binary, forceKillAfter: "100 millis" }))
      )
      const fiber = yield* Effect.forkChild(program)
      yield* Deferred.await(ready)
      const pid = Number(yield* fs.readFileString(pidFile))
      yield* Fiber.interrupt(fiber)
      expect(() => process.kill(pid, 0)).toThrow()
    })
  ).pipe(Effect.provide(PlatformLive))
)

it.live(
  "executes a labeled filter graph with independently mapped outputs",
  () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const input = video()
        const left = filters.label("left")
        const right = filters.label("right")
        const scaled = filters.label("scaled")
        const graph = filters.graph(
          filters.chain(
            filters.custom(
              "split",
              { outputs: 2 },
              [filters.label(input.video)],
              [left, right]
            )
          ),
          filters.chain(
            filters.scale(
              { w: 32, h: 24 },
              { inputs: [right], outputs: [scaled] }
            )
          )
        )
        yield* run(
          Command.make({
            global: opts({ filter_complex: graph }),
            inputs: [input],
            outputs: [
              Output.toFile(
                `${dir}/left.mp4`,
                opts({ map: left, "c:v": "libx264", threads: 1 })
              ),
              Output.toFile(
                `${dir}/right.mp4`,
                opts({ map: scaled, "c:v": "libx264", threads: 1 })
              )
            ]
          })
        )
        expect((yield* probe(`${dir}/left.mp4`)).streams[0]).toMatchObject({
          width: 64,
          height: 48
        })
        expect((yield* probe(`${dir}/right.mp4`)).streams[0]).toMatchObject({
          width: 32,
          height: 24
        })
      })
    )
)

it.live("preserves an input source error and a progress callback error", () =>
  live(
    Effect.gen(function* () {
      const failure = { _tag: "SourceUnavailable" } as const
      const source = Stream.concat(
        Stream.make(new Uint8Array(16_000)),
        Stream.fail(failure)
      )
      const error = yield* Effect.flip(
        run(
          Command.make({
            inputs: [
              Input.fromStream(source, opts({ f: "s16le", ar: 8000, ac: 1 }))
            ],
            outputs: [Output.toFile("/dev/null", opts({ f: "null" }))]
          })
        )
      )
      expect(error).toBe(failure)
      const callbackFailure = { _tag: "ProgressUnavailable" } as const
      const callbackError = yield* Effect.flip(
        run(
          Command.make({
            inputs: [video()],
            outputs: [Output.toFile("/dev/null", opts({ f: "null" }))]
          }),
          { onProgress: () => Effect.fail(callbackFailure) }
        )
      )
      expect(callbackError).toBe(callbackFailure)
    })
  )
)

it.live("drains noisy stderr while retaining only its configured tail", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const binary = `${dir}/noisy.mjs`
      yield* fs.writeFileString(
        binary,
        `#!${process.execPath}\nimport { writeSync } from 'node:fs'; writeSync(2, 'x'.repeat(100000) + 'tail-end'); process.exit(9);\n`
      )
      yield* fs.chmod(binary, 0o755)
      const error = yield* Effect.flip(
        run(Command.make({ outputs: [Output.toFile("ignored")] })).pipe(
          Effect.provide(FFmpeg.layer({ binary, stderrTailBytes: 128 }))
        )
      )
      expect(error._tag).toBe("ExitError")
      if (error._tag === "ExitError") {
        expect(error.exitCode).toBe(9)
        expect(
          new TextEncoder().encode(error.stderr).length
        ).toBeLessThanOrEqual(128)
        expect(error.stderr).toMatch(/tail-end$/)
      }
    })
  ).pipe(Effect.provide(PlatformLive))
)
