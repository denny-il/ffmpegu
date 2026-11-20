# ffmpegu documentation

ffmpegu describes FFmpeg commands with immutable builders and executes them through Effect v4 services on Node.js 26.3+ and Bun 1.4.3+, on Linux and macOS.

## Guide

Read these in order the first time.

1. [Getting started](ffmpegu/getting-started.md): install, the describe/compile/execute model, and providing the services.
2. [Commands](ffmpegu/command.md): building commands, stream references, compiling, and validation rules.
3. [Inputs and outputs](ffmpegu/inputs-outputs.md): files and URLs, Effect streams and sinks, pipe format requirements.
4. [Running FFmpeg](ffmpegu/running.md): `FFmpeg.run`, streaming output, progress, cancellation, concurrency, and tracing.
5. [FFprobe](ffmpegu/ffprobe.md): probing, selecting metadata, and decoding with your own schema.

## Reference

- [Options](ffmpegu/options.md): raw option forms, every helper and the flags it renders, time values, HLS and DASH.
- [Filters](ffmpegu/filters.md): chains, graphs, labels, value escaping, and every typed filter helper.
- [Errors and types](ffmpegu/errors.md): tagged errors and reasons, sensitive diagnostics, and the `E`/`R`/`S` type parameters.
- [Configuration and testing](ffmpegu/configuration.md): Layer options, `layerConfig`, and testing with mocks.
- [Recipes](ffmpegu/recipes.md): complete examples for common media tasks.

## Exports at a glance

| Export                                 | Purpose                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `Command`, `Input`, `Output`           | Immutable descriptions of an FFmpeg invocation                     |
| `Options`                              | Option bundles (`Options.make`) and helpers such as `Options.crf(23)` and `Options.hls({...})` |
| `Filter`                               | Filters (`Filter.make`), typed helpers, chains, graphs, and labels |
| `Time`                                 | `Time.seconds(d)` and `Time.timestamp(d)` time value adapters     |
| `FFmpeg`, `FFprobe`                    | Effect services with `layer` and `layerConfig`                     |
| `FFmpeg.run`, `FFmpeg.stream`, `FFprobe.probe`, `FFprobe.probeWith`  | Execution Effects and Streams that use the services                |
| `Argument`                             | Base class for your own option and filter values                   |
| `CommandError`, `ExitError`, …         | Tagged errors and their reasons                                    |
| `ProbeResult`, `ProjectedProbeResult`, … | Probe result schemas                                             |

`Options`, `Filter`, and `Time` are namespaces: each holds its constructor, its helpers, and its types, such as `Options.Options` (a bundle), `Options.VideoCodec`, `Filter.Filter`, and `Filter.ScaleOptions`. There is no default export.

## Compatibility

Typed option and filter names are verified against FFmpeg 6.1 through 9.0; the few exceptions, such as `scale`'s `reset_sar` (8.0+), say so in their hints. Keys without a typed hint always pass through unchanged, so options from newer FFmpeg releases work without a library update. Which encoders, muxers, and filters are available depends on your FFmpeg build: check with `ffmpeg -encoders`, `ffmpeg -muxers`, or `ffmpeg -filters`.

## FFmpeg reference

For FFmpeg's own options, codecs, formats, and filters, see the [upstream documentation](https://ffmpeg.org/documentation.html): [ffmpeg](https://ffmpeg.org/ffmpeg.html), [ffprobe](https://ffmpeg.org/ffprobe.html), [filters](https://ffmpeg.org/ffmpeg-filters.html), [formats](https://ffmpeg.org/ffmpeg-formats.html), [codecs](https://ffmpeg.org/ffmpeg-codecs.html), and [protocols](https://ffmpeg.org/ffmpeg-protocols.html).

ffmpegu is independent of the FFmpeg project; see the [FFmpeg legal notice](https://ffmpeg.org/legal.html) for FFmpeg's trademarks and licensing.
