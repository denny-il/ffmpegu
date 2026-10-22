import { FFmpeguArgument } from "../core/argument.ts"
import type { FFmpeguReferencesInterface } from "../types/index.ts"
import type { FFmpeguFilter } from "./core.ts"

/**
 * Represents a chain of filters connected in sequence
 * Filters in a chain are separated by commas in FFmpeg syntax
 */
export class FFmpeguFilterChain extends FFmpeguArgument {
  private readonly filters: ReadonlyArray<FFmpeguFilter>

  constructor(filters: ReadonlyArray<FFmpeguFilter>) {
    super()
    // Copy so later changes to the caller's array cannot alter this value.
    this.filters = [...filters]
  }

  static create(...filters: FFmpeguFilter[]): FFmpeguFilterChain {
    return new FFmpeguFilterChain(filters)
  }

  getArgs(refs: FFmpeguReferencesInterface): string[] {
    return [this.filters.map((filter) => filter.getArgs(refs)[0]).join(",")]
  }
}
