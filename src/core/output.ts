import type * as Sink from "effect/Sink"
import type { FFmpeguOptions } from "../options/core.ts"

/**
 * A file path or URL passed to ffmpeg verbatim, or a sink receiving the bytes
 * ffmpeg writes to a dedicated pipe.
 */
export type FFmpeguOutputDestination<E, R> =
  | string
  | Sink.Sink<void, Uint8Array, never, E, R>

/**
 * Represents an output of an ffmpeg command.
 *
 * A sink must consume the whole output: completing early fails the run with
 * `OutputError` (`SinkEndedEarly`).
 */
export class FFmpeguOutput<E = never, R = never> {
  constructor(
    readonly destination: FFmpeguOutputDestination<E, R>,
    readonly options?: FFmpeguOptions
  ) {}

  /**
   * Create an output to a file path or URL.
   */
  static toFile(filePath: string, options?: FFmpeguOptions): FFmpeguOutput {
    return new FFmpeguOutput(filePath, options)
  }

  /**
   * Create an output written into a sink.
   */
  static toSink<E, R>(
    sink: Sink.Sink<void, Uint8Array, never, E, R>,
    options?: FFmpeguOptions
  ): FFmpeguOutput<E, R> {
    return new FFmpeguOutput(sink, options)
  }
}
