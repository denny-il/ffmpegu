# ffmpegu

Build FFmpeg commands using the `ffmpegu` TypeScript library.
TRIGGER when: code imports `ffmpegu`, user asks to build/run FFmpeg commands programmatically, transcode video/audio, probe media files, or use ffmpegu API.
DO NOT TRIGGER when: user asks about raw FFmpeg CLI usage without the library, or general video/audio questions unrelated to code.

## About ffmpegu

`ffmpegu` is a typed, composable FFmpeg command builder and runner for JavaScript backend runtimes (Node.js, Bun, Deno). It provides a fluent, type-safe API for constructing and executing FFmpeg/FFprobe commands.

Install: `pnpm add ffmpegu`

Requirements: macOS or Linux, FFmpeg/FFprobe installed on PATH (or pass binary path to runner).

## Core API

Everything is accessed through the `ffmpegu` namespace:

```ts
import { ffmpegu } from "ffmpegu"
```

### Commands

`ffmpegu.command({ global?, inputs?, outputs? })` creates an FFmpeg command. Commands are **single-use** -- create a new instance for each run.

### Inputs

- `ffmpegu.input.fromFile(path, options?)` -- file input
- `ffmpegu.input.fromStream(readable, options?)` -- stream input (uses named pipes)

Stream references for mapping:
- `input.video`, `input.audio`, `input.subtitle`, `input.data`
- `input.video.track(n)`, `input.audio.track(n)`

### Outputs

- `ffmpegu.output.toFile(path, options?)` -- file output
- `ffmpegu.output.toStream(writable, options?)` -- stream output (uses named pipes)

### Runners

- `ffmpegu.createFFmpegRunner(binPath?)` -- create FFmpeg runner (default: "ffmpeg")
- `ffmpegu.runner` -- default FFmpeg runner
- `ffmpegu.createFFprobeRunner(binPath?)` -- create FFprobe runner (default: "ffprobe")
- `ffmpegu.probeRunner` -- default FFprobe runner
- `runner.validateBinary()` -- check binary exists
- `runner.run(command)` -- returns `{ code, args, stdout, stderr }`
- `runner.run(command, { onProgress })` -- emits parsed FFmpeg progress snapshots while running
- `runner.run(command, { signal })` -- accepts an `AbortSignal` to cancel a running command

### FFprobe

- `ffmpegu.probe.fromFile(path)` -- create probe command
- Probe runner returns `{ code, args, stdout, stderr, json }` with typed JSON

## Options API (`ffmpegu.options.*`)

### Core builders

- `custom(...args)` -- create options from strings `"-y"`, tuples `["-i", "file"]`, objects `{ "-c:v": "libx264" }`, or FFmpeguArgument instances
- `concat(source, ...args)` -- append args to existing options
- `merge(...options)` -- merge multiple option bundles

### Common helpers (all return FFmpeguOptions)

| Category | Helpers |
|---|---|
| Codecs | `videoCodec(c)`, `audioCodec(c)`, `subtitleCodec(c)`, `copy()`, `videoCopy()`, `audioCopy()`, `subtitleCopy()` |
| Disable streams | `noVideo()`, `noAudio()`, `noSubtitle()`, `noData()` |
| Bitrates | `videoBitrate(v, unit?)`, `audioBitrate(v, unit?)`, `minRate(v)`, `maxRate(v)`, `bufferSize(v)` |
| Quality | `crf(n)`, `preset(p)`, `tune(t)`, `profileVideo(p)`, `profileAudio(p)`, `level(l)` |
| Timing | `startTime(t)`, `duration(t)`, `to(t)` |
| Mapping | `map(ref)` |
| Filters | `videoFilter(chain)`, `audioFilter(chain)`, `filterComplex(graph)` |
| Frame | `frameRate(n)`, `gop(n)`, `keyintMin(n)`, `bFrames(n)`, `refs(n)`, `pixelFormat(f)`, `size(s)`, `aspect(a)` |
| Audio | `audioChannels(n)`, `audioSampleRate(n)`, `audioSampleFormat(f)`, `audioQuality(q)` |
| Container | `format(f)`, `movFlags(f)`, `metadata(k, v)` |
| Streaming | `hls({ time?, listSize?, flags? })`, `dash({ adaptationSets?, windowSize?, streaming? })` |
| Control | `overwrite()`, `noOverwrite()`, `logLevel(l)`, `threads(n)`, `shortest()` |

## Filters API (`ffmpegu.filters.*`)

### Core builders

- `custom(name, options?, inputs?, outputs?)` -- arbitrary filter
- `label(value)` -- create `[label]` reference (accepts string or input stream ref)
- `chain(...filters)` -- comma-separated filter chain (for `-vf`/`-af`)
- `graph(...chains)` -- semicolon-separated filtergraph (for `-filter_complex`)
- `builder()` -- programmatic filter builder

### Typed filter helpers

**Video:** `scale({ w, h })`, `fps({ fps })`, `crop(opts)`, `pad(opts)`, `format(opts)`, `setsar(opts)`, `setdar(opts)`, `transpose(opts)`, `hflip()`, `vflip()`, `overlay(opts)`, `drawtext(opts)`, `select(opts)`, `setpts(opts)`

**Audio:** `volume(opts)`, `atempo(opts)`, `aresample(opts)`, `atrim(opts)`, `asetpts(opts)`, `afade(opts)`, `highpass(opts)`, `lowpass(opts)`, `aformat(opts)`

All filter helpers accept an optional second argument `{ inputs?: label[], outputs?: label[] }` for filtergraph labeling.

### Exported types

- `FFmpeguFFmpegProgress`, `FFmpeguFFmpegRunOptions`
- `FFmpeguFFprobeJson`, `FFmpeguFFprobeFormat`, `FFmpeguFFprobeStream`
- `FFmpeguOptions`, `FFmpeguFilterBuilder`, `FFmpeguFilterChain`, `FFmpeguFilterGraph`, `FFmpeguSimpleFilter`, `FFmpeguFilterLabelRef`

## Patterns and Examples

### Basic transcode

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
```

### Progress updates

```ts
const result = await ffmpegu.createFFmpegRunner("ffmpeg").run(command, {
  onProgress(progress) {
    console.log(progress.progress)
    console.log(progress.frame)
    console.log(progress.out_time)
    console.log(progress.speed)
  }
})
```

### Disable audio/video/subtitles/data

```ts
const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.videoCodec("libx264"),
    ffmpegu.options.noAudio()
  )
)
```

### Cancellation

```ts
const controller = new AbortController()

const result = ffmpegu.createFFmpegRunner("ffmpeg").run(command, {
  signal: controller.signal
})

controller.abort()
await result
```

### Stream mapping (merge video + audio from different sources)

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

const command = ffmpegu.command({
  global: ffmpegu.options.custom("-y"),
  inputs: [input1, input2],
  outputs: [output]
})
```

### Simple filter chain (-vf)

```ts
const filterChain = ffmpegu.filters.chain(
  ffmpegu.filters.scale({ w: 640, h: 360 }),
  ffmpegu.filters.fps({ fps: 30 })
)

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.videoFilter(filterChain),
    ffmpegu.options.videoCodec("libx264")
  )
)
```

### Complex filtergraph with labels (-filter_complex)

```ts
const labelA = ffmpegu.filters.label("a")
const labelB = ffmpegu.filters.label("b")
const out1 = ffmpegu.filters.label("out1")
const out2 = ffmpegu.filters.label("out2")

const graph = ffmpegu.filters.graph(
  ffmpegu.filters.chain(
    ffmpegu.filters.custom("split", { outputs: 2 }, [], [labelA, labelB])
  ),
  ffmpegu.filters.chain(
    ffmpegu.filters.scale({ w: 640, h: 360 }, { inputs: [labelA], outputs: [out1] })
  ),
  ffmpegu.filters.chain(
    ffmpegu.filters.scale({ w: 320, h: 180 }, { inputs: [labelB], outputs: [out2] })
  )
)

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.filterComplex(graph),
    ffmpegu.options.map(out1)
  )
)
```

### Input stream labels in filtergraphs

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

### Stream I/O via named pipes

```ts
import { createReadStream, createWriteStream } from "node:fs"

const input = ffmpegu.input.fromStream(
  createReadStream("./input.mp4"),
  ffmpegu.options.custom(["-f", "mp4"])
)

const output = ffmpegu.output.toStream(
  createWriteStream("./output.mp4"),
  ffmpegu.options.concat(
    ffmpegu.options.format("mp4"),
    ffmpegu.options.movFlags("frag_keyframe+empty_moov"),
    ffmpegu.options.copy()
  )
)

const command = ffmpegu.command({
  global: ffmpegu.options.custom("-y"),
  inputs: [input],
  outputs: [output]
})

await ffmpegu.createFFmpegRunner("ffmpeg").run(command)
```

### Multiple stream inputs

```ts
import { createReadStream } from "node:fs"

const videoInput = ffmpegu.input.fromStream(
  createReadStream("./video.mp4"),
  ffmpegu.options.custom(["-f", "mp4"])
)
const audioInput = ffmpegu.input.fromStream(
  createReadStream("./audio.mp3"),
  ffmpegu.options.custom(["-f", "mp3"])
)

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.map(videoInput.video),
    ffmpegu.options.map(audioInput.audio),
    ffmpegu.options.videoCodec("libx264"),
    ffmpegu.options.audioCodec("aac")
  )
)

const command = ffmpegu.command({
  global: ffmpegu.options.custom("-y"),
  inputs: [videoInput, audioInput],
  outputs: [output]
})
```

### FFprobe

```ts
const probe = ffmpegu.probe.fromFile("./input.mp4")
const runner = ffmpegu.createFFprobeRunner("ffprobe")
const result = await runner.run(probe)
console.log(result.json) // typed as FFmpeguFFprobeJson
```

### Composing options

```ts
const base = ffmpegu.options.custom("-y")
const video = ffmpegu.options.concat(
  ffmpegu.options.videoCodec("libx264"),
  ffmpegu.options.crf(23)
)
const merged = ffmpegu.options.merge(base, video)
const extended = ffmpegu.options.concat(base, ffmpegu.options.preset("fast"))
```

### HLS output

```ts
const output = ffmpegu.output.toFile(
  "./output.m3u8",
  ffmpegu.options.concat(
    ffmpegu.options.videoCodec("libx264"),
    ffmpegu.options.audioCodec("aac"),
    ffmpegu.options.hls({ time: 4, listSize: 0, flags: "delete_segments" })
  )
)
```

## Key rules

- Commands are **single-use**. Create a new `ffmpegu.command()` for each run.
- When using stream I/O, always specify container format (e.g. `format("mp4")`).
- For streamable MP4 output to streams, use `movFlags("frag_keyframe+empty_moov")`.
- Use `options.concat()` to build up option chains; use `options.merge()` to combine independent option bundles.
- Filter helpers accept typed option objects; use `custom()` for filters not covered by helpers.
- Stream references (`input.video`, `input.audio`) resolve to proper indices at compile time.
- Named pipes are created during command compilation and cleaned up afterward.

## Reference docs

For FFmpeg-specific questions (codecs, filter parameters, protocols, formats), consult the bundled reference docs in `docs/ffmpeg/`, `docs/ffplay/`, and `docs/ffprobe/`.
