import type { Argument } from "../core/argument.ts"
import { Chain } from "../filters/chain.ts"
import type { Filter } from "../filters/core.ts"
import type { BitrateUnit, BitrateValue } from "./common.ts"
import { make, type Options } from "./core.ts"

/** A number takes a unit suffix; a string carries its own. */
export type BitrateHelper = {
  (bitrate: number, unit: BitrateUnit): Options
  (bitrate: BitrateValue, unit?: BitrateUnit): Options
}

export const bitrateOption =
  (name: string): BitrateHelper =>
  (bitrate: BitrateValue, unit?: BitrateUnit) =>
    make([name, unit === undefined ? bitrate : `${bitrate}${unit}`])

/**
 * A raw string, chain or filter, optionally followed by more filters applied
 * in sequence.
 */
export type FilterHelper = (
  first: string | Argument,
  ...rest: ReadonlyArray<Filter>
) => Options

export const filterOption =
  (name: string): FilterHelper =>
  (first, ...rest) =>
    // Always a chain, so an argument rendering several filters is joined
    // rather than spilled into separate argv tokens.
    make([name, new Chain([first, ...rest])])
