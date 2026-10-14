# ffmpegu guide

ffmpegu describes FFmpeg commands with pure builders and executes them through Effect v4 services. It supports Node.js and Bun on Linux and macOS.

## API guide

- [Overview](ffmpegu/overview.md)
- [Commands and compilation](ffmpegu/command.md)
- [Inputs, outputs, and resource ownership](ffmpegu/inputs-outputs.md)
- [Execution, progress, and cancellation](ffmpegu/runners.md)
- [FFprobe](ffmpegu/ffprobe.md)
- [Errors and types](ffmpegu/types.md)
- [Options](ffmpegu/options.md)
- [Filters](ffmpegu/filters.md)

## Application composition

```ts
import { Effect, Layer } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  Command,
  FFmpeg,
  FFprobe,
  Input,
  Options,
  Output,
  probe,
  run
} from "ffmpegu"

const MediaLive = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(
  Layer.provide(NodeServices.layer)
)

const program = Effect.gen(function* () {
  const input = Input.fromFile("input.mp4")
  yield* run(
    Command.make({
      global: Options.create("-y"),
      inputs: [input],
      outputs: [
        Output.toFile("output.mp4", Options.create({ "c:v": "libx264" }))
      ]
    })
  )
  const metadata = yield* probe("output.mp4")
  yield* Effect.logInfo("Transcode complete", {
    streams: metadata.streams.length
  })
})

program.pipe(Effect.provide(MediaLive), NodeRuntime.runMain)
```

For Bun, substitute `BunServices` and `BunRuntime` from `@effect/platform-bun`. FileSystem operations in your application additionally require the platform layer to remain available, for example with `Layer.provideMerge`.

## Migrating from the Promise API

| Previous API                         | Effect API                                              |
| ------------------------------------ | ------------------------------------------------------- |
| `createFFmpegRunner(path)`           | `FFmpeg.layer({ binary: path })`                        |
| `runner.run(command)`                | `run(command)` or the `FFmpeg` service's `run`          |
| `createFFprobeRunner(path).run(...)` | `probe(path)` with `FFprobe.layer(...)`                 |
| `output.toStream(writable)`          | `Output.toSink(effectSink)`                             |
| Node `Readable` input                | Effect `Stream`, optionally using a platform adapter    |
| `{ signal }` cancellation            | Fiber interruption or `Effect.timeout`                  |
| Synchronous `onProgress` callback    | Callback returning `Effect<void, E, R>`                 |
| Check `result.code`                  | Handle typed `ExitError`                                |
| `result.result` / `result.json`      | Decoded probe object returned directly                  |
| Async resourceful compilation        | Synchronous `Result` with arguments and descriptor plan |

The old runner classes and FIFO implementation are removed. The `ffmpegu` namespace remains convenient for pure builders, options, and filters; named exports are preferred for execution.

Bundled FFmpeg, FFprobe, and FFplay reference documents describe the binaries themselves, independently of this library's API.
