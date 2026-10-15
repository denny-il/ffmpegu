import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Scope } from "effect"
import { execFileSync } from "node:child_process"
import {
  Command,
  Input,
  Options,
  Output,
  filters,
  options,
  probe,
  run
} from "../../src/index.ts"
import { MediaLive } from "../helpers/platform.ts"

const live = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof MediaLive> | Scope.Scope>
) => Effect.scoped(effect).pipe(Effect.provide(MediaLive))

it.live("applies time-object seek and duration options to a real file", () =>
  live(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const source = `${dir}/source.pcm`
      const target = `${dir}/trimmed.pcm`
      const pcm = Options.create({ f: "s16le", ar: 8000, ac: 1 })
      yield* run(
        Command.make({
          inputs: [
            Input.fromFile("aevalsrc=t/4:s=8000:d=3", options.format("lavfi"))
          ],
          outputs: [Output.toFile(source, pcm)]
        })
      )
      yield* run(
        Command.make({
          inputs: [
            Input.fromFile(
              source,
              Options.create(pcm, options.startTime({ seconds: 1 }))
            )
          ],
          outputs: [
            Output.toFile(
              target,
              Options.create(
                pcm,
                options.duration({ seconds: 1, milliseconds: 500 })
              )
            )
          ]
        })
      )
      const bytes = yield* fs.readFile(target)
      const samples = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength
      )
      expect(bytes.length).toBe(1.5 * 8000 * 2)
      // The ramp identifies the seek position; duration alone cannot catch a lost -ss.
      expect(samples.getInt16(0, true) / 32768).toBeCloseTo(0.25, 3)
      expect(samples.getInt16(bytes.length - 2, true) / 32768).toBeCloseTo(
        0.625,
        3
      )
    })
  )
)

it.live("writes metadata through option helpers that FFprobe can read", () =>
  live(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const target = `${dir}/metadata.wav`
      const title = "ffmpegu title: commas, apostrophes' and [brackets]"
      yield* run(
        Command.make({
          inputs: [
            Input.fromFile("sine=duration=0.1", options.format("lavfi"))
          ],
          outputs: [Output.toFile(target, options.metadata("title", title))]
        })
      )
      expect((yield* probe(target)).format?.tags?.title).toBe(title)
    })
  )
)

it.live("trims audio with time objects and composes audio filter helpers", () =>
  live(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const target = `${dir}/trimmed.wav`
      yield* run(
        Command.make({
          inputs: [Input.fromFile("sine=duration=2", options.format("lavfi"))],
          outputs: [
            Output.toFile(
              target,
              Options.create(
                options.audioFilter(
                  filters.chain(
                    filters.atrim({
                      duration: { seconds: 1, milliseconds: 500 }
                    }),
                    filters.volume({ volume: 0.5 })
                  )
                ),
                options.audioCodec("pcm_s16le")
              )
            )
          ]
        })
      )
      const result = yield* probe(target)
      expect(result.streams[0]).toMatchObject({
        codec_name: "pcm_s16le",
        channels: 1
      })
      expect(Number(result.format?.duration)).toBeCloseTo(1.5, 3)
    })
  )
)

it.live("fades audio at the requested time-object start and duration", () =>
  live(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const target = `${dir}/fade.pcm`
      yield* run(
        Command.make({
          inputs: [
            Input.fromFile("aevalsrc=0.5:s=8000:d=1", options.format("lavfi"))
          ],
          outputs: [
            Output.toFile(
              target,
              Options.create(
                options.audioFilter(
                  filters.afade({
                    type: "out",
                    start_time: { milliseconds: 250 },
                    duration: { milliseconds: 250 }
                  })
                ),
                options.format("s16le"),
                options.audioCodec("pcm_s16le")
              )
            )
          ]
        })
      )
      const bytes = yield* fs.readFile(target)
      const samples = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength
      )
      expect(bytes.length).toBe(16000)
      const sampleAt = (seconds: number) =>
        samples.getInt16(seconds * 8000 * 2, true) / 32768
      expect(sampleAt(0.125)).toBeCloseTo(0.5, 3)
      expect(sampleAt(0.375)).toBeCloseTo(0.25, 3)
      expect(sampleAt(0.75)).toBe(0)
    })
  )
)

it.live("uses an fps time object as the starting timestamp", () =>
  live(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const target = `${dir}/frames.rgb`
      yield* run(
        Command.make({
          inputs: [
            Input.fromFile(
              "testsrc2=size=16x16:rate=10:duration=1",
              options.format("lavfi")
            )
          ],
          outputs: [
            Output.toFile(
              target,
              Options.create({
                vf: filters.fps({ fps: 10, start_time: { milliseconds: 200 } }),
                f: "rawvideo",
                pix_fmt: "rgb24",
                threads: 1,
                fps_mode: "passthrough"
              })
            )
          ]
        })
      )
      expect((yield* fs.readFile(target)).length).toBe(8 * 16 * 16 * 3)
    })
  )
)

const hasDrawtext = /\bdrawtext\b/.test(
  execFileSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" })
)

it.live.skipIf(!hasDrawtext)(
  "preserves escaped drawtext values when rendering",
  () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const text = String.raw`a,b;[c]\\'d:ok`
        const textfile = `${dir}/text.txt`
        yield* fs.writeFileString(textfile, text)
        // The text file bypasses filter-value escaping and supplies a pixel oracle.
        for (const [name, value] of [
          ["inline", { text }],
          ["file", { textfile }]
        ] as const) {
          yield* run(
            Command.make({
              inputs: [
                Input.fromFile(
                  "color=black:size=320x64:duration=0.1",
                  options.format("lavfi")
                )
              ],
              outputs: [
                Output.toFile(
                  `${dir}/${name}.rgb`,
                  Options.create({
                    vf: filters.drawtext({
                      ...value,
                      x: 10,
                      y: 10,
                      fontsize: 20,
                      fontcolor: "white"
                    }),
                    "frames:v": 1,
                    f: "rawvideo",
                    pix_fmt: "rgb24",
                    threads: 1
                  })
                )
              ]
            })
          )
        }
        const inline = yield* fs.readFile(`${dir}/inline.rgb`)
        const file = yield* fs.readFile(`${dir}/file.rgb`)
        expect(file.some((byte) => byte !== 0)).toBe(true)
        expect(inline.length).toBe(file.length)
        expect(inline.findIndex((byte, index) => byte !== file[index])).toBe(-1)
      })
    )
)
