import { FFmpeguFilter, type FilterOptions } from "./core.ts"
import type { FFmpeguFilterLabelRef } from "./label.ts"

/**
 * Simple filter implementation for quick filter creation
 * Supports both video and audio filters
 */
export class FFmpeguSimpleFilter extends FFmpeguFilter {
  constructor(
    name: string,
    options: FilterOptions = {},
    inputs: FFmpeguFilterLabelRef[] = [],
    outputs: FFmpeguFilterLabelRef[] = []
  ) {
    super(name, options, inputs, outputs)
  }

  /**
   * Create a filter
   */
  static create(
    name: string,
    options: FilterOptions = {},
    inputs: FFmpeguFilterLabelRef[] = [],
    outputs: FFmpeguFilterLabelRef[] = []
  ): FFmpeguSimpleFilter {
    return new FFmpeguSimpleFilter(name, options, inputs, outputs)
  }
}
