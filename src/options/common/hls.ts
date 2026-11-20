import type { TimeValue } from "../common.ts"
import { muxerOptions, type OpenMuxerHelper } from "./muxer.ts"

export type HlsFlag =
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
export type HlsFlagValue = HlsFlag | ReadonlyArray<HlsFlag>

export type HlsStartNumberSource =
  | "generic"
  | "epoch"
  | "epoch_us"
  | "datetime"
  | ({} & string)

export type HlsPlaylistType = "event" | "vod" | ({} & string)

export type HlsSegmentType = "mpegts" | "fmp4" | ({} & string)

/**
 * Typed hints for FFmpeg's HLS muxer options, verified against FFmpeg 6.1–9.0.
 * Other keys pass through unchanged.
 */
export type HlsOptions = {
  hls_init_time?: TimeValue
  hls_time?: TimeValue
  hls_list_size?: number
  hls_delete_threshold?: number
  hls_start_number_source?: HlsStartNumberSource
  start_number?: number
  /** An integer option: -1 (unset), 0, or 1. */
  hls_allow_cache?: boolean | number
  hls_base_url?: string
  hls_segment_filename?: string
  strftime?: boolean | number
  strftime_mkdir?: boolean | number
  hls_segment_options?: string
  hls_flags?: HlsFlagValue
  hls_playlist_type?: HlsPlaylistType
  hls_segment_type?: HlsSegmentType
  hls_fmp4_init_filename?: string
  hls_fmp4_init_resend?: boolean | number
  method?: string
  http_user_agent?: string
  var_stream_map?: string
  cc_stream_map?: string
  master_pl_name?: string
  master_pl_publish_rate?: number
  http_persistent?: boolean | number
  timeout?: TimeValue
  ignore_io_errors?: boolean | number
  headers?: string
}

// AV_OPT_TYPE_DURATION options, where time objects are converted to seconds.
const durationKeys = ["hls_init_time", "hls_time", "timeout"]

export const hls: OpenMuxerHelper<HlsOptions> = (
  options: Readonly<Record<string, unknown>> = {}
) => muxerOptions("hls", options, durationKeys)
