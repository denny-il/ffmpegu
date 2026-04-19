import { type FFmpeguTimeObject, resolveTimeOptions } from "../../utils.ts"
import type { FilterArgument, FilterOptions } from "../core.ts"
import type { FFmpeguFilterLabelRef } from "../label.ts"
import { FFmpeguSimpleFilter } from "../simple.ts"

type FilterLabels = {
  inputs?: FFmpeguFilterLabelRef[]
  outputs?: FFmpeguFilterLabelRef[]
}

type FilterOptionValue = FilterArgument
type FilterTimeValue = FilterOptionValue | FFmpeguTimeObject

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
  start?: FilterTimeValue
  end?: FilterTimeValue
  start_pts?: FilterOptionValue
  end_pts?: FilterOptionValue
  start_sample?: FilterOptionValue
  end_sample?: FilterOptionValue
  start_time?: FilterTimeValue
  end_time?: FilterTimeValue
  duration?: FilterTimeValue
}

export type AsetPtsOptions = {
  expr?: FilterOptionValue
}

export type AfadeOptions = {
  type?: FilterOptionValue
  start_sample?: FilterOptionValue
  nb_samples?: FilterOptionValue
  start_time?: FilterTimeValue
  duration?: FilterTimeValue
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

export const volume = (options: VolumeOptions = {}, labels?: FilterLabels) =>
  create("volume", options, labels)
export const atempo = (options: AtempoOptions = {}, labels?: FilterLabels) =>
  create("atempo", options, labels)
export const aresample = (
  options: AresampleOptions = {},
  labels?: FilterLabels
) => create("aresample", options, labels)
export const atrim = (options: AtrimOptions = {}, labels?: FilterLabels) =>
  create(
    "atrim",
    resolveTimeOptions(options, [
      "start",
      "end",
      "start_time",
      "end_time",
      "duration"
    ]),
    labels
  )
export const asetpts = (options: AsetPtsOptions = {}, labels?: FilterLabels) =>
  create("asetpts", options, labels)
export const afade = (options: AfadeOptions = {}, labels?: FilterLabels) =>
  create(
    "afade",
    resolveTimeOptions(options, ["start_time", "duration"]),
    labels
  )
export const highpass = (
  options: HighpassOptions = {},
  labels?: FilterLabels
) => create("highpass", options, labels)
export const lowpass = (options: LowpassOptions = {}, labels?: FilterLabels) =>
  create("lowpass", options, labels)
export const aformat = (options: AformatOptions = {}, labels?: FilterLabels) =>
  create("aformat", options, labels)
