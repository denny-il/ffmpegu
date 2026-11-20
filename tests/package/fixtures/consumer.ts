import { Effect, Sink, Stream } from "effect"
import {
  Command,
  FFmpeg,
  Filter,
  FFprobe,
  Input,
  Options,
  Output,
  ProjectedProbeResult
} from "ffmpegu"

const command = Command.make({
  inputs: [Input.fromStream(Stream.empty)],
  outputs: [Output.toSink(Sink.drain)]
})
const execution: Effect.Effect<unknown, unknown, FFmpeg> = FFmpeg.run(command)
void execution
const selected: Effect.Effect<ProjectedProbeResult, unknown, FFprobe> =
  FFprobe.probeWith("input.mp4", { show_entries: "stream=codec_name" })
void selected

// Types nested in the namespaces resolve through the published declarations.
const bundle: Options.Options = Options.make({ crf: 23 })
const codec: Options.VideoCodec = "libx264"
const scale: Filter.ScaleOptions = { w: 1280, h: -2 }
const filter: Filter.Filter = Filter.scale(scale)
void [bundle, codec, filter]
