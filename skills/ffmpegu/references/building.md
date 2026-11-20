# Building commands, options, and filters

Everything here is pure: building values never spawns a process or touches the filesystem.

## Imports

Use named exports: `import { Command, Input, Output, Options, Filter, Time } from "ffmpegu"`. `Options`, `Filter`, and `Time` are namespaces holding a constructor, helpers, and types (`Options.Options` is the bundle type, `Filter.ScaleOptions` a helper's options). There is no default export, and the names of 0.5 and earlier (`options.*`, `filters.*`, `Options.create`, `FFmpegu*` classes, bare `run`/`probe`) no longer exist.

## Commands

```ts
Command.make({ global?: Arg, inputs?: Input[], outputs?: Output[] }): Command<E, R, S>
command.withGlobal(options: Arg)                    // appends to existing global options
command.withInput(input) / command.withOutput(output)
Command.withOutput(output)(command)                 // data-last, for command.pipe(...)
Command.withOutput(command, output)                 // data-first; same for withGlobal/withInput
command.compile(): Result<CompiledCommand<E, R>, CommandError>
command.toArgs(): Result<ReadonlyArray<string>, CommandError>
```

Rendering: `[global] ([input options] -i <input>)... ([output options] <output>)...`. `toArgs` omits the flags the runner prepends (`-nostdin`, plus `-progress pipe:3 -nostats` with `onProgress`). Stream inputs and outputs render as `pipe:<fd>`, with descriptors from 4.

Type parameters:

- `E` and `R`: unions of the error and requirement types of all input streams and output sinks.
- `S`: number of `Output.toStream` outputs, `0`, `1`, or `2` (two or more). `FFmpeg.run` requires `0` and `FFmpeg.stream` requires `1`. `S = any` (from a `Command<E, R>` annotation, `new Output(...)`, or arrays of unknown length) defers the check to runtime. An output chosen by a ternary has `S = 0 | 1` and fits neither runner, so branch on the whole command instead.

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
Input.fromFile(pathOrUrl: string, ...options: Arg[]): Input<never, never>
Input.fromStream(stream: Stream<Uint8Array, E, R>, ...options: Arg[]): Input<E, R>
Output.toFile(path: string, ...options: Arg[]): Output<never, never, 0>
Output.toSink(sink: Sink<void, Uint8Array, never, E, R>, ...options: Arg[]): Output<E, R, 0>
Output.toStream(...options: Arg[]): Output<never, never, 1>
```

- `Arg` (`Options.Arg`) is any [option form](#option-bundles): a bundle, a record, a tuple, or a verbatim string. Pass them directly, as in `Output.toFile("out.mp4", Options.videoCodec("libx264"), { crf: 23 })`; no `Options.make` wrapper is needed, and `undefined` entries are skipped, so an optional bundle can be passed as it is. `global` and `withGlobal` take one form, so wrap several in `Options.make`.
- An input's `options` are input options, placed before its `-i`. Put `Options.startTime(t)` there for a fast seek.
- `fromFile` passes the string to FFmpeg unchanged: paths, URLs, image sequences (`frames/%04d.png`), and `lavfi` sources (`Input.fromFile("testsrc2=size=640x360:duration=2", Options.format("lavfi"))`).
- Stream inputs are written in the batches the stream emits, without copying. The feeder holds at most three batches ahead of the pipe (OS pipe buffers can absorb more), and the source must not mutate or reuse an emitted buffer until the run settles. A failing stream closes its pipe and fails the run with the stream's own error.
- Sinks must consume through EOF, or the run fails with `OutputError` (reason `SinkEndedEarly`). Map sinks with other results to `void` with `Sink.map(sink, () => undefined)`.
- Pipes are not seekable. See [streaming.md](streaming.md#pipes-and-sinks) for pipe format requirements.

## Stream references

| Expression (on the second input) | Renders |
| --- | --- |
| `input.video` | `1:v` |
| `input.audio` / `input.subtitle` / `input.data` | `1:a` / `1:s` / `1:d` |
| `input.audio.track(1)` | `1:a:1` |
| `Filter.label(input.video)` | `[1:v]` |

Indices are resolved when the command compiles. Never hand-write specifiers like `0:v`.

## Option bundles

```ts
Options.make(...args: Arg[]): Options.Options  // bundles nest, so this also extends and concatenates
```

| Argument | Renders |
| --- | --- |
| `"-y"` | `-y`, verbatim |
| `["c:v", "libx264"]` | `-c:v libx264` |
| `["shortest"]` | `-shortest` |
| `{ "c:v": "libx264", crf: 23 }` | `-c:v libx264 -crf 23`, in key order |
| `{ shortest: true, an: false, crf: undefined }` | `-shortest` (`false` and `undefined` omit the option) |
| `{ map: input.audio.track(1) }` | `-map 1:a:1` |
| `Options.crf(23)`, or any other bundle | its rendered arguments |

- Names get a leading `-` when missing. There is no shell, so values need no quoting.
- Nesting only appends; nothing is deduplicated or overridden. `Options.make(Options.crf(20), Options.crf(28))` renders `-crf 20 -crf 28`, and FFmpeg's own rule for repeated options applies.
- References, labels, and filters are option values, never entries on their own: write `{ map: input.video }` or `Options.map(input.video)`.
- A record cannot repeat a key, so use separate entries for repeated options such as several `map`s.

## General helpers

All `Options.*` helpers return bundles. Codec, format, and preset parameters are open string unions: listed values autocomplete, and any string FFmpeg accepts works.

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

`startTime`, `duration`, `to`, the duration keys of `Options.hls`/`Options.dash` (rendered as seconds, like filters), and the time keys of the `fps`, `atrim`, and `afade` filters accept:

| Value | Renders as option | Renders in filter |
| --- | --- | --- |
| `90.5` (seconds) | `90.5` | `90.5` |
| `"00:01:30.5"` (verbatim) | `00:01:30.5` | `00:01:30.5` (must be in the filter's own syntax: `atrim` accepts timestamps, but `fps.start_time` takes seconds only) |
| `{ minutes: 1, seconds: 30, milliseconds: 500 }` | `00:01:30.500` | `90.5` |
| `Duration.millis(1500)` | `00:00:01.500` | `1.5` |
| `Temporal.Duration.from({ seconds: 2, microseconds: 5 })` | `00:00:02.000005` | `2.000005` |

Pass Effect `Duration` values, never a bare `Duration.Input` number, because a number means seconds here. Time objects are truncated to milliseconds. Infinite durations, time objects with non-finite fields, values beyond 2^63 − 1 µs, and `Temporal.Duration` values with years, months, or weeks fail compilation with `InvalidArgument`.

No other key converts time values, since FFmpeg options read different units (`adelay` takes milliseconds, `atrim.start_pts` takes ticks). Convert explicitly with the `Time` adapters, which take a `Duration`, `Temporal.Duration`, or time object and work as any option or filter value:

| Adapter | Option | Filter |
| --- | --- | --- |
| `Time.seconds(Duration.millis(61500))` | `61.5` | `61.5` |
| `Time.timestamp(Duration.millis(61500))` | `00:01:01.500` | `00:01:01.500`, colons escaped |

```ts
Filter.make("trim", { start: Time.timestamp(Duration.minutes(90)) })  // trim=start=01\\:30\\:00.000
Options.make(Options.format("segment"), { segment_time: Time.seconds(Duration.millis(2500)) })
// -f segment -segment_time 2.5
```

Use the form the option reads: `trim`/`atrim` accept both, `fps.start_time` takes seconds only.

## Filters

```ts
Filter.make(name, options?, { inputs?, outputs? })  // any filter by name
Filter.scale(options?, { inputs?, outputs? })       // every typed helper has this shape
Filter.chain(...filters)             // "a,b"
Filter.graph(...chainsOrFilters)     // "c1;c2" → Options.filterComplex(graph); a filter is a chain of one
Filter.label("name")                 // [name], also usable as an option value: Options.map(label)
Options.videoFilter(...filters) / Options.audioFilter(...filters)  // one filter, several (a chain), a chain, or a raw string
```

- `inputs` take names, stream references, and labels directly (`{ inputs: [main.video, "logo"] }`); `outputs` take names and labels. Use `Filter.label` only for a label you also pass to `-map`.
- Values are escaped automatically for both FFmpeg parsing layers, including surrounding whitespace. Pass raw text. Escaping does not turn off a filter's own expansion: `drawtext` interprets `%` sequences, so set `expansion: "none"` for literal text.
- In filters, booleans render `key=1`/`key=0`. This differs from option bundles, where `false` omits the flag.
- Typed helper keys are hints: extra keys pass through to FFmpeg.
- An ffmpegu argument as a filter value (such as an `Options` bundle) is spliced in raw, joined with `:`. `Time.*` adapters are the exception and are escaped.
- A `-filter_complex` graph is global to the command. Attach it to one output. Each output label can be consumed once: map it from exactly one output, and use `split`/`asplit` to create one label per consumer.

```ts
const main = Input.fromFile("main.mp4")
const logo = Input.fromFile("logo.png")
const out = Filter.label("out")
const graph = Filter.graph(
  Filter.overlay(
    { x: "main_w-overlay_w-16", y: 16 },
    { inputs: [main.video, logo.video], outputs: [out] }
  )
)
const output = Output.toFile(
  "watermarked.mp4",
  Options.filterComplex(graph),
  Options.map(out),
  { map: main.audio.track(0) },
  Options.audioCopy()
)
// -filter_complex [0:v][1:v]overlay=x=main_w-overlay_w-16:y=16[out] -map [out] -map 0:a:0 -c:a copy watermarked.mp4
```
