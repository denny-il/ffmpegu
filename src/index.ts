export { Argument } from "./core/argument.ts"
export {
  Command,
  type CommandOptions,
  type CompiledCommand,
  type CompiledInputStream,
  type CompiledOutputStream
} from "./core/command.ts"
export {
  FFmpeg,
  type FFmpegConfig,
  type FFmpegService,
  type RunOptions
} from "./core/ffmpeg.ts"
export {
  type AnyInput,
  Input,
  type InputSource,
  StreamReference,
  StreamTrackReference,
  type StreamType
} from "./core/input.ts"
export { Output, type OutputDestination } from "./core/output.ts"
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
export * as Filter from "./filters/index.ts"
export * as Options from "./options/index.ts"
export {
  FFprobe,
  type FFprobeConfig,
  type FFprobeService
} from "./probe/ffprobe.ts"
export {
  ProbeFormat,
  ProbeResult,
  ProbeStream,
  ProjectedProbeResult,
  ProjectedProbeStream
} from "./probe/schema.ts"
export * as Time from "./time.ts"
export type { Progress, References, RunResult } from "./types/index.ts"
