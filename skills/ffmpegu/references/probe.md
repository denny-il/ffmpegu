# FFprobe

```ts
probe(input: string): Effect<ProbeResult, ProbeError, FFprobe>
probeWith(input: string, options: Options): Effect<ProjectedProbeResult, ProbeError, FFprobe>
probeWith<S extends Schema.Top>(input: string, options: Options, schema: S)
  : Effect<S["Type"], ProbeError, FFprobe | S["DecodingServices"]>
```

`input` is any path or URL FFprobe can open. Every call spawns FFprobe and decodes its JSON; there is no wrapper object.

## probe

`probe` runs `ffprobe -show_format -show_streams`. It is unary, so `Effect.forEach(paths, probe)` works directly.

```ts
const metadata = yield* probe("input.mp4")
const video = metadata.streams.find((s) => s.codec_type === "video")
const seconds = Number(metadata.format?.duration)   // numeric strings stay strings
```

`ProbeResult` is `{ streams: ProbeStream[]; format?: ProbeFormat }`, with unknown keys preserved as `unknown`. `streams` defaults to `[]`.

| Stream field | Type | Stream field | Type |
| --- | --- | --- | --- |
| `index` | integer (required) | `codec_type` | string (`video`, `audio`, `subtitle`, `data`) |
| `codec_name` | string | `profile` | string |
| `width` / `height` | number | `pix_fmt` | string |
| `r_frame_rate` / `avg_frame_rate` | string (`"30000/1001"`) | `time_base` | string |
| `sample_rate` | string | `channels` | number |
| `channel_layout` | string | `bits_per_sample` | number |
| `duration` | string | `bit_rate` | string |
| `nb_frames` | string | `start_time` | string |
| `tags` | `Record<string, string>` | `disposition` | `Record<string, number>` |

Format fields: `filename`, `format_name`, `format_long_name`, `duration`, `size`, `bit_rate`, `start_time` (all strings), `nb_streams`, `nb_programs`, `probe_score` (numbers), and `tags`.

## probeWith

Explicit options **replace** `-show_format -show_streams`; use FFprobe's option names.

```ts
const selected = probeWith(
  "input.mp4",
  Options.create({ show_entries: "stream=codec_name,width,height:format=duration", select_streams: "v:0", v: "error" })
)
// To keep the full output while adding options:
Options.create({ show_format: true, show_streams: true, protocol_whitelist: "file" })
```

`ProjectedProbeResult` matches `ProbeResult` except that stream `index` is optional, and `width`, `height`, `start_pts`, and `duration_ts` may be `"N/A"` (with `show_optional_fields: "always"`). An empty bundle decodes to `{ streams: [] }`. Options that change field types (such as `unit`, `prefix`, or `sexagesimal`) can fail with `ProbeDecodeError`.

## Custom schema

```ts
const Dimensions = Schema.Struct({
  streams: Schema.Array(Schema.Struct({ width: Schema.Number, height: Schema.Number }))
})
const dims = probeWith("in.mp4", Options.create({ show_entries: "stream=width,height", select_streams: "v:0" }), Dimensions)

const DurationOnly = Schema.Struct({ format: Schema.Struct({ duration: Schema.NumberFromString }) })
const duration = probeWith("in.mp4", Options.create({ show_entries: "format=duration" }), DurationOnly)
// { format: { duration: 12.5 } }
```

The schema decodes the whole JSON document, and no defaults apply. FFprobe omits sections it did not print, so make keys optional when a selection may lack them. Unlisted keys are dropped.

## Rules

- The service owns `-i`, `-of`, `-output_format`, `-print_format`, `-o`, and `--`. Setting any of them, including stream-specifier forms, fails with `CommandError` (`ReservedOption`).
- Stdin and descriptor inputs (`-`, `pipe:`, `fd:`, `/dev/stdin`), NUL bytes, and FFmpeg stream references fail with `CommandError`. To probe bytes you only have in memory, write them to a temporary file first.
- The input is one argument without a shell, so spaces and leading dashes are literal.
- Output above `maxOutputBytes` (16 MiB by default) fails with `ProbeOutputError`. Raise it in `FFprobe.layer` for frame-level or packet-level output.
- The exported schemas are `ProbeResult`, `ProjectedProbeResult`, `ProbeStream`, `ProjectedProbeStream`, and `ProbeFormat`.
