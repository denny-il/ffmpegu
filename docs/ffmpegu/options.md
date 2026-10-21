# Options

Options are composed using `ffmpegu.options.custom(...)` and helpers in `ffmpegu.options.*`.

The same bundles can be passed to `probeWith(input, options)`. Use FFprobe option names such as `show_entries`, `select_streams`, `protocol_whitelist`, and `v`; explicit options replace the default metadata selection. See [FFprobe](ffprobe.md) for output ownership and projection types. FFmpeg-specific helpers are not necessarily accepted by FFprobe.

## API

- `ffmpegu.options.custom(...args)` → builds an options bundle.
- `ffmpegu.options.merge(...options)` → merges bundles.
- `ffmpegu.options.concat(base, ...args)` → appends args to a bundle.

Common helpers:

- Codecs: `videoCodec`, `audioCodec`, `subtitleCodec`, `copy`, `videoCopy`, `audioCopy`
- Disable streams: `noVideo`, `noAudio`, `noSubtitle`, `noData`
- Bitrates: `videoBitrate`, `audioBitrate`, `minRate`, `maxRate`, `bufferSize`
- Quality: `crf`, `preset`, `tune`, `profileVideo`, `profileAudio`, `level`
- Timing: `startTime`, `duration`, `to`
- Mapping: `map`
- Filters: `videoFilter`, `audioFilter`, `filterComplex`
- Containers: `format`, `movFlags`
- Streaming: `hls`, `dash`

## Time values

`startTime`, `duration`, and `to` accept:

- a number of seconds, or a string passed to FFmpeg unchanged (`"00:01:30.5"`, `"90.5"`);
- a time object `{ hours?, minutes?, seconds?, milliseconds? }`, truncated to whole milliseconds;
- an Effect `Duration.Duration`, such as `Duration.seconds(90.5)`;
- a `Temporal.Duration`, such as `Temporal.Duration.from({ minutes: 1, seconds: 30 })`.

Time objects and durations render as `[-]HH:MM:SS.mmm`. Durations keep microseconds, FFmpeg's time base, and render as `HH:MM:SS.uuuuuu` when they have sub-millisecond precision; finer precision is truncated. Pass `Duration` values, not `Duration.Input`: a bare number always means seconds here, while Effect reads a number input as milliseconds.

Durations are converted when the command is compiled. Infinite durations and `Temporal.Duration` values with years, months, or weeks (which need a reference date) make `Command.compile()`, `run`, and `probeWith` fail with a `CommandError` whose reason is `InvalidArgument`. Builders do not throw. A `Temporal.Duration` with days counts each day as 24 hours.

```ts
import { Duration } from "effect"

const clip = ffmpegu.options.concat(
  ffmpegu.options.startTime(Duration.minutes(1)),
  ffmpegu.options.duration(Temporal.Duration.from({ seconds: 30 }))
)
```

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
const silentVideo = ffmpegu.options.concat(
  ffmpegu.options.videoCodec("libx264"),
  ffmpegu.options.noAudio()
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
