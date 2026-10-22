import { FFmpeguFilterChain } from "./chain.ts"
import type { FFmpeguFilter, FilterOptions } from "./core.ts"
import { FFmpeguFilterGraph } from "./graph.ts"
import { FFmpeguSimpleFilter } from "./simple.ts"

/**
 * Builder for creating filter chains and graphs
 */
export class FFmpeguFilterBuilder {
  private readonly chains: ReadonlyArray<FFmpeguFilterChain>

  constructor(chains: ReadonlyArray<FFmpeguFilterChain> = []) {
    // Copy so later changes to the caller's array cannot alter this value.
    this.chains = [...chains]
  }

  static create(): FFmpeguFilterBuilder {
    return new FFmpeguFilterBuilder()
  }

  /**
   * Return a new builder with a filter chain appended; this builder is unchanged
   */
  chain(...filters: FFmpeguFilter[]): FFmpeguFilterBuilder {
    return new FFmpeguFilterBuilder([
      ...this.chains,
      FFmpeguFilterChain.create(...filters)
    ])
  }

  /**
   * Build the complete filter graph
   */
  build(): FFmpeguFilterGraph {
    return FFmpeguFilterGraph.create(...this.chains)
  }

  /**
   * Create a custom filter
   */
  custom(name: string, options: FilterOptions = {}): FFmpeguSimpleFilter {
    return new FFmpeguSimpleFilter(name, options)
  }
}
