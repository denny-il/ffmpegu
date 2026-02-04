# Filters

Filters are used to build `-vf`, `-af`, and `-filter_complex` graphs.

## API

- `ffmpegu.filters.custom(name, options?, inputs?, outputs?)`
- `ffmpegu.filters.label(value)`
- `ffmpegu.filters.chain(...filters)`
- `ffmpegu.filters.graph(...chains)`
- `ffmpegu.filters.builder()`
- Common helpers: `ffmpegu.filters.scale`, `ffmpegu.filters.fps`, `ffmpegu.filters.select`, `ffmpegu.filters.setpts`, `ffmpegu.filters.volume`, etc.

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
    ffmpegu.filters.scale({ w: 640, h: 360 }, { inputs: [labelA], outputs: [out1] })
  ),
  ffmpegu.filters.chain(
    ffmpegu.filters.scale({ w: 320, h: 180 }, { inputs: [labelB], outputs: [out2] })
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
    ffmpegu.filters.scale({ w: 640, h: 360 }, { inputs: [labelA], outputs: [out1] })
  ),
  ffmpegu.filters.chain(
    ffmpegu.filters.scale({ w: 320, h: 180 }, { inputs: [labelB], outputs: [out2] })
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
import { createWriteStream } from "node:fs"

const outLabel = ffmpegu.filters.label("out")
const graph = ffmpegu.filters.graph(
  ffmpegu.filters.chain(
    ffmpegu.filters.scale({ w: 320, h: 180 }, { outputs: [outLabel] })
  )
)

const outStream = createWriteStream("./out.mp4")
const output = ffmpegu.output.toStream(
  outStream,
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
    ffmpegu.filters.scale({ w: 320, h: 180 }, { inputs: [inputVideo], outputs: [outLabel] })
  )
)
```
