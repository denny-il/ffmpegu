# Errors and types

## Errors

Every failure is a tagged error in the Effect error channel, so it can be handled with `Effect.catchTag` and appears in the Effect's type.

| Error              | Raised by          | When                                                                       | Fields                                  |
| ------------------ | ------------------ | -------------------------------------------------------------------------- | --------------------------------------- |
| `CommandError`     | all, and `compile` | The description is invalid; see [reasons](#command-error-reasons). | `reason`                                |
| `SpawnError`       | all                | The binary could not be started (missing, not executable, …).             | `binary`, `cause`                       |
| `ExitError`        | all                | The process exited with a nonzero code or was killed.                     | `binary`, `exitCode`, `stderr`, `cause` |
| `PipeError`        | all                | I/O on a library-owned descriptor failed.                                 | `fd`, `direction`, `cause`              |
| `OutputError`      | `FFmpeg.run`, `FFmpeg.stream`    | An output sink completed before EOF.                                      | `reason` (`SinkEndedEarly`)             |
| `ProbeOutputError` | probes             | FFprobe output exceeded `maxOutputBytes`.                                  | `maxOutputBytes`                        |
| `ProbeDecodeError` | probes             | FFprobe output is not valid probe data or does not match your schema.     | `message`, `cause`                      |

The unions are `FFmpegError = CommandError | SpawnError | ExitError | PipeError | OutputError` and `ProbeError = CommandError | SpawnError | ExitError | PipeError | ProbeOutputError | ProbeDecodeError`.

`ExitError.exitCode` is `null` when the process was terminated by a signal. `binary` tells FFmpeg and FFprobe failures apart in a workflow that runs both.

Errors from your own code keep their identity and type: a failing input stream, sink, or progress callback fails the run with that error, never wrapped in `PipeError`. Interruption stays interruption, and defects stay defects.

```ts
import { Effect } from "effect"
import { Command, FFmpeg, Input, Output } from "ffmpegu"

const command = Command.make({
  inputs: [Input.fromFile("input.mp4")],
  outputs: [Output.toFile("output.mp4")]
})

const handled = FFmpeg.run(command).pipe(
  Effect.catchTag("ExitError", (error) =>
    Effect.logError("ffmpeg failed", { exitCode: error.exitCode, stderr: error.stderr })
  ),
  Effect.catchTag("SpawnError", () => Effect.logError("ffmpeg is not installed"))
)
```

## Command error reasons

`CommandError` and `OutputError` carry a tagged `reason`. Match on `error.reason._tag`, or handle a single reason with `Effect.catchReason` while the others stay in the error channel:

```ts
import { Effect } from "effect"
import { Command, FFmpeg, Input, Output } from "ffmpegu"

const command = Command.make({
  inputs: [Input.fromFile("/dev/stdin")],
  outputs: [Output.toFile("output.mp4")]
})

const handled = FFmpeg.run(command).pipe(
  Effect.catchReason("CommandError", "ReservedPath", (reason) =>
    Effect.logWarning(`Use Input.fromStream instead of ${reason.path}`)
  )
)
```

| Reason             | Fields                | Cause                                                                              |
| ------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `DuplicateInput`   | `index`, `firstIndex` | The same input object appears twice.                                               |
| `DuplicateOutput`  | `index`, `firstIndex` | The same output object appears twice.                                              |
| `ForeignReference` |                       | A stream reference names an input outside the command; probes have no inputs.     |
| `ReservedPath`     | `path`, `location`    | A path or option value addresses a descriptor owned by ffmpegu.                    |
| `ReservedOption`   | `option`, `location`  | An option managed by ffmpegu is set (`-i`, `-progress`, `-stdin`, probe output).   |
| `InvalidArgument`  |                       | Any other invalid value, including invalid durations and track indices.           |
| `StreamOutput`     | `count`               | `FFmpeg.run` got an `Output.toStream` output, or `FFmpeg.stream` did not get exactly one.        |
| `SinkEndedEarly`   | `fd`                  | (`OutputError` only) an output sink completed before EOF.                          |

Every reason has a `message`, which is also the error's message. `location` is a `CommandLocation`: `{ _tag: "Global" }`, `{ _tag: "Input", index }`, `{ _tag: "Output", index }`, or `{ _tag: "Probe" }`. When a builder throws while rendering, the thrown value becomes the `CommandError`'s `cause`.

## Diagnostics and sensitive data

Paths, URLs, and arguments can contain credentials. ffmpegu never records argv, paths, URLs, or stderr as span attributes, and `ExitError` messages name only the executable's file name rather than its configured path.

Other values can still carry them, and should be treated as sensitive when you log or export them, including through a failed span, which records its error:

- `ExitError.stderr` and `ExitError.message` contain the stderr tail, where FFmpeg often quotes input and output paths and URLs; set `stderrTailBytes: 0` to keep stderr out of both;
- `SpawnError.message` and `binary` contain the configured binary path;
- platform causes on `ExitError` and `SpawnError` can include the full argv, which reaches `Cause.pretty` and exported stack traces;
- `RunResult.args` is the full argv.

## Type parameters

`Command<E, R, S>`, `Input<E, R>`, and `Output<E, R, S>` carry:

- `E`: the union of errors of all input streams and output sinks;
- `R`: the union of their requirements;
- `S` (commands and outputs): the number of `Output.toStream` outputs.

`FFmpeg.run` adds `FFmpegError` and the `FFmpeg` service, plus the error and requirement types of `onProgress`. File-only commands have `E = never` and `R = never`.

`S` is `0`, `1`, or `2` (two or more). `toFile` and `toSink` produce `Output<E, R, 0>`, `toStream` produces `Output<never, never, 1>`, and `Command.make`/`withOutput` add them up. `FFmpeg.run` requires `0` and `FFmpeg.stream` requires `1`, so choosing the wrong runner is a compile error.

The check falls back to runtime (`CommandError` reason `StreamOutput`) when the count is unknown:

- `S` defaults to `any`, so a `Command<E, R>` annotation accepts any command;
- output arrays of unknown length that may contain a stream output;
- outputs created with `new Output(...)`.

An output chosen at runtime, such as `flag ? Output.toStream() : Output.toFile(path)`, has `S = 0 | 1` and is accepted by neither runner; branch on the whole command instead. A variable inferred with one count cannot be reassigned a command with another; annotate it as `Command<E, R>`.

`Progress`, `RunResult`, and the probe result types are described in [running](running.md#progress) and [FFprobe](ffprobe.md).

## Builder types

The types of the builders live in their namespaces, next to the functions that use them:

| Namespace | Types                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| `Options` | `Options` (a bundle), `Arg`, `ArgValue`, `VideoCodec`, `AudioCodec`, `SubtitleCodec`, `Format`, `BitrateUnit`, `TimeValue`, `HlsOptions`, `DashOptions`, … |
| `Filter`  | `Filter`, `Chain`, `Graph`, `Label`, `Labels`, `Options`, `OptionValue`, and each helper's options such as `ScaleOptions` |
| `Time`    | `TimeObject`, `DurationValue`                                                                  |

```ts
import { Filter, Options } from "ffmpegu"

const encode = (codec: Options.VideoCodec, extra: Options.Options): Options.Options =>
  Options.make(Options.videoCodec(codec), extra)

const resize = (size: Filter.ScaleOptions): Filter.Filter => Filter.scale(size)
```

To build option or filter values of your own, extend the exported `Argument` class: its `getArgs(refs)` returns the rendered tokens, and `refs.get(input)` resolves an input to its index in the command.
