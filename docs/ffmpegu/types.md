# Types and errors

`Command<E, R, S>` tracks errors and services required by its input streams and output sinks. `run` adds the FFmpeg service and execution errors, plus any errors/services required by `onProgress`. File-only commands have no stream requirements.

`S` counts `Output.toStream` outputs: `0`, `1`, or `2` for two or more. `Output.toFile` and `Output.toSink` return `Output<E, R, 0>`; `Output.toStream` returns `Output<never, never, 1>`. `run` requires `0` and `stream` requires `1` (see [streaming output](runners.md#streaming-output)). An output chosen at runtime, such as `flag ? Output.toStream() : Output.toFile(path)`, counts as `0 | 1` and is accepted by neither. `S` defaults to `any`, meaning unknown, so `Command<E, R>` annotations still accept any command and pass both runners, with the check deferred to runtime.

Upgrading from versions without `S`: calls that always failed at runtime, `run` on a command with a stream output and `stream` on a command without exactly one, are now compile errors. Type-level code that compares commands or outputs to `Command<E, R>` or `Output<E, R>` exactly (instead of by assignability) must include the count. Reassigning a variable inferred with one count to a command with another, such as `let command = Command.make({})` followed by `command = command.withOutput(Output.toStream())`, needs a `Command<E, R>` annotation. Outputs typed structurally, such as `const output: Output = { destination: "out.wav" }`, no longer compile because `Output` carries the count as a property; build them with `Output.toFile`, `Output.toSink` or `Output.toStream`, which set the count, or with `new Output(...)`, which leaves it unknown.

`Progress` contains camelCase progress fields, including `outTime` as an Effect `Duration` and `progress` as `"continue" | "end"`, plus the original `raw` values; see [progress](runners.md#progress). `RunResult` contains the executed `args` and bounded `stderr` diagnostics. `ProbeResult` exposes validated streams and optional format metadata, preserving unknown fields. Explicit probe options return `ProjectedProbeResult`, whose stream `index` may also be absent; the default `ProbeResult` still requires it. A schema passed to `probeWith` sets the result type to its `Type`, and adds its decoding services to the requirements.

Time values are seconds as numbers, raw FFmpeg strings, time objects, Effect `Duration.Duration`, or `Temporal.Duration`; see [time values](options.md#time-values), including the decimal-seconds rendering beyond 9999 hours. The `Temporal.Duration` member uses the global type only when your TypeScript `lib` includes `esnext.temporal` (or `esnext`); otherwise it drops out, and the declarations still compile.

Library failures are tagged errors suitable for `Effect.catchTag`:

- `CommandError`: invalid references, descriptor conflicts, invalid command structure, invalid time values, or reserved probe arguments. Included in both `FFmpegError` and `ProbeError`. Its `reason` says which check failed; see below.
- `SpawnError`: binary startup failed.
- `ExitError`: nonzero or abnormal termination, with the configured `binary`, bounded stderr and the original cause when available. `binary` tells FFmpeg and FFprobe failures apart when both run in one workflow.
- `PipeError`: I/O on a library-owned descriptor failed.
- `OutputError`: an output sink completed before EOF (reason `SinkEndedEarly`, with the output's `fd`).
- `ProbeOutputError`: probe output exceeded the configured byte limit.
- `ProbeDecodeError`: output is not valid probe data.

`CommandError` and `OutputError` carry a tagged `reason`, so a single case can be handled with `Effect.catchReason` while other reasons stay in the error channel:

```ts
run(command).pipe(
  Effect.catchReason("CommandError", "ReservedPath", (reason) =>
    Effect.logWarning(`Use a stream input instead of ${reason.path}`)
  )
)
```

| Reason             | Fields                | Cause                                                                            |
| ------------------ | --------------------- | -------------------------------------------------------------------------------- |
| `DuplicateInput`   | `index`, `firstIndex` | The same input object is used twice.                                             |
| `DuplicateOutput`  | `index`, `firstIndex` | The same output object is used twice.                                            |
| `ForeignReference` |                       | A stream reference names an input outside the command; probes have no inputs.   |
| `ReservedPath`     | `path`, `location`    | A path or option value addresses a descriptor owned by ffmpegu.                  |
| `ReservedOption`   | `option`, `location`  | An option managed by ffmpegu (`-i`, `-progress`, `-stdin`, probe output) is set. |
| `InvalidArgument`  |                       | Any other invalid value, including a builder that failed to render.              |
| `StreamOutput`     | `count`               | `run` got an `Output.toStream` output, or `stream` did not get exactly one.      |
| `SinkEndedEarly`   | `fd`                  | `OutputError` only: an output sink completed before EOF.                         |

Every reason has a `message`, which is also the error's message. `location` is a `CommandLocation`: `{ _tag: "Global" }`, `{ _tag: "Input", index }`, `{ _tag: "Output", index }` (the path or options of that input or output), or `{ _tag: "Probe" }`. The failure that made a builder throw while rendering is the `cause` of the `CommandError`.

Migrating from 0.3: `reason` used to be a string. Replace `error.reason === "ReservedPath"` with `error.reason._tag === "ReservedPath"` (or `Effect.catchReason`), and `outputError.fd` with `outputError.reason.fd`. `CommandError` no longer takes a `message` field; construct it with a reason instance such as `new CommandError({ reason: new InvalidArgument({ message }) })`.

Caller-defined input, output, and callback errors keep their original identity and type. Interruption stays interruption. Defects remain defects; they are not converted into ordinary domain failures. Output files may be partial after either failure or interruption, so automatic retry is deliberately absent.
