import { helper, type OptionValue, type TimeOptionValue } from "../core.ts"

export type VolumeOptions = {
  volume?: OptionValue
  precision?: OptionValue
  replaygain?: OptionValue
  eval?: OptionValue
}

export type AtempoOptions = {
  tempo?: OptionValue
}

export type AresampleOptions = {
  sample_rate?: OptionValue
  resampler?: OptionValue
  async?: OptionValue
  first_pts?: OptionValue
  min_comp?: OptionValue
  cutoff?: OptionValue
}

export type AtrimOptions = {
  start?: TimeOptionValue
  end?: TimeOptionValue
  start_pts?: OptionValue
  end_pts?: OptionValue
  start_sample?: OptionValue
  end_sample?: OptionValue
  duration?: TimeOptionValue
}

export type AsetPtsOptions = { expr?: OptionValue }

export type AfadeOptions = {
  type?: OptionValue
  start_sample?: OptionValue
  nb_samples?: OptionValue
  start_time?: TimeOptionValue
  duration?: TimeOptionValue
  curve?: OptionValue
}

export type HighpassOptions = {
  f?: OptionValue
  width_type?: OptionValue
  width?: OptionValue
  poles?: OptionValue
  mix?: OptionValue
}

export type LowpassOptions = HighpassOptions

export type AformatOptions = {
  sample_fmts?: OptionValue
  sample_rates?: OptionValue
  channel_layouts?: OptionValue
}

export const volume = helper<VolumeOptions>("volume")
export const atempo = helper<AtempoOptions>("atempo")
export const aresample = helper<AresampleOptions>("aresample")
export const atrim = helper<AtrimOptions>("atrim", ["start", "end", "duration"])
export const asetpts = helper<AsetPtsOptions>("asetpts")
export const afade = helper<AfadeOptions>("afade", ["start_time", "duration"])
export const highpass = helper<HighpassOptions>("highpass")
export const lowpass = helper<LowpassOptions>("lowpass")
export const aformat = helper<AformatOptions>("aformat")
