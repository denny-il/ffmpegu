import { spawn } from "node:child_process"
import type { FFmpegCommand } from "./command.ts"
import type {
  FFmpegExecutionOptions,
  FFmpegRunnerOptions,
  ProbeResult
} from "./types.js"

/**
 * FFmpeg command runner
 *
 * Handles execution of FFmpeg and FFprobe commands with support for
 * file paths and streams across different JS runtimes.
 */
export class FFmpegRunner {
  public readonly ffmpegPath: string
  public readonly ffprobePath: string

  constructor(options: FFmpegRunnerOptions = {}) {
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg"
    this.ffprobePath = options.ffprobePath ?? "ffprobe"
  }

  /**
   * Execute an FFmpeg command
   */
  async run(command: FFmpegCommand, options?: FFmpegExecutionOptions) {
    const {} = command
  }

  /**
   * Probe media file information using FFprobe
   */
  async probe(input: string): Promise<ProbeResult> {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      input
    ]

    return new Promise((resolve, reject) => {
      const process = spawn(this.ffprobePath, args, {
        stdio: ["ignore", "pipe", "pipe"]
      })

      let stdout = ""
      let stderr = ""

      process.stdout?.on("data", (data) => {
        stdout += data.toString()
      })

      process.stderr?.on("data", (data) => {
        stderr += data.toString()
      })

      process.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`FFprobe failed with exit code ${code}: ${stderr}`))
          return
        }

        try {
          const data = JSON.parse(stdout)
          resolve({
            raw: stdout,
            data
          })
        } catch (error) {
          reject(
            new Error(
              `Failed to parse FFprobe output: ${error instanceof Error ? error.message : "Unknown error"}`
            )
          )
        }
      })

      process.on("error", (error) => {
        reject(new Error(`Failed to spawn FFprobe process: ${error.message}`))
      })
    })
  }

  /**
   * Validate that FFmpeg and FFprobe binaries are available
   */
  async validate(): Promise<boolean> {
    try {
      // Test FFmpeg
      await this.testBinary(this.ffmpegPath, ["-version"])

      // Test FFprobe
      await this.testBinary(this.ffprobePath, ["-version"])

      return true
    } catch {
      return false
    }
  }

  /**
   * Test if a binary is available and working
   */
  private async testBinary(binaryPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(binaryPath, args, {
        stdio: ["ignore", "ignore", "pipe"]
      })

      process.on("close", (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Binary test failed with exit code ${code}`))
        }
      })

      process.on("error", (error) => {
        reject(error)
      })
    })
  }

  /**
   * TODO: Implement progress tracking
   * Parse FFmpeg stderr output for progress information
   */
  private parseProgress(_stderr: string): void {
    // TODO: Implement progress parsing
    // This would parse lines like:
    // frame=  123 fps= 25 q=28.0 size=    1234kB time=00:00:12.34 bitrate=1234.5kbits/s speed=1.23x
    throw new Error("Progress tracking not implemented yet")
  }
}
