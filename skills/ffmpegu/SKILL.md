---
name: ffmpegu
description: Build and run FFmpeg and FFprobe operations in TypeScript with the Effect-native ffmpegu library (Effect v4, Node.js or Bun). Use when writing, reviewing, or debugging code that imports "ffmpegu", or when adding video/audio transcoding, thumbnails, clipping, HLS/DASH packaging, media probing, or byte-stream media conversion to an Effect application.
---

# ffmpegu

ffmpegu describes FFmpeg commands as immutable values and executes them through the `FFmpeg` and `FFprobe` Effect services. Requirements: Effect 4.x, Node.js 26.3+ or Bun 1.4.3+, Linux or macOS, and `ffmpeg`/`ffprobe` installed separately.

## Workflow

1. **Describe** the invocation with `Input`, `Output`, `Options.*`, `Filter.*`, and `Command.make`. Builders are pure.
2. **Check** the argv when unsure: `command.toArgs()` returns `Result<ReadonlyArray<string>, CommandError>` without spawning anything. Use it in unit tests.
3. **Execute** with `FFmpeg.run(command)` (an `Effect`) or `FFmpeg.stream(command)` (a `Stream`), and `FFprobe.probe`/`FFprobe.probeWith` for metadata.
4. **Provide** `FFmpeg.layer()` / `FFprobe.layer()` plus the platform layer (`NodeServices.layer` or `BunServices.layer`) at the application edge. Never start a runtime inside library code.

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Command, FFmpeg, FFprobe, Input, Options, Output } from "ffmpegu"

const input = Input.fromFile("input.mov")
const command = Command.make({
  global: Options.overwrite(),
  inputs: [input],
  outputs: [
    Output.toFile(
      "output.mp4",
      { map: input.video },
      { map: input.audio },
      Options.videoCodec("libx264"),
      Options.crf(23),
      Options.audioCodec("aac")
    )
  ]
})

const program = Effect.gen(function* () {
  yield* FFmpeg.run(command, {
    onProgress: (p) => Effect.logDebug("encoding", { frame: p.frame, speed: p.speed })
  })
  const metadata = yield* FFprobe.probe("output.mp4")
  return metadata.format?.duration
})

const MediaLive = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(
  Layer.provide(NodeServices.layer)
)
program.pipe(Effect.provide(MediaLive), NodeRuntime.runMain)
```

## API shape

- **Imports.** Use named exports: `Command`, `Input`, `Output`, `Options` (bundles and option helpers), `Filter` (filters, chains, graphs, labels), `Time` (time value adapters), `FFmpeg`, `FFprobe`, plus the error classes. Runners are statics: `FFmpeg.run`, `FFmpeg.stream`, `FFprobe.probe`, `FFprobe.probeWith`. There is no default export, and the lowercase `options`/`filters`/`time` namespaces, `Options.create`, and bare `run`/`probe` of 0.5 and earlier are gone.
- **Inputs and outputs.** `Input.fromFile(pathOrUrl, ...inputOptions)` and `Input.fromStream(stream, ...inputOptions)`; `Output.toFile(path, ...outputOptions)`, `Output.toSink(sink, ...outputOptions)`, and `Output.toStream(...outputOptions)`. Options are passed directly, in any mix of forms: `Output.toFile("out.mp4", Options.videoCodec("libx264"), { crf: 23 })`. Seek fast with `Input.fromFile(path, Options.startTime(t))`.
- **Stream references.** `input.video`, `input.audio`, `input.subtitle`, `input.data`, and `.track(n)` replace hand-written `0:v` specifiers in `map` and filter labels.
- **Options.** Forms are verbatim strings, tuples, records, and bundles: `"-y"`, `["c:v", "libx264"]`, `{ crf: 23, map: input.audio }`, `Options.preset("slow")`. `Options.make(...forms)` names a reusable bundle; bundles nest, and nesting only appends, so later options don't replace earlier ones. Codec, format, and preset parameters accept any string FFmpeg accepts.
- **HLS and DASH.** `Options.hls({...})` / `Options.dash({...})` take FFmpeg's own muxer option names (`hls_time`, `hls_playlist_type`, `seg_duration`, `use_template`, …) and pass unknown keys through. Booleans render `1`/`0`, arrays join with `+`, and durations on the known duration keys render as seconds.
- **Time values.** `startTime`/`duration`/`to` and known time keys accept numbers (seconds), strings, time objects, `Duration`, and `Temporal.Duration`. Elsewhere, use `Time.seconds(d)` or `Time.timestamp(d)`; ffmpegu never converts a time value on a key it does not know.
- **Filters.** `Options.videoFilter(...filters)` and `Options.audioFilter(...filters)` take one filter or several as a chain, and `Filter.graph(...)` goes in `Options.filterComplex`. Label pads with `{ inputs, outputs }`: inputs take names or stream references directly, outputs take names; use `Filter.label` for a label you also `map`, and `Filter.make(name, options?, labels?)` for any filter without a helper. Values are escaped automatically.
- **Execution.** `FFmpeg.run(command, { onProgress })` returns `Effect<RunResult>`, `FFmpeg.stream(command)` returns `Stream<Uint8Array>`, `FFprobe.probe(input)` returns `Effect<ProbeResult>`, and `FFprobe.probeWith(input, options, schema?)` returns an `Effect` of a projected result or the schema's type.

## References

These files sit next to this one and are self-contained. Read the ones the task needs:

| Read | When |
| --- | --- |
| [references/building.md](references/building.md) | Writing or reviewing any command, option bundle, filter graph, or time value |
| [references/video.md](references/video.md) | Video codecs, rate control, scaling, cropping, overlays, text, frame extraction |
| [references/audio.md](references/audio.md) | Audio codecs, raw PCM, resampling, volume, trimming, fades, mixing |
| [references/streaming.md](references/streaming.md) | HLS, DASH, fragmented MP4, or any `Input.fromStream`, `toSink`, or `toStream` |
| [references/running.md](references/running.md) | `FFmpeg.run` and `FFmpeg.stream` semantics, progress, cancellation, layers, configuration, tracing, testing |
| [references/probe.md](references/probe.md) | Reading metadata, `FFprobe.probeWith` selections, decoding FFprobe output with a schema |
| [references/errors.md](references/errors.md) | Handling failures, or diagnosing an `ExitError` or a type error |
| [references/recipes.md](references/recipes.md) | The task matches a common job: web transcode, clip, thumbnail, concat, in-memory conversion, and so on |

## Rules

- **Pick the runner by stream-output count.** `FFmpeg.run` needs zero `Output.toStream` outputs and `FFmpeg.stream` needs exactly one; the command type enforces this. Don't annotate commands as `Command<E, R>` unless needed, as that defers the check to runtime.
- **Declare every input in `inputs`.** Never pass `-i`, `-progress`, or `-stdin` as options, and never use `pipe:`, `fd:`, `-`, or `/dev/std*` paths. These fail with `CommandError`. Use `Input.fromStream`, `Output.toSink`, `Output.toStream`, and `onProgress` instead.
- **Prefer files for data on disk.** `Input.fromFile` lets FFmpeg seek. Pipes are not seekable: give stream inputs an explicit `f` for raw or ambiguous formats, and give sink and stream outputs a streamable muxer (`f`), using `movflags: "frag_keyframe+empty_moov"` for MP4.
- **Sinks must consume everything.** A sink that completes before EOF fails with `OutputError` (`SinkEndedEarly`). Map sinks with other results to `void` with `Sink.map(sink, () => undefined)`.
- **Cancel with Effect.** Use `Effect.timeout`, fiber interruption, or scopes. There is no `AbortSignal`. Interruption terminates FFmpeg (SIGTERM, then SIGKILL after `forceKillAfter`). `-t` limits media duration, not wall time.
- **Handle tagged errors.** Use `Effect.catchTag("ExitError", …)` (`exitCode`, `stderr`), `"SpawnError"`, `"CommandError"`, `"ProbeDecodeError"`, and so on. `CommandError`/`OutputError` reasons are tagged classes: use `Effect.catchReason("CommandError", "ReservedPath", …)` or compare `error.reason._tag`, never `error.reason === "..."`.
- **Never add automatic retries.** Outputs are not atomic or idempotent, and failed runs can leave partial files.
- **Control concurrency in Effect.** For example `Effect.forEach(items, task, { concurrency: 4 })`. The library has no queue.
- **Keep secrets out of logs.** Don't put argv, paths, URLs, or stderr into spans or logs. `RunResult.args` and error causes can contain credentials embedded in URLs.
- **Remember what `FFprobe.probeWith` replaces.** Explicit options replace the default `-show_format -show_streams`; add `{ show_format: true, show_streams: true }` to keep them. Its projected stream `index` is optional. The service owns `-i`, `-of`/`-output_format`/`-print_format`, and `-o`.
- **Mock the services in tests.** Use `Layer.mock(FFmpeg, { run: () => Effect.succeed({ args: [], stderr: "" }) })` and `Layer.mock(FFprobe, { probe: () => Effect.succeed({ streams: [] }) })`. `FFprobe.probeWith` with a schema calls `probeJson`, so mock that for those calls.

## Configuration

The defaults run `ffmpeg` and `ffprobe` from `PATH`. Use `FFmpeg.layer({ binary })` or `FFmpeg.layerConfig({ binary: Config.String("FFMPEG_PATH") })` to change that; see [references/running.md](references/running.md#layers) for the other options.

## Compatibility

Typed option and filter names are verified against FFmpeg 6.1 through 9.0 (exceptions such as `scale`'s `reset_sar`, 8.0+, are noted in their hints). Unknown keys always pass through. Which encoders, muxers, and filters exist depends on the FFmpeg build: check with `ffmpeg -encoders`, `-muxers`, or `-filters`.

## FFmpeg itself

ffmpegu does not restrict FFmpeg's options: anything FFmpeg accepts can go into `Options.make` or `Filter.make`. For FFmpeg's own flags, codecs, formats, and filters, see https://ffmpeg.org/ffmpeg.html, https://ffmpeg.org/ffmpeg-filters.html, and https://ffmpeg.org/ffprobe.html. Run `ffmpeg -h filter=<name>` or `ffmpeg -encoders` to check what the installed build supports.
