# Configuration and testing

## Layer options

`FFmpeg.layer(options?)` and `FFprobe.layer(options?)` build the live services. Both require Effect's `ChildProcessSpawner`, which `NodeServices.layer` and `BunServices.layer` provide.

| Option            | Services | Default                  | Meaning                                                          |
| ----------------- | -------- | ------------------------ | ---------------------------------------------------------------- |
| `binary`          | both     | `"ffmpeg"` / `"ffprobe"` | Executable name (resolved on `PATH`) or path.                    |
| `forceKillAfter`  | both     | `"5 seconds"`            | Grace period between SIGTERM and SIGKILL when a run is stopped.  |
| `stderrTailBytes` | both     | `"64 KiB"`               | How much stderr to keep for `RunResult` and `ExitError`.         |
| `maxOutputBytes`  | FFprobe  | `"16 MiB"`               | Largest accepted JSON output.                                    |

```ts
import { Layer } from "effect"
import { FFmpeg, FFprobe } from "ffmpegu"

const MediaLive = Layer.mergeAll(
  FFmpeg.layer({ binary: "/opt/ffmpeg/bin/ffmpeg", forceKillAfter: "2 seconds" }),
  FFprobe.layer({ binary: "/opt/ffmpeg/bin/ffprobe", maxOutputBytes: "4 MiB" })
)
```

- **Durations** (`forceKillAfter`) are any `Duration.Input`, such as `"2 seconds"` or `Duration.seconds(2)`. `0` sends SIGKILL right after SIGTERM, and `"Infinity"` never escalates. Negative and NaN values are rejected. Duration objects and tuples must have non-negative parts and total at most about 104 days; use a string such as `"200 days"` for longer.
- **Byte sizes** (`stderrTailBytes`, `maxOutputBytes`) are a non-negative integer count or a size string: `"64 KiB"` (binary units) or `"64 kB"` (decimal units). Stderr is always drained, even with a zero-byte tail; pass FFmpeg's `-v quiet` to silence it at the source.
- Invalid options passed to `layer` are defects. No process starts until an execution Effect runs.

## Configuration from the environment

`layerConfig` reads the same options from Effect `Config`, either as a `Config` per option or as a single `Config` of all options:

```ts
import { Config } from "effect"
import { FFmpeg, FFprobe } from "ffmpegu"

const FFmpegLive = FFmpeg.layerConfig({
  binary: Config.String("FFMPEG_PATH").pipe(Config.withDefault("ffmpeg")),
  forceKillAfter: Config.Duration("FFMPEG_KILL_AFTER").pipe(Config.withDefault("5 seconds")),
  stderrTailBytes: Config.ByteSize("FFMPEG_STDERR_TAIL").pipe(Config.withDefault("64 KiB"))
})

const FFprobeLive = FFprobe.layerConfig({
  binary: Config.String("FFPROBE_PATH").pipe(Config.withDefault("ffprobe"))
})
```

A field left out, or set to `undefined`, keeps its default, so fields can be set conditionally. `Config.ByteSize` reads the same size strings as the options, and `Config.Int` reads plain counts. Missing or invalid values fail Layer construction with a `ConfigError` naming the option.

## Testing

Choose the seam that matches what you are testing.

### Commands

`compile()` and `Command.toArgs` are pure, so command construction can be asserted without FFmpeg:

```ts
import { expect, it } from "@effect/vitest"
import { Result } from "effect"
import { Command, Input, Output, options } from "ffmpegu"

it("maps only the video stream", () => {
  const input = Input.fromFile("in.mp4")
  const command = Command.make({
    inputs: [input],
    outputs: [Output.toFile("out.mp4", options.map(input.video))]
  })
  expect(Result.getOrThrow(Command.toArgs(command))).toEqual([
    "-i", "in.mp4", "-map", "0:v", "out.mp4"
  ])
})
```

### Code that uses the services

Replace the services with `Layer.mock`. It takes a partial implementation; members left out die with an "unimplemented" defect when called. Callers of `run` and `stream` keep their command's error and requirement types, so the mock does not need to be generic.

```ts
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { FFmpeg, FFprobe, probe } from "ffmpegu"

const FFmpegTest = Layer.mock(FFmpeg, {
  run: () => Effect.succeed({ args: [], stderr: "" })
})

const FFprobeTest = Layer.mock(FFprobe, {
  probe: () => Effect.succeed({ streams: [{ index: 0, codec_type: "audio" }] })
})

it.effect("reads the stream count", () =>
  Effect.gen(function* () {
    const metadata = yield* probe("song.mp3")
    expect(metadata.streams).toHaveLength(1)
  }).pipe(Effect.provide(Layer.merge(FFmpegTest, FFprobeTest)))
)
```

`probeWith` with a schema calls the service's `probeJson`, which returns FFprobe's raw JSON as `unknown`; the library then decodes it with your schema. Mock `probeJson` for those calls, and note that a fixture that does not match the schema fails with `ProbeDecodeError`.

### Process behavior

To exercise the real services without real binaries, provide `FFmpeg.layer()` with a fake `ChildProcessSpawner` from `effect/process` and test with `it.effect`. For tests against real FFmpeg, use `it.live` so process shutdown and platform timers advance normally.

`Input.fromFile` and `Output.toFile` are opened by FFmpeg itself, so a fake `FileSystem` does not intercept them.
