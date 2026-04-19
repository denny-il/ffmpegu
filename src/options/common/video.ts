import type { FFmpeguUserArgValue } from "../../types/index.ts"
import { formatBitrate } from "../../utils.ts"
import type {
  FFmpeguBitrateUnit,
  FFmpeguBitrateValue,
  FFmpeguRateValue,
  FFmpeguSizeValue
} from "../common.ts"
import { FFmpeguOptions } from "../core.ts"

export type FFmpeguVideoCodec =
  | "libx264"
  | "libx265"
  | "libvpx"
  | "libvpx-vp9"
  | "libaom-av1"
  | "libsvtav1"
  | "librav1e"
  | "libtheora"
  | "libwebp"
  | "h264"
  | "hevc"
  | "vp8"
  | "vp9"
  | "av1"
  | "mpeg1video"
  | "mpeg2video"
  | "mpeg4"
  | "mjpeg"
  | "prores"
  | "dnxhd"
  | "ffv1"
  | "gif"
  | "png"
  | "rawvideo"
  | "copy"
  | ({} & string)

export const videoCopy = () => FFmpeguOptions.create(["-c:v", "copy"])

export const videoCodec = (codec: FFmpeguVideoCodec) =>
  FFmpeguOptions.create(["-c:v", codec])

export function videoBitrate(
  bitrate: number,
  unit: FFmpeguBitrateUnit
): FFmpeguOptions
export function videoBitrate(
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions
export function videoBitrate(
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions {
  return FFmpeguOptions.create(["-b:v", formatBitrate(bitrate, unit)])
}

export function minRate(
  bitrate: number,
  unit: FFmpeguBitrateUnit
): FFmpeguOptions
export function minRate(
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions
export function minRate(
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions {
  return FFmpeguOptions.create(["-minrate", formatBitrate(bitrate, unit)])
}

export function maxRate(
  bitrate: number,
  unit: FFmpeguBitrateUnit
): FFmpeguOptions
export function maxRate(
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions
export function maxRate(
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions {
  return FFmpeguOptions.create(["-maxrate", formatBitrate(bitrate, unit)])
}

export function bufferSize(
  value: number,
  unit: FFmpeguBitrateUnit
): FFmpeguOptions
export function bufferSize(
  value: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions
export function bufferSize(
  value: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
): FFmpeguOptions {
  return FFmpeguOptions.create(["-bufsize", formatBitrate(value, unit)])
}

export const crf = (value: number) => FFmpeguOptions.create(["-crf", value])
export const preset = (value: string) =>
  FFmpeguOptions.create(["-preset", value])
export const tune = (value: string) => FFmpeguOptions.create(["-tune", value])
export const profileVideo = (value: string) =>
  FFmpeguOptions.create(["-profile:v", value])
export const level = (value: string | number) =>
  FFmpeguOptions.create(["-level", value])

export const frameRate = (value: FFmpeguRateValue) =>
  FFmpeguOptions.create(["-r", value])
export const gop = (value: number) => FFmpeguOptions.create(["-g", value])
export const keyintMin = (value: number) =>
  FFmpeguOptions.create(["-keyint_min", value])
export const bFrames = (value: number) => FFmpeguOptions.create(["-bf", value])
export const refs = (value: number) => FFmpeguOptions.create(["-refs", value])
export const pixelFormat = (value: string) =>
  FFmpeguOptions.create(["-pix_fmt", value])
export const size = (value: FFmpeguSizeValue) =>
  FFmpeguOptions.create(["-s", value])
export const aspect = (value: string) =>
  FFmpeguOptions.create(["-aspect", value])

export const videoFilter = (value: FFmpeguUserArgValue) =>
  FFmpeguOptions.create(["-vf", value])
