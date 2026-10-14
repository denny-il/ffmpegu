/**
 * Type-level contract of the public API. Compiled with
 * `tsc -p tests/types`, never executed.
 */
import type { Readable } from "node:stream"
import { Context, Effect, type Result, Sink, Stream } from "effect"
import {
  Command,
  type CommandError,
  type CompiledCommand,
  FFmpeg,
  type FFmpegError,
  type FFmpeguAnyInput,
  type FFmpeguCommand,
  FFprobe,
  filters,
  Input,
  options,
  Output,
  probe,
  type ProbeError,
  type ProbeResult,
  run,
  type RunResult
} from "../../src/index.ts"

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const assertType = <T extends true>(value: T) => value

class SourceError {
  readonly _tag = "SourceError"
}
class SinkError {
  readonly _tag = "SinkError"
}
class OtherSourceError {
  readonly _tag = "OtherSourceError"
}
class ProgressError {
  readonly _tag = "ProgressError"
}
class Storage extends Context.Service<Storage, { readonly id: string }>()(
  "Storage"
) {}
class Uploader extends Context.Service<Uploader, { readonly id: string }>()(
  "Uploader"
) {}
class Metrics extends Context.Service<Metrics, { readonly id: string }>()(
  "Metrics"
) {}

declare const source: Stream.Stream<Uint8Array, SourceError, Storage>
declare const otherSource: Stream.Stream<Uint8Array, OtherSourceError>
declare const sink: Sink.Sink<void, Uint8Array, never, SinkError, Uploader>

// Heterogeneous literal arrays infer the exact unions.
const literal = Command.make({
  global: options.overwrite(),
  inputs: [
    Input.fromStream(source),
    Input.fromFile("in.mp4"),
    Input.fromStream(otherSource)
  ],
  outputs: [Output.toSink(sink), Output.toFile("out.mp4")]
})
assertType<
  Equals<
    typeof literal,
    FFmpeguCommand<
      SourceError | OtherSourceError | SinkError,
      Storage | Uploader
    >
  >
>(true)

// Arrays built separately (not literals) still infer the unions.
const inputs = [Input.fromStream(source), Input.fromStream(otherSource)]
const outputs = [Output.toSink(sink)]
const separate = Command.create({ inputs, outputs })
assertType<
  Equals<
    typeof separate,
    FFmpeguCommand<
      SourceError | OtherSourceError | SinkError,
      Storage | Uploader
    >
  >
>(true)

// Chained construction accumulates unions.
const chained = Command.make({})
  .withInput(Input.fromStream(source))
  .withInput(Input.fromFile("in.mp4"))
  .withOutput(Output.toSink(sink))
  .withGlobal(options.overwrite())
assertType<
  Equals<
    typeof chained,
    FFmpeguCommand<SourceError | SinkError, Storage | Uploader>
  >
>(true)

// File-only commands have no caller errors or requirements.
const files = Command.make({
  inputs: [Input.fromFile("in.mp4")],
  outputs: [Output.toFile("out.mp4")]
})
assertType<Equals<typeof files, FFmpeguCommand<never, never>>>(true)
assertType<Equals<typeof Command.make, typeof Command.create>>(true)

// compile is synchronous and typed.
const compiled = literal.compile()
assertType<
  Equals<
    typeof compiled,
    Result.Result<
      CompiledCommand<
        SourceError | OtherSourceError | SinkError,
        Storage | Uploader
      >,
      CommandError
    >
  >
>(true)

// run adds the FFmpeg requirement and progress callback types.
const ran = run(literal, {
  onProgress: (progress) =>
    progress.frame === undefined
      ? Effect.void
      : Effect.flatMap(Effect.service(Metrics), () =>
          Effect.fail(new ProgressError())
        )
})
assertType<
  Equals<
    typeof ran,
    Effect.Effect<
      RunResult,
      FFmpegError | SourceError | OtherSourceError | SinkError | ProgressError,
      FFmpeg | Storage | Uploader | Metrics
    >
  >
>(true)
assertType<
  Equals<
    ReturnType<typeof run<never, never>>,
    Effect.Effect<RunResult, FFmpegError, FFmpeg>
  >
>(true)

// The service itself does not require FFmpeg.
const viaService = Effect.flatMap(Effect.service(FFmpeg), (ffmpeg) =>
  ffmpeg.run(chained)
)
assertType<
  Equals<
    typeof viaService,
    Effect.Effect<
      RunResult,
      FFmpegError | SourceError | SinkError,
      FFmpeg | Storage | Uploader
    >
  >
>(true)

const probed = probe("in.mp4")
assertType<
  Equals<typeof probed, Effect.Effect<ProbeResult, ProbeError, FFprobe>>
>(true)
Effect.map(probed, (result) => {
  const stream = result.streams[0]
  const index: number | undefined = stream?.index
  const width: number | undefined = stream?.width
  const unknownField: unknown = stream?.["side_data_list"]
  const formatName: string | undefined = result.format?.format_name
  return [index, width, unknownField, formatName]
})

// References of inputs with any error/requirement types are usable everywhere.
const typedInput = Input.fromStream(source)
const anyInput: FFmpeguAnyInput = typedInput
options.map(typedInput.video)
options.map(anyInput.audio.track(1))
filters.label(typedInput.video.track(0))

// Contract violations.
declare const strings: Stream.Stream<string>
declare const readable: Readable
// @ts-expect-error input streams carry bytes
Input.fromStream(strings)
// @ts-expect-error Node streams are not accepted
Input.fromStream(readable)
// @ts-expect-error output sinks must produce void
Output.toSink(Sink.collect<Uint8Array>())
// @ts-expect-error output sinks must not declare leftovers
Output.toSink(Sink.take<Uint8Array>(1).pipe(Sink.as(undefined)))
// @ts-expect-error progress callbacks return Effects
run(files, { onProgress: () => undefined })
// @ts-expect-error commands are not Effects
Effect.runPromise(files)
