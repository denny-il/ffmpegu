import type {
  FFmpeguPrimitiveUserArgValue,
  FFmpeguUserArgValue
} from "../types/index.ts"
import { type FFmpeguTimeObject, formatTime } from "../utils.ts"
import { FFmpeguOptions } from "./core.ts"

export type FFmpeguBitrateUnit = "k" | "K" | "m" | "M" | "g" | "G" | "t" | "T"
export type FFmpeguBitrateValue = string | number
export type FFmpeguRateValue = string | number
export type FFmpeguSizeValue = string
export type { FFmpeguTimeObject }
export type FFmpeguTimeValue = string | number | FFmpeguTimeObject

const resolveTime = (value: FFmpeguTimeValue): string | number =>
  typeof value === "object" ? formatTime(value) : value

export type FFmpeguFormat =
  | "mp4"
  | "mov"
  | "mkv"
  | "matroska"
  | "webm"
  | "avi"
  | "flv"
  | "f4v"
  | "mp3"
  | "aac"
  | "adts"
  | "wav"
  | "flac"
  | "ogg"
  | "m4a"
  | "aiff"
  | "caf"
  | "mpeg"
  | "mpegts"
  | "ts"
  | "3gp"
  | "3g2"
  | "mxf"
  | "asf"
  | "vob"
  | "hls"
  | "dash"
  | "rtp"
  | "gif"
  | "apng"
  | "image2"
  | "rawvideo"
  | "null"
  | ({} & string)

export const overwrite = () => FFmpeguOptions.create("-y")
export const noOverwrite = () => FFmpeguOptions.create("-n")

export const format = (value: FFmpeguFormat) =>
  FFmpeguOptions.create(["-f", value])
export const logLevel = (value: string) =>
  FFmpeguOptions.create(["-loglevel", value])
export const threads = (value: number) =>
  FFmpeguOptions.create(["-threads", value])

export const map = (value: FFmpeguPrimitiveUserArgValue) =>
  FFmpeguOptions.create(["-map", value])

export const noVideo = () => FFmpeguOptions.create("-vn")
export const noAudio = () => FFmpeguOptions.create("-an")
export const noSubtitle = () => FFmpeguOptions.create("-sn")
export const noData = () => FFmpeguOptions.create("-dn")

export const shortest = () => FFmpeguOptions.create("-shortest")
export const startTime = (value: FFmpeguTimeValue) =>
  FFmpeguOptions.create(["-ss", resolveTime(value)])
export const duration = (value: FFmpeguTimeValue) =>
  FFmpeguOptions.create(["-t", resolveTime(value)])
export const to = (value: FFmpeguTimeValue) =>
  FFmpeguOptions.create(["-to", resolveTime(value)])

export const copy = () => FFmpeguOptions.create(["-c", "copy"])
export const filterComplex = (value: FFmpeguUserArgValue) =>
  FFmpeguOptions.create(["-filter_complex", value])

export const movFlags = (value: string) =>
  FFmpeguOptions.create(["-movflags", value])
export const metadata = (key: string, value: string | number) =>
  FFmpeguOptions.create(["-metadata", `${key}=${value}`])
