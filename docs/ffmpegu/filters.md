# Filters

The `filters` namespace builds FFmpeg filter expressions for `-vf`, `-af`, and `-filter_complex`. Filters, chains, and graphs are immutable values, and can be passed anywhere an option value is accepted.

| Concept | Builder                              | Renders as                      | Use with                       |
| ------- | ------------------------------------ | ------------------------------- | ------------------------------ |
| Filter  | `filters.scale({ w: 640, h: -2 })`    | `scale=w=640:h=-2`              | Inside chains                  |
| Chain   | `filters.chain(a, b)`                | `a,b`                           | `options.videoFilter`, `options.audioFilter` |
| Graph   | `filters.graph(chain1, chain2)`      | `chain1;chain2`                 | `options.filterComplex`        |
| Label   | `filters.label("out")`               | `[out]`                         | Filter inputs/outputs, `-map`  |

## Simple chains

```ts
import { Input, Options, Output, filters, options } from "ffmpegu"

const resize = filters.chain(
  filters.scale({ w: 1280, h: -2 }),
  filters.fps({ fps: 30 })
)

const output = Output.toFile(
  "720p.mp4",
  Options.create(options.videoFilter(resize), options.videoCodec("libx264"))
)
```

## Filter graphs and labels

Every filter helper takes an optional second argument `{ inputs?, outputs? }` with labels. A label is either a name or an input's stream reference:

```ts
import { Command, Input, Options, Output, filters, options } from "ffmpegu"

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

const command = Command.make({
  global: options.overwrite(),
  inputs: [main, logo],
  outputs: [
    Output.toFile(
      "watermarked.mp4",
      Options.create(
        options.filterComplex(graph),
        options.map(out),
        { map: main.audio.track(0) },
        options.audioCopy()
      )
    )
  ]
})
```

`filters.label(main.video)` renders `[0:v]` with the input's index resolved at compile time, like any other [stream reference](command.md#stream-references).

### One graph, several outputs

A `-filter_complex` graph is global to the command, so attach it to one output. Each output label can be consumed only once, so map each label from exactly one output and use `split` (or `asplit`) to give each consumer its own label:

```ts
import { Command, Input, Options, Output, filters, options } from "ffmpegu"

const [a, b, large, small] = ["a", "b", "large", "small"].map((name) =>
  filters.label(name)
)

const graph = filters.graph(
  filters.chain(filters.custom("split", { outputs: 2 }, [], [a, b])),
  filters.chain(filters.scale({ w: 1280, h: -2 }, { inputs: [a], outputs: [large] })),
  filters.chain(filters.scale({ w: 640, h: -2 }, { inputs: [b], outputs: [small] }))
)

const command = Command.make({
  global: options.overwrite(),
  inputs: [Input.fromFile("input.mp4")],
  outputs: [
    Output.toFile(
      "large.mp4",
      Options.create(options.filterComplex(graph), options.map(large))
    ),
    Output.toFile("small.mp4", options.map(small))
  ]
})
```

## Builder

`filters.builder()` collects chains into a graph. It is immutable: `chain(...)` returns a new builder and leaves the original unchanged, so a base builder can be shared.

```ts
import { filters } from "ffmpegu"

const base = filters.builder().chain(filters.scale({ w: 640, h: 360 }))
const withFps = base.chain(filters.fps({ fps: 30 })).build()
const flipped = base.chain(filters.hflip()).build()
// base.build() still renders only the scale chain.
```

Always use the returned builder: `builder.chain(...)` on its own has no effect.

## Option values

- **Escaping is automatic.** Strings and numbers are escaped for both of FFmpeg's parsing layers (the graph, then the option value). Pass raw text: `drawtext({ text: "It's 10:00, [live]" })` reaches the filter unchanged, including leading and trailing whitespace. Escaping does not disable a filter's own syntax: `drawtext` still expands `%{…}` sequences, so add `expansion: "none"` for literal text that may contain `%`.
- **Booleans are explicit.** `true` renders `key=1` and `false` renders `key=0`, so `false` turns off options that default to on. (In [option bundles](options.md#writing-raw-options), `false` omits the flag instead.)
- **Typed keys are hints.** Each helper types the options FFmpeg documents for that filter, but any other key is passed through, so options from newer FFmpeg versions work without a library update. FFmpeg validates names and values when it runs.
- **Bundles and filters nest.** A value can be another ffmpegu argument; its rendered arguments are joined with `:` and are not escaped, so a bundle can carry a raw fragment such as `fps({ fps: Options.create("1", "start_time=2") })`. [Time adapters](#time-options) are the exception: they are single values and are escaped like strings. Wrapping one in a bundle makes it raw again.

## Time options

The time fields of `fps` (`start_time`), `atrim` (`start`, `end`, `duration`), and `afade` (`start_time`, `duration`) also accept time objects, Effect `Duration`, and `Temporal.Duration`. They render as seconds (`start=1.25`), with microsecond precision for durations and millisecond precision for time objects. Strings and numbers pass through unchanged, so a string must use the filter's own syntax: `atrim` accepts timestamps such as `"00:01:30"`, but `fps`'s `start_time` takes seconds only. Invalid time values fail compilation as described in [time values](options.md#time-values).

```ts
import { Duration } from "effect"
import { filters } from "ffmpegu"

const trim = filters.atrim({
  start: Duration.seconds(5),
  duration: Temporal.Duration.from({ milliseconds: 1500 })
})
```

Other keys never convert time values, because filters read them in different units (`adelay` takes milliseconds, `atrim`'s `start_pts` takes time-base ticks). Where a key reads seconds or a duration, pass a [time adapter](options.md#time-adapters): `time.seconds(d)` renders seconds, and `time.timestamp(d)` renders `HH:MM:SS.mmm` with its colons escaped for the filtergraph. Check which form the option takes: `trim` and `atrim` accept both, but `fps`'s `start_time` takes seconds only.

```ts
import { Duration } from "effect"
import { filters, time } from "ffmpegu"

const trim = filters.custom("trim", {
  start: time.timestamp(Duration.minutes(90)),
  duration: time.seconds(Duration.millis(2500))
})
// trim=start=01\\:30\\:00.000:duration=2.5
```

## Helper reference

Any filter can be built with `filters.custom(name, options?, inputs?, outputs?)`. Typed helpers exist for frequently used filters:

| Video       | Typed options                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| `scale`     | `w`, `h`, `flags`, `interl`, `eval`, `force_original_aspect_ratio`, `force_divisible_by`, `reset_sar` |
| `fps`       | `fps`, `start_time`, `round`, `eof_action`                                       |
| `crop`      | `w`, `h`, `x`, `y`, `keep_aspect`, `exact`                                       |
| `pad`       | `w`, `h`, `x`, `y`, `color`, `eval`, `aspect`                                    |
| `format`    | `pix_fmts`                                                                       |
| `setsar`    | `sar`, `max`                                                                     |
| `setdar`    | `dar`, `max`                                                                     |
| `transpose` | `dir`, `passthrough`                                                             |
| `hflip`, `vflip` | none                                                                        |
| `overlay`   | `x`, `y`, `shortest`, `repeatlast`, `format`, `eof_action`, `alpha`              |
| `drawtext`  | `text`, `textfile`, `fontfile`, `font`, `fontsize`, `fontcolor`, `box`, `boxcolor`, `boxborderw`, `x`, `y`, `shadowx`, `shadowy`, `borderw`, `line_spacing`, `enable` |
| `select`    | `expr`, `outputs`                                                                |
| `setpts`    | `expr`                                                                           |

| Audio       | Typed options                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| `volume`    | `volume`, `precision`, `replaygain`, `eval`                                      |
| `atempo`    | `tempo`                                                                          |
| `aresample` | `sample_rate`, `resampler`, `async`, `first_pts`, `min_comp`, `cutoff`           |
| `atrim`     | `start`, `end`, `duration`, `start_pts`, `end_pts`, `start_sample`, `end_sample` |
| `asetpts`   | `expr`                                                                           |
| `afade`     | `type`, `start_time`, `duration`, `start_sample`, `nb_samples`, `curve`          |
| `highpass`, `lowpass` | `f`, `width_type`, `width`, `poles`, `mix`                             |
| `aformat`   | `sample_fmts`, `sample_rates`, `channel_layouts`                                 |

For what each filter does, see the [FFmpeg filters documentation](https://ffmpeg.org/ffmpeg-filters.html).
