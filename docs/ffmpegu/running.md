# Running FFmpeg

| Function                    | Accepts            | Returns                                                   |
| --------------------------- | ------------------ | --------------------------------------------------------- |
| `run(command, options?)`    | `Command<E, R, 0>` | `Effect<RunResult, FFmpegError \| E, FFmpeg \| R>`         |
| `stream(command, options?)` | `Command<E, R, 1>` | `Stream<Uint8Array, FFmpegError \| E, FFmpeg \| R>`        |

Both are also available on the `FFmpeg` service itself (`yield* FFmpeg` then `ffmpeg.run(...)`). A progress callback adds its own error and requirement types.

## Run

`run` starts a fresh process each time it is executed and succeeds once FFmpeg exits with code 0 and every sink has finished. Input feeders, output sinks, stderr, and progress readers are supervised together: if any fails, the others stop and the process is terminated.

`RunResult` contains:

- `args`: the full argv that was executed, including runner-owned flags;
- `stderr`: the last `stderrTailBytes` of FFmpeg's stderr (64 KiB by default).

A nonzero exit fails with `ExitError`, which carries the exit code and the same stderr tail. See [errors](errors.md).

## Streaming output

`stream` runs a command with exactly one `Output.toStream` output and emits that output's bytes. Other outputs of the same command can still be files or sinks.

```ts
import { Effect, Stream } from "effect"
import { Command, Input, Options, Output, stream } from "ffmpegu"

// Decode any input to 16 kHz mono PCM for speech recognition.
const pcm = stream(
  Command.make({
    inputs: [Input.fromFile("speech.webm")],
    outputs: [Output.toStream(Options.create({ f: "s16le", ac: 1, ar: 16000 }))]
  })
)

const bytes = pcm.pipe(Stream.runFold(() => 0, (total, chunk) => total + chunk.length))
```

- FFmpeg starts when the stream is first pulled, and again for every consumption.
- The consumer sets the pace. A consumer that stops pulling fills the pipe, which blocks FFmpeg and, through it, the input feeders.
- The stream ends after the output reached EOF and FFmpeg exited successfully. Failures surface after the chunks already emitted, as `run` would report them.
- Ending consumption early (`Stream.take`, interruption, closing the scope) terminates FFmpeg and releases the inputs.

If the stream-output count is unknown at compile time (see [type parameters](errors.md#type-parameters)), the check happens at runtime and fails with `CommandError` reason `StreamOutput`.

## Progress

```ts
import { Duration, Effect } from "effect"
import { Command, Input, Output, options, run } from "ffmpegu"

const command = Command.make({
  global: options.overwrite(),
  inputs: [Input.fromFile("input.mp4")],
  outputs: [Output.toFile("output.mp4", options.videoCodec("libx264"))]
})

const execution = run(command, {
  onProgress: (progress) =>
    Effect.logInfo("Encoding", {
      position: progress.outTime && Duration.format(progress.outTime),
      speed: progress.speed,
      done: progress.progress === "end"
    })
})
```

The callback returns an `Effect`. It runs serially, decoupled from FFmpeg by a buffer that keeps only the latest update, so a slow callback never stalls encoding; updates that arrive while it is busy are coalesced. On success the final pending update is delivered and awaited. A failing callback fails the run; a callback that never completes keeps the run pending.

Each `Progress` update contains:

| Field        | Type                    | From FFmpeg key           |
| ------------ | ----------------------- | ------------------------- |
| `progress`   | `"continue" \| "end"`   | `progress`                |
| `frame`      | `number`                | `frame`                   |
| `fps`        | `number`                | `fps`                     |
| `bitrate`    | `string`, e.g. `"1234.5kbits/s"` | `bitrate`        |
| `totalSize`  | `number` (bytes)        | `total_size`              |
| `outTime`    | `Duration`              | `out_time_us`             |
| `dupFrames`  | `number`                | `dup_frames`              |
| `dropFrames` | `number`                | `drop_frames`             |
| `speed`      | `number`, `1.5` for `1.5x` | `speed`                |
| `raw`        | `Record<string, string>` | every retained key, unparsed |

Typed fields are `undefined` when FFmpeg reports `N/A` or a non-finite value. `raw` keeps the block's keys as strings, including ones without a typed field such as per-stream quality. To bound memory, lines longer than 4 KiB are dropped and at most 256 distinct keys besides `progress` are kept per block, so a command with very many output streams can lose later keys, including `out_time_us`. The library reports only what FFmpeg printed: it never fabricates a final `"end"` update for a killed process.

To compute a percentage, [probe](ffprobe.md) the input's duration first and compare it with `outTime`; see the [recipe](recipes.md#report-progress-as-a-percentage).

## Cancellation and timeouts

Cancellation is ordinary Effect interruption:

```ts
import { Effect, Fiber } from "effect"
import { Command, Input, Output, run } from "ffmpegu"

const command = Command.make({
  inputs: [Input.fromFile("input.mp4")],
  outputs: [Output.toFile("output.mkv")]
})

const withDeadline = run(command).pipe(Effect.timeout("10 minutes"))

const cancellable = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(run(command))
  // ... later
  yield* Fiber.interrupt(fiber)
})
```

Use `Effect.forkScoped` to tie a run to a surrounding scope. Interruption closes the run's scope: sinks and the progress callback stop, inputs close, and FFmpeg receives SIGTERM, escalating to SIGKILL after [`forceKillAfter`](configuration.md#layer-options) (5 seconds by default). Sink and stream outputs keep being drained during termination, so FFmpeg blocked on a full pipe can still act on SIGTERM.

Cleanup waits for your own stream, sink, and callback finalizers. `forceKillAfter` bounds process termination, not application finalizers, so a finalizer that never completes can keep cancellation from completing.

## Concurrency

The library has no queue or concurrency setting of its own; use Effect's:

```ts
import { Effect } from "effect"
import { Command, Input, Options, Output, options, run } from "ffmpegu"

const thumbnails = (paths: ReadonlyArray<string>) =>
  Effect.forEach(
    paths,
    (path) =>
      run(
        Command.make({
          global: options.overwrite(),
          inputs: [Input.fromFile(path, options.startTime(1))],
          outputs: [Output.toFile(`${path}.jpg`, Options.create({ "frames:v": 1 }))]
        })
      ),
    { concurrency: 4 }
  )
```

## Tracing

`run` and `stream` run inside the spans `ffmpegu/FFmpeg.run` and `ffmpegu/FFmpeg.stream`; every FFprobe process runs inside `ffmpegu/FFprobe.probe`. `probeWith` with a schema adds an enclosing `ffmpegu/probeWith` span that also covers decoding. Span attributes are limited to values that cannot carry credentials; argv, paths, URLs, and stderr are never recorded.

| Attribute                 | Spans  | Value                                                    |
| ------------------------- | ------ | -------------------------------------------------------- |
| `process.executable.name` | all    | File name of the binary, without its directory           |
| `process.exit.code`       | all    | Exit code, once the process reported one                 |
| `ffmpegu.inputs`          | FFmpeg | Number of inputs                                         |
| `ffmpegu.outputs`         | FFmpeg | Number of outputs                                        |
| `ffmpegu.input_streams`   | FFmpeg | Inputs fed from an Effect `Stream`                       |
| `ffmpegu.output_streams`  | FFmpeg | Outputs written to a `Sink` or read through `stream`     |
| `ffmpegu.progress`        | FFmpeg | Whether a progress callback is set                       |

The exit code is also recorded when cleanup terminates the process, for example after interruption. It is absent when the process was killed by a signal or had not reported an exit code by the time cleanup finished.

Error values are a different matter: a failed span's message for an `ExitError` includes the stderr tail, and platform error causes can include the executable path and arguments. See [diagnostics and sensitive data](errors.md#diagnostics-and-sensitive-data).
