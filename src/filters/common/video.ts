import {
  helper,
  type Labels,
  make,
  type Options,
  type OptionValue,
  type TimeOptionValue
} from "../core.ts"

export type ScaleOptions = {
  w?: OptionValue
  h?: OptionValue
  flags?: OptionValue
  interl?: OptionValue
  eval?: OptionValue
  force_original_aspect_ratio?: OptionValue
  force_divisible_by?: OptionValue
  /** Requires FFmpeg 8.0 or later. */
  reset_sar?: OptionValue
}

export type FpsOptions = {
  fps?: OptionValue
  start_time?: TimeOptionValue
  round?: OptionValue
  eof_action?: OptionValue
}

export type CropOptions = {
  w?: OptionValue
  h?: OptionValue
  x?: OptionValue
  y?: OptionValue
  keep_aspect?: OptionValue
  exact?: OptionValue
}

export type PadOptions = {
  w?: OptionValue
  h?: OptionValue
  x?: OptionValue
  y?: OptionValue
  color?: OptionValue
  eval?: OptionValue
  aspect?: OptionValue
}

export type FormatOptions = {
  pix_fmts?: OptionValue
}

export type SetSarOptions = {
  sar?: OptionValue
  max?: OptionValue
}

export type SetDarOptions = {
  dar?: OptionValue
  max?: OptionValue
}

export type TransposeOptions = {
  dir?: OptionValue
  passthrough?: OptionValue
}

export type OverlayOptions = {
  x?: OptionValue
  y?: OptionValue
  shortest?: OptionValue
  repeatlast?: OptionValue
  format?: OptionValue
  eof_action?: OptionValue
  /**
   * Prefer `"straight"` or `"premultiplied"`: FFmpeg 8.1 changed the default,
   * and the numeric value `0` no longer means the same thing across versions.
   */
  alpha?: OptionValue
}

export type DrawtextOptions = {
  text?: OptionValue
  textfile?: OptionValue
  fontfile?: OptionValue
  font?: OptionValue
  fontsize?: OptionValue
  fontcolor?: OptionValue
  box?: OptionValue
  boxcolor?: OptionValue
  boxborderw?: OptionValue
  x?: OptionValue
  y?: OptionValue
  shadowx?: OptionValue
  shadowy?: OptionValue
  borderw?: OptionValue
  line_spacing?: OptionValue
  enable?: OptionValue
}

export type SelectOptions = {
  expr?: OptionValue
  outputs?: OptionValue
}

export type SetPtsOptions = {
  expr?: OptionValue
}

export const scale = helper<ScaleOptions>("scale")
export const fps = helper<FpsOptions>("fps", ["start_time"])
export const crop = helper<CropOptions>("crop")
export const pad = helper<PadOptions>("pad")
export const format = helper<FormatOptions>("format")
export const setsar = helper<SetSarOptions>("setsar")
export const setdar = helper<SetDarOptions>("setdar")
export const transpose = helper<TransposeOptions>("transpose")
export const hflip = (options?: Options, labels?: Labels) =>
  make("hflip", options, labels)
export const vflip = (options?: Options, labels?: Labels) =>
  make("vflip", options, labels)
export const overlay = helper<OverlayOptions>("overlay")
export const drawtext = helper<DrawtextOptions>("drawtext")
export const select = helper<SelectOptions>("select")
export const setpts = helper<SetPtsOptions>("setpts")
