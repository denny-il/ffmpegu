# API overview

The public entry point exports:

- `Input`, `Output`, and `Command`: immutable operation descriptions carrying their error and service types.
- `Options`, `options`, and `filters`: composable FFmpeg arguments and filter graphs.
- `FFmpeg` and `FFprobe`: injectable Effect services, with configurable live Layers.
- `run` and `probe`: service-accessor Effects; applications own their runtime.
- Tagged errors and result/progress types.

Pure builders perform no filesystem operations and spawn no processes. Execution acquires a fresh scope, starts the binary, supervises input/output fibers, and releases resources on success, failure, or interruption.

`effect` is a peer dependency. Platform packages are supplied by applications. The public execution effects expose domain service requirements; the live Layers require Effect's `ChildProcessSpawner`. That platform API is currently unstable, so the supported Effect peer range is intentionally constrained to the tested 4.0 patch series.

See [the application example](../README.md).
