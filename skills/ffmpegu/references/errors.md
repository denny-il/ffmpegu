# Errors

| Error | From | Fields | Meaning |
| --- | --- | --- | --- |
| `CommandError` | all, and `compile` | `reason` | Invalid description; see the reasons below |
| `SpawnError` | all | `binary`, `cause` | The binary could not start (not installed, not executable) |
| `ExitError` | all | `binary`, `exitCode` (`null` if killed by a signal), `stderr`, `cause` | Nonzero or abnormal exit |
| `PipeError` | all | `fd`, `direction` (`input`, `output`), `cause` | Library-owned pipe I/O failed |
| `OutputError` | `run`, `stream` | `reason: SinkEndedEarly { fd }` | A sink completed before EOF |
| `ProbeOutputError` | probes | `maxOutputBytes` | FFprobe output too large |
| `ProbeDecodeError` | probes | `message`, `cause` | Invalid probe JSON or schema mismatch |

```ts
type FFmpegError = CommandError | SpawnError | ExitError | PipeError | OutputError
type ProbeError = CommandError | SpawnError | ExitError | PipeError | ProbeOutputError | ProbeDecodeError
```

`CommandError` reasons: `DuplicateInput`, `DuplicateOutput` (`index`, `firstIndex`), `ForeignReference`, `ReservedPath` (`path`, `location`), `ReservedOption` (`option`, `location`), `InvalidArgument`, and `StreamOutput` (`count`). See [building.md](building.md#commands) for their causes. `location` is `{ _tag: "Global" | "Input" | "Output" | "Probe", index? }`.

## Handling

```ts
run(command).pipe(
  Effect.catchTag("ExitError", (e) => Effect.logError("ffmpeg failed", { exitCode: e.exitCode, stderr: e.stderr })),
  Effect.catchTag("SpawnError", () => Effect.fail(new FfmpegMissing()))
)

// One reason, while the other CommandError reasons stay in the error channel:
run(command).pipe(
  Effect.catchReason("CommandError", "ReservedPath", (reason) => Effect.logWarning(reason.path))
)

// Or match on the reason tag:
run(command).pipe(
  Effect.catchTag("CommandError", (e) =>
    e.reason._tag === "InvalidArgument" ? Effect.logWarning(e.message) : Effect.fail(e)
  )
)
```

Reasons are tagged classes, so never compare `error.reason === "ReservedPath"`.

## Semantics

- Errors from your input streams, sinks, and progress callbacks pass through unchanged, never wrapped in `PipeError`. Interruption stays interruption, and defects stay defects.
- `ExitError.stderr` is a bounded tail and usually holds FFmpeg's actual complaint, such as an unknown encoder, a missing file, or an invalid filter argument. Read it before guessing.
- `ExitError` messages name only the executable's file name plus the stderr tail. `SpawnError` messages contain the configured binary path.
- Platform causes on `ExitError` and `SpawnError`, and `RunResult.args`, can contain full argv, including credentials in URLs. Don't log them wholesale.

## Diagnosing

| Symptom | Likely cause |
| --- | --- |
| `SpawnError` | FFmpeg is not on `PATH`; set `binary` in the layer |
| `ExitError`, stderr "Unknown encoder" | This FFmpeg build lacks the codec; check `ffmpeg -encoders` |
| `ExitError`, stderr "Output file … does not contain any stream" | A `map` references a stream that doesn't exist; use `track(n)` or drop the map |
| `ExitError`, "muxer does not support non seekable output" | A pipe output needs a streamable muxer; see [streaming.md](streaming.md#pipes-and-sinks) |
| `ExitError`, "Invalid data found when processing input" on a stream input | A missing `f` for a raw or ambiguous pipe input, or an MP4 with a trailing `moov` |
| `OutputError` / `SinkEndedEarly` | The sink stopped early (for example `Sink.take`); consume everything |
| `CommandError` `ReservedOption` | `-i`, `-progress`, or `-stdin` was set in options; use `inputs` or `onProgress` |
| Type error on `run` or `stream` | Wrong number of `Output.toStream` outputs for that runner |
| Run never finishes | A stalled input stream, a consumer not pulling, or a hanging `onProgress`; add `Effect.timeout` |
