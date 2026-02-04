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

## FFprobe Runner

- `ffmpegu.createFFprobeRunner(binPath?)`
- `ffmpegu.probeRunner` (default)

```ts
const runner = ffmpegu.createFFprobeRunner("ffprobe")
const result = await runner.run(ffmpegu.probe.fromFile("./input.mp4"))
console.log(result.json)
```
