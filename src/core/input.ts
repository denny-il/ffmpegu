import type * as Stream from "effect/Stream"
import { type Arg, fromArgs, type Options } from "../options/core.ts"
import type { References } from "../types/index.ts"
import { Argument } from "./argument.ts"
import { InvalidStreamIndex, MAX_STREAM_INDEX } from "./references.ts"

/**
 * A file path, URL or ffmpeg pseudo input (e.g. `lavfi` sources), passed to
 * `-i` verbatim, or a byte stream fed to ffmpeg through a dedicated pipe.
 */
export type InputSource<E, R> = string | Stream.Stream<Uint8Array, E, R>

/** Any input, regardless of its stream error and requirement types. */
export type AnyInput = Input<unknown, unknown>

/** FFmpeg's stream type specifier: video, audio, subtitle or data. */
export type StreamType = "v" | "a" | "s" | "d"

export class StreamTrackReference extends Argument {
  constructor(
    readonly input: AnyInput,
    readonly streamType: StreamType,
    readonly index: number
  ) {
    super()
  }

  // Validated when rendered rather than constructed, so that commands report
  // an invalid index through `compile` like any other invalid argument.
  // FFmpeg parses the index as a C int: larger values wrap to another stream
  // and values beyond 1e21 render in exponent notation.
  getArgs(refs: References): string[] {
    // Read once: a getter could return a valid index to the check and a
    // different value to the rendered argument.
    const track: unknown = this.index
    if (
      typeof track !== "number" ||
      !Number.isInteger(track) ||
      track < 0 ||
      track > MAX_STREAM_INDEX
    ) {
      throw new InvalidStreamIndex(track)
    }
    return [`${refs.get(this.input)}:${this.streamType}:${track}`]
  }
}

export class StreamReference extends Argument {
  constructor(
    readonly input: AnyInput,
    readonly streamType: StreamType
  ) {
    super()
  }

  getArgs(refs: References): string[] {
    return [`${refs.get(this.input)}:${this.streamType}`]
  }

  track(index: number): StreamTrackReference {
    return new StreamTrackReference(this.input, this.streamType, index)
  }
}

/**
 * Represents an input to an ffmpeg command.
 *
 * Inputs are plain descriptions: stream sources are only run when a command
 * using them runs, and are run again on every run.
 */
export class Input<E = never, R = never> {
  readonly video: StreamReference
  readonly audio: StreamReference
  readonly subtitle: StreamReference
  readonly data: StreamReference

  constructor(
    readonly source: InputSource<E, R>,
    readonly options?: Options
  ) {
    this.video = new StreamReference(this, "v")
    this.audio = new StreamReference(this, "a")
    this.subtitle = new StreamReference(this, "s")
    this.data = new StreamReference(this, "d")
  }

  /**
   * Create an input from a file path, URL or pseudo input name.
   */
  static fromFile(
    filePath: string,
    ...options: ReadonlyArray<Arg | undefined>
  ): Input {
    return new Input(filePath, fromArgs(options))
  }

  /**
   * Create an input fed from a byte stream.
   */
  static fromStream<E, R>(
    stream: Stream.Stream<Uint8Array, E, R>,
    ...options: ReadonlyArray<Arg | undefined>
  ): Input<E, R> {
    return new Input(stream, fromArgs(options))
  }
}
