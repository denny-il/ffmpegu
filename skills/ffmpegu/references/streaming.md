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

## HLS

`options.hls(settings)` renders `-f hls` followed by the mapped options. Booleans render `1`/`0`, and `flags` may be an array that is joined with `+`.

| Setting | Flag | Setting | Flag |
| --- | --- | --- | --- |
| `time` | `-hls_time` | `initTime` | `-hls_init_time` |
| `listSize` | `-hls_list_size` | `deleteThreshold` | `-hls_delete_threshold` |
| `playlistType` (`vod`, `event`) | `-hls_playlist_type` | `segmentType` (`mpegts`, `fmp4`) | `-hls_segment_type` |
| `segmentFilename` | `-hls_segment_filename` | `fmp4InitFilename` | `-hls_fmp4_init_filename` |
| `fmp4InitResend` | `-hls_fmp4_init_resend` | `flags` | `-hls_flags` |
| `baseUrl` | `-hls_base_url` | `segmentOptions` | `-hls_segment_options` |
| `startNumber` | `-start_number` | `startNumberSource` | `-hls_start_number_source` |
| `allowCache` | `-hls_allow_cache` | `strftime` | `-strftime` |
| `strftimeMkdir` | `-strftime_mkdir` | `varStreamMap` | `-var_stream_map` |
| `ccStreamMap` | `-cc_stream_map` | `masterPlName` | `-master_pl_name` |
| `masterPlPublishRate` | `-master_pl_publish_rate` | `method` | `-method` |
| `httpUserAgent` | `-http_user_agent` | `httpPersistent` | `-http_persistent` |
| `headers` | `-headers` | `timeout` | `-timeout` |
| `ignoreIoErrors` | `-ignore_io_errors` | | |

The `flags` values include `independent_segments`, `delete_segments`, `append_list`, `omit_endlist`, `split_by_time`, `program_date_time`, `single_file`, `temp_file`, `discont_start`, `round_durations`, `iframes_only`, `periodic_rekey`, and the `second_level_segment_*` flags.

```ts
const input = Input.fromFile("movie.mp4")
const output = Output.toFile(
  "hls/index.m3u8",
  Options.create(
    options.videoCodec("libx264"),
    options.gop(48),
    options.audioCodec("aac"),
    options.hls({ time: 4, playlistType: "vod", segmentFilename: "hls/segment_%03d.ts", flags: ["independent_segments"] })
  )
)
// -c:v libx264 -g 48 -c:a aac -f hls -hls_time 4 -hls_segment_filename hls/segment_%03d.ts
//   -hls_flags independent_segments -hls_playlist_type vod hls/index.m3u8
```

FFmpeg does not create the output directory; create it first, for example with Effect `FileSystem.makeDirectory(dir, { recursive: true })`. For an adaptive ladder, use `split` and `scale` in a `filterComplex`, map each rendition, and set `varStreamMap` (`"v:0,a:0 v:1,a:1"`) and `masterPlName`, with `%v` in the segment and playlist names.

## DASH

`options.dash(settings)` renders `-f dash` followed by the mapped options, with booleans as `1`/`0`.

| Setting | Flag | Setting | Flag |
| --- | --- | --- | --- |
| `segDuration` | `-seg_duration` | `fragDuration` | `-frag_duration` |
| `fragType` (`auto`, `every_frame`, `duration`, `pframes`) | `-frag_type` | `segmentType` (`auto`, `mp4`, `webm`) | `-dash_segment_type` |
| `windowSize` | `-window_size` | `extraWindowSize` | `-extra_window_size` |
| `adaptationSets` | `-adaptation_sets` | `useTemplate` | `-use_template` |
| `useTimeline` | `-use_timeline` | `singleFile` | `-single_file` |
| `singleFileName` | `-single_file_name` | `initSegName` | `-init_seg_name` |
| `mediaSegName` | `-media_seg_name` | `streaming` | `-streaming` |
| `ldash` | `-ldash` | `lhls` | `-lhls` |
| `targetLatency` | `-target_latency` | `minPlaybackRate` | `-min_playback_rate` |
| `maxPlaybackRate` | `-max_playback_rate` | `updatePeriod` | `-update_period` |
| `utcTimingUrl` | `-utc_timing_url` | `writePrft` | `-write_prft` |
| `hlsPlaylist` | `-hls_playlist` | `hlsMasterName` | `-hls_master_name` |
| `masterM3u8PublishRate` | `-master_m3u8_publish_rate` | `mpdProfile` (`dash`, `dvb_dash`) | `-mpd_profile` |
| `globalSidx` | `-global_sidx` | `indexCorrection` | `-index_correction` |
| `removeAtExit` | `-remove_at_exit` | `formatOptions` | `-format_options` |
| `method` | `-method` | `httpOpts` | `-http_opts` |
| `httpUserAgent` | `-http_user_agent` | `httpPersistent` | `-http_persistent` |
| `timeout` | `-timeout` | `ignoreIoErrors` | `-ignore_io_errors` |

```ts
options.dash({ segDuration: 4, useTemplate: true, useTimeline: true, adaptationSets: "id=0,streams=v id=1,streams=a" })
// -f dash -adaptation_sets id=0,streams=v id=1,streams=a -seg_duration 4 -use_template 1 -use_timeline 1
```

## Other muxer options

Any muxer option without a helper goes in a record: `{ segment_time: 10, reset_timestamps: 1 }` with `options.format("segment")`, or `{ "f": "tee" }`. Check what a muxer supports with `ffmpeg -h muxer=<name>`.
