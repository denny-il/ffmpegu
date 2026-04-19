# Runners

Runners execute compiled commands.

## FFmpeg Runner

- `ffmpegu.createFFmpegRunner(binPath?)`
- `ffmpegu.runner` (default)

```ts
const runner = ffmpegu.createFFmpegRunner("ffmpeg")
await runner.validateBinary()
const result = await runner.run(command)

console.log(result.code)
console.log(result.args)
console.log(result.stdout)
console.log(result.stderr)
```

### Progress updates

Pass `onProgress` to receive parsed key/value updates from FFmpeg's `-progress`
stream while the command is running:

```ts
const runner = ffmpegu.createFFmpegRunner("ffmpeg")

const result = await runner.run(command, {
	onProgress(progress) {
		console.log(progress.progress)
		console.log(progress.frame)
		console.log(progress.out_time)
		console.log(progress.speed)
	}
})

console.log(result.code)
```

Progress values are emitted as structured objects with a `raw` map containing the
original FFmpeg values.

### Cancellation

Pass an `AbortSignal` to stop a running FFmpeg command:

```ts
const controller = new AbortController()

const result = runner.run(command, {
	signal: controller.signal
})

controller.abort()
await result // rejects with AbortError
```

## FFprobe Runner

- `ffmpegu.createFFprobeRunner(binPath?)`
- `ffmpegu.probeRunner` (default)

```ts
const runner = ffmpegu.createFFprobeRunner("ffprobe")
const result = await runner.run(ffmpegu.probe.fromFile("./input.mp4"))
console.log(result.json)
```
