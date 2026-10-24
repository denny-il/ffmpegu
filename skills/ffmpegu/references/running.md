# Running, services, and testing

## Execution

```ts
run(command: Command<E, R, 0>, options?: { onProgress?: (p: Progress) => Effect<void, PE, PR> })
  : Effect<RunResult, FFmpegError | E | PE, FFmpeg | R | PR>
stream(command: Command<E, R, 1>, options?: { onProgress?: ... })
  : Stream<Uint8Array, FFmpegError | E | PE, FFmpeg | R | PR>

interface RunResult {
  readonly args: ReadonlyArray<string>  // full argv, including -nostdin and progress flags
  readonly stderr: string               // last stderrTailBytes of stderr
}
```

Both are also methods of the `FFmpeg` service (`const ffmpeg = yield* FFmpeg; ffmpeg.run(command)`).

- `run` succeeds once FFmpeg exits with code 0 and every sink has finished. Feeders, sinks, stderr, and progress are supervised together, so any failure stops the rest and terminates the process.
- `stream` starts FFmpeg on the first pull and again on every consumption. The consumer sets the pace, and a stalled consumer blocks FFmpeg. Ending early (`Stream.take`, interruption) terminates FFmpeg. Failures surface after the chunks already emitted.

```ts
// stream: exactly one Output.toStream, and run would be a type error here.
const pcm = stream(
  Command.make({
    inputs: [Input.fromFile("speech.webm")],
    outputs: [Output.toStream(Options.create({ f: "s16le", ac: 1, ar: 16000 }))]
  })
) // Stream<Uint8Array, FFmpegError, FFmpeg>

// Stream in and stream out keep the source's error and requirement types.
const toOpus = <E, R>(upload: Stream.Stream<Uint8Array, E, R>) =>
  stream(
    Command.make({
      inputs: [Input.fromStream(upload)],
      outputs: [Output.toStream(Options.create({ vn: true, "c:a": "libopus", f: "ogg" }))]
    })
  ) // Stream<Uint8Array, FFmpegError | E, FFmpeg | R>
```

## Progress

```ts
interface Progress {
  readonly progress: "continue" | "end"
  readonly frame?: number
  readonly fps?: number
  readonly bitrate?: string          // "1234.5kbits/s"
  readonly totalSize?: number        // bytes
  readonly outTime?: Duration        // from out_time_us
  readonly dupFrames?: number
  readonly dropFrames?: number
  readonly speed?: number            // 1.5 for "1.5x"
  readonly raw: Readonly<Record<string, string>>  // keys as strings; lines over 4 KiB dropped, max 256 keys besides progress
}
```

- The callback returns an `Effect` and runs serially. Updates that arrive while it is busy are coalesced to the latest, so a slow callback never stalls encoding.
- On success the final update is delivered and awaited. A failing callback fails the run.
- Fields are `undefined` for `N/A`. A final `"end"` is never fabricated for a killed process.
- For a percentage, probe `format.duration` first: `Duration.toSeconds(p.outTime) / Number(duration)`.

## Cancellation, deadlines, and concurrency

- Cancel with Effect: `Effect.timeout("10 minutes")`, `Fiber.interrupt`, or scope closure (`Effect.forkScoped`). There is no `AbortSignal`.
- Interruption terminates FFmpeg or FFprobe with SIGTERM, then SIGKILL after `forceKillAfter`. Outputs keep being drained during termination.
- Cleanup waits for your stream, sink, and callback finalizers; `forceKillAfter` bounds only the process.
- `-t` limits media duration, not wall time. FFmpeg can wait on a stalled input forever without `Effect.timeout`.
- Limit concurrency with `Effect.forEach(items, task, { concurrency: n })`. The library has no queue.
- Never retry automatically. Outputs are not atomic, and failed runs can leave partial files.

## Layers

```ts
FFmpeg.layer({ binary?, forceKillAfter?, stderrTailBytes? }): Layer<FFmpeg, never, ChildProcessSpawner>
FFprobe.layer({ binary?, forceKillAfter?, stderrTailBytes?, maxOutputBytes? }): Layer<FFprobe, never, ChildProcessSpawner>
FFmpeg.layerConfig({ binary: Config.String("FFMPEG_PATH"), ... }): Layer<FFmpeg, ConfigError, ChildProcessSpawner>
FFprobe.layerConfig({ ... })
```

| Option | Default | Notes |
| --- | --- | --- |
| `binary` | `"ffmpeg"` / `"ffprobe"` | Name on `PATH`, or an absolute path |
| `forceKillAfter` | `"5 seconds"` | `Duration.Input`; `0` kills immediately, `"Infinity"` never escalates |
| `stderrTailBytes` | `"64 KiB"` | Byte count or size string; `0` keeps stderr out of error messages |
| `maxOutputBytes` | `"16 MiB"` | FFprobe only; exceeding it fails with `ProbeOutputError` |

`ChildProcessSpawner` comes from the platform layer: `NodeServices.layer` (`@effect/platform-node`) or `BunServices.layer` (`@effect/platform-bun`). Provide both services once at the edge:

```ts
const MediaLive = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(
  Layer.provideMerge(NodeServices.layer) // provideMerge keeps FileSystem etc. available
)
program.pipe(Effect.provide(MediaLive), NodeRuntime.runMain)
```

`layerConfig` takes a `Config` per option or one `Config` of all options. Invalid values fail with `ConfigError`, while invalid options passed to `layer` are defects.

## Tracing

The spans are `ffmpegu/FFmpeg.run`, `ffmpegu/FFmpeg.stream`, and `ffmpegu/FFprobe.probe`, plus `ffmpegu/probeWith` around probes with a schema. Their attributes are `process.executable.name`, `process.exit.code`, `ffmpegu.inputs`, `ffmpegu.outputs`, `ffmpegu.input_streams`, `ffmpegu.output_streams`, and `ffmpegu.progress`. Attributes never carry argv, paths, URLs, or stderr. A failed span does record its error, though: `ExitError` messages include the stderr tail (which can quote paths), and platform causes can include argv. Set `stderrTailBytes: 0` to keep stderr out of messages, and don't add argv or paths to your own spans and logs.

## Testing

- **Command shape:** assert `Result.getOrThrow(Command.toArgs(command))` with no FFmpeg needed.
- **Code using the services:** use `Layer.mock`. Members left out die when called.

```ts
const FFmpegTest = Layer.mock(FFmpeg, { run: () => Effect.succeed({ args: [], stderr: "" }) })
const FFprobeTest = Layer.mock(FFprobe, {
  probe: () => Effect.succeed({ streams: [{ index: 0, codec_type: "audio" }] }),
  // probeWith(input, options, schema) calls probeJson and decodes its result with the schema
  probeJson: () => Effect.succeed({ format: { duration: "12.5" } })
})
```

- **Process behavior:** provide `FFmpeg.layer()` with a fake `ChildProcessSpawner` from `effect/process`, and use `it.effect`.
- **Real binaries:** use `it.live` so process shutdown and timers run normally, and use `lavfi` inputs (`testsrc2`, `sine`) to generate fixtures.
