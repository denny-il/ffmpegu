# Types

FFmpeg/FFprobe types are exported for type-safe parsing and progress handling:

- `FFmpeguFFmpegProgress`
- `FFmpeguFFmpegRunOptions`
- `FFmpeguFFprobeJson`
- `FFmpeguFFprobeFormat`
- `FFmpeguFFprobeStream`

```ts
import type { FFmpeguFFmpegProgress, FFmpeguFFprobeJson } from "ffmpegu"

const result = await ffmpegu.createFFprobeRunner("ffprobe").run(
  ffmpegu.probe.fromFile("./input.mp4")
)

const json = result.result as FFmpeguFFprobeJson

const updates: FFmpeguFFmpegProgress[] = []
await ffmpegu.createFFmpegRunner("ffmpeg").run(command, {
  onProgress(progress) {
    updates.push(progress)
  }
})

const controller = new AbortController()
await ffmpegu.createFFmpegRunner("ffmpeg").run(command, {
  signal: controller.signal
})
```
