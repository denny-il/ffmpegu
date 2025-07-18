import type { Readable } from "node:stream"
import type { FFmpegCommandOptions } from "./types.js"

export class FFmpegBaseCommand {
  readonly args: readonly string[]

  constructor(args: string[]) {
    this.args = Object.freeze(args)
  }
}

/**
 * Immutable FFmpeg command configuration
 *
 * Represents a complete FFmpeg command with input, output, and options.
 * Once constructed, the command cannot be modified.
 */
export class FFmpegCommand extends FFmpegBaseCommand {
  readonly inputPipes: readonly [number, Readable][]
  readonly outputPipes: readonly [number, Readable][]

  constructor(protected readonly options: FFmpegCommandOptions) {
    let pipeIndex = 0
    const args: string[] = []
    const pipes: [number, Readable][] = []
    const { inputs, output, outputOptions = [] } = options

    for (const { input, options = [] } of inputs) {
      // Add input options first (before -i)
      args.push(...options)

      // Add input
      if (input !== undefined) {
        if (typeof input === "string") {
          args.push("-i", input)
        } else {
          pipes.push([pipeIndex, input])
          args.push("-i", `pipe:${pipeIndex++}`)
        }
      }
    }

    // Add output options
    args.push(...outputOptions)

    // Add output
    if (output !== undefined) {
      if (typeof output === "string") {
        args.push(output)
      } else {
        args.push(`pipe:1`)
      }
    }

    super(args)

    this.inputPipes = Object.freeze(pipes)
  }

  /**
   * Check if this command uses stdin for input
   */
  get usesStdin(): boolean {
    return this.options.inputs.some(
      (input) => input.input === undefined || typeof input.input !== "string"
    )
  }

  /**
   * Check if this command uses stdout for output
   */
  get usesStdout(): boolean {
    return this.output !== undefined && typeof this.output !== "string"
  }
}
