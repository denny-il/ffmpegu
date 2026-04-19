import type { FFmpeguUserArgValue } from "../../types/index.ts"
import { format } from "../common.ts"
import { FFmpeguOptions } from "../core.ts"

export type FFmpeguDashSegmentType = "auto" | "mp4" | "webm" | ({} & string)

export type FFmpeguDashFragType =
  | "auto"
  | "every_frame"
  | "duration"
  | "pframes"
  | ({} & string)

export type FFmpeguDashMpdProfile = "dash" | "dvb_dash" | ({} & string)

export type FFmpeguDashWritePrft = "auto" | "wallclock" | "pts" | ({} & string)

export type FFmpeguDashOptions = {
  adaptationSets?: string
  segmentType?: FFmpeguDashSegmentType
  extraWindowSize?: number
  formatOptions?: string
  fragDuration?: number | string
  fragType?: FFmpeguDashFragType
  globalSidx?: boolean | number
  hlsMasterName?: string
  hlsPlaylist?: boolean | number
  httpOpts?: string
  httpPersistent?: boolean | number
  httpUserAgent?: string
  ignoreIoErrors?: boolean | number
  indexCorrection?: boolean | number
  initSegName?: string
  ldash?: boolean | number
  lhls?: boolean | number
  masterM3u8PublishRate?: number
  maxPlaybackRate?: number | string
  mediaSegName?: string
  method?: string
  minPlaybackRate?: number | string
  mpdProfile?: FFmpeguDashMpdProfile
  removeAtExit?: boolean | number
  segDuration?: number | string
  singleFile?: boolean | number
  singleFileName?: string
  streaming?: boolean | number
  targetLatency?: number | string
  timeout?: number | string
  updatePeriod?: number
  useTemplate?: boolean | number
  useTimeline?: boolean | number
  utcTimingUrl?: string
  windowSize?: number
  writePrft?: FFmpeguDashWritePrft
}

const boolToInt = (value: boolean | number) =>
  typeof value === "boolean" ? (value ? 1 : 0) : value

export const dash = (options: FFmpeguDashOptions) => {
  const args: Record<string, FFmpeguUserArgValue> = {}

  if (typeof options.adaptationSets !== "undefined") {
    args.adaptation_sets = options.adaptationSets
  }

  if (typeof options.segmentType !== "undefined") {
    args.dash_segment_type = options.segmentType
  }

  if (typeof options.extraWindowSize !== "undefined") {
    args.extra_window_size = options.extraWindowSize
  }

  if (typeof options.formatOptions !== "undefined") {
    args.format_options = options.formatOptions
  }

  if (typeof options.fragDuration !== "undefined") {
    args.frag_duration = options.fragDuration
  }

  if (typeof options.fragType !== "undefined") {
    args.frag_type = options.fragType
  }

  if (typeof options.globalSidx !== "undefined") {
    args.global_sidx = boolToInt(options.globalSidx)
  }

  if (typeof options.hlsMasterName !== "undefined") {
    args.hls_master_name = options.hlsMasterName
  }

  if (typeof options.hlsPlaylist !== "undefined") {
    args.hls_playlist = boolToInt(options.hlsPlaylist)
  }

  if (typeof options.httpOpts !== "undefined") {
    args.http_opts = options.httpOpts
  }

  if (typeof options.httpPersistent !== "undefined") {
    args.http_persistent = boolToInt(options.httpPersistent)
  }

  if (typeof options.httpUserAgent !== "undefined") {
    args.http_user_agent = options.httpUserAgent
  }

  if (typeof options.ignoreIoErrors !== "undefined") {
    args.ignore_io_errors = boolToInt(options.ignoreIoErrors)
  }

  if (typeof options.indexCorrection !== "undefined") {
    args.index_correction = boolToInt(options.indexCorrection)
  }

  if (typeof options.initSegName !== "undefined") {
    args.init_seg_name = options.initSegName
  }

  if (typeof options.ldash !== "undefined") {
    args.ldash = boolToInt(options.ldash)
  }

  if (typeof options.lhls !== "undefined") {
    args.lhls = boolToInt(options.lhls)
  }

  if (typeof options.masterM3u8PublishRate !== "undefined") {
    args.master_m3u8_publish_rate = options.masterM3u8PublishRate
  }

  if (typeof options.maxPlaybackRate !== "undefined") {
    args.max_playback_rate = options.maxPlaybackRate
  }

  if (typeof options.mediaSegName !== "undefined") {
    args.media_seg_name = options.mediaSegName
  }

  if (typeof options.method !== "undefined") {
    args.method = options.method
  }

  if (typeof options.minPlaybackRate !== "undefined") {
    args.min_playback_rate = options.minPlaybackRate
  }

  if (typeof options.mpdProfile !== "undefined") {
    args.mpd_profile = options.mpdProfile
  }

  if (typeof options.removeAtExit !== "undefined") {
    args.remove_at_exit = boolToInt(options.removeAtExit)
  }

  if (typeof options.segDuration !== "undefined") {
    args.seg_duration = options.segDuration
  }

  if (typeof options.singleFile !== "undefined") {
    args.single_file = boolToInt(options.singleFile)
  }

  if (typeof options.singleFileName !== "undefined") {
    args.single_file_name = options.singleFileName
  }

  if (typeof options.streaming !== "undefined") {
    args.streaming = boolToInt(options.streaming)
  }

  if (typeof options.targetLatency !== "undefined") {
    args.target_latency = options.targetLatency
  }

  if (typeof options.timeout !== "undefined") {
    args.timeout = options.timeout
  }

  if (typeof options.updatePeriod !== "undefined") {
    args.update_period = options.updatePeriod
  }

  if (typeof options.useTemplate !== "undefined") {
    args.use_template = boolToInt(options.useTemplate)
  }

  if (typeof options.useTimeline !== "undefined") {
    args.use_timeline = boolToInt(options.useTimeline)
  }

  if (typeof options.utcTimingUrl !== "undefined") {
    args.utc_timing_url = options.utcTimingUrl
  }

  if (typeof options.windowSize !== "undefined") {
    args.window_size = options.windowSize
  }

  if (typeof options.writePrft !== "undefined") {
    args.write_prft = options.writePrft
  }

  return FFmpeguOptions.create(format("dash"), args)
}
