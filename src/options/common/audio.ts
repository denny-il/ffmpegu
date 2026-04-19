import type { FFmpeguUserArgValue } from "../../types/index.ts"
import { formatBitrate } from "../../utils.ts"
import type { FFmpeguBitrateUnit, FFmpeguBitrateValue } from "../common.ts"
import { FFmpeguOptions } from "../core.ts"

export type FFmpeguAudioCodec =
  | "aac"
  | "libfdk_aac"
  | "libopus"
  | "libvorbis"
  | "libmp3lame"
  | "mp3"
  | "mp2"
  | "opus"
  | "vorbis"
  | "flac"
  | "alac"
  | "ac3"
  | "eac3"
  | "pcm_s16le"
  | "pcm_s16be"
  | "pcm_s24le"
  | "pcm_s32le"
  | "pcm_f32le"
  | "pcm_u8"
  | "pcm_mulaw"
  | "pcm_alaw"
  | "copy"
  | ({} & string)

export const audioCopy = () => FFmpeguOptions.create(["-c:a", "copy"])

export const audioCodec = (codec: FFmpeguAudioCodec) =>
  FFmpeguOptions.create(["-c:a", codec])

export function audioBitrate(
  bitrate: number,
  unit: FFmpeguBitrateUnit
): FFmpeguOptions
export function audioBitrate(
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions
export function audioBitrate(
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions {
  return FFmpeguOptions.create(["-b:a", formatBitrate(bitrate, unit)])
}

export const profileAudio = (value: string) =>
  FFmpeguOptions.create(["-profile:a", value])

export const audioChannels = (value: number) =>
  FFmpeguOptions.create(["-ac", value])
export const audioSampleRate = (value: number) =>
  FFmpeguOptions.create(["-ar", value])
export const audioSampleFormat = (value: string) =>
  FFmpeguOptions.create(["-sample_fmt", value])
export const audioQuality = (value: number) =>
  FFmpeguOptions.create(["-q:a", value])

export const audioFilter = (value: FFmpeguUserArgValue) =>
  FFmpeguOptions.create(["-af", value])
