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

`hls(settings)` and `dash(settings)` render `-f hls` / `-f dash` followed by the settings, in key order. Keys are FFmpeg's own muxer option names (`hls_time`, `hls_playlist_type`, `seg_duration`, `use_template`, …), so FFmpeg's documentation applies directly. The typed keys are hints for autocompletion, not a closed set: any other key, such as `hls_enc` or a muxer option added in a newer FFmpeg, passes through unchanged.

The helpers convert three kinds of values, on every key:

- Booleans render `1`/`0`, never as a bare flag: `use_template: true` renders `-use_template 1`.
- Arrays are joined with `+`: `hls_flags: ["independent_segments", "program_date_time"]` renders `-hls_flags independent_segments+program_date_time`.
- On the duration options (`hls_time`, `hls_init_time`, `timeout`, `seg_duration`, `frag_duration`, `target_latency`), time objects, Effect `Duration`, and `Temporal.Duration` render as seconds: `hls_time: Duration.millis(2500)` renders `-hls_time 2.5`. Numbers and strings always pass through unchanged. For other keys, convert with the [`time` adapters](#time-adapters).

`undefined` values are skipped.

```ts
import { Input, Options, Output, options } from "ffmpegu"

const input = Input.fromFile("input.mp4")

const playlist = Output.toFile(
  "out/stream.m3u8",
  Options.create(
    options.videoCodec("libx264"),
    options.audioCodec("aac"),
    options.hls({
      hls_time: 4,
      hls_playlist_type: "vod",
      hls_segment_filename: "out/segment_%03d.ts",
      hls_flags: ["independent_segments"]
    })
  )
)
// -c:v libx264 -c:a aac -f hls -hls_time 4 -hls_playlist_type vod
//   -hls_segment_filename out/segment_%03d.ts -hls_flags independent_segments
//   out/stream.m3u8
```

FFmpeg does not create the `out/` directory itself; create it before running, for example with Effect `FileSystem.makeDirectory`.

Typed HLS keys: `hls_time`, `hls_init_time`, `hls_list_size`, `hls_delete_threshold`, `hls_playlist_type` (`vod`, `event`), `hls_segment_type` (`mpegts`, `fmp4`), `hls_segment_filename`, `hls_segment_options`, `hls_flags`, `hls_base_url`, `hls_fmp4_init_filename`, `hls_fmp4_init_resend`, `hls_allow_cache`, `hls_start_number_source` (`generic`, `epoch`, `epoch_us`, `datetime`), `start_number`, `strftime`, `strftime_mkdir`, `master_pl_name`, `master_pl_publish_rate`, `var_stream_map`, `cc_stream_map`, `method`, `http_user_agent`, `http_persistent`, `headers`, `timeout`, `ignore_io_errors`.

Typed DASH keys: `seg_duration`, `frag_duration`, `frag_type` (`none`, `every_frame`, `duration`, `pframes`), `dash_segment_type` (`auto`, `mp4`, `webm`), `window_size`, `extra_window_size`, `adaptation_sets`, `use_template`, `use_timeline`, `single_file`, `single_file_name`, `init_seg_name`, `media_seg_name`, `streaming`, `ldash`, `lhls`, `target_latency`, `min_playback_rate`, `max_playback_rate`, `update_period`, `utc_timing_url`, `write_prft` (`auto` or a boolean), `hls_playlist`, `hls_master_name`, `master_m3u8_publish_rate`, `mpd_profile` (`dash`, `dvb_dash`), `global_sidx`, `index_correction`, `remove_at_exit`, `format_options`, `method`, `http_opts`, `http_user_agent`, `http_persistent`, `timeout`, `ignore_io_errors`.

The listed values are suggestions; any string is accepted. Run `ffmpeg -h muxer=hls` or `ffmpeg -h muxer=dash` to see what your build supports.

## Time values

`startTime`, `duration`, and `to`, the duration keys of [`hls` and `dash`](#hls-and-dash), and the time options of some [filters](filters.md#time-options) accept:

| Value                                      | Example                                     | Renders as        |
| ------------------------------------------ | ------------------------------------------- | ----------------- |
| Number of seconds                          | `90.5`                                      | `90.5`            |
| String, passed unchanged                   | `"00:01:30.5"`                              | `00:01:30.5`      |
| Time object, truncated to milliseconds     | `{ minutes: 1, seconds: 30, milliseconds: 500 }` | `00:01:30.500` |
| Effect `Duration`                          | `Duration.millis(1500)`                     | `00:00:01.500`    |
| `Temporal.Duration`                        | `Temporal.Duration.from({ seconds: 2, microseconds: 5 })` | `00:00:02.000005` |
| [Time adapter](#time-adapters)             | `time.seconds(Duration.millis(1500))`       | `1.5`             |

Durations keep microsecond precision (FFmpeg's time base); anything finer is truncated. A time object's fields are added up, and the total is truncated to milliseconds. Values beyond 9999 hours, which FFmpeg cannot read as `HH:MM:SS`, render as decimal seconds instead.

Pass `Duration` values, not `Duration.Input`: a bare number always means seconds here, whereas Effect reads a number as milliseconds.

Time values are read when the option is built and converted when the command compiles. Infinite durations, time objects with fields that are not finite numbers, magnitudes beyond 2^63 − 1 microseconds, and `Temporal.Duration` values with years, months, or weeks (which need a reference date) fail `compile()`, `run`, and `probeWith` with a `CommandError` whose reason is `InvalidArgument`. Days count as 24 hours.

```ts
import { Duration } from "effect"
import { Options, options } from "ffmpegu"

const clip = Options.create(
  options.startTime(Duration.minutes(1)),
  options.duration(Temporal.Duration.from({ seconds: 30 }))
)
```

`hls` and `dash` render time values as seconds instead (`2.5`), as do filters.

### Time adapters

Everywhere else, convert a time value explicitly with the `time` adapters. Each takes an Effect `Duration`, a `Temporal.Duration`, or a time object, and returns a value usable for any option or filter key:

| Adapter              | Example                                       | Renders as     |
| -------------------- | --------------------------------------------- | -------------- |
| `time.seconds(d)`    | `time.seconds(Duration.millis(61500))`        | `61.5`         |
| `time.timestamp(d)`  | `time.timestamp(Duration.millis(61500))`      | `00:01:01.500` |

They follow the rules above: microsecond precision, time objects truncated to milliseconds, and conversion when the command compiles, so invalid values fail `compile()` with `InvalidArgument`. Inside a filter, a timestamp's colons are escaped automatically.

Pick the form the option reads. FFmpeg's duration options accept both, but some options take seconds only, and others are not times in seconds at all (`adelay` reads milliseconds and `atrim`'s `start_pts` reads time-base ticks), which is why ffmpegu never converts a time value on a key it does not know.

```ts
import { Duration } from "effect"
import { Options, options, time } from "ffmpegu"

const segments = Options.create(options.format("segment"), {
  segment_time: time.seconds(Duration.millis(2500))
})
// -f segment -segment_time 2.5
```

The `Temporal.Duration` member of the time type is available when your TypeScript `lib` includes `esnext.temporal` (or `esnext`); otherwise it drops out and the declarations still compile.

## Options for FFprobe

`probeWith(input, options)` takes the same bundles. Use FFprobe's own option names such as `show_entries`, `select_streams`, and `v`; most FFmpeg helpers above do not apply to FFprobe. See [FFprobe](ffprobe.md#selecting-metadata).
