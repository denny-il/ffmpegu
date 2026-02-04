import type { FileHandle } from "node:fs/promises"
import type { FFmpeguArgument } from "../core/argument.ts"

export interface FFmpeguReferencesInterface {
  get(ref: FFmpeguCompilable): number
  has(ref: FFmpeguCompilable): boolean
}

export interface FFmpeguCompilable {
  compile(refs: FFmpeguReferencesInterface): Promise<string[]>
}

export type FFmpeguPipe = {
  dir: string
  path: string
}

export type FFmpeguPipeHandler = FFmpeguPipe & {
  handler: FileHandle
  clean: () => Promise<void>
}

export type FFmpeguPrimitiveUserArgValue = string | FFmpeguArgument

export type FFmpeguUserArgValue =
  | FFmpeguPrimitiveUserArgValue
  | number
  | boolean

export type FFmpeguUserArg =
  | FFmpeguPrimitiveUserArgValue
  | [string, FFmpeguUserArgValue?]
  | Record<string, FFmpeguUserArgValue>

export type FFmpeguFFprobeTags = Record<string, string>
export type FFmpeguFFprobeDisposition = Record<string, number>

export interface FFmpeguFFprobeStream {
  index: number
  codec_name?: string
  codec_long_name?: string
  profile?: string
  codec_type?: string
  codec_tag_string?: string
  codec_tag?: string
  width?: number
  height?: number
  coded_width?: number
  coded_height?: number
  has_b_frames?: number
  sample_aspect_ratio?: string
  display_aspect_ratio?: string
  pix_fmt?: string
  level?: number
  color_range?: string
  color_space?: string
  color_transfer?: string
  color_primaries?: string
  chroma_location?: string
  field_order?: string
  refs?: number
  is_avc?: string
  nal_length_size?: string
  id?: string
  r_frame_rate?: string
  avg_frame_rate?: string
  time_base?: string
  start_pts?: number
  start_time?: string
  duration_ts?: number
  duration?: string
  bit_rate?: string
  bits_per_raw_sample?: string
  nb_frames?: string
  extradata_size?: number
  disposition?: FFmpeguFFprobeDisposition
  tags?: FFmpeguFFprobeTags
  [key: string]: unknown
}

export interface FFmpeguFFprobeFormat {
  filename?: string
  nb_streams?: number
  nb_programs?: number
  nb_stream_groups?: number
  format_name?: string
  format_long_name?: string
  start_time?: string
  duration?: string
  size?: string
  bit_rate?: string
  probe_score?: number
  tags?: FFmpeguFFprobeTags
  [key: string]: unknown
}

export interface FFmpeguFFprobeJson {
  streams?: FFmpeguFFprobeStream[]
  format?: FFmpeguFFprobeFormat
  [key: string]: unknown
}
