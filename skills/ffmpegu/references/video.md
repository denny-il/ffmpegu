# Video

## Options

| Helper | Renders |
| --- | --- |
| `videoCodec(c)` | `-c:v c` (`libx264`, `libx265`, `libvpx-vp9`, `libsvtav1`, `libaom-av1`, `prores`, `mjpeg`, `png`, `gif`, …) |
| `videoCopy()` | `-c:v copy` |
| `crf(n)` | `-crf n` |
| `preset(p)` | `-preset p` |
| `tune(t)` | `-tune t` |
| `profileVideo(p)` | `-profile:v p` |
| `level(l)` | `-level l` |
| `videoBitrate(v, unit?)` | `-b:v v<unit>` |
| `minRate(v, unit?)` / `maxRate(v, unit?)` | `-minrate` / `-maxrate` |
| `bufferSize(v, unit?)` | `-bufsize v<unit>` |
| `frameRate(r)` | `-r r` |
| `gop(n)` | `-g n` |
| `keyintMin(n)` | `-keyint_min n` |
| `bFrames(n)` | `-bf n` |
| `refs(n)` | `-refs n` |
| `pixelFormat(f)` | `-pix_fmt f` |
| `size("WxH")` | `-s WxH` |
| `aspect("16:9")` | `-aspect 16:9` |
| `videoFilter(chain)` | `-vf chain` |
| `noVideo()` | `-vn` |

Use the unit suffixes `k`, `M`, `G`, or `T`; FFmpeg reads a lowercase `m` as milli and rejects `g` and `t`. `videoBitrate(2500, "k")` renders `-b:v 2500k`, and a string such as `"2.5M"` passes through. For options without a helper, use a record, such as `{ "frames:v": 1 }`, `{ "x264-params": "keyint=60" }`, or `{ "c:v": "h264_nvenc" }`.

Common choices:

- **Web MP4:** `videoCodec("libx264")`, `crf(23)`, `preset("medium")`, `pixelFormat("yuv420p")`, and `movFlags("+faststart")`.
- **Constrained bitrate (streaming):** `videoBitrate(3000, "k")`, `maxRate(3000, "k")`, and `bufferSize(6000, "k")`.
- **Fixed keyframe interval** (for aligned HLS/DASH segments): `frameRate(fps)`, `gop(fps * seconds)`, `keyintMin(fps * seconds)`, and disable scene-cut keyframes: `{ sc_threshold: 0 }` for libx264, `{ "x265-params": "scenecut=0" }` for libx265. Use the same frame rate and interval in every rendition.

## Filters

Each typed helper has the shape `filters.<name>(options?, { inputs?, outputs? })`, and extra keys pass through.

| Helper | Typed keys | Example |
| --- | --- | --- |
| `scale` | `w`, `h`, `flags`, `interl`, `eval`, `force_original_aspect_ratio`, `force_divisible_by`, `reset_sar` | `scale({ w: -2, h: 720 })` keeps the aspect ratio with an even width |
| `fps` | `fps`, `start_time` (seconds or `Duration`, not a timestamp string), `round`, `eof_action` | `fps({ fps: 30 })` |
| `crop` | `w`, `h`, `x`, `y`, `keep_aspect`, `exact` | `crop({ w: "ih", h: "ih" })` for a centered square |
| `pad` | `w`, `h`, `x`, `y`, `color`, `eval`, `aspect` | `pad({ w: 1920, h: 1080, x: "(ow-iw)/2", y: "(oh-ih)/2" })` |
| `format` | `pix_fmts` | `format({ pix_fmts: "yuv420p" })` |
| `setsar` / `setdar` | `sar` or `dar`, `max` | `setsar({ sar: 1 })` |
| `transpose` | `dir`, `passthrough` | `transpose({ dir: "clock" })` |
| `hflip` / `vflip` | none | `hflip()` |
| `overlay` | `x`, `y`, `shortest`, `repeatlast`, `format`, `eof_action`, `alpha` | `overlay({ x: 16, y: 16 }, { inputs: [base, logo], outputs: [out] })` |
| `drawtext` | `text` (set `expansion: "none"` when the text contains `%`), `textfile`, `fontfile`, `font`, `fontsize`, `fontcolor`, `box`, `boxcolor`, `boxborderw`, `x`, `y`, `shadowx`, `shadowy`, `borderw`, `line_spacing`, `enable` | `drawtext({ text: "Live: 10:00", fontsize: 24, x: 10, y: 10 })` |
| `select` | `expr`, `outputs` | `select({ expr: "eq(pict_type,I)" })` |
| `setpts` | `expr` | `setpts({ expr: "0.5*PTS" })` for double speed |

Use `filters.custom(name, options, inputs?, outputs?)` for other filters, such as `split`, `concat`, `thumbnail`, `tile`, `zoompan`, or `hstack`.

## Idioms

```ts
// Thumbnail: fast input seek, one frame.
Command.make({
  global: options.overwrite(),
  inputs: [Input.fromFile("in.mp4", options.startTime(1))],
  outputs: [
    Output.toFile(
      "thumb.jpg",
      Options.create(options.videoFilter(filters.chain(filters.scale({ w: 320, h: -2 }))), { "frames:v": 1 })
    )
  ]
})
// -y -ss 1 -i in.mp4 -vf scale=w=320:h=-2 -frames:v 1 thumb.jpg

// Animated GIF with a generated palette.
const [a, b, p] = ["a", "b", "p"].map((name) => filters.label(name))
const gif = filters.graph(
  filters.chain(filters.fps({ fps: 10 }), filters.scale({ w: 480, h: -1 }), filters.custom("split", {}, [], [a, b])),
  filters.chain(filters.custom("palettegen", {}, [a], [p])),
  filters.chain(filters.custom("paletteuse", {}, [b, p]))
)
// options.filterComplex(gif) → fps=fps=10,scale=w=480:h=-1,split[a][b];[a]palettegen[p];[b][p]paletteuse
```
