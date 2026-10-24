# Building commands, options, and filters

Everything here is pure: building values never spawns a process or touches the filesystem.

## Imports

Use named exports: `import { Command, Input, Output, Options, options, filters } from "ffmpegu"`. A default export `ffmpegu` (`ffmpegu.command`, `ffmpegu.input`, …) and `FFmpegu*` class names (`FFmpeguCommand`, …) exist as aliases; don't generate code with them.

## Commands

```ts
Command.make({ global?: Options, inputs?: Input[], outputs?: Output[] }): Command<E, R, S>
Command.create                                      // alias of make
command.withGlobal(options)                         // appends to existing global options
command.withInput(input) / command.withOutput(output)
Command.withOutput(output)(command)                 // data-last, for command.pipe(...)
Command.withOutput(command, output)                 // data-first; same for withGlobal/withInput
command.compile(): Result<CompiledCommand<E, R>, CommandError>
Command.toArgs(command): Result<ReadonlyArray<string>, CommandError>
```

Rendering: `[global] ([input options] -i <input>)... ([output options] <output>)...`. `toArgs` omits the flags the runner prepends (`-nostdin`, plus `-progress pipe:3 -nostats` with `onProgress`). Stream inputs and outputs render as `pipe:<fd>`, with descriptors from 4.

Type parameters:

- `E` and `R`: unions of the error and requirement types of all input streams and output sinks.
- `S`: number of `Output.toStream` outputs, `0`, `1`, or `2` (two or more). `run` requires `0` and `stream` requires `1`. `S = any` (from a `Command<E, R>` annotation, `new Output(...)`, or arrays of unknown length) defers the check to runtime. An output chosen by a ternary has `S = 0 | 1` and fits neither runner, so branch on the whole command instead.

Compile failures are `CommandError` with a tagged `reason`:

| Reason | Cause |
| --- | --- |
| `DuplicateInput` / `DuplicateOutput` | The same object appears twice. Create a second `Input.fromFile` for the same file. |
| `ForeignReference` | A stream reference points at an input that is not in this command. |
| `ReservedPath` | A path or option value is `pipe:…`, `fd:…`, `/dev/std*`, `/dev/fd/*`, or `/proc/*/fd/*`, or an input or output path is `-`. |
| `ReservedOption` | Options set `-i`, `-progress`, or `-stdin`, including forms such as `-progress:v`. |
| `InvalidArgument` | Invalid duration, track index outside 0..2147483647, output path starting with `-` (write `./-x.mp4`), or a builder that threw. |
| `StreamOutput` | Wrong runner for the stream-output count, when it was unknown at compile time. |

A standalone token spelled exactly like a reserved option is rejected even as another option's value; embedded text such as `title=-i` is fine.

## Inputs and outputs

```ts
Input.fromFile(pathOrUrl: string, options?: Options): Input<never, never>
Input.fromStream(stream: Stream<Uint8Array, E, R>, options?: Options): Input<E, R>
Output.toFile(path: string, options?: Options): Output<never, never, 0>
Output.toSink(sink: Sink<void, Uint8Array, never, E, R>, options?: Options): Output<E, R, 0>
Output.toStream(options?: Options): Output<never, never, 1>
```

- An input's `options` are input options, placed before its `-i`. Put `options.startTime(t)` there for a fast seek.
- `fromFile` passes the string to FFmpeg unchanged: paths, URLs, image sequences (`frames/%04d.png`), and `lavfi` sources (`Input.fromFile("testsrc2=size=640x360:duration=2", options.format("lavfi"))`).
- Stream inputs are written in the batches the stream emits, without copying. The feeder holds at most three batches ahead of the pipe (OS pipe buffers can absorb more), and the source must not mutate or reuse an emitted buffer until the run settles. A failing stream closes its pipe and fails the run with the stream's own error.
- Sinks must consume through EOF, or the run fails with `OutputError` (reason `SinkEndedEarly`). Map sinks with other results to `void` with `Sink.map(sink, () => undefined)`.
- Pipes are not seekable. See [streaming.md](streaming.md#pipes-and-sinks) for pipe format requirements.

## Stream references

| Expression (on the second input) | Renders |
| --- | --- |
| `input.video` | `1:v` |
| `input.audio` / `input.subtitle` / `input.data` | `1:a` / `1:s` / `1:d` |
| `input.audio.track(1)` | `1:a:1` |
| `filters.label(input.video)` | `[1:v]` |

Indices are resolved when the command compiles. Never hand-write specifiers like `0:v`.

## Option bundles

```ts
Options.create(...args)          // alias options.custom
Options.concat(bundle, ...args)  // alias options.concat; first argument must be a bundle
Options.merge(...bundles)        // alias options.merge
```

| Argument | Renders |
| --- | --- |
| `"-y"` | `-y`, verbatim |
| `["c:v", "libx264"]` | `-c:v libx264` |
| `["shortest"]` | `-shortest` |
| `{ "c:v": "libx264", crf: 23 }` | `-c:v libx264 -crf 23`, in key order |
| `{ shortest: true, an: false }` | `-shortest` (`false` omits the flag) |
| `{ map: input.audio.track(1) }` | `-map 1:a:1` |
| `options.crf(23)`, or any other bundle or filter | its rendered arguments |

- Names get a leading `-` when missing. There is no shell, so values need no quoting.
- `merge` and `concat` only append; nothing is deduplicated or overridden. `Options.merge(options.crf(20), options.crf(28))` renders `-crf 20 -crf 28`, and FFmpeg's own rule for repeated options applies.
- A record cannot repeat a key, so use separate entries for repeated options such as several `map`s.

## General helpers

All `options.*` helpers return bundles. Codec, format, and preset parameters are open string unions: listed values autocomplete, and any string FFmpeg accepts works.

| Helper | Renders |
| --- | --- |
| `overwrite()` / `noOverwrite()` | `-y` / `-n` |
| `format(name)` | `-f name` |
| `map(ref)` | `-map ref` |
| `copy()` | `-c copy` |
| `noVideo()` / `noAudio()` / `noSubtitle()` / `noData()` | `-vn` / `-an` / `-sn` / `-dn` |
| `subtitleCodec(c)` / `subtitleCopy()` | `-c:s c` / `-c:s copy` |
| `startTime(t)` / `duration(t)` / `to(t)` | `-ss t` / `-t t` / `-to t` |
| `shortest()` | `-shortest` |
| `metadata(key, value)` | `-metadata key=value` |
| `movFlags(flags)` | `-movflags flags` |
| `filterComplex(graph)` | `-filter_complex graph` |
| `logLevel(level)` | `-loglevel level` |
| `threads(n)` | `-threads n` |

Video helpers are in [video.md](video.md), audio helpers in [audio.md](audio.md), and `hls`/`dash` in [streaming.md](streaming.md).

## Time values

`startTime`, `duration`, `to`, the duration keys of `options.hls`/`options.dash` (rendered as seconds, like filters), and the time keys of the `fps`, `atrim`, and `afade` filters accept:

| Value | Renders as option | Renders in filter |
| --- | --- | --- |
| `90.5` (seconds) | `90.5` | `90.5` |
| `"00:01:30.5"` (verbatim) | `00:01:30.5` | `00:01:30.5` (must be in the filter's own syntax: `atrim` accepts timestamps, but `fps.start_time` takes seconds only) |
| `{ minutes: 1, seconds: 30, milliseconds: 500 }` | `00:01:30.500` | `90.5` |
| `Duration.millis(1500)` | `00:00:01.500` | `1.5` |
| `Temporal.Duration.from({ seconds: 2, microseconds: 5 })` | `00:00:02.000005` | `2.000005` |

Pass Effect `Duration` values, never a bare `Duration.Input` number, because a number means seconds here. Infinite durations and `Temporal.Duration` values with years, months, or weeks fail compilation with `InvalidArgument`.

No other key converts time values, since FFmpeg options read different units (`adelay` takes milliseconds, `atrim.start_pts` takes ticks). Convert explicitly with the `time` adapters, which take a `Duration`, `Temporal.Duration`, or time object and work as any option or filter value:

| Adapter | Option | Filter |
| --- | --- | --- |
| `time.seconds(Duration.millis(61500))` | `61.5` | `61.5` |
| `time.timestamp(Duration.millis(61500))` | `00:01:01.500` | `00:01:01.500`, colons escaped |

```ts
filters.custom("trim", { start: time.timestamp(Duration.minutes(90)) })  // trim=start=01\\:30\\:00.000
Options.create(options.format("segment"), { segment_time: time.seconds(Duration.millis(2500)) })
// -f segment -segment_time 2.5
```

Use the form the option reads: `trim`/`atrim` accept both, `fps.start_time` takes seconds only. Wrapping an adapter in `Options.create(...)` inside a filter makes it a raw, unescaped fragment.

## Filters

```ts
filters.custom(name, options?, inputs?: Label[], outputs?: Label[])
filters.label("name") | filters.label(input.video)  // [name] / [0:v]
filters.chain(...filters)  // "a,b"   → options.videoFilter(chain) / options.audioFilter(chain)
filters.graph(...chains)   // "c1;c2" → options.filterComplex(graph)
filters.builder().chain(...filters).chain(...).build()  // immutable: use the returned builder
filters.scale(options?, { inputs?, outputs? })           // every typed helper has this shape
```

- Values are escaped automatically for both FFmpeg parsing layers, including surrounding whitespace. Pass raw text. Escaping does not turn off a filter's own expansion: `drawtext` interprets `%` sequences, so set `expansion: "none"` for literal text.
- In filters, booleans render `key=1`/`key=0`. This differs from option bundles, where `false` omits the flag.
- Typed helper keys are hints: extra keys pass through to FFmpeg.
- An ffmpegu argument as a filter value (such as an `Options` bundle) is spliced in raw, joined with `:`. `time.*` adapters are the exception and are escaped.
- A `-filter_complex` graph is global to the command. Attach it to one output. Each output label can be consumed once: map it from exactly one output, and use `split`/`asplit` to create one label per consumer.

```ts
const main = Input.fromFile("main.mp4")
const logo = Input.fromFile("logo.png")
const out = filters.label("out")
const graph = filters.graph(
  filters.chain(
    filters.overlay(
      { x: "main_w-overlay_w-16", y: 16 },
      { inputs: [filters.label(main.video), filters.label(logo.video)], outputs: [out] }
    )
  )
)
const output = Output.toFile(
  "watermarked.mp4",
  Options.create(options.filterComplex(graph), options.map(out), { map: main.audio.track(0) }, options.audioCopy())
)
// -filter_complex [0:v][1:v]overlay=x=main_w-overlay_w-16:y=16[out] -map [out] -map 0:a:0 -c:a copy watermarked.mp4
```
