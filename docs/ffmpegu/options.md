# Options

An options bundle (`Options`, also exported as `FFmpeguOptions`) is an immutable list of FFmpeg arguments. Bundles are used for global options, per-input and per-output options, and [FFprobe](ffprobe.md) selections.

## Writing raw options

`Options.create(...args)` accepts any mix of these forms, rendered in order:

| Form          | Example                                  | Renders as                     |
| ------------- | ---------------------------------------- | ------------------------------ |
| String        | `"-y"`                                   | `-y` (passed verbatim)         |
| Tuple         | `["c:v", "libx264"]`                     | `-c:v libx264`                 |
| Flag tuple    | `["shortest"]`                           | `-shortest`                    |
| Record        | `{ "c:v": "libx264", crf: 23 }`          | `-c:v libx264 -crf 23`         |
| Boolean entry | `{ shortest: true, an: false }`          | `-shortest` (`false` is omitted) |
| Reference     | `{ map: input.audio.track(1) }`          | `-map 1:a:1`                   |
| Bundle        | `options.crf(23)`                        | `-crf 23`                      |

Names get a leading `-` when they lack one. Record entries keep their insertion order, and a record cannot repeat a key, so use separate records or tuples for repeated options such as several `-map` entries. Values are passed straight to the process: no shell is involved, so spaces and quotes need no escaping.

```ts
import { Input, Options, options } from "ffmpegu"

const input = Input.fromFile("input.mkv")

const output = Options.create(
  { map: input.video },
  { map: input.audio.track(1) },
  options.videoCodec("libx264"),
  { preset: "slow", crf: 20, "b:a": "160k" },
  ["movflags", "+faststart"]
)
```

## Composing bundles

- `Options.create(...args)` (alias `options.custom`) builds a bundle; bundles can be nested inside it.
- `Options.concat(bundle, ...args)` (alias `options.concat`) returns `bundle` followed by more arguments.
- `Options.merge(...bundles)` (alias `options.merge`) concatenates bundles.

Bundles copy the arrays and records they receive, so mutating your input afterwards has no effect, and a shared base bundle can be reused safely.

## Helpers

The helpers in `options` return bundles for frequently used flags. Their string parameters list common values for autocompletion but accept any string, so codecs and formats from newer FFmpeg builds work too.

### Codecs and streams

| Helper                     | Renders              |
| -------------------------- | -------------------- |
| `videoCodec(codec)`        | `-c:v <codec>`       |
| `audioCodec(codec)`        | `-c:a <codec>`       |
| `subtitleCodec(codec)`     | `-c:s <codec>`       |
| `copy()`                   | `-c copy`            |
| `videoCopy()`              | `-c:v copy`          |
| `audioCopy()`              | `-c:a copy`          |
| `subtitleCopy()`           | `-c:s copy`          |
| `map(reference)`           | `-map <reference>`   |
| `noVideo()`                | `-vn`                |
| `noAudio()`                | `-an`                |
| `noSubtitle()`             | `-sn`                |
| `noData()`                 | `-dn`                |

### Video

| Helper                         | Renders                   |
| ------------------------------ | ------------------------- |
| `videoBitrate(value, unit?)`   | `-b:v <value><unit>`      |
| `minRate(value, unit?)`        | `-minrate <value><unit>`  |
| `maxRate(value, unit?)`        | `-maxrate <value><unit>`  |
| `bufferSize(value, unit?)`     | `-bufsize <value><unit>`  |
| `crf(n)`                       | `-crf <n>`                |
| `preset(name)`                 | `-preset <name>`          |
| `tune(name)`                   | `-tune <name>`            |
| `profileVideo(name)`           | `-profile:v <name>`       |
| `level(value)`                 | `-level <value>`          |
| `frameRate(rate)`              | `-r <rate>`               |
| `gop(n)`                       | `-g <n>`                  |
| `keyintMin(n)`                 | `-keyint_min <n>`         |
| `bFrames(n)`                   | `-bf <n>`                 |
| `refs(n)`                      | `-refs <n>`               |
| `pixelFormat(format)`          | `-pix_fmt <format>`       |
| `size("1280x720")`             | `-s 1280x720`             |
| `aspect("16:9")`               | `-aspect 16:9`            |
| `videoFilter(chain)`           | `-vf <chain>`             |

Use FFmpeg's unit suffixes `k`, `M`, `G`, or `T`: `videoBitrate(2500, "k")` renders `-b:v 2500k`. FFmpeg reads a lowercase `m` as milli and rejects `g` and `t`. A string such as `"2.5M"` is passed through.

### Audio

| Helper                         | Renders                |
| ------------------------------ | ---------------------- |
| `audioBitrate(value, unit?)`   | `-b:a <value><unit>`   |
| `profileAudio(name)`           | `-profile:a <name>`    |
| `audioChannels(n)`             | `-ac <n>`              |
| `audioSampleRate(hz)`          | `-ar <hz>`             |
| `audioSampleFormat(format)`    | `-sample_fmt <format>` |
| `audioQuality(q)`              | `-q:a <q>`             |
| `audioFilter(chain)`           | `-af <chain>`          |

### Timing

| Helper            | Renders       |
| ----------------- | ------------- |
| `startTime(time)` | `-ss <time>`  |
| `duration(time)`  | `-t <time>`   |
| `to(time)`        | `-to <time>`  |
| `shortest()`      | `-shortest`   |

As input options, `startTime` and `duration` seek and limit the input; as output options they trim the output. See [time values](#time-values) for accepted types.

### Containers, filters, and control

| Helper                  | Renders                          |
| ----------------------- | -------------------------------- |
| `format(name)`          | `-f <name>`                      |
| `movFlags(flags)`       | `-movflags <flags>`              |
| `metadata(key, value)`  | `-metadata <key>=<value>`        |
| `filterComplex(graph)`  | `-filter_complex <graph>`        |
| `overwrite()`           | `-y`                             |
| `noOverwrite()`         | `-n`                             |
| `logLevel(level)`       | `-loglevel <level>`              |
| `threads(n)`            | `-threads <n>`                   |
| `hls(settings)`         | `-f hls` plus HLS muxer options  |
| `dash(settings)`        | `-f dash` plus DASH muxer options |

### HLS and DASH

`hls` and `dash` take camelCase settings and render the matching muxer options. Booleans render as `1`/`0`, and HLS `flags` may be an array that is joined with `+`.

```ts
import { Input, Options, Output, options } from "ffmpegu"

const input = Input.fromFile("input.mp4")

const playlist = Output.toFile(
  "out/stream.m3u8",
  Options.create(
    options.videoCodec("libx264"),
    options.audioCodec("aac"),
    options.hls({
      time: 4,
      playlistType: "vod",
      segmentFilename: "out/segment_%03d.ts",
      flags: ["independent_segments"]
    })
  )
)
```

FFmpeg does not create the `out/` directory itself; create it before running, for example with Effect `FileSystem.makeDirectory`.

Common HLS settings: `time`, `initTime`, `listSize`, `playlistType`, `segmentType`, `segmentFilename`, `flags`, `baseUrl`, `startNumber`, `deleteThreshold`, `masterPlName`, `varStreamMap`, `fmp4InitFilename`. Common DASH settings: `segDuration`, `fragDuration`, `windowSize`, `extraWindowSize`, `adaptationSets`, `segmentType`, `useTemplate`, `useTimeline`, `singleFile`, `streaming`, `ldash`, `hlsPlaylist`, `initSegName`, `mediaSegName`. Each maps to the matching muxer option, such as `time` → `-hls_time`, `startNumber` → `-start_number`, and `segmentType` → `-dash_segment_type` for DASH; your editor lists the rest.

## Time values

`startTime`, `duration`, and `to`, and the time options of some [filters](filters.md#time-options), accept:

| Value                                      | Example                                     | Renders as        |
| ------------------------------------------ | ------------------------------------------- | ----------------- |
| Number of seconds                          | `90.5`                                      | `90.5`            |
| String, passed unchanged                   | `"00:01:30.5"`                              | `00:01:30.5`      |
| Time object, truncated to milliseconds     | `{ minutes: 1, seconds: 30, milliseconds: 500 }` | `00:01:30.500` |
| Effect `Duration`                          | `Duration.millis(1500)`                     | `00:00:01.500`    |
| `Temporal.Duration`                        | `Temporal.Duration.from({ seconds: 2, microseconds: 5 })` | `00:00:02.000005` |

Durations keep microsecond precision (FFmpeg's time base); anything finer is truncated. Values beyond 9999 hours, which FFmpeg cannot read as `HH:MM:SS`, render as decimal seconds instead.

Pass `Duration` values, not `Duration.Input`: a bare number always means seconds here, whereas Effect reads a number as milliseconds.

Durations are converted when the command compiles. Infinite durations, magnitudes beyond 2^63 − 1 microseconds, and `Temporal.Duration` values with years, months, or weeks (which need a reference date) fail `compile()`, `run`, and `probeWith` with a `CommandError` whose reason is `InvalidArgument`. Days count as 24 hours.

```ts
import { Duration } from "effect"
import { Options, options } from "ffmpegu"

const clip = Options.create(
  options.startTime(Duration.minutes(1)),
  options.duration(Temporal.Duration.from({ seconds: 30 }))
)
```

The `Temporal.Duration` member of the time type is available when your TypeScript `lib` includes `esnext.temporal` (or `esnext`); otherwise it drops out and the declarations still compile.

## Options for FFprobe

`probeWith(input, options)` takes the same bundles. Use FFprobe's own option names such as `show_entries`, `select_streams`, and `v`; most FFmpeg helpers above do not apply to FFprobe. See [FFprobe](ffprobe.md#selecting-metadata).
