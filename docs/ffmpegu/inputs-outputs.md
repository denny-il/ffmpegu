# Inputs and outputs

`Input.fromFile(path, options?)` and `Output.toFile(path, options?)` pass paths directly to FFmpeg. They preserve seeking and FFmpeg's protocol support. A fake Effect FileSystem does not intercept I/O performed inside FFmpeg itself; use a fake process service for isolated tests.

`Input.fromStream(stream, options?)` accepts an Effect `Stream<Uint8Array, E, R>`. `Output.toSink(sink, options?)` accepts `Sink<void, Uint8Array, never, E, R>`. Both preserve their error and service types in the resulting command.

## Effect FileSystem

```ts
import { Effect, FileSystem } from "effect"
import { Command, Input, Options, Output, run } from "ffmpegu"

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  return yield* run(
    Command.make({
      inputs: [
        Input.fromStream(
          fs.stream("audio.pcm"),
          Options.create({
            f: "s16le",
            ar: 48000,
            ac: 2
          })
        )
      ],
      outputs: [
        Output.toSink(
          fs.sink("audio.ogg"),
          Options.create({
            f: "ogg",
            "c:a": "libopus"
          })
        )
      ]
    })
  )
})
```

Provide both `FFmpeg` and the matching platform services to this program. FileSystem adapters acquire resources during execution and participate in scoped cleanup.

## Node stream adapters

Use `NodeStream.fromReadable` and `NodeSink.fromWritable` from `@effect/platform-node` at your application boundary. Their `evaluate` functions should acquire fresh streams per execution. Follow the adapter's ownership contract for externally owned streams; a borrowed stream is not automatically replayable.

## Completion and format requirements

A successful output sink must consume through EOF and finish its own writes. Early success is an `OutputError` with reason `SinkEndedEarly`; the engine does not silently discard the remaining media. If a sink produces an irrelevant result, explicitly map it to `void` with `Sink.map(sink, () => undefined)`.

Pipes are not seekable. Specify raw input formats and output muxers explicitly. For MP4 output through a sink, use a streaming-compatible layout such as `movflags: "frag_keyframe+empty_moov"`; ordinary seekable MP4 files should use `Output.toFile`.

When FFmpeg finishes early, such as with `-t`, pending input feeders are interrupted and their resources released. Caller-originated stream errors are preserved. Partial file outputs are not removed automatically.
