import type { FFmpeguUserArgValue } from "../../types/index.ts"
import { format } from "../common.ts"
import { FFmpeguOptions } from "../core.ts"

export type FFmpeguHlsFlag =
  | "single_file"
  | "delete_segments"
  | "append_list"
  | "round_durations"
  | "discont_start"
  | "omit_endlist"
  | "split_by_time"
  | "program_date_time"
  | "periodic_rekey"
  | "independent_segments"
  | "iframes_only"
  | "second_level_segment_index"
  | "second_level_segment_size"
  | "second_level_segment_duration"
  | "temp_file"
  | ({} & string)
export type FFmpeguHlsFlagValue = FFmpeguHlsFlag | FFmpeguHlsFlag[]

export type FFmpeguHlsStartNumberSource =
  | "generic"
  | "epoch"
  | "epoch_us"
  | "datetime"
  | ({} & string)

export type FFmpeguHlsPlaylistType = "event" | "vod" | ({} & string)

export type FFmpeguHlsSegmentType = "mpegts" | "fmp4" | ({} & string)

export type FFmpeguHlsOptions = {
  initTime?: number
  time?: number
  listSize?: number
  deleteThreshold?: number
  startNumberSource?: FFmpeguHlsStartNumberSource
  startNumber?: number
  allowCache?: boolean | number
  baseUrl?: string
  segmentFilename?: string
  strftime?: boolean | number
  strftimeMkdir?: boolean | number
  segmentOptions?: string
  flags?: FFmpeguHlsFlagValue
  playlistType?: FFmpeguHlsPlaylistType
  segmentType?: FFmpeguHlsSegmentType
  fmp4InitFilename?: string
  fmp4InitResend?: boolean | number
  method?: string
  httpUserAgent?: string
  varStreamMap?: string
  ccStreamMap?: string
  masterPlName?: string
  masterPlPublishRate?: number
  httpPersistent?: boolean | number
  timeout?: number | string
  ignoreIoErrors?: boolean | number
  headers?: string
}

export const hls = (options: FFmpeguHlsOptions) => {
  const args: Record<string, FFmpeguUserArgValue> = {}

  if (typeof options.initTime !== "undefined") {
    args.hls_init_time = options.initTime
  }

  if (typeof options.time !== "undefined") {
    args.hls_time = options.time
  }

  if (typeof options.listSize !== "undefined") {
    args.hls_list_size = options.listSize
  }

  if (typeof options.deleteThreshold !== "undefined") {
    args.hls_delete_threshold = options.deleteThreshold
  }

  if (typeof options.startNumberSource !== "undefined") {
    args.hls_start_number_source = options.startNumberSource
  }

  if (typeof options.startNumber !== "undefined") {
    args.start_number = options.startNumber
  }

  if (typeof options.allowCache !== "undefined") {
    args.hls_allow_cache =
      typeof options.allowCache === "boolean"
        ? options.allowCache
          ? 1
          : 0
        : options.allowCache
  }

  if (typeof options.baseUrl !== "undefined") {
    args.hls_base_url = options.baseUrl
  }

  if (typeof options.segmentFilename !== "undefined") {
    args.hls_segment_filename = options.segmentFilename
  }

  if (typeof options.strftime !== "undefined") {
    args.strftime =
      typeof options.strftime === "boolean"
        ? options.strftime
          ? 1
          : 0
        : options.strftime
  }

  if (typeof options.strftimeMkdir !== "undefined") {
    args.strftime_mkdir =
      typeof options.strftimeMkdir === "boolean"
        ? options.strftimeMkdir
          ? 1
          : 0
        : options.strftimeMkdir
  }

  if (typeof options.segmentOptions !== "undefined") {
    args.hls_segment_options = options.segmentOptions
  }

  if (typeof options.flags !== "undefined") {
    args.hls_flags = Array.isArray(options.flags)
      ? options.flags.join("+")
      : options.flags
  }

  if (typeof options.playlistType !== "undefined") {
    args.hls_playlist_type = options.playlistType
  }

  if (typeof options.segmentType !== "undefined") {
    args.hls_segment_type = options.segmentType
  }

  if (typeof options.fmp4InitFilename !== "undefined") {
    args.hls_fmp4_init_filename = options.fmp4InitFilename
  }

  if (typeof options.fmp4InitResend !== "undefined") {
    args.hls_fmp4_init_resend =
      typeof options.fmp4InitResend === "boolean"
        ? options.fmp4InitResend
          ? 1
          : 0
        : options.fmp4InitResend
  }

  if (typeof options.method !== "undefined") {
    args.method = options.method
  }

  if (typeof options.httpUserAgent !== "undefined") {
    args.http_user_agent = options.httpUserAgent
  }

  if (typeof options.varStreamMap !== "undefined") {
    args.var_stream_map = options.varStreamMap
  }

  if (typeof options.ccStreamMap !== "undefined") {
    args.cc_stream_map = options.ccStreamMap
  }

  if (typeof options.masterPlName !== "undefined") {
    args.master_pl_name = options.masterPlName
  }

  if (typeof options.masterPlPublishRate !== "undefined") {
    args.master_pl_publish_rate = options.masterPlPublishRate
  }

  if (typeof options.httpPersistent !== "undefined") {
    args.http_persistent =
      typeof options.httpPersistent === "boolean"
        ? options.httpPersistent
          ? 1
          : 0
        : options.httpPersistent
  }

  if (typeof options.timeout !== "undefined") {
    args.timeout = options.timeout
  }

  if (typeof options.ignoreIoErrors !== "undefined") {
    args.ignore_io_errors =
      typeof options.ignoreIoErrors === "boolean"
        ? options.ignoreIoErrors
          ? 1
          : 0
        : options.ignoreIoErrors
  }

  if (typeof options.headers !== "undefined") {
    args.headers = options.headers
  }

  return FFmpeguOptions.create(format("hls"), args)
}
