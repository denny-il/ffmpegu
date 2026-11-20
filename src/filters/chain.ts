import { Argument } from "../core/argument.ts"
import type { References } from "../types/index.ts"
import type { Filter } from "./core.ts"

/**
 * Filters applied in sequence, separated by commas in FFmpeg syntax. Raw
 * filter text and nested chains render as they are; every token of another
 * argument is a filter of the chain.
 */
export class Chain extends Argument {
  private readonly filters: ReadonlyArray<string | Argument>

  constructor(filters: ReadonlyArray<string | Argument>) {
    super()
    // Copy so later changes to the caller's array cannot alter this value.
    this.filters = [...filters]
  }

  getArgs(refs: References): string[] {
    return [
      this.filters
        .flatMap((filter) =>
          typeof filter === "string" ? [filter] : filter.getArgs(refs)
        )
        .join(",")
    ]
  }
}

export const chain = (...filters: ReadonlyArray<Filter>): Chain =>
  new Chain(filters)
