// Export all types

// Export classes
export { FFmpegTranscodeCommand as FFmpegCommand } from "./command.js"
export { FFmpegRunner } from "./runner.js"
export type {
  FFmpegCommandOptions,
  FFmpegExecutionResult as ExecutionResult,
  FFmpegInputType as FFmpegInput,
  FFmpegOutputType as FFmpegOutput,
  FFmpegRunnerOptions,
  ProbeResult,
  ProgressInfo
} from "./types.js"

// Create and export default runner instance
import { FFmpegRunner } from "./runner.js"

/**
 * Default FFmpeg runner instance using system PATH
 *
 * This is a pre-configured runner that uses the default 'ffmpeg' and 'ffprobe'
 * binaries from the system PATH. Most users can use this directly without
 * creating their own runner instance.
 */
export const defaultRunner = new FFmpegRunner()
