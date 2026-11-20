import { Argument } from "../core/argument.ts"
import type { StreamReference, StreamTrackReference } from "../core/input.ts"
import type { References } from "../types/index.ts"
import {
  type DurationValue,
  resolveSecondsOptions,
  TimeArgument,
  type TimeObject
} from "../utils.ts"
import { Label } from "./label.ts"

export type OptionValue = string | number | boolean | Argument

/**
 * Value of a typed helper's time option: durations and time objects render as
 * seconds there.
 */
export type TimeOptionValue = OptionValue | TimeObject | DurationValue

export interface Options {
  [key: string]: OptionValue
}

/** A link label, or the name or input stream to make one from. */
export type LabelLike = string | StreamReference | StreamTrackReference | Label

export type Labels = {
  inputs?: ReadonlyArray<LabelLike>
  outputs?: ReadonlyArray<string | Label>
}

const toLabel = (value: LabelLike): Label =>
  value instanceof Label ? value : new Label(value)

// Each parsing layer trims unescaped boundary whitespace from its tokens.
const boundaryWhitespace = /^[ \t\n\r]+|[ \t\n\r]+$/g

const escapeLayer = (value: string, special: RegExp): string =>
  value
    .replace(special, "\\$&")
    .replace(boundaryWhitespace, (run) => run.replace(/./gs, "\\$&"))

/**
 * A typed filter helper whose `Known` keys are hints, not a closed set: FFmpeg
 * decides which options exist, so any other key passes through as a raw value.
 * Extra keys are typed through a mapped type because `Known & Options` would
 * reject time objects on known keys. The plain `Known` signature keeps typed
 * wrappers and `Parameters<typeof helper>` working.
 */
export type OpenHelper<Known> = {
  <
    T extends Known & {
      [K in keyof T as Exclude<K, keyof Known>]: OptionValue
    }
  >(
    options?: T,
    labels?: Labels
  ): Filter
  (options?: Known, labels?: Labels): Filter
}

/**
 * A filter in FFmpeg filtergraph syntax:
 * `[inputs]filter_name=arguments[outputs]`.
 */
export class Filter extends Argument {
  protected readonly options: Readonly<Options>
  protected readonly inputs: ReadonlyArray<Label>
  protected readonly outputs: ReadonlyArray<Label>

  constructor(
    protected readonly name: string,
    options: Readonly<Options> = {},
    labels: Labels = {}
  ) {
    super()
    // Copy so later changes to the caller's values cannot alter this value.
    this.options = { ...options }
    this.inputs = (labels.inputs ?? []).map(toLabel)
    this.outputs = (labels.outputs ?? []).map(toLabel)
  }

  getArgs(refs: References): string[] {
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

  protected buildOptions(refs: References): string[] {
    const options: string[] = []

    for (const [key, value] of Object.entries(this.options)) {
      // An optional key set to undefined means "not set", as in the helpers.
      if (value === undefined) continue
      if (value instanceof TimeArgument) {
        // A timestamp's colons would otherwise split the option.
        options.push(`${key}=${this.escapeFilterValue(value.getArgs()[0]!)}`)
      } else if (value instanceof Argument) {
        // Other arguments are raw fragments, spliced in unescaped.
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

/** Build any filter by name. */
export const make = (
  name: string,
  options?: Options,
  labels?: Labels
): Filter => new Filter(name, options, labels)

/**
 * @internal Typed helper for the filter `name`. Durations and time objects on
 * `timeKeys` render as seconds.
 */
export const helper =
  <Known extends object>(
    name: string,
    timeKeys?: ReadonlyArray<keyof Known & string>
  ): OpenHelper<Known> =>
  (options: Known = {} as Known, labels?: Labels) =>
    new Filter(
      name,
      (timeKeys
        ? resolveSecondsOptions(options as Record<string, unknown>, timeKeys)
        : options) as Options,
      labels
    )
