# Types

FFprobe JSON types are exported for type-safe parsing:

- `FFmpeguFFprobeJson`
- `FFmpeguFFprobeFormat`
- `FFmpeguFFprobeStream`

```ts
import type { FFmpeguFFprobeJson } from "ffmpegu"

const result = await ffmpegu.createFFprobeRunner("ffprobe").run(
  ffmpegu.probe.fromFile("./input.mp4")
)

const json = result.json as FFmpeguFFprobeJson
```
