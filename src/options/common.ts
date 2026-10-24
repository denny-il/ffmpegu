import { FFmpeguArgument } from "../core/argument.ts"
import type {
  FFmpeguPrimitiveUserArgValue,
  FFmpeguUserArgValue
} from "../types/index.ts"
import {
  type FFmpeguDurationValue,
  type FFmpeguTimeObject,
  formatTime,
  isDurationValue,
  timestampArgument
} from "../utils.ts"
import { FFmpeguOptions } from "./core.ts"

/**
 * Appended verbatim. Lowercase `m` is milli and lowercase `g`/`t` are rejected
 * by FFmpeg, so mega, giga, and tera are only offered uppercase.
 */
export type FFmpeguBitrateUnit = "k" | "K" | "M" | "G" | "T"
export type FFmpeguBitrateValue = string | number
export type FFmpeguRateValue = string | number
export type FFmpeguSizeValue = string
export type { FFmpeguDurationValue, FFmpeguTimeObject }
/** Numbers are seconds. Arguments, such as `time.seconds(d)`, pass through. */
export type FFmpeguTimeValue =
  | string
  | number
  | FFmpeguDurationValue
  | FFmpeguTimeObject
  | FFmpeguArgument

const resolveTime = (value: FFmpeguTimeValue): FFmpeguUserArgValue =>
  // Checked first: an argument is an object, so formatTime would take it.
  value instanceof FFmpeguArgument
    ? value
    : isDurationValue(value)
      ? timestampArgument(value)
      : typeof value === "object"
        ? formatTime(value)
        : value

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
