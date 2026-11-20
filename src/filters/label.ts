import { Argument } from "../core/argument.ts"
import type { StreamReference, StreamTrackReference } from "../core/input.ts"
import type { References } from "../types/index.ts"

/**
 * A filtergraph link label: a name, or a stream of one of the command's
 * inputs. As an option value, such as for `-map`, it renders bracketed.
 */
export class Label extends Argument {
  constructor(readonly value: string | StreamReference | StreamTrackReference) {
    super()
  }

  getLabel(refs: References): string {
    return typeof this.value === "string"
      ? this.value
      : this.value.getArgs(refs)[0]!
  }

  getArgs(refs: References): string[] {
    return [`[${this.getLabel(refs)}]`]
  }
}

export const label = (
  value: string | StreamReference | StreamTrackReference
): Label => new Label(value)
