import { FFmpeguArgument } from "../core/argument.ts"
import type { FFmpeguReferencesInterface } from "../types/index.ts"
import type { FFmpeguFilterLabelRef } from "./label.ts"
import type { FFmpeguSimpleFilter } from "./simple.ts"

export type FilterArgument = string | number | boolean | FFmpeguArgument

export interface FilterOptions {
  [key: string]: FilterArgument
}

// Each parsing layer trims unescaped boundary whitespace from its tokens.
const boundaryWhitespace = /^[ \t\n\r]+|[ \t\n\r]+$/g

const escapeLayer = (value: string, special: RegExp): string =>
  value
    .replace(special, "\\$&")
    .replace(boundaryWhitespace, (run) => run.replace(/./gs, "\\$&"))

export type FilterLabels = {
  inputs?: ReadonlyArray<FFmpeguFilterLabelRef>
  outputs?: ReadonlyArray<FFmpeguFilterLabelRef>
}

/**
 * A typed filter helper whose `Known` keys are hints, not a closed set: FFmpeg
 * decides which options exist, so any other key passes through as a raw value.
 * Extra keys are typed through a mapped type because `Known & FilterOptions`
 * would reject time objects on known keys. The plain `Known` signature keeps
 * typed wrappers and `Parameters<typeof helper>` working.
 */
export type OpenFilterHelper<Known> = {
  <
    T extends Known & {
      [K in keyof T as Exclude<K, keyof Known>]: FilterArgument
    }
  >(
    options?: T,
    labels?: FilterLabels
  ): FFmpeguSimpleFilter
  (options?: Known, labels?: FilterLabels): FFmpeguSimpleFilter
}

/**
 * Base class for all FFmpeg filters
 * Follows the FFmpeg filtergraph syntax: [inputs]filter_name=arguments[outputs]
 */
export abstract class FFmpeguFilter extends FFmpeguArgument {
  protected readonly options: Readonly<FilterOptions>
  protected readonly inputs: ReadonlyArray<FFmpeguFilterLabelRef>
  protected readonly outputs: ReadonlyArray<FFmpeguFilterLabelRef>

  constructor(
    protected readonly name: string,
    options: Readonly<FilterOptions> = {},
    inputs: ReadonlyArray<FFmpeguFilterLabelRef> = [],
    outputs: ReadonlyArray<FFmpeguFilterLabelRef> = []
  ) {
    super()
    // Copy so later changes to the caller's values cannot alter this value.
    this.options = { ...options }
    this.inputs = [...inputs]
    this.outputs = [...outputs]
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
      // An optional key set to undefined means "not set", as in the helpers.
      if (value === undefined) continue
      if (value instanceof FFmpeguArgument) {
        const args = value.getArgs(refs)
        options.push(`${key}=${args.join(":")}`)
      } else if (typeof value === "boolean") {
        // A bare key is parsed as a positional value, so spell booleans out.
        options.push(`${key}=${value ? 1 : 0}`)
      } else if (typeof value === "object" || typeof value === "function") {
        // Helpers convert time values only on their known time keys. Options
        // passed as a variable skip excess-property checks, so a Duration or
        // time object can reach any other key, where its string form (e.g.
        // "2000 millis") would be misread by FFmpeg.
        throw new TypeError(
          `Filter option "${key}" must be a string, number, boolean or ffmpegu argument`
        )
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
    // FFmpeg parses the graph first, then each filter's option values. Escape
    // both layers so graph parsing does not consume the option-level escapes.
    // Arguments go directly to the process, so no shell escaping is needed.
    return escapeLayer(escapeLayer(value, /[\\':]/g), /[\\'[\],;]/g)
  }
}
