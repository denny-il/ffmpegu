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
 * Key of the phantom property that carries how many `Output.toStream` outputs
 * a value has, so that `run` and `stream` reject misuse at compile time. Never
 * set at runtime.
 */
export const StreamOutputs: unique symbol = Symbol.for("ffmpegu/StreamOutputs")

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
 * `S` is `1` for an `Output.toStream` output and `0` otherwise. It defaults
 * to `any` (unknown) for outputs built with the constructor or typed without
 * it; commands containing such outputs are only checked at runtime.
 *
 * A sink must consume the whole output: completing early fails the run with
 * `OutputError` (`SinkEndedEarly`).
 */
export class FFmpeguOutput<E = never, R = never, S extends 0 | 1 = any> {
  declare readonly [StreamOutputs]: S

  constructor(
    readonly destination: FFmpeguOutputDestination<E, R>,
    readonly options?: FFmpeguOptions
  ) {}

  /**
   * Create an output to a file path or URL.
   */
  static toFile(
    filePath: string,
    options?: FFmpeguOptions
  ): FFmpeguOutput<never, never, 0> {
    return new FFmpeguOutput(filePath, options)
  }

  /**
   * Create an output written into a sink.
   */
  static toSink<E, R>(
    sink: Sink.Sink<void, Uint8Array, never, E, R>,
    options?: FFmpeguOptions
  ): FFmpeguOutput<E, R, 0> {
    return new FFmpeguOutput(sink, options)
  }

  /**
   * Create an output read as the stream returned by `stream(command)`, which
   * requires exactly one such output. `run` rejects commands containing one.
   */
  static toStream(options?: FFmpeguOptions): FFmpeguOutput<never, never, 1> {
    return new FFmpeguOutput(STREAM_DESTINATION, options)
  }
}
