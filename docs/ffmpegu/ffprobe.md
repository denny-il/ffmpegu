# FFprobe

FFprobe commands are simplified and JSON-only.

## API

- `ffmpegu.probe.fromFile(path)` → `FFmpeguProbeCommand`
- `ffmpegu.createFFprobeRunner(binPath?)`

## Example

```ts
const probe = ffmpegu.probe.fromFile("./input.mp4")
const runner = ffmpegu.createFFprobeRunner("ffprobe")
const result = await runner.run(probe)

console.log(result.json)
```
