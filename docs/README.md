# ffmpegu Documentation

This folder contains API documentation for the `ffmpegu` package and references to FFmpeg docs bundled in this repository.

## ffmpegu API

- [Overview](ffmpegu/overview.md)
- [Options](ffmpegu/options.md)
- [Inputs & Outputs](ffmpegu/inputs-outputs.md)
- [Commands](ffmpegu/command.md)
- [Runners](ffmpegu/runners.md)
- [Filters](ffmpegu/filters.md)
- [FFprobe](ffmpegu/ffprobe.md)
- [Types](ffmpegu/types.md)

## Usage

This document shows how to build and run FFmpeg commands with `ffmpegu`.

### Quick start

```ts
import { ffmpegu } from "ffmpegu"

const command = ffmpegu.command({
  global: ffmpegu.options.custom("-y"),
  inputs: [ffmpegu.input.fromFile("./input.mp4")],
  outputs: [
    ffmpegu.output.toFile(
      "./output.mp4",
      ffmpegu.options.concat(
        ffmpegu.options.videoCodec("libx264"),
        ffmpegu.options.preset("fast"),
        ffmpegu.options.crf(23),
        ffmpegu.options.audioCodec("aac"),
        ffmpegu.options.audioBitrate("192k")
      )
    )
  ]
})

const runner = ffmpegu.createFFmpegRunner("ffmpeg")
await runner.validateBinary()

const result = await runner.run(command)
console.log(result.code)
```

### Options

`ffmpegu.options.custom(...)` builds FFmpeg arguments using a compact, type-safe syntax. Each argument can be:

- A string: `"-y"`
- A tuple: `["-i", "input.mp4"]`
- An object: `{ "-c:v": "libx264" }`
- An `FFmpeguArgumentable` (filters, stream references, etc.)

```ts
const opts = ffmpegu.options.concat(
  "-y",
  ["-i", "input.mp4"],
  { "-c:v": "libx264" },
  { "-movflags": "frag_keyframe+empty_moov" }
)
```

You can also compose options:

```ts
const base = ffmpegu.options.custom("-y")
const video = ffmpegu.options.concat(
  ffmpegu.options.videoCodec("libx264"),
  ffmpegu.options.crf(23)
)

const merged = ffmpegu.options.merge(base, video)
const extended = ffmpegu.options.concat(base, ffmpegu.options.preset("fast"))
```

Common option helpers are available under `ffmpegu.options.*` (e.g. `videoCodec`, `audioCodec`, `audioBitrate`, `crf`, `preset`).

There are also helpers for common routing/filtering flags:

```ts
ffmpegu.options.map(input.video)
ffmpegu.options.videoFilter(filterChain)
ffmpegu.options.audioFilter(audioChain)
ffmpegu.options.filterComplex(graph)
```

### Inputs and outputs

#### File inputs/outputs

```ts
const input = ffmpegu.input.fromFile("./input.mp4")
const output = ffmpegu.output.toFile("./output.mp4")
```

#### Stream inputs/outputs

```ts
import { createReadStream, createWriteStream } from "node:fs"

const inputStream = createReadStream("./input.mp4")
const input = ffmpegu.input.fromStream(
  inputStream,
  ffmpegu.options.custom(["-f", "mp4"])
)

const outputStream = createWriteStream("./output.mp4")
const output = ffmpegu.output.toStream(
  outputStream,
  ffmpegu.options.concat(
    ffmpegu.options.format("mp4"),
    ffmpegu.options.movFlags("frag_keyframe+empty_moov"),
    ffmpegu.options.copy()
  )
)
```

### Stream mapping

Use input stream references to build `-map` arguments:

```ts
const input1 = ffmpegu.input.fromFile("./video.mp4")
const input2 = ffmpegu.input.fromFile("./audio.mp3")

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.map(input1.video),
    ffmpegu.options.map(input2.audio.track(0)),
    ffmpegu.options.videoCodec("libx264"),
    ffmpegu.options.crf(23)
  )
)
```

Available references:

- `input.video`, `input.audio`, `input.subtitle`, `input.data`
- `input.video.track(0)`, `input.audio.track(1)`, etc.

### Filters

`ffmpegu.filters` builds filter chains or graphs that can be passed as arguments:

```ts
const scale = ffmpegu.filters.scale({ w: 640, h: 360 })
const fps = ffmpegu.filters.fps({ fps: 30 })

const filterChain = ffmpegu.filters.chain(scale, fps)

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.custom(["-vf", filterChain])
)
```

If you need multiple chains, use a graph:

```ts
const labelA = ffmpegu.filters.label("a")
const labelB = ffmpegu.filters.label("b")
const labelOut1 = ffmpegu.filters.label("out1")
const labelOut2 = ffmpegu.filters.label("out2")

const chain1 = ffmpegu.filters.chain(
  ffmpegu.filters.custom("split", { outputs: 2 }, [], [labelA, labelB])
)
const chain2 = ffmpegu.filters.chain(
  ffmpegu.filters.scale({ w: 640, h: 360 }, { inputs: [labelA], outputs: [labelOut1] })
)
const chain3 = ffmpegu.filters.chain(
  ffmpegu.filters.scale({ w: 320, h: 180 }, { inputs: [labelB], outputs: [labelOut2] })
)

const graph = ffmpegu.filters.graph(chain1, chain2, chain3)

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.filterComplex(graph),
    ffmpegu.options.map(labelOut1)
  )
)
```

You can also reference input streams in filtergraphs by wrapping stream refs in labels:

```ts
const input = ffmpegu.input.fromFile("./input.mp4")
const inputVideo = ffmpegu.filters.label(input.video)
const outLabel = ffmpegu.filters.label("scaled")

const graph = ffmpegu.filters.graph(
  ffmpegu.filters.chain(
    ffmpegu.filters.scale({ w: 320, h: 180 }, { inputs: [inputVideo], outputs: [outLabel] })
  )
)

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.filterComplex(graph),
    ffmpegu.options.map(outLabel)
  )
)
```

### Running commands

```ts
const command = ffmpegu.command({
  global: ffmpegu.options.custom("-y"),
  inputs: [input],
  outputs: [output]
})

const runner = ffmpegu.createFFmpegRunner("ffmpeg")
const result = await runner.run(command)

console.log(result.code)
console.log(result.args)
console.log(result.stdout)
console.log(result.stderr)
```

#### Binary validation

```ts
await runner.validateBinary()
```

### FFprobe (JSON)

```ts
const probe = ffmpegu.probe.fromFile("./input.mp4")
const probeRunner = ffmpegu.createFFprobeRunner("ffprobe")

const result = await probeRunner.run(probe)
console.log(result.json)
```

## Notes

- Commands are **single-use**. Create a new command instance for each run.
- When using streams, ensure you pass appropriate container options (e.g. `-f mp4`).
- Make sure FFmpeg is installed and available on your system path.
