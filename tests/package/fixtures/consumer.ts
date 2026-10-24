import { Effect, Sink, Stream } from "effect"
import {
  Command,
  FFmpeg,
  FFprobe,
  Input,
  Options,
  Output,
  ProjectedProbeResult,
  probeWith,
  run
} from "ffmpegu"

const command = Command.make({
  inputs: [Input.fromStream(Stream.empty)],
  outputs: [Output.toSink(Sink.drain)]
})
const execution: Effect.Effect<unknown, unknown, FFmpeg> = run(command)
void execution
const selected: Effect.Effect<ProjectedProbeResult, unknown, FFprobe> =
  probeWith("input.mp4", Options.create({ show_entries: "stream=codec_name" }))
void selected
