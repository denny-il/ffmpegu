# Inputs & Outputs

## Inputs

- `ffmpegu.input.fromFile(path)`
- `ffmpegu.input.fromStream(readable, options?)`

```ts
const input = ffmpegu.input.fromFile("./input.mp4")
const inputStream = ffmpegu.input.fromStream(stream, ffmpegu.options.custom(["-f", "mp4"]))
```

Stream references are available for mapping:

- `input.video`, `input.audio`, `input.subtitle`, `input.data`
- `input.video.track(n)`, `input.audio.track(n)`

## Stream piping (named pipes)

When you pass Node.js streams, `ffmpegu` uses named pipes under the hood. This allows multiple input/output streams in a single command without fighting over `stdin`/`stdout`.

Key points:

- Each stream input/output gets its own named pipe.
- The pipes are created during command compilation and cleaned up afterwards.
- The streams are one-shot: once consumed by FFmpeg, they can’t be reused.

Example:

```ts
import { createReadStream, createWriteStream } from "node:fs"

const inputStream = createReadStream("./input.mp4")
const input = ffmpegu.input.fromStream(
	inputStream,
	ffmpegu.options.custom(["-f", "mp4"])
)

const outputStream = createWriteStream("./output.mp4")
const output = ffmpegu.output.toStream(
	outputStream,
	ffmpegu.options.concat(
		["-f", "mp4"],
		["-movflags", "frag_keyframe+empty_moov"],
		["-c", "copy"]
	)
)

const command = ffmpegu.command({
	global: ffmpegu.options.custom("-y"),
	inputs: [input],
	outputs: [output]
})

const runner = ffmpegu.createFFmpegRunner("ffmpeg")
await runner.run(command)
```

### Multiple stream inputs

```ts
import { createReadStream } from "node:fs"

const videoStream = createReadStream("./video.mp4")
const audioStream = createReadStream("./audio.mp3")

const videoInput = ffmpegu.input.fromStream(
	videoStream,
	ffmpegu.options.custom(["-f", "mp4"])
)
const audioInput = ffmpegu.input.fromStream(
	audioStream,
	ffmpegu.options.custom(["-f", "mp3"])
)

const output = ffmpegu.output.toFile(
	"./output.mp4",
	ffmpegu.options.concat(
		ffmpegu.options.map(videoInput.video),
		ffmpegu.options.map(audioInput.audio),
		ffmpegu.options.videoCodec("libx264"),
		ffmpegu.options.audioCodec("aac")
	)
)

const command = ffmpegu.command({
	global: ffmpegu.options.custom("-y"),
	inputs: [videoInput, audioInput],
	outputs: [output]
})

await ffmpegu.createFFmpegRunner("ffmpeg").run(command)
```

### Multiple stream outputs

```ts
import { createReadStream, createWriteStream } from "node:fs"

const inputStream = createReadStream("./input.mp4")
const input = ffmpegu.input.fromStream(
	inputStream,
	ffmpegu.options.custom(["-f", "mp4"])
)

const outputStream1 = createWriteStream("./output-1.mp4")
const outputStream2 = createWriteStream("./output-2.mp4")

const output1 = ffmpegu.output.toStream(
	outputStream1,
	ffmpegu.options.concat(
		ffmpegu.options.map(input.video),
		["-f", "mp4"],
		["-movflags", "frag_keyframe+empty_moov"],
		["-c", "copy"]
	)
)

const output2 = ffmpegu.output.toStream(
	outputStream2,
	ffmpegu.options.concat(
		ffmpegu.options.map(input.video),
		["-f", "mp4"],
		["-movflags", "frag_keyframe+empty_moov"],
		["-c", "copy"]
	)
)

const command = ffmpegu.command({
	global: ffmpegu.options.custom("-y"),
	inputs: [input],
	outputs: [output1, output2]
})

await ffmpegu.createFFmpegRunner("ffmpeg").run(command)
```

## Outputs

- `ffmpegu.output.toFile(path, options?)`
- `ffmpegu.output.toStream(writable, options?)`

```ts
const output = ffmpegu.output.toFile("./output.mp4")
const outputStream = ffmpegu.output.toStream(stream, ffmpegu.options.custom(["-f", "mp4"]))
```
