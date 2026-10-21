import { expect, it } from "@effect/vitest"
import { Duration, Effect, FileSystem, Layer, Scope } from "effect"
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

it.live(
  "applies Effect and Temporal durations with microsecond precision",
  () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const source = `${dir}/source.pcm`
        const seeked = `${dir}/seeked.pcm`
        const trimmed = `${dir}/trimmed.pcm`
        // At 8 kHz one sample is 125 µs, so a sub-millisecond time value
        // that lost its microseconds would change the sample count.
        const pcm = Options.create({ f: "s16le", ar: 8000, ac: 1 })
        const firstSample = (bytes: Uint8Array) =>
          new DataView(bytes.buffer, bytes.byteOffset).getInt16(0, true) / 32768
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
                Options.create(pcm, options.startTime(Duration.seconds(1)))
              )
            ],
            outputs: [
              Output.toFile(
                seeked,
                Options.create(
                  pcm,
                  options.duration(
                    Temporal.Duration.from({
                      milliseconds: 500,
                      microseconds: 125
                    })
                  )
                )
              )
            ]
          })
        )
        yield* run(
          Command.make({
            inputs: [Input.fromFile(source, pcm)],
            outputs: [
              Output.toFile(
                trimmed,
                Options.create(
                  pcm,
                  options.audioFilter(
                    filters.chain(
                      filters.atrim({
                        start: Temporal.Duration.from({ milliseconds: 500 }),
                        duration: Duration.micros(250_125n)
                      })
                    )
                  )
                )
              )
            ]
          })
        )
        const seekedBytes = yield* fs.readFile(seeked)
        expect(seekedBytes.length).toBe(4001 * 2)
        expect(firstSample(seekedBytes)).toBeCloseTo(0.25, 3)
        const trimmedBytes = yield* fs.readFile(trimmed)
        expect(trimmedBytes.length).toBe(2001 * 2)
        expect(firstSample(trimmedBytes)).toBeCloseTo(0.125, 3)
      })
    )
)

it.live("seeks with time values beyond four hour digits", () =>
  live(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      // FFmpeg rejects five-digit HH:MM:SS hours as an invalid duration, so
      // these must render as seconds; seeking past the source leaves no audio.
      for (const [index, startTime] of [
        Duration.micros(9_007_199_254_740_993n),
        Temporal.Duration.from({ hours: 10_000, microseconds: 1 }),
        { hours: 10_000 }
      ].entries()) {
        const target = `${dir}/empty-${index}.pcm`
        yield* run(
          Command.make({
            inputs: [
              Input.fromFile(
                "anullsrc=d=0.001",
                Options.create(
                  options.format("lavfi"),
                  options.startTime(startTime)
                )
              )
            ],
            outputs: [Output.toFile(target, options.format("s16le"))]
          })
        )
        expect((yield* fs.readFile(target)).length).toBe(0)
      }
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

it.live("renders boolean filter options that FFmpeg can parse", () =>
  live(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      // repeatlast defaults to on, so only an explicit false shows the overlay ending.
      for (const [repeatlast, expected] of [
        [true, [255, 255, 255]],
        [false, [255, 0, 0]]
      ] as const) {
        const main = Input.fromFile(
          "color=black:size=2x2:rate=1:duration=3",
          options.format("lavfi")
        )
        const top = Input.fromFile(
          "color=white:size=2x2:rate=1:duration=1",
          options.format("lavfi")
        )
        const target = `${dir}/${repeatlast}.gray`
        yield* run(
          Command.make({
            inputs: [main, top],
            outputs: [
              Output.toFile(
                target,
                Options.create({
                  filter_complex: filters.overlay(
                    { repeatlast },
                    {
                      inputs: [
                        filters.label(main.video),
                        filters.label(top.video)
                      ]
                    }
                  ),
                  f: "rawvideo",
                  pix_fmt: "gray",
                  threads: 1
                })
              )
            ]
          })
        )
        const bytes = yield* fs.readFile(target)
        expect(
          Array.from({ length: 3 }, (_, frame) => bytes[frame * 4])
        ).toEqual(expected)
      }
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
        const style = {
          x: 10,
          y: 10,
          fontsize: 20,
          fontcolor: "white",
          // The box spans the text advance, so trailing whitespace shows up in pixels.
          box: true,
          boxcolor: "red"
        }
        // Boundary whitespace is trimmed by option parsing mid-filter and by
        // graph parsing at the end of a filter, so cover both positions.
        for (const { name, text, last } of [
          { name: "special", text: String.raw`a,b;[c]\\'d:ok`, last: false },
          { name: "mid", text: " \t padded \t ", last: false },
          { name: "end", text: " \t padded \t ", last: true }
        ]) {
          const textfile = `${dir}/${name}.txt`
          yield* fs.writeFileString(textfile, text)
          const render = (
            kind: string,
            value: { text: string } | { textfile: string }
          ) =>
            run(
              Command.make({
                inputs: [
                  Input.fromFile(
                    "color=black:size=480x64:duration=0.1",
                    options.format("lavfi")
                  )
                ],
                outputs: [
                  Output.toFile(
                    `${dir}/${name}-${kind}.rgb`,
                    Options.create({
                      vf: filters.drawtext(
                        last ? { ...style, ...value } : { ...value, ...style }
                      ),
                      "frames:v": 1,
                      f: "rawvideo",
                      pix_fmt: "rgb24",
                      threads: 1
                    })
                  )
                ]
              })
            )
          // The text file bypasses filter-value escaping and supplies a pixel oracle.
          yield* render("inline", { text })
          yield* render("file", { textfile })
          const inline = yield* fs.readFile(`${dir}/${name}-inline.rgb`)
          const file = yield* fs.readFile(`${dir}/${name}-file.rgb`)
          expect(file.some((byte) => byte !== 0)).toBe(true)
          expect(inline.length).toBe(file.length)
          expect(
            inline.findIndex((byte, offset) => byte !== file[offset])
          ).toBe(-1)
        }
      })
    )
)
