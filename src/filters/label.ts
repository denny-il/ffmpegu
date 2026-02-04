import { FFmpeguArgument } from "../core/argument.ts"
import type {
  FFmpeguStreamReference,
  FFmpeguStreamTrackReference
} from "../core/input.ts"
import type { FFmpeguReferencesInterface } from "../types/index.ts"

export class FFmpeguFilterLabelRef extends FFmpeguArgument {
  constructor(
    readonly value:
      | string
      | FFmpeguStreamReference
      | FFmpeguStreamTrackReference
  ) {
    super()
  }

  static create(label: string): FFmpeguFilterLabelRef
  static create(
    stream: FFmpeguStreamReference | FFmpeguStreamTrackReference
  ): FFmpeguFilterLabelRef
  static create(
    value: string | FFmpeguStreamReference | FFmpeguStreamTrackReference
  ): FFmpeguFilterLabelRef {
    return new FFmpeguFilterLabelRef(value)
  }

  getLabel(refs: FFmpeguReferencesInterface): string {
    if (typeof this.value === "string") {
      return this.value
    }

    const [stream] = this.value.getArgs(refs)
    return stream
  }

  getArgs(refs: FFmpeguReferencesInterface): string[] {
    return [`[${this.getLabel(refs)}]`]
  }
}
