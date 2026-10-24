# Audio

## Options

| Helper | Renders |
| --- | --- |
| `audioCodec(c)` | `-c:a c` (`aac`, `libopus`, `libmp3lame`, `flac`, `alac`, `pcm_s16le`, `ac3`, …) |
| `audioCopy()` | `-c:a copy` |
| `audioBitrate(v, unit?)` | `-b:a v<unit>` |
| `audioQuality(q)` | `-q:a q` (VBR quality; for `libmp3lame`, 0 is best and 9 is worst) |
| `profileAudio(p)` | `-profile:a p` |
| `audioChannels(n)` | `-ac n` |
| `audioSampleRate(hz)` | `-ar hz` |
| `audioSampleFormat(f)` | `-sample_fmt f` |
| `audioFilter(chain)` | `-af chain` |
| `noAudio()` | `-an` |

Raw PCM has no header, so describe it on both sides of a pipe: `Options.create({ f: "s16le", ar: 48000, ac: 2 })`. Use the same record as input options for raw input and as output options for raw output.

Common choices:

- **AAC in MP4/HLS:** `audioCodec("aac")` and `audioBitrate(128, "k")`.
- **Opus in Ogg or WebM:** `audioCodec("libopus")`, `audioBitrate(64, "k")`, and `format("ogg")` when piping.
- **MP3 VBR:** `audioCodec("libmp3lame")` and `audioQuality(2)`.
- **Speech-recognition input:** `Options.create({ f: "s16le", ac: 1, ar: 16000 })`.

## Filters

Each typed helper has the shape `filters.<name>(options?, { inputs?, outputs? })`, and extra keys pass through.

| Helper | Typed keys | Example |
| --- | --- | --- |
| `volume` | `volume`, `precision`, `replaygain`, `eval` | `volume({ volume: "-6dB" })` or `volume({ volume: 0.5 })` |
| `atempo` | `tempo` (0.5 to 100) | `atempo({ tempo: 1.25 })` |
| `aresample` | `sample_rate`, `resampler`, `async`, `first_pts`, `min_comp`, `cutoff` | `aresample({ sample_rate: 48000 })` |
| `atrim` | `start`, `end`, `duration` (time values), `start_pts`, `end_pts`, `start_sample`, `end_sample` | `atrim({ start: Duration.seconds(5), duration: 10 })` |
| `asetpts` | `expr` | `asetpts({ expr: "PTS-STARTPTS" })` after `atrim` |
| `afade` | `type`, `start_time`, `duration` (time values), `start_sample`, `nb_samples`, `curve` | `afade({ type: "out", start_time: 55, duration: 5 })` |
| `highpass` / `lowpass` | `f`, `width_type`, `width`, `poles`, `mix` | `highpass({ f: 80 })` |
| `aformat` | `sample_fmts`, `sample_rates`, `channel_layouts` | `aformat({ channel_layouts: "mono" })` |

Use `filters.custom` for others, such as `loudnorm`, `amix`, `amerge`, `silenceremove`, `acompressor`, or `pan`. Time keys render as seconds: `atrim({ start: Duration.millis(1250) })` renders `atrim=start=1.25`.

## Idioms

```ts
// Extract the first audio track as MP3.
const input = Input.fromFile("talk.mp4")
Command.make({
  global: options.overwrite(),
  inputs: [input],
  outputs: [
    Output.toFile(
      "talk.mp3",
      Options.create(options.map(input.audio.track(0)), options.audioCodec("libmp3lame"), options.audioQuality(2))
    )
  ]
})
// -y -i talk.mp4 -map 0:a:0 -c:a libmp3lame -q:a 2 talk.mp3

// Loudness-normalize and trim.
options.audioFilter(
  filters.chain(
    filters.atrim({ start: 5, duration: 30 }),
    filters.asetpts({ expr: "PTS-STARTPTS" }),
    filters.custom("loudnorm", { I: -16, TP: -1.5, LRA: 11 })
  )
)
// -af atrim=start=5:duration=30,asetpts=expr=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11

// Mix two inputs.
const [voice, music] = [Input.fromFile("voice.wav"), Input.fromFile("music.mp3")]
const mixed = filters.label("mix")
const graph = filters.graph(
  filters.chain(
    filters.custom("amix", { inputs: 2, duration: "first" }, [filters.label(voice.audio), filters.label(music.audio)], [mixed])
  )
)
// -filter_complex [0:a][1:a]amix=inputs=2:duration=first[mix], then options.map(mixed)
```
