# Recipes

Each recipe is an Effect that needs `FFmpeg` and/or `FFprobe`; provide them as in [getting started](getting-started.md#composing-services). Inputs are files unless stated otherwise.

## Extract the audio track

```ts
import { Command, Input, Output, Options, options, run } from "ffmpegu"

const input = Input.fromFile("talk.mp4")

export const extractAudio = run(
  Command.make({
    global: options.overwrite(),
    inputs: [input],
    outputs: [
      Output.toFile(
        "talk.mp3",
        Options.create(
          options.map(input.audio.track(0)),
          options.audioCodec("libmp3lame"),
          options.audioQuality(2)
        )
      )
    ]
  })
)
```

## Grab a thumbnail

Seeking as an input option (`startTime` on the input) is fast because FFmpeg skips to the nearest keyframe before decoding.

```ts
import { Command, Input, Output, Options, filters, options, run } from "ffmpegu"

export const thumbnail = (video: string, at: number, target: string) =>
  run(
    Command.make({
      global: options.overwrite(),
      inputs: [Input.fromFile(video, options.startTime(at))],
      outputs: [
        Output.toFile(
          target,
          Options.create(
            options.videoFilter(filters.chain(filters.scale({ w: 320, h: -2 }))),
            { "frames:v": 1 }
          )
        )
      ]
    })
  )
```

## Cut a clip without re-encoding

Stream copy is instant but can only cut on keyframes; re-encode instead when the cut must be frame-accurate.

```ts
import { Duration } from "effect"
import { Command, Input, Output, Options, options, run } from "ffmpegu"

export const clip = run(
  Command.make({
    global: options.overwrite(),
    inputs: [Input.fromFile("match.mp4", options.startTime(Duration.minutes(12)))],
    outputs: [
      Output.toFile(
        "highlight.mp4",
        Options.create(options.duration(Duration.seconds(45)), options.copy())
      )
    ]
  })
)
```

## Encode for the web

```ts
import { Command, Input, Output, Options, filters, options, run } from "ffmpegu"

export const webEncode = (source: string, target: string) =>
  run(
    Command.make({
      global: options.overwrite(),
      inputs: [Input.fromFile(source)],
      outputs: [
        Output.toFile(
          target,
          Options.create(
            options.videoFilter(filters.chain(filters.scale({ w: -2, h: 720 }))),
            options.videoCodec("libx264"),
            options.preset("medium"),
            options.crf(23),
            options.pixelFormat("yuv420p"),
            options.audioCodec("aac"),
            options.audioBitrate(128, "k"),
            options.movFlags("+faststart")
          )
        )
      ]
    })
  )
```

## Report progress as a percentage

Probe the duration first, then compare it with `outTime`:

```ts
import { Duration, Effect } from "effect"
import { Command, Input, Output, options, probe, run } from "ffmpegu"

export const transcodeWithProgress = (source: string, target: string) =>
  Effect.gen(function* () {
    const metadata = yield* probe(source)
    const total = Number(metadata.format?.duration ?? Number.NaN)

    yield* run(
      Command.make({
        global: options.overwrite(),
        inputs: [Input.fromFile(source)],
        outputs: [Output.toFile(target, options.videoCodec("libx264"))]
      }),
      {
        onProgress: (progress) => {
          if (progress.outTime === undefined || !(total > 0)) return Effect.void
          const percent = Math.min(100, (Duration.toSeconds(progress.outTime) / total) * 100)
          return Effect.logInfo(`${percent.toFixed(1)}%`)
        }
      }
    )
  })
```

## Transcode bytes in memory

Feed an Effect `Stream` in and read the result as a `Stream`, for example to convert an upload and send it on without touching disk:

```ts
import { Stream } from "effect"
import { Command, Input, Options, Output, stream } from "ffmpegu"

export const toOpus = <E, R>(upload: Stream.Stream<Uint8Array, E, R>) =>
  stream(
    Command.make({
      inputs: [Input.fromStream(upload)],
      outputs: [
        Output.toStream(Options.create({ vn: true, "c:a": "libopus", "b:a": "64k", f: "ogg" }))
      ]
    })
  )
// Stream<Uint8Array, FFmpegError | E, FFmpeg | R>
```

The input format is probed from the bytes here. Raw formats need an explicit `f` (plus parameters such as `ar` and `ac`) as input options. Containers that need seeking, such as MP4 with its index at the end, cannot be read from a pipe even with `f` set: write them to a temporary file and use `Input.fromFile`.

## Package HLS for video on demand

FFmpeg does not create output directories, so create `hls/` first. This program needs `FileSystem` as well as `FFmpeg`.

```ts
import { Effect, FileSystem } from "effect"
import { Command, Input, Output, Options, options, run } from "ffmpegu"

const command = Command.make({
  global: options.overwrite(),
  inputs: [Input.fromFile("movie.mp4")],
  outputs: [
    Output.toFile(
      "hls/index.m3u8",
      Options.create(
        options.videoCodec("libx264"),
        options.gop(48),
        options.audioCodec("aac"),
        options.hls({
          hls_time: 4,
          hls_playlist_type: "vod",
          hls_segment_filename: "hls/segment_%03d.ts",
          hls_flags: ["independent_segments"]
        })
      )
    )
  ]
})

export const hlsVod = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory("hls", { recursive: true })
  yield* run(command)
})
```

## Concatenate clips

The `concat` filter joins clips, re-encoding as it goes. Every clip needs the mapped video and audio tracks, the same dimensions and sample aspect ratio, and compatible audio; normalize mismatched clips first with `scale`, `pad`, `setsar`, and `aresample`.

```ts
import { Command, Input, Output, Options, filters, options, run } from "ffmpegu"

export const concatenate = (paths: ReadonlyArray<string>, target: string) => {
  const inputs = paths.map((path) => Input.fromFile(path))
  const [video, audio] = [filters.label("v"), filters.label("a")]
  const graph = filters.graph(
    filters.chain(
      filters.custom(
        "concat",
        { n: inputs.length, v: 1, a: 1 },
        inputs.flatMap((input) => [
          filters.label(input.video.track(0)),
          filters.label(input.audio.track(0))
        ]),
        [video, audio]
      )
    )
  )

  return run(
    Command.make({
      global: options.overwrite(),
      inputs,
      outputs: [
        Output.toFile(
          target,
          Options.create(options.filterComplex(graph), options.map(video), options.map(audio))
        )
      ]
    })
  )
}
```

## Generate test media

`lavfi` inputs synthesize media, which is handy in tests:

```ts
import { Command, Input, Output, Options, options, run } from "ffmpegu"

export const testClip = (target: string) =>
  run(
    Command.make({
      global: options.overwrite(),
      inputs: [
        Input.fromFile("testsrc2=size=640x360:rate=30:duration=2", options.format("lavfi")),
        Input.fromFile("sine=frequency=440:duration=2", options.format("lavfi"))
      ],
      outputs: [
        Output.toFile(
          target,
          Options.create(options.videoCodec("libx264"), options.pixelFormat("yuv420p"), options.audioCodec("aac"))
        )
      ]
    })
  )
```

## Read the duration as a number

```ts
import { Schema } from "effect"
import { Options, probeWith } from "ffmpegu"

const Duration = Schema.Struct({
  format: Schema.Struct({ duration: Schema.NumberFromString })
})

export const durationSeconds = (path: string) =>
  probeWith(path, Options.create({ show_entries: "format=duration", v: "error" }), Duration)
// Effect<{ readonly format: { readonly duration: number } }, ProbeError, FFprobe>
```
