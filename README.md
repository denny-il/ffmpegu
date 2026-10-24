<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark-square.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/logo-light-square.svg">
  <img alt="ffmpegu" src="assets/brand/logo-light-square.png" width="320" height="320">
</picture>

# ffmpegu

[![npm](https://img.shields.io/npm/v/ffmpegu)](https://www.npmjs.com/package/ffmpegu)
[![CI](https://github.com/denny-il/ffmpegu/actions/workflows/ci.yml/badge.svg)](https://github.com/denny-il/ffmpegu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/ffmpegu)](LICENSE)

Effect-native FFmpeg and FFprobe for Node.js and Bun. Describe commands with typed, immutable builders, then run them as Effects with scoped processes, typed errors, progress reporting, and cancellation through interruption.

- **Commands are values.** Inputs, outputs, options, and filter graphs are immutable. `compile()` validates a command and renders its argv without spawning anything.
- **Typed stream references.** Map `input.video` or `input.audio.track(1)` instead of hand-counting `1:a:1`; indices are resolved when the command compiles.
- **Effect streams in and out.** Feed FFmpeg from a `Stream<Uint8Array>`, write into a `Sink`, or read an output as a `Stream`. Their error and service types flow through to `run`.
- **Resource-safe execution.** Every run owns a scope. Failures, timeouts, and interruption stop the process (SIGTERM, then SIGKILL) and release every pipe.
- **Typed failures.** Spawn failures, nonzero exits, invalid commands, and malformed probe output are tagged errors.
- **Validated probes.** `probe` decodes FFprobe's JSON with Effect Schema; `probeWith` takes your own selection and schema.
- **Services, not globals.** `FFmpeg` and `FFprobe` are Effect services with configurable Layers, easy to replace in tests.

## Install

```sh
pnpm add ffmpegu effect @effect/platform-node
# On Bun, install @effect/platform-bun instead of @effect/platform-node.
```

Requires Effect 4.0.x, Node.js 26.3+ or Bun 1.4.3+, Linux or macOS, and `ffmpeg`/`ffprobe` installed separately (on `PATH`, or configured per Layer).

## Quick start

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Command, FFmpeg, FFprobe, Input, Options, Output, filters, options, probe, run } from "ffmpegu"

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
        options.videoFilter(filters.chain(filters.scale({ w: -2, h: 720 }))),
        options.videoCodec("libx264"),
        options.crf(23),
        options.audioCodec("aac")
      )
    )
  ]
})

const program = Effect.gen(function* () {
  yield* run(command).pipe(Effect.timeout("10 minutes"))
  const metadata = yield* probe("output.mp4")
  yield* Effect.logInfo("Done", { duration: metadata.format?.duration })
})

const MediaLive = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(
  Layer.provide(NodeServices.layer)
)

program.pipe(Effect.provide(MediaLive), NodeRuntime.runMain)
```

On Bun, use `BunServices.layer` and `BunRuntime.runMain` from `@effect/platform-bun`. The library never starts a runtime itself.

### Progress

```ts
run(command, {
  onProgress: (progress) =>
    Effect.logInfo("Encoding", { frame: progress.frame, speed: progress.speed })
})
```

### Streams in, stream out

```ts
import { Stream } from "effect"
import { Command, Input, Options, Output, stream } from "ffmpegu"

// Convert any audio Stream to Opus without touching disk.
const toOpus = <E, R>(upload: Stream.Stream<Uint8Array, E, R>) =>
  stream(
    Command.make({
      inputs: [Input.fromStream(upload)],
      outputs: [Output.toStream(Options.create({ "c:a": "libopus", f: "ogg" }))]
    })
  )
```

### Probing a selection

```ts
import { Options, probeWith } from "ffmpegu"

const video = probeWith(
  "input.mp4",
  Options.create({ show_entries: "stream=codec_name,width,height", select_streams: "v:0" })
)
```

### Handling failures

```ts
run(command).pipe(
  Effect.catchTag("ExitError", (error) =>
    Effect.logError("ffmpeg failed", { exitCode: error.exitCode, stderr: error.stderr })
  )
)
```

## Behavior

- `run` succeeds only after FFmpeg exits with code 0 and every output sink has finished.
- Interruption, including `Effect.timeout`, terminates the process and releases resources. There is no `AbortSignal` and no hidden runtime.
- File paths are passed to FFmpeg, keeping seeking and protocol support. Stream inputs and outputs use dedicated pipes and need pipe-friendly formats.
- Commands can be executed repeatedly; stream resources are acquired afresh each time. Outputs are not atomic, and nothing is retried automatically.

## Documentation

- [Guide and reference](docs/README.md): [getting started](docs/ffmpegu/getting-started.md), [commands](docs/ffmpegu/command.md), [inputs and outputs](docs/ffmpegu/inputs-outputs.md), [running](docs/ffmpegu/running.md), [FFprobe](docs/ffmpegu/ffprobe.md), [options](docs/ffmpegu/options.md), [filters](docs/ffmpegu/filters.md), [errors and types](docs/ffmpegu/errors.md), [configuration and testing](docs/ffmpegu/configuration.md)
- [Recipes](docs/ffmpegu/recipes.md): thumbnails, clips, web encodes, HLS, concatenation, progress percentages, and more.

## Agent skill

The package ships an [Agent Skill](skills/ffmpegu/SKILL.md) that teaches coding agents the ffmpegu API and its conventions. Install it into your project with:

```sh
npx skills add denny-il/ffmpegu
```

It is also available at `node_modules/ffmpegu/skills/ffmpegu/` once the package is installed.

## Known limitations

- On macOS with Bun, slow consumers of streaming output can fail with `ECONNRESET` ([#3](https://github.com/denny-il/ffmpegu/issues/3)).
- Windows is not supported.

## License and attribution

ffmpegu is [MIT licensed](LICENSE). It is an independent project, not affiliated with or endorsed by the FFmpeg project. FFmpeg's name, trademarks, and licensing are described in the [FFmpeg legal notice](https://ffmpeg.org/legal.html). See [NOTICE.md](NOTICE.md) for third-party material in this repository, and [assets/brand](assets/brand/README.md) for the ffmpegu logos.

## Development

Use `vp` to manage the Node environment and the pinned pnpm version:

```sh
vp env exec -- pnpm install --frozen-lockfile
vp env exec -- pnpm run check          # typecheck, lint, format check, build
vp env exec -- pnpm run test:node
vp env exec -- pnpm run test:bun
vp env exec -- pnpm run test:package   # run after build or check
```

Both runtime commands execute the same Vitest suite with `@effect/vitest`. Integration and package tests need FFmpeg and FFprobe. CI covers Node and Bun on Linux and macOS. `test:package` installs the built tarball into a temporary project, checks its declarations, and transfers real media through the public API on both runtimes.
