import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

// Known fields are validated; any other key is kept as `unknown` so newer
// ffprobe output survives decoding unchanged.
const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const
const string = Schema.optionalKey(Schema.String)
const number = Schema.optionalKey(Schema.Number)

export const ProbeTags = Schema.Record(Schema.String, Schema.String)
export const ProbeDisposition = Schema.Record(Schema.String, Schema.Number)

const StreamFields = {
  index: Schema.Int,
  codec_name: string,
  codec_long_name: string,
  profile: string,
  codec_type: string,
  codec_tag_string: string,
  codec_tag: string,
  width: number,
  height: number,
  coded_width: number,
  coded_height: number,
  has_b_frames: number,
  sample_aspect_ratio: string,
  display_aspect_ratio: string,
  pix_fmt: string,
  level: number,
  color_range: string,
  color_space: string,
  color_transfer: string,
  color_primaries: string,
  chroma_location: string,
  field_order: string,
  refs: number,
  is_avc: string,
  nal_length_size: string,
  sample_fmt: string,
  sample_rate: string,
  channels: number,
  channel_layout: string,
  bits_per_sample: number,
  id: string,
  r_frame_rate: string,
  avg_frame_rate: string,
  time_base: string,
  start_pts: number,
  start_time: string,
  duration_ts: number,
  duration: string,
  bit_rate: string,
  bits_per_raw_sample: string,
  nb_frames: string,
  extradata_size: number,
  disposition: Schema.optionalKey(ProbeDisposition),
  tags: Schema.optionalKey(ProbeTags)
}

export const ProbeStream = Schema.StructWithRest(
  Schema.Struct(StreamFields),
  Rest
)

/** Stream fields selected by a caller may omit even the stream index. */
export const ProjectedProbeStream = Schema.StructWithRest(
  Schema.Struct({
    ...StreamFields,
    index: Schema.optionalKey(Schema.Int),
    // show_optional_fields=always exposes unavailable timestamps explicitly.
    start_pts: Schema.optionalKey(
      Schema.Union([Schema.Number, Schema.Literal("N/A")])
    ),
    duration_ts: Schema.optionalKey(
      Schema.Union([Schema.Number, Schema.Literal("N/A")])
    )
  }),
  Rest
)

export const ProbeFormat = Schema.StructWithRest(
  Schema.Struct({
    filename: string,
    nb_streams: number,
    nb_programs: number,
    nb_stream_groups: number,
    format_name: string,
    format_long_name: string,
    start_time: string,
    duration: string,
    size: string,
    bit_rate: string,
    probe_score: number,
    tags: Schema.optionalKey(ProbeTags)
  }),
  Rest
)

export const ProbeResult = Schema.StructWithRest(
  Schema.Struct({
    streams: Schema.Array(ProbeStream).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed([]))
    ),
    format: Schema.optionalKey(ProbeFormat)
  }),
  Rest
)

/** Like ProbeResult, allowing show_entries to omit stream indexes. */
export const ProjectedProbeResult = Schema.StructWithRest(
  Schema.Struct({
    streams: Schema.Array(ProjectedProbeStream).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed([]))
    ),
    format: Schema.optionalKey(ProbeFormat)
  }),
  Rest
)

export type ProjectedProbeStream = typeof ProjectedProbeStream.Type
export type ProjectedProbeResult = typeof ProjectedProbeResult.Type
export type ProbeStream = typeof ProbeStream.Type
export type ProbeFormat = typeof ProbeFormat.Type
export type ProbeResult = typeof ProbeResult.Type
