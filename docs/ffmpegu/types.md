# Types and errors

`Command<E, R>` tracks errors and services required by its input streams and output sinks. `run` adds the FFmpeg service and execution errors, plus any errors/services required by `onProgress`. File-only commands have no stream requirements.

`Progress` contains parsed progress fields and the original `raw` values. `RunResult` contains the executed `args` and bounded `stderr` diagnostics. `ProbeResult` exposes validated streams and optional format metadata, preserving unknown fields. Explicit probe options return `ProjectedProbeResult`, whose stream `index` may also be absent; the default `ProbeResult` still requires it.

Time values are seconds as numbers, raw FFmpeg strings, time objects, Effect `Duration.Duration`, or `Temporal.Duration`; see [time values](options.md#time-values). The `Temporal.Duration` member uses the global type only when your TypeScript `lib` includes `esnext.temporal` (or `esnext`); otherwise it drops out, and the declarations still compile.

Library failures are tagged errors suitable for `Effect.catchTag`:

- `CommandError`: invalid references, descriptor conflicts, invalid command structure, invalid time values, or reserved probe arguments. Included in both `FFmpegError` and `ProbeError`.
- `SpawnError`: binary startup failed.
- `ExitError`: nonzero or abnormal termination, with bounded stderr and the original cause when available.
- `PipeError`: I/O on a library-owned descriptor failed.
- `OutputError`: an output sink completed before EOF.
- `ProbeOutputError`: probe output exceeded the configured byte limit.
- `ProbeDecodeError`: output is not valid probe data.

Caller-defined input, output, and callback errors keep their original identity and type. Interruption stays interruption. Defects remain defects; they are not converted into ordinary domain failures. Output files may be partial after either failure or interruption, so automatic retry is deliberately absent.
