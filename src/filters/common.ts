import type { FilterArgument, FilterOptions } from "./core.ts"
import type { FFmpeguFilterLabelRef } from "./label.ts"
import { FFmpeguSimpleFilter } from "./simple.ts"

type FilterLabels = {
  inputs?: FFmpeguFilterLabelRef[]
  outputs?: FFmpeguFilterLabelRef[]
}

type FilterOptionValue = FilterArgument

export type ScaleOptions = {
  w?: FilterOptionValue
  h?: FilterOptionValue
  flags?: FilterOptionValue
  interl?: FilterOptionValue
  eval?: FilterOptionValue
  force_original_aspect_ratio?: FilterOptionValue
  force_divisible_by?: FilterOptionValue
  reset_sar?: FilterOptionValue
}

export type FpsOptions = {
  fps?: FilterOptionValue
  start_time?: FilterOptionValue
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
  c?: FilterOptionValue
  a?: FilterOptionValue
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
  eval?: FilterOptionValue
  outputs?: FilterOptionValue
}

export type SetPtsOptions = {
  expr?: FilterOptionValue
}

export type VolumeOptions = {
  volume?: FilterOptionValue
  precision?: FilterOptionValue
  replaygain?: FilterOptionValue
  eval?: FilterOptionValue
}

export type AtempoOptions = {
  tempo?: FilterOptionValue
}

export type AresampleOptions = {
  sample_rate?: FilterOptionValue
  resampler?: FilterOptionValue
  async?: FilterOptionValue
  first_pts?: FilterOptionValue
  min_comp?: FilterOptionValue
  max_comp?: FilterOptionValue
  compensation_duration?: FilterOptionValue
  compensation_distance?: FilterOptionValue
  cutoff?: FilterOptionValue
}

export type AtrimOptions = {
  start?: FilterOptionValue
  end?: FilterOptionValue
  start_pts?: FilterOptionValue
  end_pts?: FilterOptionValue
  start_sample?: FilterOptionValue
  end_sample?: FilterOptionValue
  start_time?: FilterOptionValue
  end_time?: FilterOptionValue
  duration?: FilterOptionValue
}

export type AsetPtsOptions = {
  expr?: FilterOptionValue
}

export type AfadeOptions = {
  type?: FilterOptionValue
  start_sample?: FilterOptionValue
  nb_samples?: FilterOptionValue
  start_time?: FilterOptionValue
  duration?: FilterOptionValue
  curve?: FilterOptionValue
}

export type HighpassOptions = {
  f?: FilterOptionValue
  width_type?: FilterOptionValue
  width?: FilterOptionValue
  poles?: FilterOptionValue
  mix?: FilterOptionValue
}

export type LowpassOptions = {
  f?: FilterOptionValue
  width_type?: FilterOptionValue
  width?: FilterOptionValue
  poles?: FilterOptionValue
  mix?: FilterOptionValue
}

export type AformatOptions = {
  sample_fmts?: FilterOptionValue
  sample_rates?: FilterOptionValue
  channel_layouts?: FilterOptionValue
  channels?: FilterOptionValue
}

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

// Video filters
export const scale = (options: ScaleOptions = {}, labels?: FilterLabels) =>
  create("scale", options, labels)
export const fps = (options: FpsOptions = {}, labels?: FilterLabels) =>
  create("fps", options, labels)
export const crop = (options: CropOptions = {}, labels?: FilterLabels) =>
  create("crop", options, labels)
export const pad = (options: PadOptions = {}, labels?: FilterLabels) =>
  create("pad", options, labels)
export const format = (options: FormatOptions = {}, labels?: FilterLabels) =>
  create("format", options, labels)
export const setsar = (options: SetSarOptions = {}, labels?: FilterLabels) =>
  create("setsar", options, labels)
export const setdar = (options: SetDarOptions = {}, labels?: FilterLabels) =>
  create("setdar", options, labels)
export const transpose = (
  options: TransposeOptions = {},
  labels?: FilterLabels
) => create("transpose", options, labels)
export const hflip = (options: FilterOptions = {}, labels?: FilterLabels) =>
  create("hflip", options, labels)
export const vflip = (options: FilterOptions = {}, labels?: FilterLabels) =>
  create("vflip", options, labels)
export const overlay = (options: OverlayOptions = {}, labels?: FilterLabels) =>
  create("overlay", options, labels)
export const drawtext = (
  options: DrawtextOptions = {},
  labels?: FilterLabels
) => create("drawtext", options, labels)
export const select = (options: SelectOptions = {}, labels?: FilterLabels) =>
  create("select", options, labels)
export const setpts = (options: SetPtsOptions = {}, labels?: FilterLabels) =>
  create("setpts", options, labels)

// Audio filters
export const volume = (options: VolumeOptions = {}, labels?: FilterLabels) =>
  create("volume", options, labels)
export const atempo = (options: AtempoOptions = {}, labels?: FilterLabels) =>
  create("atempo", options, labels)
export const aresample = (
  options: AresampleOptions = {},
  labels?: FilterLabels
) => create("aresample", options, labels)
export const atrim = (options: AtrimOptions = {}, labels?: FilterLabels) =>
  create("atrim", options, labels)
export const asetpts = (options: AsetPtsOptions = {}, labels?: FilterLabels) =>
  create("asetpts", options, labels)
export const afade = (options: AfadeOptions = {}, labels?: FilterLabels) =>
  create("afade", options, labels)
export const highpass = (
  options: HighpassOptions = {},
  labels?: FilterLabels
) => create("highpass", options, labels)
export const lowpass = (options: LowpassOptions = {}, labels?: FilterLabels) =>
  create("lowpass", options, labels)
export const aformat = (options: AformatOptions = {}, labels?: FilterLabels) =>
  create("aformat", options, labels)
