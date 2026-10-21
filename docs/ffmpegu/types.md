# Types and errors

`Command<E, R, S>` tracks errors and services required by its input streams and output sinks. `run` adds the FFmpeg service and execution errors, plus any errors/services required by `onProgress`. File-only commands have no stream requirements.

`S` counts `Output.toStream` outputs: `0`, `1`, or `2` for two or more. `Output.toFile` and `Output.toSink` return `Output<E, R, 0>`; `Output.toStream` returns `Output<never, never, 1>`. `run` requires `0` and `stream` requires `1` (see [streaming output](runners.md#streaming-output)). An output chosen at runtime, such as `flag ? Output.toStream() : Output.toFile(path)`, counts as `0 | 1` and is accepted by neither. `S` defaults to `any`, meaning unknown, so `Command<E, R>` annotations still accept any command and pass both runners, with the check deferred to runtime.

Upgrading from versions without `S`: calls that always failed at runtime, `run` on a command with a stream output and `stream` on a command without exactly one, are now compile errors. Type-level code that compares commands or outputs to `Command<E, R>` or `Output<E, R>` exactly (instead of by assignability) must include the count. Reassigning a variable inferred with one count to a command with another, such as `let command = Command.make({})` followed by `command = command.withOutput(Output.toStream())`, needs a `Command<E, R>` annotation.

`Progress` contains camelCase progress fields, including `outTime` as an Effect `Duration` and `progress` as `"continue" | "end"`, plus the original `raw` values; see [progress](runners.md#progress). `RunResult` contains the executed `args` and bounded `stderr` diagnostics. `ProbeResult` exposes validated streams and optional format metadata, preserving unknown fields. Explicit probe options return `ProjectedProbeResult`, whose stream `index` may also be absent; the default `ProbeResult` still requires it.

Time values are seconds as numbers, raw FFmpeg strings, time objects, Effect `Duration.Duration`, or `Temporal.Duration`; see [time values](options.md#time-values), including the decimal-seconds rendering beyond 9999 hours. The `Temporal.Duration` member uses the global type only when your TypeScript `lib` includes `esnext.temporal` (or `esnext`); otherwise it drops out, and the declarations still compile.

Library failures are tagged errors suitable for `Effect.catchTag`:

- `CommandError`: invalid references, descriptor conflicts, invalid command structure, invalid time values, or reserved probe arguments. Included in both `FFmpegError` and `ProbeError`.
- `SpawnError`: binary startup failed.
- `ExitError`: nonzero or abnormal termination, with bounded stderr and the original cause when available.
- `PipeError`: I/O on a library-owned descriptor failed.
- `OutputError`: an output sink completed before EOF.
- `ProbeOutputError`: probe output exceeded the configured byte limit.
- `ProbeDecodeError`: output is not valid probe data.

Caller-defined input, output, and callback errors keep their original identity and type. Interruption stays interruption. Defects remain defects; they are not converted into ordinary domain failures. Output files may be partial after either failure or interruption, so automatic retry is deliberately absent.
