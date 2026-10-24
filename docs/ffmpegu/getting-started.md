# Getting started

## Install

```sh
pnpm add ffmpegu effect @effect/platform-node
# On Bun, install @effect/platform-bun instead of @effect/platform-node.
```

| Requirement | Version                                                     |
| ----------- | ----------------------------------------------------------- |
| Effect      | 4.0.x (`effect` is a peer dependency)                       |
| Runtime     | Node.js 26.3+ or Bun 1.4.3+ (both provide global `Temporal`) |
| OS          | Linux or macOS                                              |
| Binaries    | `ffmpeg` and `ffprobe`, installed separately                |

The package does not bundle FFmpeg. By default the services run `ffmpeg` and `ffprobe` from `PATH`; [configure](configuration.md) a different binary per Layer.

The live Layers depend on Effect's `ChildProcessSpawner`, which is still an unstable Effect API. That is why the peer range is pinned to the tested 4.0 patch series.

## The model

ffmpegu separates describing an FFmpeg invocation from executing it:

1. **Describe.** `Input`, `Output`, `Options`, filters, and `Command` are immutable values. Building them never touches the filesystem or spawns a process.
2. **Compile.** `command.compile()` validates the description and renders the exact argv. It is pure and synchronous, so you can unit-test commands without FFmpeg.
3. **Execute.** `run(command)` is an `Effect` that needs the `FFmpeg` service. Providing `FFmpeg.layer()` and your platform's services turns it into a real process with a scope of its own.

The library never starts a runtime. Your application decides where Effects run, typically with `NodeRuntime.runMain` or `BunRuntime.runMain`.

## First transcode

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { Command, FFmpeg, Input, Options, Output, options, run } from "ffmpegu"

const input = Input.fromFile("input.mov")

const command = Command.make({
  global: options.overwrite(),
  inputs: [input],
  outputs: [
    Output.toFile(
      "output.mp4",
      Options.create(
        { map: input.video },
        { map: input.audio },
        options.videoCodec("libx264"),
        options.crf(23),
        options.audioCodec("aac")
      )
    )
  ]
})

const program = Effect.gen(function* () {
  const result = yield* run(command)
  yield* Effect.logInfo("Done", { args: result.args.length })
})

program.pipe(
  Effect.provide(FFmpeg.layer()),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
```

`Options.create` accepts raw FFmpeg options (`{ map: input.video }` renders `-map 0:v`) and nests the bundles returned by helpers such as `options.crf(23)`. See [options](options.md) for every form.

On Bun, use `BunServices.layer` and `BunRuntime.runMain` from `@effect/platform-bun`.

## Composing services

Most applications provide both services once, next to the platform layer:

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Command, FFmpeg, FFprobe, Input, Output, options, probe, run } from "ffmpegu"

const MediaLive = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(
  Layer.provideMerge(NodeServices.layer)
)

const program = Effect.gen(function* () {
  yield* run(
    Command.make({
      global: options.overwrite(),
      inputs: [Input.fromFile("input.mp4")],
      outputs: [Output.toFile("output.webm", options.videoCodec("libvpx-vp9"))]
    })
  )
  const metadata = yield* probe("output.webm")
  yield* Effect.logInfo("Transcoded", { streams: metadata.streams.length })
})

program.pipe(Effect.provide(MediaLive), NodeRuntime.runMain)
```

`Layer.provideMerge` keeps the platform services (such as `FileSystem`) available to the rest of the program; use `Layer.provide` if only the media services should be exposed.

## Next steps

- [Commands](command.md): structure, stream references, and compile-time checks.
- [Inputs and outputs](inputs-outputs.md): files, Effect streams, and sinks.
- [Running FFmpeg](running.md): progress, streaming output, cancellation.
- [Recipes](recipes.md): complete programs for common tasks.
