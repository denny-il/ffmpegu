import { FFmpeguFilterChain } from "./chain.ts"
import type { FFmpeguFilter, FilterOptions } from "./core.ts"
import { FFmpeguFilterGraph } from "./graph.ts"
import { FFmpeguSimpleFilter } from "./simple.ts"

/**
 * Builder for creating filter chains and graphs
 */
export class FFmpeguFilterBuilder {
  private chains: FFmpeguFilterChain[] = []

  static create(): FFmpeguFilterBuilder {
    return new FFmpeguFilterBuilder()
  }

  /**
   * Add a filter chain to the graph
   */
  chain(...filters: FFmpeguFilter[]): FFmpeguFilterBuilder {
    this.chains.push(FFmpeguFilterChain.create(...filters))
    return this
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
