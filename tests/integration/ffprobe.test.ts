import { it, expect } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import { FFprobe, probe } from "../../src/index.ts"
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
