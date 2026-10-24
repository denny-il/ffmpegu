# Inputs and outputs

| Constructor                        | Media travels through            | Types                     |
| ---------------------------------- | -------------------------------- | ------------------------- |
| `Input.fromFile(path, options?)`   | FFmpeg opens the path itself     | `Input<never, never>`     |
| `Input.fromStream(stream, options?)` | A pipe fed from an Effect `Stream` | `Input<E, R>`           |
| `Output.toFile(path, options?)`    | FFmpeg writes the path itself    | `Output<never, never, 0>` |
| `Output.toSink(sink, options?)`    | A pipe drained into an Effect `Sink` | `Output<E, R, 0>`     |
| `Output.toStream(options?)`        | A pipe read by [`stream`](running.md#streaming-output) | `Output<never, never, 1>` |

`options` are the input or output options placed before that input's `-i` or before that output's path.

## Files, URLs, and devices

`fromFile` and `toFile` pass the string to FFmpeg unchanged, so everything FFmpeg can open works: local paths, URLs for any compiled-in [protocol](https://ffmpeg.org/ffmpeg-protocols.html), image sequences such as `frame_%04d.png`, and pseudo inputs such as `lavfi` sources. Prefer files whenever the data is on disk: FFmpeg can seek them, which some formats (such as regular MP4) need.

```ts
import { Input, Options, options } from "ffmpegu"

const remote = Input.fromFile("https://example.com/video.mp4")
const frames = Input.fromFile("frames/%04d.png", Options.create({ framerate: 30 }))
const tone = Input.fromFile("sine=frequency=440:duration=5", options.format("lavfi"))
```

FFmpeg performs this I/O itself, so a fake Effect `FileSystem` cannot intercept it; see [testing](configuration.md#testing).

## Stream inputs

`Input.fromStream` accepts any `Stream<Uint8Array, E, R>`. Its error type `E` and requirements `R` flow into the command and then into `run`.

```ts
import { Effect, FileSystem } from "effect"
import { Command, Input, Options, Output, run } from "ffmpegu"

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  yield* run(
    Command.make({
      inputs: [
        Input.fromStream(
          fs.stream("audio.pcm"),
          Options.create({ f: "s16le", ar: 48000, ac: 2 })
        )
      ],
      outputs: [
        Output.toSink(
          fs.sink("audio.ogg"),
          Options.create({ f: "ogg", "c:a": "libopus" })
        )
      ]
    })
  )
})
```

This program requires `FFmpeg` and `FileSystem`, so provide both the media layer and the platform layer.

- **Name the format.** Pipes are not seekable and FFmpeg cannot always probe them; give raw and ambiguous inputs an explicit `f` (plus `ar`/`ac` or `s`/`pix_fmt` for raw media).
- **Backpressure.** The feeder holds at most three of the stream's batches (the chunk arrays it emits per pull) ahead of the pipe: one being written, one queued, one waiting. The pipe and OS buffers can absorb more before FFmpeg reads it. `Stream.rechunk(n)` limits the number of chunks per batch, not the size of each `Uint8Array`.
- **No copies.** Batches are written as emitted. A producer must not mutate or reuse an emitted buffer until the run settles; copy before emitting if your producer recycles buffers.
- **Early exit.** When FFmpeg finishes before the stream ends (for example with `-t`), the feeder is interrupted and its resources released.
- **Failure.** If the stream fails, its pipe is closed so FFmpeg stops promptly, and the run fails with the stream's own error. FFmpeg may still have finalized file outputs with partial content.

## Sink outputs

`Output.toSink` accepts a `Sink<void, Uint8Array, never, E, R>`. The run succeeds only after the sink has consumed the output through EOF and finished its own writes.

A sink that completes before EOF fails the run with an `OutputError` whose reason is `SinkEndedEarly`, rather than silently dropping media. Map a sink with an unrelated result to `void` with `Sink.map(sink, () => undefined)`.

Pipe outputs need a muxer that can write sequentially: name it with `f`, and for MP4 use a fragmented layout such as `movflags: "frag_keyframe+empty_moov"`. Write ordinary, seekable MP4 files with `Output.toFile`.

## Stream outputs

`Output.toStream(options?)` marks the output that `stream(command)` returns as a `Stream<Uint8Array>`; see [streaming output](running.md#streaming-output). The command type counts these outputs, so `run` rejects a command that has one and `stream` requires exactly one at compile time.

## Node streams

At the application boundary, adapt Node streams with `NodeStream.fromReadable` and `NodeSink.fromWritable` from `@effect/platform-node`. Their `evaluate` functions should create a fresh Node stream per execution so the command stays re-runnable. A borrowed, already-open Node stream is single-use; follow the adapter's ownership rules for closing it.

## Deadlines

`-t` limits media duration, not elapsed time. FFmpeg can wait indefinitely for a stalled producer or a slow network input; use `Effect.timeout` when the application needs an execution deadline.
