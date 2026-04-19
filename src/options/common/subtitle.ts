import { FFmpeguOptions } from "../core.ts"

export type FFmpeguSubtitleCodec =
  | "mov_text"
  | "srt"
  | "subrip"
  | "webvtt"
  | "ass"
  | "ssa"
  | "dvdsub"
  | "dvbsub"
  | "hdmv_pgs_subtitle"
  | "text"
  | "copy"
  | ({} & string)

export const subtitleCopy = () => FFmpeguOptions.create(["-c:s", "copy"])

export const subtitleCodec = (codec: FFmpeguSubtitleCodec) =>
  FFmpeguOptions.create(["-c:s", codec])
