# Execution services

`run(command, options?)` and `stream(command, options?)` require `FFmpeg`; `probe(path)` and `probeWith(path, options)` require `FFprobe`. Provide their live Layers with Node or Bun platform services. Custom binaries can be configured with `FFmpeg.layer({ binary: "/path/to/ffmpeg" })` and `FFprobe.layer({ binary: "/path/to/ffprobe" })`.

Each run starts a fresh scoped process. Input feeders, output sinks, stderr, and progress readers are supervised together. Source/sink errors and defects stop the operation and terminate its child. Nonzero exit codes are typed failures. Successful execution waits for output EOF and sink finalization and returns a bounded stderr tail for diagnostics.

`forceKillAfter` controls escalation when a child ignores SIGTERM; the default is five seconds. FFmpeg blocked writing to a full output pipe does not act on SIGTERM, so sink and stream outputs keep being drained (and the remaining bytes discarded) during termination, and a cancelled or failed run does not wait out the grace period. `stderrTailBytes` bounds retained diagnostics. Paths and arguments can contain credentials, so automatic tracing does not record argv or stderr. Treat explicitly inspected diagnostics as potentially sensitive.

## Streaming output

`stream(command, options?)` runs a command with exactly one `Output.toStream` output and returns its bytes as a `Stream<Uint8Array, FFmpegError | E, FFmpeg | R>`. Other outputs can still be files or sinks; `run` rejects commands with a stream output.

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

## Configuration and testing

Both services offer `layerConfig` for application-owned configuration:

```ts
import { Config } from "effect"
import { FFmpeg } from "ffmpegu"

const FFmpegLive = FFmpeg.layerConfig(
  Config.all({
    binary: Config.String("FFMPEG_PATH").pipe(Config.withDefault("ffmpeg"))
  })
)
```

A configuration provider can be replaced in tests. Byte limits must be non-negative safe integers; invalid programmatic settings are defects during Layer construction. No binary is started until an execution Effect runs.

For deterministic tests, supply a fake `ChildProcessSpawner` to the live service Layer and use `@effect/vitest`'s `it.effect`. Real process tests use `it.live` so process shutdown and platform timers advance normally. Applications can also provide a fake `FFmpeg` or `FFprobe` service when testing higher-level workflows without testing process behavior.
