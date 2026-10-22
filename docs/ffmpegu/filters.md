# Filters

Filters are used to build `-vf`, `-af`, and `-filter_complex` graphs.

## API

- `ffmpegu.filters.custom(name, options?, inputs?, outputs?)`
- `ffmpegu.filters.label(value)`
- `ffmpegu.filters.chain(...filters)`
- `ffmpegu.filters.graph(...chains)`
- `ffmpegu.filters.builder()`
- Common helpers: `ffmpegu.filters.scale`, `ffmpegu.filters.fps`, `ffmpegu.filters.select`, `ffmpegu.filters.setpts`, `ffmpegu.filters.volume`, etc.

## Option values

- Booleans render as `key=1` or `key=0`, so `false` explicitly turns off options that default to on.
- Strings and numbers are escaped for both FFmpeg parsing layers (the filtergraph, then the option value). Special characters and leading or trailing whitespace reach the filter unchanged, so `drawtext({ text: " hello " })` keeps its spaces.

## Time options

The time fields of `fps` (`start_time`), `atrim` (`start`, `end`, `start_time`, `end_time`, `duration`), and `afade` (`start_time`, `duration`) accept time objects, Effect `Duration` values, and `Temporal.Duration` values in addition to plain filter values. They render as seconds (`start_time=1.25`), with microsecond precision for durations. Invalid durations fail compilation as for [time options](options.md#time-values).

```ts
import { Duration } from "effect"

ffmpegu.filters.atrim({
  start: Duration.seconds(5),
  duration: Temporal.Duration.from({ milliseconds: 1500 })
})
```

## Simple chain

```ts
const filterChain = ffmpegu.filters.chain(
  ffmpegu.filters.scale({ w: 640, h: 360 }),
  ffmpegu.filters.fps({ fps: 30 })
)

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.videoFilter(filterChain),
    ffmpegu.options.videoCodec("libx264")
  )
)
```

## Builder

`ffmpegu.filters.builder()` returns an immutable builder. Each `chain(...filters)` call returns a new builder with the chain appended and leaves the original unchanged, so a base builder can be reused safely. Filters, chains, graphs, builders and option bundles copy the arrays, option records and option tuples they receive, so changing those values afterwards does not change them.

```ts
const base = ffmpegu.filters
  .builder()
  .chain(ffmpegu.filters.scale({ w: 640, h: 360 }))
const withFps = base.chain(ffmpegu.filters.fps({ fps: 30 })).build()
const flipped = base.chain(ffmpegu.filters.hflip()).build()
// base.build() still renders only the scale chain.
```

> **Breaking change:** earlier versions mutated the builder in place and returned it. Code that calls `builder.chain(...)` without using the result now loses those chains. Use the returned builder instead, for example `builder = builder.chain(...)`, or chain the calls in one expression.

## Filter graphs with labels

```ts
const labelA = ffmpegu.filters.label("a")
const labelB = ffmpegu.filters.label("b")
const out1 = ffmpegu.filters.label("out1")
const out2 = ffmpegu.filters.label("out2")

const graph = ffmpegu.filters.graph(
  ffmpegu.filters.chain(
    ffmpegu.filters.custom("split", { outputs: 2 }, [], [labelA, labelB])
  ),
  ffmpegu.filters.chain(
    ffmpegu.filters.scale(
      { w: 640, h: 360 },
      { inputs: [labelA], outputs: [out1] }
    )
  ),
  ffmpegu.filters.chain(
    ffmpegu.filters.scale(
      { w: 320, h: 180 },
      { inputs: [labelB], outputs: [out2] }
    )
  )
)

const output = ffmpegu.output.toFile(
  "./output.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.filterComplex(graph),
    ffmpegu.options.map(out1)
  )
)
```

## Labeled outputs (multiple files)

```ts
const labelA = ffmpegu.filters.label("a")
const labelB = ffmpegu.filters.label("b")
const out1 = ffmpegu.filters.label("out1")
const out2 = ffmpegu.filters.label("out2")

const graph = ffmpegu.filters.graph(
  ffmpegu.filters.chain(
    ffmpegu.filters.custom("split", { outputs: 2 }, [], [labelA, labelB])
  ),
  ffmpegu.filters.chain(
    ffmpegu.filters.scale(
      { w: 640, h: 360 },
      { inputs: [labelA], outputs: [out1] }
    )
  ),
  ffmpegu.filters.chain(
    ffmpegu.filters.scale(
      { w: 320, h: 180 },
      { inputs: [labelB], outputs: [out2] }
    )
  )
)

const output1 = ffmpegu.output.toFile(
  "./out-1.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.filterComplex(graph),
    ffmpegu.options.map(out1),
    ffmpegu.options.videoCodec("libx264")
  )
)

const output2 = ffmpegu.output.toFile(
  "./out-2.mp4",
  ffmpegu.options.concat(
    ffmpegu.options.map(out2),
    ffmpegu.options.videoCodec("libx264")
  )
)

const command = ffmpegu.command({
  global: ffmpegu.options.custom("-y"),
  inputs: [ffmpegu.input.fromFile("./input.mp4")],
  outputs: [output1, output2]
})
```

## Labeled outputs to streams

```ts
import { FileSystem } from "effect"

// Inside Effect.gen with platform services provided:
const fs = yield * FileSystem.FileSystem

const outLabel = ffmpegu.filters.label("out")
const graph = ffmpegu.filters.graph(
  ffmpegu.filters.chain(
    ffmpegu.filters.scale({ w: 320, h: 180 }, { outputs: [outLabel] })
  )
)

const outSink = fs.sink("./out.mp4")
const output = ffmpegu.output.toSink(
  outSink,
  ffmpegu.options.concat(
    ffmpegu.options.filterComplex(graph),
    ffmpegu.options.map(outLabel),
    ffmpegu.options.format("mp4"),
    ffmpegu.options.movFlags("frag_keyframe+empty_moov"),
    ffmpegu.options.videoCodec("libx264")
  )
)
```

## Input stream labels

```ts
const input = ffmpegu.input.fromFile("./input.mp4")
const inputVideo = ffmpegu.filters.label(input.video)
const outLabel = ffmpegu.filters.label("scaled")

const graph = ffmpegu.filters.graph(
  ffmpegu.filters.chain(
    ffmpegu.filters.scale(
      { w: 320, h: 180 },
      { inputs: [inputVideo], outputs: [outLabel] }
    )
  )
)
```
