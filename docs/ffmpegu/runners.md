# Execution services

`run(command, options?)` and `stream(command, options?)` require `FFmpeg`; `probe(path)` and `probeWith(path, options)` require `FFprobe`. Provide their live Layers with Node or Bun platform services. Custom binaries can be configured with `FFmpeg.layer({ binary: "/path/to/ffmpeg" })` and `FFprobe.layer({ binary: "/path/to/ffprobe" })`.

Each run starts a fresh scoped process. Input feeders, output sinks, stderr, and progress readers are supervised together. Source/sink errors and defects stop the operation and terminate its child. Nonzero exit codes are typed failures. Successful execution waits for output EOF and sink finalization and returns a bounded stderr tail for diagnostics.

`forceKillAfter` controls escalation when a child ignores SIGTERM; the default is five seconds. Zero sends SIGKILL right after SIGTERM and `"Infinity"` never escalates; negative and NaN durations are rejected, including tiny negatives that would round to zero (the number `-0` counts as zero, but any string with a leading `-` is rejected; `Config.Duration` parses durations itself, so a tiny negative read through it is already zero). `Duration` sums the parts of a `[seconds, nanos]` tuple or a duration object (such as `{ seconds, milliseconds }`) in floating point, so every part must be non-negative, even when the total would be positive (`{ seconds: 1, milliseconds: -500 }` is rejected), and the parts must total at most `Number.MAX_SAFE_INTEGER` nanoseconds (about 104 days), so that none is lost to rounding; use a string such as `"200 days"` for longer periods, or `"Infinity"`. FFmpeg blocked writing to a full output pipe does not act on SIGTERM, so sink and stream outputs keep being drained (and the remaining bytes discarded) during termination, and a cancelled or failed run does not wait out the grace period. `stderrTailBytes` bounds retained diagnostics (a byte count or a size such as `"64 KiB"`). Paths and arguments can contain credentials. Failed-span messages for an `ExitError` name only the executable's file name, followed by the retained stderr tail when there is one; `stderrTailBytes: 0` keeps stderr out of them. A `SpawnError` message names the configured path in full. Platform error causes kept on `ExitError` and `SpawnError` can include the executable path and arguments, including input and output URLs; these reach `Cause.pretty` and exported exception stack traces. The `binary` field keeps the configured path for callers. Treat explicitly inspected diagnostics as potentially sensitive.

## Streaming output

`stream(command, options?)` runs a command with exactly one `Output.toStream` output and returns its bytes as a `Stream<Uint8Array, FFmpegError | E, FFmpeg | R>`. Other outputs can still be files or sinks; `run` rejects commands with a stream output.

Commands count their `Output.toStream` outputs in their type, so both mistakes are compile errors: `run` accepts only `Command<E, R, 0>` and `stream` only `Command<E, R, 1>`. When the count is unknown, the command is accepted and checked when it runs, failing with `CommandError` (reason `StreamOutput`). The count is unknown for commands typed as `Command<E, R>`, for output arrays of unknown length that may contain a stream output, and for outputs built with the `Output` constructor.

```ts
import { Stream } from "effect"
import { Command, Input, Options, Output, stream } from "ffmpegu"

const pcm = stream(
  Command.make({
    inputs: [Input.fromStream(source, Options.create({ f: "webm" }))],
    outputs: [Output.toStream(Options.create({ f: "s16le", ac: 1, ar: 16000 }))]
  })
)
```

FFmpeg starts when the stream is first pulled and runs again on every consumption. Its output is paced by the consumer: one chunk is handed over at a time, and a consumer that stops pulling fills the pipe, blocks FFmpeg and, through it, the input feeders. The stream ends once the output reached EOF and FFmpeg exited successfully; failures (nonzero exit, input errors, pipe errors) fail it after the chunks already emitted, as `run` would report them.

Ending consumption early (`Stream.take`, interruption, closing its scope) terminates FFmpeg and releases the inputs. The output pipe keeps being drained meanwhile, so FFmpeg blocked on a full pipe can act on SIGTERM instead of waiting out `forceKillAfter`.

## Progress

```ts
import { Duration, Effect } from "effect"

const execution = run(command, {
  onProgress: (progress) =>
    Effect.logDebug("Encoding", {
      frame: progress.frame,
      position: progress.outTime && Duration.format(progress.outTime),
      state: progress.progress
    })
})
```

The callback returns an Effect. Progress parsing and callback execution are separated by a bounded queue retaining the latest update, so a slow callback does not stop media processing. Updates may be coalesced. Successful completion waits for pending callback work. Callback failure fails the run; callbacks are interrupted on run failure/cancellation. A callback that never completes keeps the run pending: apply your own timeout if needed.

Each update is a `Progress` with camelCase fields: `frame`, `fps`, `bitrate` (as reported, such as `"1234.5kbits/s"`), `totalSize` (bytes), `outTime` (an Effect `Duration` from `out_time_us`), `dupFrames`, `dropFrames`, and `speed` (`1.5` for `1.5x`). `progress` is `"end"` for FFmpeg's final block and `"continue"` otherwise; an unrecognized marker also counts as `"continue"`, so a final block is never inferred, and `raw.progress` keeps the original. `raw` keeps every key of the block as its original string, including keys without a typed field such as per-stream quality.

The library only reports parsed updates. It does not fabricate `progress=end` for a killed process or missing/malformed progress. `N/A` and other unparseable or non-finite values become `undefined`; original strings remain in `raw`.

### Migrating from snake_case progress fields

Earlier releases exposed FFmpeg's key names and kept `out_time` as text. Rename the fields as follows:

| Previous field                         | Current field                                                    |
| -------------------------------------- | ---------------------------------------------------------------- |
| `progress: string`                     | `progress: "continue" \| "end"`                                  |
| `total_size`                           | `totalSize`                                                      |
| `out_time_us` (number of microseconds) | `outTime` (`Duration`), for example `Duration.toMillis(outTime)` |
| `out_time_ms` (also microseconds)      | `outTime`, or `raw.out_time_ms`                                  |
| `out_time` (`HH:MM:SS.uuuuuu` text)    | `outTime`, or `raw.out_time`                                     |
| `dup_frames`                           | `dupFrames`                                                      |
| `drop_frames`                          | `dropFrames`                                                     |
| `frame`, `fps`, `bitrate`, `speed`     | Unchanged                                                        |

## Cancellation

```ts
import { Effect, Fiber } from "effect"

const program = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(run(command))
  // Other application work happens here.
  yield* Fiber.interrupt(fiber)
})
```

Use `forkScoped` when the operation should belong to a surrounding scope. `Effect.timeout` also interrupts the run and performs cleanup. The library never detaches a process or starts a hidden runtime. Applications may use `NodeRuntime.runMain`, `BunRuntime.runMain`, or their existing managed runtime at the boundary.

Cleanup waits for caller-owned stream, sink, and callback finalizers. Sinks and callbacks are stopped, inputs are closed and FFmpeg is terminated together, so a sink finalizer may wait for a resource the input stream releases. As with other scoped Effects, a finalizer that never completes can prevent cancellation from completing; `forceKillAfter` bounds process termination, not arbitrary application finalizers.

## Tracing

`run`, `stream`, and `probe` run in the spans `ffmpegu/FFmpeg.run`, `ffmpegu/FFmpeg.stream`, and `ffmpegu/FFprobe.probe`. Their attributes are limited to data that cannot carry credentials; argv, paths, URLs, and stderr are never recorded.

| Attribute                 | Spans  | Value                                                                       |
| ------------------------- | ------ | --------------------------------------------------------------------------- |
| `process.executable.name` | all    | File name of the binary, without its directory                              |
| `process.exit.code`       | all    | Exit code, once the process exited with one (see below)                     |
| `ffmpegu.inputs`          | FFmpeg | Number of inputs                                                            |
| `ffmpegu.outputs`         | FFmpeg | Number of outputs                                                           |
| `ffmpegu.input_streams`   | FFmpeg | Inputs fed from an Effect `Stream`                                          |
| `ffmpegu.output_streams`  | FFmpeg | Outputs written to a `Sink` or to the stream returned by `stream`           |
| `ffmpegu.progress`        | FFmpeg | Whether a progress callback is set                                          |

The exit code is also recorded when cleanup terminates the process, for example after an interruption, a failed source or sink, or a stream consumer that stops early. It is absent when the process was terminated by a signal (such as the `forceKillAfter` SIGKILL) or its exit code was not yet reported when cleanup finished: cleanup never waits for it.

## Configuration and testing

Both services offer `layerConfig` for application-owned configuration. It takes a `Config` per option, or a single `Config` of all options:

```ts
import { Config } from "effect"
import { FFmpeg, FFprobe } from "ffmpegu"

const FFmpegLive = FFmpeg.layerConfig({
  binary: Config.String("FFMPEG_PATH").pipe(Config.withDefault("ffmpeg")),
  forceKillAfter: Config.Duration("FFMPEG_KILL_AFTER"),
  stderrTailBytes: Config.ByteSize("FFMPEG_STDERR_TAIL")
})

const FFprobeLive = FFprobe.layerConfig({
  maxOutputBytes: Config.ByteSize("FFPROBE_MAX_OUTPUT")
})
```

Byte limits (`stderrTailBytes`, and FFprobe's `maxOutputBytes`) take a byte count or a size such as `"64 KiB"` (binary units) or `"64 kB"` (decimal units); `Config.ByteSize` reads the same sizes, and `Config.Int` reads plain counts. They must be non-negative safe integers. A record field that is `undefined` means the option is omitted, so it can be set conditionally. Invalid configured values fail Layer construction with a `ConfigError` naming the option; invalid programmatic settings passed to `layer` are defects. No binary is started until an execution Effect runs. A configuration provider can be replaced in tests.

For deterministic tests, supply a fake `ChildProcessSpawner` to the live service Layer and use `@effect/vitest`'s `it.effect`. Real process tests use `it.live` so process shutdown and platform timers advance normally. Applications can also provide a fake `FFmpeg` or `FFprobe` service when testing higher-level workflows without testing process behavior.

To test code that depends on `FFmpeg` or `FFprobe` without running processes, replace the service with `Layer.mock`. It takes a partial implementation; members left out die with an unimplemented defect when used:

```ts
import { Effect, Layer } from "effect"
import { FFmpeg, FFprobe, run } from "ffmpegu"

const FFmpegTest = Layer.mock(FFmpeg, {
  run: () => Effect.succeed({ args: [], stderr: "" })
})

const FFprobeTest = Layer.mock(FFprobe, {
  probe: () => Effect.succeed({ streams: [] })
})

const result = run(command).pipe(Effect.provide(FFmpegTest))
```

A mock does not need to be generic: callers of `run` and `stream` keep the command's error and requirement types.
