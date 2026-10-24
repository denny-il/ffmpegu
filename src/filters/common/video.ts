import {
  type FFmpeguDurationValue,
  type FFmpeguTimeObject,
  resolveSecondsOptions
} from "../../utils.ts"
import type {
  FilterArgument,
  FilterLabels,
  FilterOptions,
  OpenFilterHelper
} from "../core.ts"
import { FFmpeguSimpleFilter } from "../simple.ts"

type FilterOptionValue = FilterArgument
type FilterTimeValue =
  | FilterOptionValue
  | FFmpeguTimeObject
  | FFmpeguDurationValue

const create = (
  name: string,
  options: FilterOptions = {},
  labels: FilterLabels = {}
) =>
  FFmpeguSimpleFilter.create(
    name,
    options,
    labels.inputs ?? [],
    labels.outputs ?? []
  )

export type ScaleOptions = {
  w?: FilterOptionValue
  h?: FilterOptionValue
  flags?: FilterOptionValue
  interl?: FilterOptionValue
  eval?: FilterOptionValue
  force_original_aspect_ratio?: FilterOptionValue
  force_divisible_by?: FilterOptionValue
  /** Requires FFmpeg 8.0 or later. */
  reset_sar?: FilterOptionValue
}

export type FpsOptions = {
  fps?: FilterOptionValue
  start_time?: FilterTimeValue
  round?: FilterOptionValue
  eof_action?: FilterOptionValue
}

export type CropOptions = {
  w?: FilterOptionValue
  h?: FilterOptionValue
  x?: FilterOptionValue
  y?: FilterOptionValue
  keep_aspect?: FilterOptionValue
  exact?: FilterOptionValue
}

export type PadOptions = {
  w?: FilterOptionValue
  h?: FilterOptionValue
  x?: FilterOptionValue
  y?: FilterOptionValue
  color?: FilterOptionValue
  eval?: FilterOptionValue
  aspect?: FilterOptionValue
}

export type FormatOptions = {
  pix_fmts?: FilterOptionValue
}

export type SetSarOptions = {
  sar?: FilterOptionValue
  max?: FilterOptionValue
}

export type SetDarOptions = {
  dar?: FilterOptionValue
  max?: FilterOptionValue
}

export type TransposeOptions = {
  dir?: FilterOptionValue
  passthrough?: FilterOptionValue
}

export type OverlayOptions = {
  x?: FilterOptionValue
  y?: FilterOptionValue
  shortest?: FilterOptionValue
  repeatlast?: FilterOptionValue
  format?: FilterOptionValue
  eof_action?: FilterOptionValue
  /**
   * Prefer `"straight"` or `"premultiplied"`: FFmpeg 8.1 changed the default,
   * and the numeric value `0` no longer means the same thing across versions.
   */
  alpha?: FilterOptionValue
}

export type DrawtextOptions = {
  text?: FilterOptionValue
  textfile?: FilterOptionValue
  fontfile?: FilterOptionValue
  font?: FilterOptionValue
  fontsize?: FilterOptionValue
  fontcolor?: FilterOptionValue
  box?: FilterOptionValue
  boxcolor?: FilterOptionValue
  boxborderw?: FilterOptionValue
  x?: FilterOptionValue
  y?: FilterOptionValue
  shadowx?: FilterOptionValue
  shadowy?: FilterOptionValue
  borderw?: FilterOptionValue
  line_spacing?: FilterOptionValue
  enable?: FilterOptionValue
}

export type SelectOptions = {
  expr?: FilterOptionValue
  outputs?: FilterOptionValue
}

export type SetPtsOptions = {
  expr?: FilterOptionValue
}

export const scale: OpenFilterHelper<ScaleOptions> = (
  options: ScaleOptions = {},
  labels?: FilterLabels
) => create("scale", options, labels)
export const fps: OpenFilterHelper<FpsOptions> = (
  options: FpsOptions = {},
  labels?: FilterLabels
) => create("fps", resolveSecondsOptions(options, ["start_time"]), labels)
export const crop: OpenFilterHelper<CropOptions> = (
  options: CropOptions = {},
  labels?: FilterLabels
) => create("crop", options, labels)
export const pad: OpenFilterHelper<PadOptions> = (
  options: PadOptions = {},
  labels?: FilterLabels
) => create("pad", options, labels)
export const format: OpenFilterHelper<FormatOptions> = (
  options: FormatOptions = {},
  labels?: FilterLabels
) => create("format", options, labels)
export const setsar: OpenFilterHelper<SetSarOptions> = (
  options: SetSarOptions = {},
  labels?: FilterLabels
) => create("setsar", options, labels)
export const setdar: OpenFilterHelper<SetDarOptions> = (
  options: SetDarOptions = {},
  labels?: FilterLabels
) => create("setdar", options, labels)
export const transpose: OpenFilterHelper<TransposeOptions> = (
  options: TransposeOptions = {},
  labels?: FilterLabels
) => create("transpose", options, labels)
export const hflip = (options: FilterOptions = {}, labels?: FilterLabels) =>
  create("hflip", options, labels)
export const vflip = (options: FilterOptions = {}, labels?: FilterLabels) =>
  create("vflip", options, labels)
export const overlay: OpenFilterHelper<OverlayOptions> = (
  options: OverlayOptions = {},
  labels?: FilterLabels
) => create("overlay", options, labels)
export const drawtext: OpenFilterHelper<DrawtextOptions> = (
  options: DrawtextOptions = {},
  labels?: FilterLabels
) => create("drawtext", options, labels)
export const select: OpenFilterHelper<SelectOptions> = (
  options: SelectOptions = {},
  labels?: FilterLabels
) => create("select", options, labels)
export const setpts: OpenFilterHelper<SetPtsOptions> = (
  options: SetPtsOptions = {},
  labels?: FilterLabels
) => create("setpts", options, labels)
