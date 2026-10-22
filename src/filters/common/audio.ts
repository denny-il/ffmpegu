import {
  type FFmpeguDurationValue,
  type FFmpeguTimeObject,
  resolveFilterTimeOptions
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
  cutoff?: FilterOptionValue
}

export type AtrimOptions = {
  start?: FilterTimeValue
  end?: FilterTimeValue
  start_pts?: FilterOptionValue
  end_pts?: FilterOptionValue
  start_sample?: FilterOptionValue
  end_sample?: FilterOptionValue
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
}

export const volume: OpenFilterHelper<VolumeOptions> = (
  options: VolumeOptions = {},
  labels?: FilterLabels
) => create("volume", options, labels)
export const atempo: OpenFilterHelper<AtempoOptions> = (
  options: AtempoOptions = {},
  labels?: FilterLabels
) => create("atempo", options, labels)
export const aresample: OpenFilterHelper<AresampleOptions> = (
  options: AresampleOptions = {},
  labels?: FilterLabels
) => create("aresample", options, labels)
export const atrim: OpenFilterHelper<AtrimOptions> = (
  options: AtrimOptions = {},
  labels?: FilterLabels
) =>
  create(
    "atrim",
    resolveFilterTimeOptions(options, ["start", "end", "duration"]),
    labels
  )
export const asetpts: OpenFilterHelper<AsetPtsOptions> = (
  options: AsetPtsOptions = {},
  labels?: FilterLabels
) => create("asetpts", options, labels)
export const afade: OpenFilterHelper<AfadeOptions> = (
  options: AfadeOptions = {},
  labels?: FilterLabels
) =>
  create(
    "afade",
    resolveFilterTimeOptions(options, ["start_time", "duration"]),
    labels
  )
export const highpass: OpenFilterHelper<HighpassOptions> = (
  options: HighpassOptions = {},
  labels?: FilterLabels
) => create("highpass", options, labels)
export const lowpass: OpenFilterHelper<LowpassOptions> = (
  options: LowpassOptions = {},
  labels?: FilterLabels
) => create("lowpass", options, labels)
export const aformat: OpenFilterHelper<AformatOptions> = (
  options: AformatOptions = {},
  labels?: FilterLabels
) => create("aformat", options, labels)
