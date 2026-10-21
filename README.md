<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark-square.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/logo-light-square.svg">
  <img alt="ffmpegu" src="assets/brand/logo-light-square.png" width="320" height="320">
</picture>

# ffmpegu

Effect-native FFmpeg and FFprobe services for Node.js and Bun. Build commands with typed options, stream references, and filter graphs; execute them with scoped resources, typed failures, and cancellation through Effect interruption.

## Install

```sh
pnpm add ffmpegu effect @effect/platform-node
# For Bun applications, use @effect/platform-bun instead.
```

Requires Effect 4.0.x, Node.js 26.3+ or Bun 1.4.3+, macOS or Linux, and FFmpeg/FFprobe on PATH. Custom binary paths can be supplied to the service Layers.

Known limitation: slow streaming output consumers on macOS/Bun can fail with `ECONNRESET`; investigation and re-enabling the affected tests are tracked in [#3](https://github.com/denny-il/ffmpegu/issues/3).

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

Probe format and streams with `probe("input.mp4")`, or select metadata with the same options builder:

```ts
import { Options, probeWith } from "ffmpegu"

const metadata = probeWith("input.mp4", Options.create({
  show_entries: "stream=codec_name,width,height:format=duration",
  select_streams: "v:0",
  protocol_whitelist: "file",
  v: "error"
}))
```

Explicit probe options replace the default format/stream selection. Output stays JSON; projected stream fields, including `index`, may be absent. See [FFprobe](docs/ffmpegu/ffprobe.md) for decoding, limits, and cancellation.

## Behavior

- `run(command)` succeeds only after FFmpeg exits successfully and every output sink finishes.
- Nonzero exits, spawn failures, invalid commands, and invalid probe data are typed failures.
- Inputs accept `Stream<Uint8Array, E, R>`; outputs accept `Sink<void, Uint8Array, never, E, R>`. Errors and service requirements are preserved.
- Interruption releases resources and terminates the child process, escalating if it ignores SIGTERM.
- File paths retain FFmpeg's seekable file behavior. Streams use additional descriptors and require suitable container options.
- Commands can be evaluated again. Stream resources must be acquired afresh, and output writes are not atomic or idempotent. There is no automatic retry.

## Documentation

Start with [the guide](docs/README.md), then see [commands](docs/ffmpegu/command.md), [inputs and outputs](docs/ffmpegu/inputs-outputs.md), [execution services](docs/ffmpegu/runners.md), [FFprobe](docs/ffmpegu/ffprobe.md), [options](docs/ffmpegu/options.md), and [filters](docs/ffmpegu/filters.md).

## License and attribution

ffmpegu is [MIT licensed](LICENSE) and is an independent project, not affiliated with or endorsed by FFmpeg. FFmpeg is a trademark of Fabrice Bellard. The FFmpeg name and official branding remain with their respective rights holders.

FFmpeg and FFprobe are installed separately and retain their own licenses. See [third-party notices and branding](NOTICE.md) for attribution, upstream documentation, and license scope.

Approved SVG and PNG logos, palette values, and export instructions are in [assets/brand](assets/brand/README.md).

## Development

Use `vp` to manage the Node environment and the pinned pnpm version:

```sh
vp env exec -- pnpm install --frozen-lockfile
vp env exec -- pnpm run check
vp env exec -- pnpm run test:node
vp env exec -- pnpm run test:bun
vp env exec -- pnpm run test:package
```

Both runtime commands execute the same Vitest 5 suite with `@effect/vitest`. Integration and package tests require FFmpeg/FFprobe. CI covers Node/Bun on Linux/macOS. `test:package` installs the built tarball into a temporary consumer, checks its declarations, and transfers real media through the public API on both runtimes. It uses the existing `dist` output: run `build` or `check` first.
