# ffmpegu

Use the Effect-native ffmpegu API to build and run FFmpeg/FFprobe operations on Node.js or Bun, on Linux or macOS.

Install `ffmpegu`, `effect`, and the application platform package (`@effect/platform-node` or `@effect/platform-bun`). The supported Effect version is the tested 4.0 patch series; the minimum runtimes are Node.js 26.3 and Bun 1.4.3. FFmpeg/FFprobe binaries must be installed separately.

## Execution model

- Named exports: `Command`, `Input`, `Output`, `Options`, `FFmpeg`, `FFprobe`, `run`, `stream`, `probe`, `options`, `filters`.
- Pure builders also remain accessible through `ffmpegu.command`, `ffmpegu.input`, `ffmpegu.output`, `ffmpegu.options`, and `ffmpegu.filters`.
- `Command.make({ global?, inputs?, outputs? })`, `withInput`, `withOutput`, `withGlobal` preserve error and service types. Commands are pipeable; `Command.withInput`/`withOutput`/`withGlobal` are data-first or data-last: `command.pipe(Command.withOutput(output))`.
- `Input.fromFile(path, options?)`; `Input.fromStream(Stream<Uint8Array,E,R>, options?)`.
- `Output.toFile(path, options?)`; `Output.toSink(Sink<void,Uint8Array,never,E,R>, options?)`; `Output.toStream(options?)`.
- `run(command, { onProgress? })` returns an Effect requiring `FFmpeg`; callback returns an Effect too. It receives `Progress` with camelCase fields (`frame`, `fps`, `bitrate`, `totalSize`, `outTime` as a `Duration`, `dupFrames`, `dropFrames`, `speed`), `progress: "continue" | "end"`, and the original strings in `raw`.
- `stream(command, { onProgress? })` returns `Stream<Uint8Array>` of the command's single `Output.toStream` output; `run` rejects commands with one. Stopping consumption terminates FFmpeg.
- `Command<E, R, S>` counts `Output.toStream` outputs in `S` (`0`, `1`, `2` for two or more), so `run` (needs `0`) and `stream` (needs `1`) reject the wrong count at compile time. `Command<E, R>` annotations default `S` to unknown and defer the check to runtime.
- `probe(path)` returns an Effect requiring `FFprobe`, yielding the validated metadata object directly.
- Provide `FFmpeg.layer`/`FFprobe.layer` with the matching platform services; binary paths are Layer configuration.
- Application owns runtime execution. Use Effect fibers, interruption, and timeout for cancellation.
- Never introduce old Promise runners, AbortSignal options, FIFO transport, Node streams directly in commands, or `.json`/`.result` probe wrappers.

Each execution owns a scope and supervised process/stream resources. Successful output sinks consume EOF and finish writes. Nonzero exit is a typed failure. Caller errors retain identity; interruption and defects retain their semantics. Commands can run again only when their streams acquire fresh resources. Outputs are neither atomic nor idempotent; never add automatic retries.

File paths are passed to FFmpeg to retain seeking. Use Effect FileSystem for application-owned filesystem operations and adapters. Streaming output needs a pipe-compatible format; MP4 usually needs fragmented output flags. Raw descriptor paths conflict with engine ownership: use stream/sink constructors.

## Options API (`ffmpegu.options.*`)

### Core builders

- `custom(...args)` -- create options from strings `"-y"`, tuples `["-i", "file"]`, objects `{ "-c:v": "libx264" }`, or FFmpeguArgument instances
- `concat(source, ...args)` -- append args to existing options
- `merge(...options)` -- merge multiple option bundles

### Common helpers (all return FFmpeguOptions)

| Category        | Helpers                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Codecs          | `videoCodec(c)`, `audioCodec(c)`, `subtitleCodec(c)`, `copy()`, `videoCopy()`, `audioCopy()`, `subtitleCopy()` |
| Disable streams | `noVideo()`, `noAudio()`, `noSubtitle()`, `noData()`                                                           |
| Bitrates        | `videoBitrate(v, unit?)`, `audioBitrate(v, unit?)`, `minRate(v)`, `maxRate(v)`, `bufferSize(v)`                |
| Quality         | `crf(n)`, `preset(p)`, `tune(t)`, `profileVideo(p)`, `profileAudio(p)`, `level(l)`                             |
| Timing          | `startTime(t)`, `duration(t)`, `to(t)`                                                                         |
| Mapping         | `map(ref)`                                                                                                     |
| Filters         | `videoFilter(chain)`, `audioFilter(chain)`, `filterComplex(graph)`                                             |
| Frame           | `frameRate(n)`, `gop(n)`, `keyintMin(n)`, `bFrames(n)`, `refs(n)`, `pixelFormat(f)`, `size(s)`, `aspect(a)`    |
| Audio           | `audioChannels(n)`, `audioSampleRate(n)`, `audioSampleFormat(f)`, `audioQuality(q)`                            |
| Container       | `format(f)`, `movFlags(f)`, `metadata(k, v)`                                                                   |
| Streaming       | `hls({ time?, listSize?, flags? })`, `dash({ adaptationSets?, windowSize?, streaming? })`                      |
| Control         | `overwrite()`, `noOverwrite()`, `logLevel(l)`, `threads(n)`, `shortest()`                                      |

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

Time values for `startTime`/`duration`/`to` and for the `fps`/`atrim`/`afade` time fields: numbers are seconds; strings pass through; also time objects `{ hours?, minutes?, seconds?, milliseconds? }`, Effect `Duration` values (not `Duration.Input`), and `Temporal.Duration`. Durations keep microseconds. Infinite durations, durations beyond ±(2^63 − 1) µs, and Temporal years/months/weeks fail `compile()` with `CommandError` reason `InvalidArgument`.

All filter helpers accept an optional second argument `{ inputs?: label[], outputs?: label[] }` for filtergraph labeling.

## Example

```ts
import { Effect } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Command, FFmpeg, Input, Options, Output, run } from "ffmpegu"

const command = Command.make({
  inputs: [Input.fromFile("input.mp4")],
  outputs: [
    Output.toFile("output.mp4", Options.create({ "c:v": "libx264", crf: 23 }))
  ]
})
run(command).pipe(
  Effect.provide(FFmpeg.layer()),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
```

See `docs/ffmpegu/` for lifecycle and API contracts. Keep pure options/filter helpers for FFmpeg-specific composition. For binary flags/formats/codecs, consult the bundled references in `docs/ffmpeg/` and `docs/ffprobe/`.
