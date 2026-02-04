import { FFmpeguCommand } from "./core/command.ts"
import { FFmpeguInput } from "./core/input.ts"
import { FFmpeguOutput } from "./core/output.ts"
import { FFmpeguFFmpegRunner } from "./core/runner.ts"
import * as _filters from "./filters/index.ts"
import * as _options from "./options/index.ts"
import { FFmpeguProbeCommand } from "./probe/command.ts"
import { FFmpeguFFprobeRunner } from "./probe/runner.ts"

export { FFmpeguFilterBuilder } from "./filters/builder.ts"
export { FFmpeguFilterChain } from "./filters/chain.ts"
export { FFmpeguFilterGraph } from "./filters/graph.ts"
export { FFmpeguFilterLabelRef } from "./filters/label.ts"
export { FFmpeguSimpleFilter } from "./filters/simple.ts"
export { FFmpeguOptions } from "./options/core.ts"
export type {
  FFmpeguFFprobeFormat,
  FFmpeguFFprobeJson,
  FFmpeguFFprobeStream
} from "./types/index.ts"

const DefaultFFmpegRunner = new FFmpeguFFmpegRunner("ffmpeg")
const DefaultFFprobeRunner = new FFmpeguFFprobeRunner("ffprobe")

export namespace ffmpegu {
  export const createFFmpegRunner = (binPath: string) =>
    new FFmpeguFFmpegRunner(binPath)
  export const createFFprobeRunner = (binPath: string) =>
    new FFmpeguFFprobeRunner(binPath)
  export const runner = DefaultFFmpegRunner
  export const probeRunner = DefaultFFprobeRunner
  export const input = FFmpeguInput
  export const output = FFmpeguOutput
  export const command = FFmpeguCommand.create
  export const probe = FFmpeguProbeCommand
  export const filters = _filters
  export const options = _options
}

export default ffmpegu
