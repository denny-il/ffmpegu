---
name: ffmpegu
description: Build and run FFmpeg and FFprobe operations in TypeScript with the Effect-native ffmpegu library (Effect v4, Node.js or Bun). Use when writing, reviewing, or debugging code that imports "ffmpegu", or when adding video/audio transcoding, thumbnails, clipping, HLS/DASH packaging, media probing, or byte-stream media conversion to an Effect application.
---

# ffmpegu

ffmpegu describes FFmpeg commands as immutable values and executes them through the `FFmpeg` and `FFprobe` Effect services. Requirements: Effect 4.0.x, Node.js 26.3+ or Bun 1.4.3+, Linux or macOS, and `ffmpeg`/`ffprobe` installed separately.

## Workflow

1. **Describe** the invocation with `Input`, `Output`, `Options`, `options.*`, `filters.*`, and `Command.make`. Builders are pure.
2. **Check** the argv when unsure: `Command.toArgs(command)` returns `Result<ReadonlyArray<string>, CommandError>` without spawning anything. Use it in unit tests.
3. **Execute** with `run(command)` (an `Effect`) or `stream(command)` (a `Stream`), and `probe`/`probeWith` for metadata.
4. **Provide** `FFmpeg.layer()` / `FFprobe.layer()` plus the platform layer (`NodeServices.layer` or `BunServices.layer`) at the application edge. Never start a runtime inside library code.

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Command, FFmpeg, FFprobe, Input, Options, Output, options, probe, run } from "ffmpegu"

const input = Input.fromFile("input.mov")
const command = Command.make({
  global: options.overwrite(),
  inputs: [input],
  outputs: [
    Output.toFile(
      "output.mp4",
      Options.create(
        { map: input.video },
        { map: input.audio },
        options.videoCodec("libx264"),
        options.crf(23),
        options.audioCodec("aac")
      )
    )
  ]
})

const program = Effect.gen(function* () {
  yield* run(command, {
    onProgress: (p) => Effect.logDebug("encoding", { frame: p.frame, speed: p.speed })
  })
  const metadata = yield* probe("output.mp4")
  return metadata.format?.duration
})

const MediaLive = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(
  Layer.provide(NodeServices.layer)
)
program.pipe(Effect.provide(MediaLive), NodeRuntime.runMain)
```

## API shape

- **Imports.** Use named exports: `Command`, `Input`, `Output`, `Options` (raw bundles), `options` (helpers), `filters`, `FFmpeg`, `FFprobe`, `run`, `stream`, `probe`, `probeWith`, plus the error classes. Don't use the default `ffmpegu` export or the `FFmpegu*` class aliases.
- **Inputs and outputs.** `Input.fromFile(pathOrUrl, inputOptions?)` and `Input.fromStream(stream, inputOptions?)`; `Output.toFile(path, outputOptions?)`, `Output.toSink(sink, outputOptions?)`, and `Output.toStream(outputOptions?)`. Seek fast with `Input.fromFile(path, options.startTime(t))`.
- **Stream references.** `input.video`, `input.audio`, `input.subtitle`, `input.data`, and `.track(n)` replace hand-written `0:v` specifiers in `map` and filter labels.
- **Options.** `Options.create("-y", ["c:v", "libx264"], { crf: 23, map: input.audio }, options.preset("slow"))`. Merging only appends, so later options don't replace earlier ones. Codec, format, and preset parameters accept any string FFmpeg accepts.
- **Filters.** `filters.chain(...)` goes in `options.videoFilter` or `options.audioFilter`, and `filters.graph(...)` in `options.filterComplex`. Use labels via `filters.label`, and `filters.custom` for any filter without a helper. Values are escaped automatically.
- **Execution.** `run(command, { onProgress })` returns `Effect<RunResult>`, `stream(command)` returns `Stream<Uint8Array>`, `probe(input)` returns `ProbeResult`, and `probeWith(input, options, schema?)` returns a projected result or the schema's type.

## References

These files sit next to this one and are self-contained. Read the ones the task needs:

| Read | When |
| --- | --- |
| [references/building.md](references/building.md) | Writing or reviewing any command, option bundle, filter graph, or time value |
| [references/video.md](references/video.md) | Video codecs, rate control, scaling, cropping, overlays, text, frame extraction |
| [references/audio.md](references/audio.md) | Audio codecs, raw PCM, resampling, volume, trimming, fades, mixing |
| [references/streaming.md](references/streaming.md) | HLS, DASH, fragmented MP4, or any `Input.fromStream`, `toSink`, or `toStream` |
| [references/running.md](references/running.md) | `run` and `stream` semantics, progress, cancellation, layers, configuration, tracing, testing |
| [references/probe.md](references/probe.md) | Reading metadata, `probeWith` selections, decoding FFprobe output with a schema |
| [references/errors.md](references/errors.md) | Handling failures, or diagnosing an `ExitError` or a type error |
| [references/recipes.md](references/recipes.md) | The task matches a common job: web transcode, clip, thumbnail, concat, in-memory conversion, and so on |

## Rules

- **Pick the runner by stream-output count.** `run` needs zero `Output.toStream` outputs and `stream` needs exactly one; the command type enforces this. Don't annotate commands as `Command<E, R>` unless needed, as that defers the check to runtime.
- **Declare every input in `inputs`.** Never pass `-i`, `-progress`, or `-stdin` as options, and never use `pipe:`, `fd:`, `-`, or `/dev/std*` paths. These fail with `CommandError`. Use `Input.fromStream`, `Output.toSink`, `Output.toStream`, and `onProgress` instead.
- **Prefer files for data on disk.** `Input.fromFile` lets FFmpeg seek. Pipes are not seekable: give stream inputs an explicit `f` for raw or ambiguous formats, and give sink and stream outputs a streamable muxer (`f`), using `movflags: "frag_keyframe+empty_moov"` for MP4.
- **Sinks must consume everything.** A sink that completes before EOF fails with `OutputError` (`SinkEndedEarly`). Map sinks with other results to `void` with `Sink.map(sink, () => undefined)`.
- **Cancel with Effect.** Use `Effect.timeout`, fiber interruption, or scopes. There is no `AbortSignal`. Interruption terminates FFmpeg (SIGTERM, then SIGKILL after `forceKillAfter`). `-t` limits media duration, not wall time.
- **Handle tagged errors.** Use `Effect.catchTag("ExitError", …)` (`exitCode`, `stderr`), `"SpawnError"`, `"CommandError"`, `"ProbeDecodeError"`, and so on. `CommandError`/`OutputError` reasons are tagged classes: use `Effect.catchReason("CommandError", "ReservedPath", …)` or compare `error.reason._tag`, never `error.reason === "..."`.
- **Never add automatic retries.** Outputs are not atomic or idempotent, and failed runs can leave partial files.
- **Control concurrency in Effect.** For example `Effect.forEach(items, task, { concurrency: 4 })`. The library has no queue.
- **Keep secrets out of logs.** Don't put argv, paths, URLs, or stderr into spans or logs. `RunResult.args` and error causes can contain credentials embedded in URLs.
- **Remember what `probeWith` replaces.** Explicit options replace the default `-show_format -show_streams`; add `{ show_format: true, show_streams: true }` to keep them. Its projected stream `index` is optional. The service owns `-i`, `-of`/`-output_format`/`-print_format`, and `-o`.
- **Mock the services in tests.** Use `Layer.mock(FFmpeg, { run: () => Effect.succeed({ args: [], stderr: "" }) })` and `Layer.mock(FFprobe, { probe: () => Effect.succeed({ streams: [] }) })`. `probeWith` with a schema calls `probeJson`, so mock that for those calls.

## Configuration

The defaults run `ffmpeg` and `ffprobe` from `PATH`. Use `FFmpeg.layer({ binary })` or `FFmpeg.layerConfig({ binary: Config.String("FFMPEG_PATH") })` to change that; see [references/running.md](references/running.md#layers) for the other options.

## FFmpeg itself

ffmpegu does not restrict FFmpeg's options: anything FFmpeg accepts can go into `Options.create` or `filters.custom`. For FFmpeg's own flags, codecs, formats, and filters, see https://ffmpeg.org/ffmpeg.html, https://ffmpeg.org/ffmpeg-filters.html, and https://ffmpeg.org/ffprobe.html. Run `ffmpeg -h filter=<name>` or `ffmpeg -encoders` to check what the installed build supports.
