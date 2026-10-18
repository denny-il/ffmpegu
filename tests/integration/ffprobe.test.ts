import { it, expect } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import {
  Command,
  FFprobe,
  Input,
  Options,
  Output,
  probe,
  probeWith,
  run
} from "../../src/index.ts"
import { MediaLive, PlatformLive } from "../helpers/platform.ts"

it.live(
  "decodes real FFprobe metadata and preserves codec-specific fields",
  () =>
    Effect.gen(function* () {
      const result = yield* probe("./assets/video.mp4")
      expect(result.streams[0]).toMatchObject({
        codec_type: "video",
        codec_name: "h264",
        width: 640,
        height: 360
      })
      expect(result.format?.format_name).toContain("mov")
      const again = yield* probe("./assets/video.mp4")
      expect(again.streams).toEqual(result.streams)
    }).pipe(Effect.provide(MediaLive))
)

it.live(
  "preserves unary probe callbacks for arrays, Effect.forEach, and the service",
  () =>
    Effect.gen(function* () {
      const inputs = ["./assets/video.mp4", "./assets/video.mp4"]
      const sequential = yield* Effect.forEach(inputs, probe)
      const mapped = yield* Effect.all(inputs.map(probe))
      const service = yield* FFprobe.use((service) =>
        Effect.forEach(inputs, service.probe)
      )
      expect(mapped).toEqual(sequential)
      expect(service).toEqual(sequential)
      expect(sequential[0].streams[0]?.codec_name).toBe("h264")
    }).pipe(Effect.provide(MediaLive))
)

it.live(
  "stray values and missing option arguments cannot replace the probe input",
  () =>
    Effect.gen(function* () {
      const stray = yield* Effect.flip(
        probeWith(
          "./assets/video.mp4",
          Options.create("-show_format", "./assets/video.mp4")
        )
      )
      expect(stray).toMatchObject({ _tag: "ExitError", exitCode: 1 })
      const missing = yield* Effect.flip(
        probeWith("-filename.mp4", Options.create("-show_entries"))
      )
      expect(missing).toMatchObject({ _tag: "ExitError", exitCode: 1 })
      if (missing._tag === "ExitError")
        expect(missing.stderr).toContain("Missing argument")
    }).pipe(Effect.provide(MediaLive))
)

it.live("decodes unavailable timestamps with show_optional_fields always", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const raw = `${dir}/video.h264`
      yield* run(
        Command.make({
          inputs: [Input.fromFile("./assets/video.mp4")],
          outputs: [
            Output.toFile(
              raw,
              Options.create({ "c:v": "copy", frames: 1, f: "h264" })
            )
          ]
        })
      )
      const result = yield* probeWith(
        raw,
        Options.create({
          show_optional_fields: "always",
          show_entries: "stream=start_pts,duration_ts",
          v: "error"
        })
      )
      expect(result.streams).toEqual([{ start_pts: "N/A", duration_ts: "N/A" }])
    })
  ).pipe(Effect.provide(MediaLive))
)

it.live(
  "projects real metadata, omits stream indexes and unselected sections, and can run again",
  () =>
    Effect.gen(function* () {
      const options = Options.create({
        protocol_whitelist: "file",
        v: "quiet",
        select_streams: "v:0",
        show_entries: "stream=codec_name,width:format=duration"
      })
      const result = yield* probeWith("./assets/video.mp4", options)
      expect(result.streams).toEqual([{ codec_name: "h264", width: 640 }])
      expect(result.format).toEqual({ duration: expect.any(String) })
      expect(yield* probeWith("./assets/video.mp4", options)).toEqual(result)

      const formatOnly = yield* probeWith(
        "./assets/video.mp4",
        Options.create({ show_entries: "format=duration", v: "error" })
      )
      expect(formatOnly).toEqual({
        streams: [],
        format: { duration: expect.any(String) }
      })
      const empty = yield* probeWith(
        "./assets/video.mp4",
        Options.create({ v: "error" })
      )
      expect(empty).toEqual({ streams: [] })
    }).pipe(Effect.provide(MediaLive))
)

it.live("passes protocol restrictions to FFprobe", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      probeWith(
        "./assets/video.mp4",
        Options.create({
          protocol_whitelist: "http",
          v: "error",
          show_format: true
        })
      )
    )
    expect(error).toMatchObject({ _tag: "ExitError" })
    if (error._tag === "ExitError")
      expect(error.stderr).toContain("not on whitelist")
  }).pipe(Effect.provide(MediaLive))
)

it.live(
  "reports a missing FFprobe binary without an unhandled spawn error",
  () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(probe("unused"))
      expect(error).toMatchObject({ _tag: "SpawnError" })
    }).pipe(
      Effect.provide(FFprobe.layer({ binary: "/ffmpegu/missing-ffprobe" })),
      Effect.provide(PlatformLive)
    )
)

it.live(
  "reports invalid JSON and nonzero process exits as typed failures",
  () =>
    Effect.gen(function* () {
      const invalid = yield* Effect.flip(
        probe("unused").pipe(
          Effect.provide(FFprobe.layer({ binary: "/bin/echo" }))
        )
      )
      expect(invalid).toMatchObject({ _tag: "ProbeDecodeError" })
      const missing = yield* Effect.flip(probe("/ffmpegu/missing-media"))
      expect(missing).toMatchObject({ _tag: "ExitError" })
    }).pipe(Effect.provide(MediaLive))
)

it.live("bounds stdout from an unexpected probe executable", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const binary = `${dir}/noisy.mjs`
      yield* fs.writeFileString(
        binary,
        `#!${process.execPath}\nimport { writeSync } from 'node:fs'; writeSync(1, 'x'.repeat(100000));\n`
      )
      yield* fs.chmod(binary, 0o755)
      const error = yield* Effect.flip(
        probe("ignored").pipe(
          Effect.provide(FFprobe.layer({ binary, maxOutputBytes: 128 }))
        )
      )
      expect(error).toMatchObject({ _tag: "ProbeOutputError" })
    })
  ).pipe(Effect.provide(PlatformLive))
)
