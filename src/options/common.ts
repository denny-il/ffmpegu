import { Argument } from "../core/argument.ts"
import {
  type DurationValue,
  type TimeObject,
  timestampArgument
} from "../utils.ts"
import { type ArgValue, make } from "./core.ts"

/**
 * Appended verbatim. Lowercase `m` is milli and lowercase `g`/`t` are rejected
 * by FFmpeg, so mega, giga, and tera are only offered uppercase.
 */
export type BitrateUnit = "k" | "K" | "M" | "G" | "T"
export type BitrateValue = string | number
export type RateValue = string | number
export type SizeValue = string
/** Numbers are seconds. Arguments, such as `Time.seconds(d)`, pass through. */
export type TimeValue = string | number | DurationValue | TimeObject | Argument

const resolveTime = (value: TimeValue): ArgValue =>
  // Checked first: an argument is an object, but not a time value.
  value instanceof Argument
    ? value
    : typeof value === "object"
      ? timestampArgument(value)
      : value

export type Format =
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

export const overwrite = () => make("-y")
export const noOverwrite = () => make("-n")

export const format = (value: Format) => make(["-f", value])
export const logLevel = (value: string) => make(["-loglevel", value])
export const threads = (value: number) => make(["-threads", value])

export const map = (value: string | Argument) => make(["-map", value])

export const noVideo = () => make("-vn")
export const noAudio = () => make("-an")
export const noSubtitle = () => make("-sn")
export const noData = () => make("-dn")

export const shortest = () => make("-shortest")
export const startTime = (value: TimeValue) => make(["-ss", resolveTime(value)])
export const duration = (value: TimeValue) => make(["-t", resolveTime(value)])
export const to = (value: TimeValue) => make(["-to", resolveTime(value)])

export const copy = () => make(["-c", "copy"])
export const filterComplex = (value: ArgValue) =>
  make(["-filter_complex", value])

export const movFlags = (value: string) => make(["-movflags", value])
export const metadata = (key: string, value: string | number) =>
  make(["-metadata", `${key}=${value}`])
