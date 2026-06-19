import type { Writable } from "node:stream"
import type { FFmpeguOptions } from "../options/core.ts"
import type {
  FFmpeguCompileResult,
  FFmpeguCompilable,
  FFmpeguReferencesInterface
} from "../types/index.ts"
import { createPipe } from "./streams.ts"

export type FFmpeguOutputDestination = string | Writable

/**
 * Represents an output from an ffmpeg command
 */
export class FFmpeguOutput implements FFmpeguCompilable {
  constructor(
    readonly destination: FFmpeguOutputDestination,
    readonly options?: FFmpeguOptions
  ) {}

  /**
   * Create an output to a file path
   */
  static toFile(filePath: string, args?: FFmpeguOptions) {
    return new FFmpeguOutput(filePath, args)
  }

  /**
   * Create an output to a writable stream
   */
  static toStream(stream: Writable, args?: FFmpeguOptions) {
    return new FFmpeguOutput(stream, args)
  }

  async compile(
    refs: FFmpeguReferencesInterface
  ): Promise<FFmpeguCompileResult> {
    const args: string[] = []

    if (this.options) args.push(...this.options.getArgs(refs))

    if (typeof this.destination === "string") {
      args.push(this.destination)
    } else {
      const index = refs.get(this)
      const pipe = await createPipe(`${index}`)
      args.push(pipe.path)
      return { args, pipe }
    }

    return { args }
  }
}
