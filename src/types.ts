import type { Readable, Writable } from "node:stream"

/**
 * Input type for FFmpeg commands - can be a file path or readable stream
 */
export type FFmpegInput = string | Readable

/**
 * Output type for FFmpeg commands - can be a file path or writable stream
 */
export type FFmpegOutput = string | Writable

/**
 * Configuration options for FFmpegRunner
 */
export interface FFmpegRunnerOptions {
  /**
   * Path to FFmpeg binary. Defaults to 'ffmpeg' (system PATH)
   */
  ffmpegPath?: string

  /**
   * Path to FFprobe binary. Defaults to 'ffprobe' (system PATH)
   */
  ffprobePath?: string
}

/**
 * Input type for FFmpeg commands - can be a file path or readable stream
 */
export type FFmpegOptionsInput = {
  input: FFmpegInput
  options?: string[]
}

/**
 * Configuration options for FFmpegCommand
 */
export interface FFmpegCommandOptions {
  /**
   * Input file path or stream
   */
  inputs: [FFmpegOptionsInput, ...FFmpegOptionsInput[]]

  /**
   * Output file path or stream
   */
  output: FFmpegOutput

  /**
   * Options to apply to the output (placed after input)
   */
  outputOptions?: string[]
}

/**
 * Result of FFmpeg command execution options
 */
export interface FFmpegExecutionOptions {
  /**
   * Path to FFmpeg binary. Defaults to 'ffmpeg' (system PATH)
   */
  signal?: AbortSignal

  /**
   * Timeout for the command in milliseconds. Defaults to no timeout
   */
  timeout?: number
}

/**
 * Result of FFmpeg command execution
 */
export interface FFmpegExecutionResult {
  /**
   * Exit code of the FFmpeg process
   */
  exitCode: number

  /**
   * Standard output from FFmpeg
   */
  stdout: string | null

  /**
   * Standard error from FFmpeg
   */
  stderr: string | null

  /**
   * Whether the command completed successfully (exitCode === 0)
   */
  success: boolean
}

export type FFmpegExecution = {
  result: Promise<FFmpegExecutionResult>
  process: import("node:child_process").ChildProcess
}

/**
 * Result of FFprobe command execution
 */
export interface ProbeResult {
  /**
   * Raw JSON output from FFprobe
   */
  raw: string

  /**
   * Parsed JSON data from FFprobe
   */
  data: unknown
}

/**
 * Progress information from FFmpeg execution
 * TODO: Implement progress tracking
 */
export interface ProgressInfo {
  /**
   * Current time position
   */
  time?: string

  /**
   * Progress percentage (0-100)
   */
  percentage?: number

  /**
   * Current frame number
   */
  frame?: number

  /**
   * Processing speed (e.g., "2.5x")
   */
  speed?: string
}
