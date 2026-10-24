# Recipes

Each recipe shows a command and the argv that `Command.toArgs` returns for it. Run it with `run(command)` and provide `FFmpeg` (and `FFprobe` where used). Imports: `import { Command, Input, Options, Output, filters, options, probe, probeWith, run, stream } from "ffmpegu"`, plus `Duration`, `Effect`, `FileSystem`, `Schema`, and `Stream` from `effect`.

## Transcode for the web

```ts
const input = Input.fromFile("in.mov")
Command.make({
  global: options.overwrite(),
  inputs: [input],
  outputs: [
    Output.toFile(
      "out.mp4",
      Options.create(
        { map: input.video.track(0) },
        { map: input.audio.track(0) },
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
// -y -i in.mov -map 0:v:0 -map 0:a:0 -vf scale=w=-2:h=720 -c:v libx264 -preset medium -crf 23
//   -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart out.mp4
```

## Cut a clip

```ts
// Stream copy: instant, but cuts on keyframes.
Command.make({
  global: options.overwrite(),
  inputs: [Input.fromFile("in.mp4", options.startTime(Duration.minutes(12)))],
  outputs: [Output.toFile("clip.mp4", Options.create(options.duration(45), options.copy()))]
})
// -y -ss 00:12:00.000 -i in.mp4 -t 45 -c copy clip.mp4
// For a frame-accurate cut, re-encode: replace options.copy() with options.videoCodec("libx264"), options.audioCodec("aac").
```

## Thumbnail, or one image per N seconds

```ts
Command.make({
  global: options.overwrite(),
  inputs: [Input.fromFile("in.mp4", options.startTime(5))],
  outputs: [Output.toFile("thumb.jpg", Options.create({ "frames:v": 1 }, { "q:v": 2 }))]
})
// -y -ss 5 -i in.mp4 -frames:v 1 -q:v 2 thumb.jpg

Command.make({
  inputs: [Input.fromFile("in.mp4")],
  outputs: [Output.toFile("frames/%04d.jpg", options.videoFilter(filters.chain(filters.fps({ fps: "1/10" }))))]
})
// -i in.mp4 -vf fps=fps=1/10 frames/%04d.jpg
```

## Replace audio

```ts
const video = Input.fromFile("video.mp4")
const audio = Input.fromFile("voiceover.wav")
Command.make({
  global: options.overwrite(),
  inputs: [video, audio],
  outputs: [
    Output.toFile(
      "out.mp4",
      Options.create(options.map(video.video), options.map(audio.audio), options.videoCopy(), options.audioCodec("aac"), options.shortest())
    )
  ]
})
// -y -i video.mp4 -i voiceover.wav -map 0:v -map 1:a -c:v copy -c:a aac -shortest out.mp4
```

## Concatenate clips (re-encoding)

Every clip needs the mapped video and audio tracks, the same dimensions and SAR, and compatible audio. Normalize mismatched clips first, for example with `scale`, `pad`, `setsar({ sar: 1 })`, and `aresample`.

```ts
const inputs = ["a.mp4", "b.mp4"].map((path) => Input.fromFile(path))
const [v, a] = [filters.label("v"), filters.label("a")]
const graph = filters.graph(
  filters.chain(
    filters.custom(
      "concat",
      { n: inputs.length, v: 1, a: 1 },
      inputs.flatMap((input) => [filters.label(input.video.track(0)), filters.label(input.audio.track(0))]),
      [v, a]
    )
  )
)
Command.make({
  global: options.overwrite(),
  inputs,
  outputs: [Output.toFile("joined.mp4", Options.create(options.filterComplex(graph), options.map(v), options.map(a)))]
})
// -y -i a.mp4 -i b.mp4 -filter_complex [0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[v][a] -map [v] -map [a] joined.mp4
```

## Burn in text

```ts
Command.make({
  inputs: [Input.fromFile("in.mp4")],
  outputs: [
    Output.toFile(
      "out.mp4",
      options.videoFilter(
        filters.chain(filters.drawtext({ text: "Draft: v2", fontsize: 32, fontcolor: "white", x: 20, y: 20, box: true, boxcolor: "black@0.5" }))
      )
    )
  ]
})
// -i in.mp4 -vf drawtext=text=Draft\\: v2:fontsize=32:fontcolor=white:x=20:y=20:box=1:boxcolor=black@0.5 out.mp4
// Escaping is automatic, so pass raw text. Add expansion: "none" if the text may contain %.
```

## Progress percentage

```ts
const transcode = (source: string, target: string) =>
  Effect.gen(function* () {
    const total = Number((yield* probe(source)).format?.duration)
    yield* run(
      Command.make({ global: options.overwrite(), inputs: [Input.fromFile(source)], outputs: [Output.toFile(target)] }),
      {
        onProgress: (p) =>
          p.outTime && total > 0
            ? Effect.logInfo(`${Math.min(100, (Duration.toSeconds(p.outTime) / total) * 100).toFixed(1)}%`)
            : Effect.void
      }
    )
  })
```

## In-memory conversion

```ts
// Stream<Uint8Array> in, Stream<Uint8Array> out. Errors and requirements of `upload` are preserved.
const toMp3 = <E, R>(upload: Stream.Stream<Uint8Array, E, R>) =>
  stream(
    Command.make({
      inputs: [Input.fromStream(upload)],
      outputs: [Output.toStream(Options.create(options.noVideo(), options.audioCodec("libmp3lame"), options.format("mp3")))]
    })
  )
// -i pipe:4 -vn -c:a libmp3lame -f mp3 pipe:5
```

## Write to a sink

```ts
const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  yield* run(
    Command.make({
      inputs: [Input.fromFile("in.mp4")],
      outputs: [
        Output.toSink(
          fs.sink("out.mp4"),
          Options.create(options.videoCodec("libx264"), options.format("mp4"), options.movFlags("frag_keyframe+empty_moov"))
        )
      ]
    })
  )
}) // needs FFmpeg and FileSystem
```

## Generate test media

```ts
Command.make({
  global: options.overwrite(),
  inputs: [
    Input.fromFile("testsrc2=size=640x360:rate=30:duration=2", options.format("lavfi")),
    Input.fromFile("sine=frequency=440:duration=2", options.format("lavfi"))
  ],
  outputs: [Output.toFile("test.mp4", Options.create(options.videoCodec("libx264"), options.pixelFormat("yuv420p"), options.audioCodec("aac")))]
})
// -y -f lavfi -i testsrc2=size=640x360:rate=30:duration=2 -f lavfi -i sine=frequency=440:duration=2
//   -c:v libx264 -pix_fmt yuv420p -c:a aac test.mp4
```

## Batch probe for durations

```ts
const Format = Schema.Struct({ format: Schema.Struct({ duration: Schema.NumberFromString }) })
const durations = (paths: ReadonlyArray<string>) =>
  Effect.forEach(
    paths,
    (path) => probeWith(path, Options.create({ show_entries: "format=duration", v: "error" }), Format).pipe(
      Effect.map((r) => r.format.duration),
      Effect.timeout("10 seconds")
    ),
    { concurrency: 4 }
  )
```

More: HLS and DASH are in [streaming.md](streaming.md), watermark overlays in [building.md](building.md#filters), GIFs in [video.md](video.md#idioms), and audio mixing and loudness in [audio.md](audio.md#idioms).
