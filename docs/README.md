# ffmpegu documentation

ffmpegu describes FFmpeg commands with immutable builders and executes them through Effect v4 services on Node.js 26.3+ and Bun 1.4.3+, on Linux and macOS.

## Guide

Read these in order the first time.

1. [Getting started](ffmpegu/getting-started.md): install, the describe/compile/execute model, and providing the services.
2. [Commands](ffmpegu/command.md): building commands, stream references, compiling, and validation rules.
3. [Inputs and outputs](ffmpegu/inputs-outputs.md): files and URLs, Effect streams and sinks, pipe format requirements.
4. [Running FFmpeg](ffmpegu/running.md): `run`, streaming output, progress, cancellation, concurrency, and tracing.
5. [FFprobe](ffmpegu/ffprobe.md): probing, selecting metadata, and decoding with your own schema.

## Reference

- [Options](ffmpegu/options.md): raw option forms, every helper and the flags it renders, time values, HLS and DASH.
- [Filters](ffmpegu/filters.md): chains, graphs, labels, the builder, value escaping, and every typed filter helper.
- [Errors and types](ffmpegu/errors.md): tagged errors and reasons, sensitive diagnostics, and the `E`/`R`/`S` type parameters.
- [Configuration and testing](ffmpegu/configuration.md): Layer options, `layerConfig`, and testing with mocks.
- [Recipes](ffmpegu/recipes.md): complete examples for common media tasks.

## Exports at a glance

| Export                                 | Purpose                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `Command`, `Input`, `Output`           | Immutable descriptions of an FFmpeg invocation                     |
| `Options`                              | Raw option bundles: `Options.create`, `concat`, `merge`            |
| `options`                              | Option helpers such as `options.crf(23)` and `options.hls({...})`   |
| `filters`                              | Filter helpers, chains, graphs, labels, and the builder           |
| `FFmpeg`, `FFprobe`                    | Effect services with `layer` and `layerConfig`                     |
| `run`, `stream`, `probe`, `probeWith`  | Execution Effects and Streams that use the services                |
| `CommandError`, `ExitError`, …         | Tagged errors and their reasons                                    |
| `ProbeResult`, `ProjectedProbeResult`, … | Probe result schemas                                             |

Every builder class is also exported under its `FFmpegu*` name (for example `FFmpeguCommand`), and the default export `ffmpegu` groups the pure builders as `ffmpegu.command`, `ffmpegu.input`, `ffmpegu.output`, `ffmpegu.options`, and `ffmpegu.filters`. Prefer the named exports.

## FFmpeg reference

For FFmpeg's own options, codecs, formats, and filters, see the [upstream documentation](https://ffmpeg.org/documentation.html): [ffmpeg](https://ffmpeg.org/ffmpeg.html), [ffprobe](https://ffmpeg.org/ffprobe.html), [filters](https://ffmpeg.org/ffmpeg-filters.html), [formats](https://ffmpeg.org/ffmpeg-formats.html), [codecs](https://ffmpeg.org/ffmpeg-codecs.html), and [protocols](https://ffmpeg.org/ffmpeg-protocols.html).

ffmpegu is independent of the FFmpeg project; see the [FFmpeg legal notice](https://ffmpeg.org/legal.html) for FFmpeg's trademarks and licensing.
