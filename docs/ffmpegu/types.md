# Types and errors

`Command<E, R>` tracks errors and services required by its input streams and output sinks. `run` adds the FFmpeg service and execution errors, plus any errors/services required by `onProgress`. File-only commands have no stream requirements.

`Progress` contains parsed progress fields and the original `raw` values. `RunResult` contains the executed `args` and bounded `stderr` diagnostics. `ProbeResult` exposes validated streams and optional format metadata, preserving unknown fields.

Library failures are tagged errors suitable for `Effect.catchTag`:

- `CommandError`: invalid references, descriptor conflicts, or invalid command structure.
- `SpawnError`: binary startup failed.
- `ExitError`: nonzero or abnormal termination, with bounded stderr and the original cause when available.
- `PipeError`: I/O on a library-owned descriptor failed.
- `OutputError`: an output sink completed before EOF.
- `ProbeOutputError`: probe output exceeded the configured byte limit.
- `ProbeDecodeError`: output is not valid probe data.

Caller-defined input, output, and callback errors keep their original identity and type. Interruption stays interruption. Defects remain defects; they are not converted into ordinary domain failures. Output files may be partial after either failure or interruption, so automatic retry is deliberately absent.
