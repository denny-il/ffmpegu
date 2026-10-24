# Streaming formats, muxers, and pipes

## Pipes and sinks

`Input.fromStream`, `Output.toSink`, and `Output.toStream` use pipes, which are not seekable:

- **Inputs:** give raw or ambiguous formats an explicit `f`, such as `{ f: "s16le", ar: 48000, ac: 2 }` or `{ f: "webm" }`. MP4 with its index at the end (`moov` after `mdat`) cannot be read from a pipe; write it to a temporary file and use `Input.fromFile`.
- **Outputs:** always set `f`, since there is no file extension to infer it from, and pick a muxer that writes sequentially.

| Container | Pipe output options |
| --- | --- |
| Fragmented MP4 | `options.format("mp4")`, `options.movFlags("frag_keyframe+empty_moov")` (add `+default_base_moof` for MSE players) |
| MPEG-TS | `options.format("mpegts")` |
| WebM / Matroska | `options.format("webm")` / `options.format("matroska")` |
| Ogg (Opus, Vorbis) | `options.format("ogg")` |
| Raw PCM | `Options.create({ f: "s16le", ar: 48000, ac: 2 })` |
| Raw video | `Options.create({ f: "rawvideo", pix_fmt: "rgb24" })` |
| Image frames | `Options.create({ f: "image2pipe", "c:v": "mjpeg" })` |

For regular, seekable MP4 files, use `Output.toFile` with `options.movFlags("+faststart")`.

## HLS and DASH

`options.hls(settings)` and `options.dash(settings)` render `-f hls` / `-f dash` followed by the settings in key order. Keys are FFmpeg's own muxer option names, so `ffmpeg -h muxer=hls` and FFmpeg's docs apply directly. Typed keys are autocompletion hints; any other key passes through unchanged. On every key, booleans render `1`/`0` (never a bare flag) and arrays are joined with `+`. On the duration keys (`hls_time`, `hls_init_time`, `timeout`, `seg_duration`, `frag_duration`, `target_latency`), time objects, `Duration`, and `Temporal.Duration` render as seconds. Numbers and strings pass through unchanged everywhere. `undefined` values are skipped.

Typed HLS keys: `hls_time`, `hls_init_time`, `hls_list_size`, `hls_delete_threshold`, `hls_playlist_type` (`vod`, `event`), `hls_segment_type` (`mpegts`, `fmp4`), `hls_segment_filename`, `hls_segment_options`, `hls_fmp4_init_filename`, `hls_fmp4_init_resend`, `hls_flags`, `hls_base_url`, `hls_allow_cache`, `start_number`, `hls_start_number_source` (`generic`, `epoch`, `epoch_us`, `datetime`), `strftime`, `strftime_mkdir`, `var_stream_map`, `cc_stream_map`, `master_pl_name`, `master_pl_publish_rate`, `method`, `http_user_agent`, `http_persistent`, `headers`, `timeout`, `ignore_io_errors`.

The `hls_flags` values include `independent_segments`, `delete_segments`, `append_list`, `omit_endlist`, `split_by_time`, `program_date_time`, `single_file`, `temp_file`, `discont_start`, `round_durations`, `iframes_only`, `periodic_rekey`, and the `second_level_segment_*` flags.

```ts
const input = Input.fromFile("movie.mp4")
const output = Output.toFile(
  "hls/index.m3u8",
  Options.create(
    options.videoCodec("libx264"),
    options.gop(48),
    options.audioCodec("aac"),
    options.hls({ hls_time: 4, hls_playlist_type: "vod", hls_segment_filename: "hls/segment_%03d.ts", hls_flags: ["independent_segments"] })
  )
)
// -c:v libx264 -g 48 -c:a aac -f hls -hls_time 4 -hls_playlist_type vod
//   -hls_segment_filename hls/segment_%03d.ts -hls_flags independent_segments hls/index.m3u8
```

FFmpeg does not create the output directory; create it first, for example with Effect `FileSystem.makeDirectory(dir, { recursive: true })`. For an adaptive ladder, use `split` and `scale` in a `filterComplex`, map each rendition, and set `var_stream_map` (`"v:0,a:0 v:1,a:1"`) and `master_pl_name`, with `%v` in the segment and playlist names.

Typed DASH keys: `seg_duration`, `frag_duration`, `frag_type` (`none`, `every_frame`, `duration`, `pframes`), `dash_segment_type` (`auto`, `mp4`, `webm`), `window_size`, `extra_window_size`, `adaptation_sets`, `use_template`, `use_timeline`, `single_file`, `single_file_name`, `init_seg_name`, `media_seg_name`, `streaming`, `ldash`, `lhls`, `target_latency`, `min_playback_rate`, `max_playback_rate`, `update_period`, `utc_timing_url`, `write_prft` (`auto` or a boolean), `hls_playlist`, `hls_master_name`, `master_m3u8_publish_rate`, `mpd_profile` (`dash`, `dvb_dash`), `global_sidx`, `index_correction`, `remove_at_exit`, `format_options`, `method`, `http_opts`, `http_user_agent`, `http_persistent`, `timeout`, `ignore_io_errors`.

```ts
options.dash({ seg_duration: 4, use_template: true, use_timeline: true, adaptation_sets: "id=0,streams=v id=1,streams=a" })
// -f dash -seg_duration 4 -use_template 1 -use_timeline 1 -adaptation_sets id=0,streams=v id=1,streams=a
```

## Other muxer options

Other muxers take their options in a record: `{ segment_time: 10, reset_timestamps: 1 }` with `options.format("segment")`, or `{ "f": "tee" }`. Check what a muxer supports with `ffmpeg -h muxer=<name>`.
