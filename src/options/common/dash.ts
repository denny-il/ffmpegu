import type { TimeValue } from "../common.ts"
import { muxerOptions, type OpenMuxerHelper } from "./muxer.ts"

export type DashSegmentType = "auto" | "mp4" | "webm" | ({} & string)

export type DashFragType =
  | "none"
  | "every_frame"
  | "duration"
  | "pframes"
  | ({} & string)

export type DashMpdProfile = "dash" | "dvb_dash" | ({} & string)

// write_prft is a boolean option; "auto" (the default) follows `ldash`.
export type DashWritePrft = "auto" | ({} & string)

/**
 * Typed hints for FFmpeg's DASH muxer options, verified against FFmpeg 6.1–9.0.
 * Other keys pass through unchanged.
 */
export type DashOptions = {
  adaptation_sets?: string
  dash_segment_type?: DashSegmentType
  extra_window_size?: number
  format_options?: string
  frag_duration?: TimeValue
  frag_type?: DashFragType
  global_sidx?: boolean | number
  hls_master_name?: string
  hls_playlist?: boolean | number
  http_opts?: string
  http_persistent?: boolean | number
  http_user_agent?: string
  ignore_io_errors?: boolean | number
  index_correction?: boolean | number
  init_seg_name?: string
  ldash?: boolean | number
  lhls?: boolean | number
  master_m3u8_publish_rate?: number
  max_playback_rate?: number | string
  media_seg_name?: string
  method?: string
  min_playback_rate?: number | string
  mpd_profile?: DashMpdProfile
  remove_at_exit?: boolean | number
  seg_duration?: TimeValue
  single_file?: boolean | number
  single_file_name?: string
  streaming?: boolean | number
  target_latency?: TimeValue
  timeout?: TimeValue
  update_period?: number
  use_template?: boolean | number
  use_timeline?: boolean | number
  utc_timing_url?: string
  window_size?: number
  write_prft?: DashWritePrft | boolean | number
}

// AV_OPT_TYPE_DURATION options, where time objects are converted to seconds.
const durationKeys = [
  "frag_duration",
  "seg_duration",
  "target_latency",
  "timeout"
]

export const dash: OpenMuxerHelper<DashOptions> = (
  options: Readonly<Record<string, unknown>> = {}
) => muxerOptions("dash", options, durationKeys)
