import type * as Stream from "effect/Stream"
import type { FFmpeguOptions } from "../options/core.ts"
import type { FFmpeguReferencesInterface } from "../types/index.ts"
import { FFmpeguArgument } from "./argument.ts"
import { StreamType } from "./enums.ts"

/**
 * A file path, URL or ffmpeg pseudo input (e.g. `lavfi` sources), passed to
 * `-i` verbatim, or a byte stream fed to ffmpeg through a dedicated pipe.
 */
export type FFmpeguInputSource<E, R> = string | Stream.Stream<Uint8Array, E, R>

/** Any input, regardless of its stream error and requirement types. */
export type FFmpeguAnyInput = FFmpeguInput<unknown, unknown>

export class FFmpeguStreamTrackReference extends FFmpeguArgument {
  constructor(
    readonly input: FFmpeguAnyInput,
    readonly streamType: StreamType,
    readonly index: number
  ) {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError(
        `Stream index must be a non-negative integer, got: ${index}`
      )
    }
    super()
  }

  getArgs(refs: FFmpeguReferencesInterface): string[] {
    const index = refs.get(this.input)
    return [`${index}:${getStreamType(this.streamType)}:${this.index}`]
  }
}

export class FFmpeguStreamReference extends FFmpeguArgument {
  constructor(
    readonly input: FFmpeguAnyInput,
    readonly streamType: StreamType
  ) {
    super()
  }

  getArgs(refs: FFmpeguReferencesInterface): string[] {
    const index = refs.get(this.input)
    return [`${index}:${getStreamType(this.streamType)}`]
  }

  track(index: number): FFmpeguStreamTrackReference {
    return new FFmpeguStreamTrackReference(this.input, this.streamType, index)
  }
}

/**
 * Represents an input to an ffmpeg command.
 *
 * Inputs are plain descriptions: stream sources are only run when a command
 * using them runs, and are run again on every run.
 */
export class FFmpeguInput<E = never, R = never> {
  readonly video: FFmpeguStreamReference
  readonly audio: FFmpeguStreamReference
  readonly subtitle: FFmpeguStreamReference
  readonly data: FFmpeguStreamReference

  constructor(
    readonly source: FFmpeguInputSource<E, R>,
    readonly options?: FFmpeguOptions
  ) {
    this.video = new FFmpeguStreamReference(this, StreamType.VIDEO)
    this.audio = new FFmpeguStreamReference(this, StreamType.AUDIO)
    this.subtitle = new FFmpeguStreamReference(this, StreamType.SUBTITLE)
    this.data = new FFmpeguStreamReference(this, StreamType.DATA)
  }

  /**
   * Create an input from a file path, URL or pseudo input name.
   */
  static fromFile(filePath: string, options?: FFmpeguOptions): FFmpeguInput {
    return new FFmpeguInput(filePath, options)
  }

  /**
   * Create an input fed from a byte stream.
   */
  static fromStream<E, R>(
    stream: Stream.Stream<Uint8Array, E, R>,
    options?: FFmpeguOptions
  ): FFmpeguInput<E, R> {
    return new FFmpeguInput(stream, options)
  }
}

function getStreamType(streamType: StreamType) {
  switch (streamType) {
    case StreamType.VIDEO:
      return "v"
    case StreamType.AUDIO:
      return "a"
    case StreamType.SUBTITLE:
      return "s"
    case StreamType.DATA:
      return "d"
  }
}
