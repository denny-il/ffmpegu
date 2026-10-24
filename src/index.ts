import { FFmpeguCommand } from "./core/command.ts"
import { FFmpeguInput } from "./core/input.ts"
import { FFmpeguOutput } from "./core/output.ts"
import * as _filters from "./filters/index.ts"
import * as _options from "./options/index.ts"
import * as _time from "./time.ts"

export {
  FFmpeguCommand,
  FFmpeguCommand as Command,
  type CompiledCommand,
  type CompiledInputStream,
  type CompiledOutputStream,
  type FFmpeguCommandOptions
} from "./core/command.ts"
export {
  FFmpeguInput,
  FFmpeguInput as Input,
  type FFmpeguAnyInput,
  type FFmpeguInputSource,
  FFmpeguStreamReference,
  FFmpeguStreamTrackReference
} from "./core/input.ts"
export {
  FFmpeguOutput,
  FFmpeguOutput as Output,
  type FFmpeguOutputDestination
} from "./core/output.ts"
export {
  FFmpeg,
  type FFmpegOptions,
  type FFmpegService,
  run,
  stream,
  type RunOptions
} from "./core/ffmpeg.ts"
export {
  FFprobe,
  type FFprobeOptions,
  type FFprobeService,
  probe,
  probeWith
} from "./probe/ffprobe.ts"
export {
  ProbeFormat,
  ProbeResult,
  ProbeStream,
  ProjectedProbeResult,
  ProjectedProbeStream
} from "./probe/schema.ts"
export {
  CommandError,
  type CommandErrorReason,
  CommandLocation,
  DuplicateInput,
  DuplicateOutput,
  ExitError,
  type FFmpegError,
  ForeignReference,
  InvalidArgument,
  OutputError,
  PipeError,
  ProbeDecodeError,
  type ProbeError,
  ProbeOutputError,
  ReservedOption,
  ReservedPath,
  SinkEndedEarly,
  SpawnError,
  StreamOutput
} from "./errors.ts"
export { FFmpeguFilterBuilder } from "./filters/builder.ts"
export { FFmpeguFilterChain } from "./filters/chain.ts"
export { FFmpeguFilterGraph } from "./filters/graph.ts"
export { FFmpeguFilterLabelRef } from "./filters/label.ts"
export { FFmpeguSimpleFilter } from "./filters/simple.ts"
export { FFmpeguOptions, FFmpeguOptions as Options } from "./options/core.ts"
export type { Progress, RunResult } from "./types/index.ts"

export const filters = _filters
export const options = _options
export const time = _time

/** Pure builder aliases. */
export const ffmpegu = {
  input: FFmpeguInput,
  output: FFmpeguOutput,
  command: FFmpeguCommand.make,
  filters: _filters,
  options: _options,
  time: _time
} as const

export default ffmpegu
