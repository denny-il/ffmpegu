import type {
  FFmpeguPrimitiveUserArgValue,
  FFmpeguUserArgValue
} from "../types/index.ts"
import { FFmpeguOptions } from "./core.ts"

export type FFmpeguBitrateUnit = "k" | "K" | "m" | "M" | "g" | "G" | "t" | "T"
export type FFmpeguBitrateValue = string | number
export type FFmpeguRateValue = string | number
export type FFmpeguSizeValue = string
export type FFmpeguTimeValue = string | number
export type FFmpeguHlsFlag =
  | "delete_segments"
  | "append_list"
  | "split_by_time"
  | "program_date_time"
  | ({} & string)
export type FFmpeguHlsFlagValue = FFmpeguHlsFlag | FFmpeguHlsFlag[]

export type FFmpeguHlsOptions = {
  time?: number
  listSize?: number
  flags?: FFmpeguHlsFlagValue
}

export type FFmpeguDashOptions = {
  adaptationSets?: string
  windowSize?: number
  streaming?: boolean | number
}
export type FFmpeguContainerFormat =
  | "mp4"
  | "mov"
  | "mkv"
  | "webm"
  | "avi"
  | "flv"
  | "mp3"
  | "aac"
  | "wav"
  | "flac"
  | "ogg"
  | "m4a"
  | "mpeg"
  | "ts"
  | "gif"
  | "image2"
  | ({} & string)

export type FFmpeguVideoCodec =
  | "libx264"
  | "libx265"
  | "libvpx"
  | "libvpx-vp9"
  | "libaom-av1"
  | "h264"
  | "hevc"
  | "vp8"
  | "vp9"
  | "av1"
  | "mpeg4"
  | "copy"
  | ({} & string)

export type FFmpeguAudioCodec =
  | "aac"
  | "libopus"
  | "libvorbis"
  | "libmp3lame"
  | "mp3"
  | "opus"
  | "vorbis"
  | "flac"
  | "pcm_s16le"
  | "copy"
  | ({} & string)

export type FFmpeguSubtitleCodec =
  | "mov_text"
  | "srt"
  | "webvtt"
  | "ass"
  | "copy"
  | ({} & string)

export const overwrite = () => FFmpeguOptions.create("-y")
export const noOverwrite = () => FFmpeguOptions.create("-n")

export const format = (value: FFmpeguContainerFormat) =>
  FFmpeguOptions.create(["-f", value])
export const logLevel = (value: string) =>
  FFmpeguOptions.create(["-loglevel", value])
export const threads = (value: number) =>
  FFmpeguOptions.create(["-threads", value])

export const map = (value: FFmpeguPrimitiveUserArgValue) =>
  FFmpeguOptions.create(["-map", value])

export const shortest = () => FFmpeguOptions.create("-shortest")
export const startTime = (value: FFmpeguTimeValue) =>
  FFmpeguOptions.create(["-ss", value])
export const duration = (value: FFmpeguTimeValue) =>
  FFmpeguOptions.create(["-t", value])
export const to = (value: FFmpeguTimeValue) =>
  FFmpeguOptions.create(["-to", value])

export const copy = () => FFmpeguOptions.create(["-c", "copy"])
export const videoCopy = () => FFmpeguOptions.create(["-c:v", "copy"])
export const audioCopy = () => FFmpeguOptions.create(["-c:a", "copy"])
export const subtitleCopy = () => FFmpeguOptions.create(["-c:s", "copy"])

export const videoCodec = (codec: FFmpeguVideoCodec) =>
  FFmpeguOptions.create(["-c:v", codec])
export const audioCodec = (codec: FFmpeguAudioCodec) =>
  FFmpeguOptions.create(["-c:a", codec])
export const subtitleCodec = (codec: FFmpeguSubtitleCodec) =>
  FFmpeguOptions.create(["-c:s", codec])

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
export const profileAudio = (value: string) =>
  FFmpeguOptions.create(["-profile:a", value])
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

export const audioChannels = (value: number) =>
  FFmpeguOptions.create(["-ac", value])
export const audioSampleRate = (value: number) =>
  FFmpeguOptions.create(["-ar", value])
export const audioSampleFormat = (value: string) =>
  FFmpeguOptions.create(["-sample_fmt", value])
export const audioQuality = (value: number) =>
  FFmpeguOptions.create(["-q:a", value])

export const videoFilter = (value: FFmpeguUserArgValue) =>
  FFmpeguOptions.create(["-vf", value])
export const audioFilter = (value: FFmpeguUserArgValue) =>
  FFmpeguOptions.create(["-af", value])
export const filterComplex = (value: FFmpeguUserArgValue) =>
  FFmpeguOptions.create(["-filter_complex", value])

export const movFlags = (value: string) =>
  FFmpeguOptions.create(["-movflags", value])
export const metadata = (key: string, value: string | number) =>
  FFmpeguOptions.create(["-metadata", `${key}=${value}`])

export const hls = (options: FFmpeguHlsOptions) => {
  const args: Record<string, FFmpeguUserArgValue> = {}

  if (typeof options.time !== "undefined") {
    args.hls_time = options.time
  }

  if (typeof options.listSize !== "undefined") {
    args.hls_list_size = options.listSize
  }

  if (typeof options.flags !== "undefined") {
    args.hls_flags = Array.isArray(options.flags)
      ? options.flags.join(",")
      : options.flags
  }

  return FFmpeguOptions.create(format("hls"), args)
}

export const dash = (options: FFmpeguDashOptions) => {
  const args: Record<string, FFmpeguUserArgValue> = {}

  if (typeof options.adaptationSets !== "undefined") {
    args.adaptation_sets = options.adaptationSets
  }

  if (typeof options.windowSize !== "undefined") {
    args.window_size = options.windowSize
  }

  if (typeof options.streaming !== "undefined") {
    args.streaming =
      typeof options.streaming === "boolean"
        ? options.streaming
          ? 1
          : 0
        : options.streaming
  }

  return FFmpeguOptions.create(format("dash"), args)
}

const formatBitrate = (
  bitrate: FFmpeguBitrateValue,
  unit?: FFmpeguBitrateUnit
) => (typeof unit === "undefined" ? bitrate : `${bitrate}${unit}`)
