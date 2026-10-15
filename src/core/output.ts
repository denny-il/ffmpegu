import type * as Sink from "effect/Sink"
import type { FFmpeguOptions } from "../options/core.ts"

/**
 * Destination of an output read as the stream returned by `stream`; see
 * {@link FFmpeguOutput.toStream}.
 */
export const STREAM_DESTINATION: unique symbol = Symbol.for(
  "ffmpegu/StreamDestination"
)

/**
 * A file path or URL passed to ffmpeg verbatim, a sink receiving the bytes
 * ffmpeg writes to a dedicated pipe, or {@link STREAM_DESTINATION} for a
 * pipe read as a stream.
 */
export type FFmpeguOutputDestination<E, R> =
  | string
  | Sink.Sink<void, Uint8Array, never, E, R>
  | typeof STREAM_DESTINATION

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

  /**
   * Create an output read as the stream returned by `stream(command)`, which
   * requires exactly one such output. `run` rejects commands containing one.
   */
  static toStream(options?: FFmpeguOptions): FFmpeguOutput {
    return new FFmpeguOutput(STREAM_DESTINATION, options)
  }
}
