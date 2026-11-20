# Recipes

Each recipe is an Effect that needs `FFmpeg` and/or `FFprobe`; provide them as in [getting started](getting-started.md#composing-services). Inputs are files unless stated otherwise.

## Extract the audio track

```ts
import { Command, FFmpeg, Input, Options, Output } from "ffmpegu"

const input = Input.fromFile("talk.mp4")

export const extractAudio = FFmpeg.run(
  Command.make({
    global: Options.overwrite(),
    inputs: [input],
    outputs: [
      Output.toFile(
        "talk.mp3",
        Options.map(input.audio.track(0)),
        Options.audioCodec("libmp3lame"),
        Options.audioQuality(2)
      )
    ]
  })
)
```

## Grab a thumbnail

Seeking as an input option (`startTime` on the input) is fast because FFmpeg skips to the nearest keyframe before decoding.

```ts
import { Command, FFmpeg, Filter, Input, Options, Output } from "ffmpegu"

export const thumbnail = (video: string, at: number, target: string) =>
  FFmpeg.run(
    Command.make({
      global: Options.overwrite(),
      inputs: [Input.fromFile(video, Options.startTime(at))],
      outputs: [
        Output.toFile(
          target,
          Options.videoFilter(Filter.scale({ w: 320, h: -2 })),
          { "frames:v": 1 }
        )
      ]
    })
  )
```

## Cut a clip without re-encoding

Stream copy is instant but can only cut on keyframes; re-encode instead when the cut must be frame-accurate.

```ts
import { Duration } from "effect"
import { Command, FFmpeg, Input, Options, Output } from "ffmpegu"

export const clip = FFmpeg.run(
  Command.make({
    global: Options.overwrite(),
    inputs: [Input.fromFile("match.mp4", Options.startTime(Duration.minutes(12)))],
    outputs: [
      Output.toFile("highlight.mp4", Options.duration(Duration.seconds(45)), Options.copy())
    ]
  })
)
```

## Encode for the web

```ts
import { Command, FFmpeg, Filter, Input, Options, Output } from "ffmpegu"

export const webEncode = (source: string, target: string) =>
  FFmpeg.run(
    Command.make({
      global: Options.overwrite(),
      inputs: [Input.fromFile(source)],
      outputs: [
        Output.toFile(
          target,
          Options.videoFilter(Filter.scale({ w: -2, h: 720 })),
          Options.videoCodec("libx264"),
          Options.preset("medium"),
          Options.crf(23),
          Options.pixelFormat("yuv420p"),
          Options.audioCodec("aac"),
          Options.audioBitrate(128, "k"),
          Options.movFlags("+faststart")
        )
      ]
    })
  )
```

## Report progress as a percentage

Probe the duration first, then compare it with `outTime`:

```ts
import { Duration, Effect } from "effect"
import { Command, FFmpeg, FFprobe, Input, Options, Output } from "ffmpegu"

export const transcodeWithProgress = (source: string, target: string) =>
  Effect.gen(function* () {
    const metadata = yield* FFprobe.probe(source)
    const total = Number(metadata.format?.duration ?? Number.NaN)

    yield* FFmpeg.run(
      Command.make({
        global: Options.overwrite(),
        inputs: [Input.fromFile(source)],
        outputs: [Output.toFile(target, Options.videoCodec("libx264"))]
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
import { Command, FFmpeg, Input, Output } from "ffmpegu"

export const toOpus = <E, R>(upload: Stream.Stream<Uint8Array, E, R>) =>
  FFmpeg.stream(
    Command.make({
      inputs: [Input.fromStream(upload)],
      outputs: [
        Output.toStream({ vn: true, "c:a": "libopus", "b:a": "64k", f: "ogg" })
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
import { Command, FFmpeg, Input, Options, Output } from "ffmpegu"

const command = Command.make({
  global: Options.overwrite(),
  inputs: [Input.fromFile("movie.mp4")],
  outputs: [
    Output.toFile(
      "hls/index.m3u8",
      Options.videoCodec("libx264"),
      Options.gop(48),
      Options.audioCodec("aac"),
      Options.hls({
        hls_time: 4,
        hls_playlist_type: "vod",
        hls_segment_filename: "hls/segment_%03d.ts",
        hls_flags: ["independent_segments"]
      })
    )
  ]
})

export const hlsVod = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory("hls", { recursive: true })
  yield* FFmpeg.run(command)
})
```

## Concatenate clips

The `concat` filter joins clips, re-encoding as it goes. Every clip needs the mapped video and audio tracks, the same dimensions and sample aspect ratio, and compatible audio; normalize mismatched clips first with `scale`, `pad`, `setsar`, and `aresample`.

```ts
import { Command, FFmpeg, Filter, Input, Options, Output } from "ffmpegu"

export const concatenate = (paths: ReadonlyArray<string>, target: string) => {
  const inputs = paths.map((path) => Input.fromFile(path))
  const [video, audio] = [Filter.label("v"), Filter.label("a")]
  const graph = Filter.graph(
    Filter.make(
      "concat",
      { n: inputs.length, v: 1, a: 1 },
      {
        inputs: inputs.flatMap((input) => [input.video.track(0), input.audio.track(0)]),
        outputs: [video, audio]
      }
    )
  )

  return FFmpeg.run(
    Command.make({
      global: Options.overwrite(),
      inputs,
      outputs: [
        Output.toFile(
          target,
          Options.filterComplex(graph),
          Options.map(video),
          Options.map(audio)
        )
      ]
    })
  )
}
```

## Generate test media

`lavfi` inputs synthesize media, which is handy in tests:

```ts
import { Command, FFmpeg, Input, Options, Output } from "ffmpegu"

export const testClip = (target: string) =>
  FFmpeg.run(
    Command.make({
      global: Options.overwrite(),
      inputs: [
        Input.fromFile("testsrc2=size=640x360:rate=30:duration=2", Options.format("lavfi")),
        Input.fromFile("sine=frequency=440:duration=2", Options.format("lavfi"))
      ],
      outputs: [
        Output.toFile(
          target,
          Options.videoCodec("libx264"),
          Options.pixelFormat("yuv420p"),
          Options.audioCodec("aac")
        )
      ]
    })
  )
```

## Read the duration as a number

```ts
import { Schema } from "effect"
import { FFprobe } from "ffmpegu"

const Duration = Schema.Struct({
  format: Schema.Struct({ duration: Schema.NumberFromString })
})

export const durationSeconds = (path: string) =>
  FFprobe.probeWith(path, { show_entries: "format=duration", v: "error" }, Duration)
// Effect<{ readonly format: { readonly duration: number } }, ProbeError, FFprobe>
```
