# ffmpegu

Effect-native FFmpeg and FFprobe services for Node.js and Bun. Build commands with typed options, stream references, and filter graphs; execute them with scoped resources, typed failures, and cancellation through Effect interruption.

## Install

```sh
pnpm add ffmpegu effect @effect/platform-node
# For Bun applications, use @effect/platform-bun instead.
```

Requires Effect 4.0.x, Node.js 24+ or Bun 1.4+, macOS or Linux, and FFmpeg/FFprobe on PATH. Custom binary paths can be supplied to the service Layers.

## Quick start

```ts
import { Effect } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Command, FFmpeg, Input, Options, Output, run } from "ffmpegu"

const input = Input.fromFile("input.mp4")
const command = Command.make({
  global: Options.create("-y"),
  inputs: [input],
  outputs: [
    Output.toFile(
      "output.mp4",
      Options.create({
        map: input.video,
        "c:v": "libx264",
        crf: 23
      })
    )
  ]
})

run(command).pipe(
  Effect.provide(FFmpeg.layer()),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
```

On Bun, supply `BunServices.layer` and use `BunRuntime.runMain` from `@effect/platform-bun`. The library never starts a runtime internally.

## Behavior

- `run(command)` succeeds only after FFmpeg exits successfully and every output sink finishes.
- Nonzero exits, spawn failures, invalid commands, and invalid probe data are typed failures.
- Inputs accept `Stream<Uint8Array, E, R>`; outputs accept `Sink<void, Uint8Array, never, E, R>`. Errors and service requirements are preserved.
- Interruption releases resources and terminates the child process, escalating if it ignores SIGTERM.
- File paths retain FFmpeg's seekable file behavior. Streams use additional descriptors and require suitable container options.
- Commands can be evaluated again. Stream resources must be acquired afresh, and output writes are not atomic or idempotent. There is no automatic retry.

## Documentation

Start with [the guide](docs/README.md), then see [commands](docs/ffmpegu/command.md), [inputs and outputs](docs/ffmpegu/inputs-outputs.md), [execution services](docs/ffmpegu/runners.md), [FFprobe](docs/ffmpegu/ffprobe.md), [options](docs/ffmpegu/options.md), and [filters](docs/ffmpegu/filters.md).

## Development

Use `vp` to manage the Node environment and the pinned pnpm version:

```sh
vp env exec -- pnpm install --frozen-lockfile
vp env exec -- pnpm run check
vp env exec -- pnpm run test:node
vp env exec -- pnpm run test:bun
vp env exec -- pnpm run test:package
```

Both runtime commands execute the same Vitest 5 suite with `@effect/vitest`. Integration tests require FFmpeg/FFprobe. CI covers Node/Bun on Linux/macOS. `test:package` builds on the existing `dist` output: run `build` or `check` first.
