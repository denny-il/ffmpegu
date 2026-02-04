import assert from "node:assert"
import type { Readable } from "node:stream"
import type { FFmpeguOptions } from "../options/core.ts"
import type {
  FFmpeguCompilable,
  FFmpeguPipe,
  FFmpeguReferencesInterface
} from "../types/index.ts"
import { FFmpeguArgument } from "./argument.ts"
import { StreamType } from "./enums.ts"
import { createPipe } from "./streams.ts"

export type FFmpeguInputSource = string | Readable

export class FFmpeguStreamTrackReference extends FFmpeguArgument {
  constructor(
    readonly input: FFmpeguInput,
    readonly streamType: StreamType,
    readonly index: number
  ) {
    assert(index >= 0, `Stream index must be non-negative, got: ${index}`)
    super()
  }

  getArgs(inputs: FFmpeguReferencesInterface): string[] {
    const index = inputs.get(this.input)
    return [`${index}:${getStreamType(this.streamType)}:${this.index}`]
  }
}

export class FFmpeguStreamReference extends FFmpeguArgument {
  constructor(
    readonly input: FFmpeguInput,
    readonly streamType: StreamType
  ) {
    super()
  }

  getArgs(inputs: FFmpeguReferencesInterface): string[] {
    const index = inputs.get(this.input)
    return [`${index}:${getStreamType(this.streamType)}`]
  }

  track(index: number): FFmpeguStreamTrackReference {
    return new FFmpeguStreamTrackReference(this.input, this.streamType, index)
  }
}

/**
 * Represents an input to an ffmpeg command
 */
export class FFmpeguInput implements FFmpeguCompilable {
  readonly video: FFmpeguStreamReference
  readonly audio: FFmpeguStreamReference
  readonly subtitle: FFmpeguStreamReference
  readonly data: FFmpeguStreamReference

  #pipe?: FFmpeguPipe

  constructor(
    readonly source: FFmpeguInputSource,
    readonly options?: FFmpeguOptions
  ) {
    this.video = new FFmpeguStreamReference(this, StreamType.VIDEO)
    this.audio = new FFmpeguStreamReference(this, StreamType.AUDIO)
    this.subtitle = new FFmpeguStreamReference(this, StreamType.SUBTITLE)
    this.data = new FFmpeguStreamReference(this, StreamType.DATA)
  }

  /**
   * Create an input from a file path
   */
  static fromFile(filePath: string, args?: FFmpeguOptions): FFmpeguInput {
    return new FFmpeguInput(filePath, args)
  }

  /**
   * Create an input from a readable stream
   */
  static fromStream(stream: Readable, args?: FFmpeguOptions): FFmpeguInput {
    return new FFmpeguInput(stream, args)
  }

  get pipe() {
    return this.#pipe
  }

  /**
   * Async setup phase - create named pipes if needed
   */
  async compile(inputs: FFmpeguReferencesInterface): Promise<string[]> {
    const args: string[] = []

    if (this.options) args.push(...this.options.getArgs(inputs))

    if (typeof this.source === "string") {
      args.push("-i", this.source)
    } else {
      const index = inputs.get(this)
      this.#pipe = await createPipe(`${index}`)
      args.push("-i", this.#pipe!.path)
    }

    return args
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
