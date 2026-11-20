/**
 * Type-level contract of the public API. Compiled with
 * `tsc -p tests/types`, never executed.
 */
import type { Readable } from "node:stream"
import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  type Result,
  Schema,
  Sink,
  Stream,
  type Types
} from "effect"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import {
  type AnyInput,
  Command,
  type CommandError,
  type CompiledCommand,
  FFmpeg,
  type FFmpegError,
  FFprobe,
  type FFprobeService,
  Filter,
  Input,
  Options,
  Output,
  type OutputError,
  type ProbeError,
  type ProbeResult,
  type Progress,
  type ProjectedProbeResult,
  type ReservedPath,
  type RunResult
} from "../../src/index.ts"
import type { TemporalDuration } from "../../src/utils.ts"

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
  global: Options.overwrite(),
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
    Command<SourceError | OtherSourceError | SinkError, Storage | Uploader, 0>
  >
>(true)

// Arrays built separately (not literals) still infer the unions.
const inputs = [Input.fromStream(source), Input.fromStream(otherSource)]
const outputs = [Output.toSink(sink)]
const separate = Command.make({ inputs, outputs })
assertType<
  Equals<
    typeof separate,
    Command<SourceError | OtherSourceError | SinkError, Storage | Uploader, 0>
  >
>(true)

// Chained construction accumulates unions.
const chained = Command.make({})
  .withInput(Input.fromStream(source))
  .withInput(Input.fromFile("in.mp4"))
  .withOutput(Output.toSink(sink))
  .withGlobal(Options.overwrite())
assertType<
  Equals<
    typeof chained,
    Command<SourceError | SinkError, Storage | Uploader, 0>
  >
>(true)

// Data-last combinators in a pipe accumulate unions exactly like the methods.
const piped = Command.make({}).pipe(
  Command.withInput(Input.fromStream(source)),
  Command.withInput(Input.fromFile("in.mp4")),
  Command.withOutput(Output.toSink(sink)),
  Command.withGlobal(Options.overwrite())
)
assertType<Equals<typeof piped, typeof chained>>(true)

// Data-first forms widen the same way.
const dataFirst = Command.withOutput(
  Command.withInput(Command.make({}), Input.fromStream(source)),
  Output.toSink(sink)
)
assertType<
  Equals<
    typeof dataFirst,
    Command<SourceError | SinkError, Storage | Uploader, 0>
  >
>(true)

// A data-last combinator stays generic over the command it is applied to.
const overwrite = Command.withGlobal(Options.overwrite())
const addSink = Command.withOutput(Output.toSink(sink))
assertType<
  Equals<
    ReturnType<typeof addSink<OtherSourceError, Metrics, 1>>,
    Command<OtherSourceError | SinkError, Metrics | Uploader, 1>
  >
>(true)
const pipedWithStreamInput = Command.make({
  inputs: [Input.fromStream(otherSource)]
}).pipe(addSink, overwrite)
assertType<
  Equals<
    typeof pipedWithStreamInput,
    Command<OtherSourceError | SinkError, Uploader, 0>
  >
>(true)

// File-only commands have no caller errors or requirements.
const files = Command.make({
  inputs: [Input.fromFile("in.mp4")],
  outputs: [Output.toFile("out.mp4")]
})
assertType<Equals<typeof files, Command<never, never, 0>>>(true)

// Inputs and outputs built inline with the constructor contribute their own
// types, `never` without a stream or sink, instead of `any`.
const constructedFiles = Command.make({
  inputs: [new Input("in.mp4")],
  outputs: [new Output("out.mp4")]
})
assertType<Equals<typeof constructedFiles, Command<never, never, any>>>(true)
const constructedInput = Command.make({ inputs: [new Input("in.mp4")] })
assertType<Equals<typeof constructedInput, Command<never, never, 0>>>(true)
const constructedDrain = Command.make({ outputs: [new Output(Sink.drain)] })
assertType<Equals<typeof constructedDrain, Command<never, never, any>>>(true)
const constructedMixed = Command.make({
  inputs: [new Input(source), new Input("in.mp4"), Input.fromFile("b.mp4")],
  outputs: [new Output(sink), new Output("out.mp4"), Output.toStream()]
})
assertType<
  Equals<
    typeof constructedMixed,
    Command<SourceError | SinkError, Storage | Uploader, any>
  >
>(true)
const constructedByConstructor = new Command({
  inputs: [new Input("in.mp4"), new Input(source)],
  outputs: [new Output("out.mp4")]
})
assertType<
  Equals<typeof constructedByConstructor, Command<SourceError, Storage, any>>
>(true)
const constructedPiped = Command.make({}).pipe(
  Command.withInput(new Input("in.mp4")),
  Command.withOutput(new Output("out.mp4")),
  Command.withOutput(new Output(sink))
)
assertType<Equals<typeof constructedPiped, Command<SinkError, Uploader, any>>>(
  true
)
const constructedRun = FFmpeg.run(
  Command.make({
    inputs: [new Input("in.mp4")],
    outputs: [Output.toFile("out.mp4")]
  })
)
assertType<
  Equals<typeof constructedRun, Effect.Effect<RunResult, FFmpegError, FFmpeg>>
>(true)

// Output.toStream outputs are counted (`2` means two or more) through every
// way of building a command.
const streamed = Command.make({
  inputs: [Input.fromStream(source)],
  outputs: [Output.toFile("out.mp4"), Output.toStream()]
})
assertType<Equals<typeof streamed, Command<SourceError, Storage, 1>>>(true)
const streamedByMethod = files.withOutput(Output.toStream())
assertType<Equals<typeof streamedByMethod, Command<never, never, 1>>>(true)
const twoStreams = streamed.pipe(
  Command.withOutput(Output.toStream()),
  Command.withOutput(Output.toFile("other.mp4"))
)
assertType<Equals<typeof twoStreams, Command<SourceError, Storage, 2>>>(true)
const threeStreams = Command.withOutput(twoStreams, Output.toStream())
assertType<Equals<typeof threeStreams, Command<SourceError, Storage, 2>>>(true)
declare const flag: boolean
const maybeStreamed = Command.make({
  outputs: [flag ? Output.toStream() : Output.toFile("out.mp4")]
})
assertType<Equals<typeof maybeStreamed, Command<never, never, 0 | 1>>>(true)
// Counting stays within the instantiation depth limit for long output tuples.
type Repeat<
  T,
  N extends number,
  Acc extends ReadonlyArray<T> = []
> = Acc["length"] extends N ? Acc : Repeat<T, N, readonly [...Acc, T]>
declare const manyFiles: Repeat<Output<never, never, 0>, 100>
const manyOutputs = Command.make({
  outputs: [...manyFiles, Output.toStream(), ...manyFiles]
})
assertType<Equals<typeof manyOutputs, Command<never, never, 1>>>(true)
// Explicit type arguments written before the count existed still apply.
const explicitOutput = files.withOutput<SinkError, Uploader>(
  Output.toSink(sink)
)
assertType<Equals<typeof explicitOutput, Command<SinkError, Uploader, any>>>(
  true
)
const streamedOutput = FFmpeg.stream(streamed)
assertType<
  Equals<
    typeof streamedOutput,
    Stream.Stream<Uint8Array, FFmpegError | SourceError, FFmpeg | Storage>
  >
>(true)

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
const ran = FFmpeg.run(literal, {
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
    ReturnType<typeof FFmpeg.run<never, never>>,
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

const probed = FFprobe.probe("in.mp4")
const probeCallbacks = Effect.forEach(["in.mp4"], FFprobe.probe)
const probeArray = ["in.mp4"].map(FFprobe.probe)
const serviceCallbacks = FFprobe.use((service) =>
  Effect.forEach(["in.mp4"], service.probe)
)
assertType<
  Equals<
    typeof probeCallbacks,
    Effect.Effect<ProbeResult[], ProbeError, FFprobe>
  >
>(true)
assertType<
  Equals<typeof probeArray, Effect.Effect<ProbeResult, ProbeError, FFprobe>[]>
>(true)
assertType<
  Equals<
    typeof serviceCallbacks,
    Effect.Effect<ProbeResult[], ProbeError, FFprobe>
  >
>(true)
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

// Default probes retain required indexes; projected probes expose optional indexes.
Effect.map(probed, (result) => {
  for (const stream of result.streams) {
    const index: number = stream.index
    void index
  }
})
const projected = FFprobe.probeWith(
  "in.mp4",
  Options.make({ show_entries: "stream=width" })
)
assertType<
  Equals<
    typeof projected,
    Effect.Effect<ProjectedProbeResult, ProbeError, FFprobe>
  >
>(true)
Effect.map(projected, (result) => {
  for (const stream of result.streams) {
    const index: number | undefined = stream.index
    // @ts-expect-error projections can omit index
    const requiredIndex: number = stream.index
    const width: number | "N/A" | undefined = stream.width
    // @ts-expect-error projected dimensions can be "N/A"
    const numericWidth: number | undefined = stream.width
    void [index, requiredIndex, width, numericWidth]
  }
})
const projectedViaService = FFprobe.use((service) =>
  service.probeWith("in.mp4", Options.make("-show_chapters"))
)
assertType<
  Equals<
    typeof projectedViaService,
    Effect.Effect<ProjectedProbeResult, ProbeError, FFprobe>
  >
>(true)

// A caller schema replaces the projected result and adds its decoding services.
const Dims = Schema.Struct({
  streams: Schema.Array(
    Schema.Struct({ width: Schema.Number, height: Schema.Number })
  )
})
const dims = FFprobe.probeWith(
  "in.mp4",
  Options.make({ show_entries: "stream=width,height" }),
  Dims
)
assertType<
  Equals<
    typeof dims,
    Effect.Effect<
      {
        readonly streams: ReadonlyArray<{
          readonly width: number
          readonly height: number
        }>
      },
      ProbeError,
      FFprobe
    >
  >
>(true)
declare const StoredDims: Schema.Codec<
  { readonly width: number },
  unknown,
  Storage
>
const storedDims = FFprobe.probeWith(
  "in.mp4",
  Options.make("-show_streams"),
  StoredDims
)
assertType<
  Equals<
    typeof storedDims,
    Effect.Effect<{ readonly width: number }, ProbeError, FFprobe | Storage>
  >
>(true)
// The service returns raw JSON; only the library decodes with the schema.
const rawViaService = FFprobe.use((service) =>
  service.probeJson("in.mp4", Options.make("-show_streams"))
)
assertType<
  Equals<typeof rawViaService, Effect.Effect<unknown, ProbeError, FFprobe>>
>(true)
// Generic helpers and schema unions keep the schema's types.
const probeWithHelper = <S extends Schema.Top>(schema: S) =>
  FFprobe.probeWith("in.mp4", Options.make("-show_streams"), schema)
const helperDims = probeWithHelper(StoredDims)
assertType<
  Equals<
    typeof helperDims,
    Effect.Effect<{ readonly width: number }, ProbeError, FFprobe | Storage>
  >
>(true)
declare const eitherSchema: typeof Schema.String | typeof Schema.Number
const either = FFprobe.probeWith(
  "in.mp4",
  Options.make("-show_streams"),
  eitherSchema
)
assertType<
  Equals<typeof either, Effect.Effect<string | number, ProbeError, FFprobe>>
>(true)
// @ts-expect-error the third argument must be a Schema
FFprobe.probeWith("in.mp4", Options.make("-show_streams"), { width: 0 })
// `Parameters`/`ReturnType` read the last overload, so wrappers derived from
// them keep the two-argument API.
const forwardProbeWith = (
  ...args: Parameters<typeof FFprobe.probeWith>
): ReturnType<typeof FFprobe.probeWith> => FFprobe.probeWith(...args)
const forwarded = forwardProbeWith("in.mp4", Options.make("-show_streams"))
assertType<
  Equals<
    typeof forwarded,
    Effect.Effect<ProjectedProbeResult, ProbeError, FFprobe>
  >
>(true)
// The documented mock: fixed raw JSON is enough, since `probeWith` decodes it.
const fixture = { streams: [] }
const mockProbeService: FFprobeService = {
  probe: () => Effect.succeed(fixture),
  probeWith: () => Effect.succeed(fixture),
  probeJson: () => Effect.succeed(fixture)
}
export const FFprobeMock = Layer.succeed(FFprobe, mockProbeService)
// @ts-expect-error custom implementations must provide probeJson
export const withoutProbeJson: FFprobeService = {
  probe: mockProbeService.probe,
  probeWith: mockProbeService.probeWith
}
// A generic helper that claims to return the schema's type without decoding
// no longer fits the service: it never receives a schema.
const ignoresSchema = <S extends Schema.Top>(
  _input: string,
  _options: Options.Arg,
  _schema: S
): Effect.Effect<S["Type"]> => Effect.succeed({ streams: [] })
export const schemaIgnoringService: FFprobeService = {
  ...mockProbeService,
  // @ts-expect-error probeJson takes no schema
  probeJson: ignoresSchema
}
// Error reasons are tagged, so Effect.catchReason narrows them.
assertType<
  Equals<
    Types.ReasonTags<CommandError>,
    | "DuplicateInput"
    | "DuplicateOutput"
    | "ForeignReference"
    | "ReservedPath"
    | "ReservedOption"
    | "InvalidArgument"
    | "StreamOutput"
  >
>(true)
assertType<Equals<Types.ReasonTags<OutputError>, "SinkEndedEarly">>(true)
declare const failing: Effect.Effect<RunResult, FFmpegError>
const reservedPath = failing.pipe(
  Effect.catchReason("CommandError", "ReservedPath", (reason) => {
    assertType<Equals<typeof reason, ReservedPath>>(true)
    return Effect.succeed(reason.path)
  })
)
assertType<
  Equals<typeof reservedPath, Effect.Effect<RunResult | string, FFmpegError>>
>(true)
const sinkFd = failing.pipe(
  Effect.catchReason("OutputError", "SinkEndedEarly", (reason) =>
    Effect.succeed(reason.fd)
  )
)
assertType<
  Equals<typeof sinkFd, Effect.Effect<RunResult | number, FFmpegError>>
>(true)
failing.pipe(
  // @ts-expect-error reason tags are checked against the error
  Effect.catchReason("CommandError", "SinkEndedEarly", () => Effect.void)
)

// ExitError names the failed binary when probing and transcoding together.
Effect.gen(function* () {
  yield* FFprobe.probe("in.mp4")
  return yield* FFmpeg.run(files)
}).pipe(
  Effect.catchTag("ExitError", (error) => {
    const binary: string | undefined = error.binary
    return Effect.succeed(binary)
  })
)

// References of inputs with any error/requirement types are usable everywhere.
const typedInput = Input.fromStream(source)
const anyInput: AnyInput = typedInput
Options.map(typedInput.video)
Options.map(anyInput.audio.track(1))
Filter.label(typedInput.video.track(0))

// Time values accept Duration values and Temporal.Duration directly.
// Temporal.Duration also fits the time object shape, so check the alias.
assertType<Equals<TemporalDuration, Temporal.Duration>>(true)
Options.startTime(Duration.seconds(1))
Options.to(Temporal.Duration.from({ milliseconds: 1500 }))
Filter.atrim({
  start: Duration.millis(500),
  duration: Temporal.Duration.from({ seconds: 1 })
})
Filter.fps({ start_time: Duration.micros(1n) })

// Progress fields are camelCase; the marker and output time are typed.
assertType<Equals<Progress["progress"], "continue" | "end">>(true)
assertType<Equals<Progress["outTime"], Duration.Duration | undefined>>(true)
assertType<Equals<Progress["totalSize"], number | undefined>>(true)

// Filter labels accept readonly arrays.
const readonlyLabels: ReadonlyArray<ReturnType<typeof Filter.label>> = [
  Filter.label("in")
]
Filter.scale({ w: 320 }, { inputs: readonlyLabels, outputs: readonlyLabels })
Filter.make("null", {}, { inputs: readonlyLabels, outputs: readonlyLabels })
// Labels are also given as names and stream references.
Filter.scale(
  { w: 320 },
  { inputs: [Input.fromFile("in.mp4").video], outputs: ["out"] }
)
// @ts-expect-error an input stream cannot name a filter output
Filter.scale({}, { outputs: [Input.fromFile("in.mp4").video] })
// @ts-expect-error option bundles are immutable
Options.make("-y").args.push("-n")

// Partial mocks of the generic service methods for code under test.
const ffmpegMock = Layer.mock(FFmpeg, {
  run: () => Effect.succeed({ args: [], stderr: "" }),
  stream: () => Stream.make(new Uint8Array([1]))
})
assertType<Equals<typeof ffmpegMock, Layer.Layer<FFmpeg>>>(true)
const mockedRun = FFmpeg.run(files).pipe(Effect.provide(ffmpegMock))
assertType<Equals<typeof mockedRun, Effect.Effect<RunResult, FFmpegError>>>(
  true
)
const mockedStream = FFmpeg.stream(streamedByMethod).pipe(
  Stream.provide(ffmpegMock)
)
assertType<Equals<typeof mockedStream, Stream.Stream<Uint8Array, FFmpegError>>>(
  true
)
const ffprobeMock = Layer.mock(FFprobe, {
  probe: () => Effect.succeed({ streams: [] })
})
assertType<Equals<typeof ffprobeMock, Layer.Layer<FFprobe>>>(true)
// @ts-expect-error mocked results keep the service's result type
Layer.mock(FFmpeg, { run: () => Effect.succeed({ stderr: "" }) })

// Service options: byte limits accept sizes, Config layers accept a Config
// per option or one Config of all options.
const ffmpegLayer = FFmpeg.layer({ stderrTailBytes: "64 KiB" })
assertType<
  Equals<typeof ffmpegLayer, Layer.Layer<FFmpeg, never, ChildProcessSpawner>>
>(true)
const ffmpegConfigLayer = FFmpeg.layerConfig({
  binary: Config.String("FFMPEG_PATH"),
  forceKillAfter: Config.Duration("FFMPEG_KILL_AFTER"),
  stderrTailBytes: Config.ByteSize("FFMPEG_STDERR_TAIL")
})
assertType<
  Equals<
    typeof ffmpegConfigLayer,
    Layer.Layer<FFmpeg, Config.ConfigError, ChildProcessSpawner>
  >
>(true)
FFmpeg.layerConfig(Config.all({ binary: Config.String("FFMPEG_PATH") }))
FFprobe.layerConfig({ maxOutputBytes: Config.Int("FFPROBE_MAX_OUTPUT") })

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
FFmpeg.run(files, { onProgress: () => undefined })
// @ts-expect-error byte sizes need a known unit
FFprobe.layer({ maxOutputBytes: "16 MB/s" })
// @ts-expect-error configured binaries are strings
FFmpeg.layerConfig({ binary: Config.Int("FFMPEG_PATH") })
// @ts-expect-error commands are not Effects
Effect.runPromise(files)
// @ts-expect-error time values take Duration values, not other Duration.Input forms
Options.duration([1, 0])
// @ts-expect-error inputs are not outputs
Command.withOutput(Input.fromFile("in.mp4"))
// @ts-expect-error inputs are not outputs
Command.make({ outputs: [Input.fromFile("in.mp4")] })
// @ts-expect-error outputs are not inputs
Command.make({ inputs: [Output.toFile("out.mp4")] })
// @ts-expect-error input streams carry bytes
Command.make({ inputs: [{ ...Input.fromFile("in.mp4"), source: strings }] })
Command.make({
  // @ts-expect-error output destinations are paths, sinks or streams
  outputs: [{ ...Output.toFile("out.mp4"), destination: 1 }]
})
// @ts-expect-error run cannot consume an Output.toStream output
FFmpeg.run(streamed)
// @ts-expect-error run cannot consume an Output.toStream output
FFmpeg.run(twoStreams)
// @ts-expect-error stream needs an Output.toStream output
FFmpeg.stream(files)
// @ts-expect-error stream reads exactly one Output.toStream output
FFmpeg.stream(twoStreams)
// @ts-expect-error the output may be a stream output
FFmpeg.run(maybeStreamed)
// @ts-expect-error the output may not be a stream output
FFmpeg.stream(maybeStreamed)
Effect.flatMap(Effect.service(FFmpeg), (ffmpeg) => {
  // @ts-expect-error the service checks like run
  ffmpeg.run(streamedByMethod)
  // @ts-expect-error the service checks like stream
  return Effect.succeed(ffmpeg.stream(chained))
})

// Commands whose count is unknown are accepted by both and checked at runtime:
// explicitly typed commands, arrays of unknown length that may contain stream
// outputs, and outputs built with the constructor.
const annotated: Command<SourceError, Storage> = streamed
const mixedOutputs = [Output.toFile("out.mp4"), Output.toStream()]
const fromArray = Command.make({ outputs: mixedOutputs })
const constructed = files.withOutput(new Output("out.mkv"))
FFmpeg.run(annotated)
FFmpeg.stream(annotated)
FFmpeg.run(fromArray)
FFmpeg.stream(fromArray)
FFmpeg.run(constructed)
FFmpeg.stream(constructed)

// Bundle entries are tokens, bundles, tuples and records. A bare argument
// would render as a stray positional token, so it is only accepted as a value.
const referenced = Input.fromFile("in.mp4")
Options.make({ map: referenced.video }, ["map", referenced.audio], "-y")
// @ts-expect-error a stream reference is an option value, not an option
Options.make(referenced.video)
// @ts-expect-error a filter is an option value, not an option
Options.make(Filter.hflip())
// Optional keys of a typed record are accepted and omitted when unset.
const optionalKeys: { crf?: number; preset?: string } = {}
Options.make(optionalKeys)

// Inputs, outputs and global options take option forms directly.
Command.make({ global: { y: true } })
Input.fromFile("in.mp4", { ss: 1 }, ["t", 2], Options.format("mp4"))
Output.toStream({ f: "ogg" }, "-vn")
// @ts-expect-error a bare argument is not an option form here either
Output.toFile("out.mp4", referenced.video)
const emptyCommand = Command.make()
assertType<Equals<typeof emptyCommand, Command<never, never, 0>>>(true)
declare const maybeStreaming:
  | { readonly outputs: readonly [Output<never, never, 1>] }
  | undefined
// @ts-expect-error a configuration that may be absent would keep its count
Command.make(maybeStreaming)
// An optional bundle may be passed as it is.
declare const maybeSeek: Options.Options | undefined
Input.fromFile("in.mp4", maybeSeek)
Output.toFile("out.mp4", maybeSeek, { crf: 23 })

// Filter options take one raw string, chain or filter, or several filters.
Options.videoFilter("scale=1:1")
Options.videoFilter(Filter.chain(Filter.hflip()))
Options.videoFilter(Filter.scale({ w: 1 }), Filter.hflip())
Options.videoFilter("scale=1:1", Filter.hflip())
// @ts-expect-error at least one filter is required
Options.audioFilter()
// @ts-expect-error as a callback it would read the index as a filter
;["hflip"].map(Options.videoFilter)
// Wrappers derived from the helper keep every form.
const wrappedFilter = (...args: Parameters<typeof Options.videoFilter>) =>
  Options.videoFilter(...args)
wrappedFilter("scale=1:1")
wrappedFilter(Filter.chain(Filter.hflip()))
// Their signatures can be named from the package entry.
const namedFilter: Options.FilterHelper = Options.audioFilter
const namedBitrate: Options.BitrateHelper = Options.videoBitrate
void [namedFilter, namedBitrate]

// Filters without typed options still take only filter option values.
Filter.hflip({ enable: "gte(t,1)" })
// @ts-expect-error options are a record
Filter.hflip(123)
// @ts-expect-error time objects are only accepted on a helper's time keys
Filter.vflip({ enable: { seconds: 1 } })
