import { FFmpeguArgument } from "../core/argument.ts"
import type { FFmpeguReferencesInterface } from "../types/index.ts"
import type { FFmpeguFilterLabelRef } from "./label.ts"

export type FilterArgument = string | number | boolean | FFmpeguArgument

export interface FilterOptions {
  [key: string]: FilterArgument
}

/**
 * Base class for all FFmpeg filters
 * Follows the FFmpeg filtergraph syntax: [inputs]filter_name=arguments[outputs]
 */
export abstract class FFmpeguFilter extends FFmpeguArgument {
  constructor(
    protected readonly name: string,
    protected readonly options: FilterOptions = {},
    protected readonly inputs: FFmpeguFilterLabelRef[] = [],
    protected readonly outputs: FFmpeguFilterLabelRef[] = []
  ) {
    super()
  }

  getArgs(refs: FFmpeguReferencesInterface): string[] {
    const filterParts: string[] = []

    // Add input labels
    if (this.inputs.length > 0) {
      filterParts.push(
        this.inputs.map((input) => `[${input.getLabel(refs)}]`).join("")
      )
    }

    // Add filter name
    filterParts.push(this.name)

    // Add options
    const optionStrings = this.buildOptions(refs)
    if (optionStrings.length > 0) {
      filterParts.push(`=${optionStrings.join(":")}`)
    }

    // Add output labels
    if (this.outputs.length > 0) {
      filterParts.push(
        this.outputs.map((output) => `[${output.getLabel(refs)}]`).join("")
      )
    }

    return [filterParts.join("")]
  }

  protected buildOptions(refs: FFmpeguReferencesInterface): string[] {
    const options: string[] = []

    for (const [key, value] of Object.entries(this.options)) {
      if (value instanceof FFmpeguArgument) {
        const args = value.getArgs(refs)
        options.push(`${key}=${args.join(":")}`)
      } else if (typeof value === "boolean") {
        if (value) options.push(key)
      } else {
        options.push(`${key}=${this.escapeFilterValue(String(value))}`)
      }
    }

    return options
  }

  /**
   * Escape special characters in filter values according to FFmpeg filtergraph syntax
   */
  protected escapeFilterValue(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/:/g, "\\:")
      .replace(/,/g, "\\,")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]")
      .replace(/;/g, "\\;")
  }
}
