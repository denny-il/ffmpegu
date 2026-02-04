# Options

Options are composed using `ffmpegu.options.custom(...)` and helpers in `ffmpegu.options.*`.

## API

- `ffmpegu.options.custom(...args)` → builds an options bundle.
- `ffmpegu.options.merge(...options)` → merges bundles.
- `ffmpegu.options.concat(base, ...args)` → appends args to a bundle.

Common helpers:

- Codecs: `videoCodec`, `audioCodec`, `subtitleCodec`, `copy`, `videoCopy`, `audioCopy`
- Bitrates: `videoBitrate`, `audioBitrate`, `minRate`, `maxRate`, `bufferSize`
- Quality: `crf`, `preset`, `tune`, `profileVideo`, `profileAudio`, `level`
- Timing: `startTime`, `duration`, `to`
- Mapping: `map`
- Filters: `videoFilter`, `audioFilter`, `filterComplex`
- Containers: `format`, `movFlags`
- Streaming: `hls`, `dash`

## Examples

```ts
const opts = ffmpegu.options.concat(
  "-y",
  ffmpegu.options.videoCodec("libx264"),
  ffmpegu.options.crf(23),
  ffmpegu.options.audioCodec("aac"),
  ffmpegu.options.audioBitrate(192, "k")
)
```

```ts
const filterChain = ffmpegu.filters.chain(
  ffmpegu.filters.scale({ w: 640, h: 360 })
)

const opts = ffmpegu.options.concat(
  ffmpegu.options.videoFilter(filterChain),
  ffmpegu.options.map(ffmpegu.input.fromFile("./input.mp4").video)
)
```
