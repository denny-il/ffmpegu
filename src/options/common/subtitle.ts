import { make } from "../core.ts"

export type SubtitleCodec =
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

export const subtitleCopy = () => make(["-c:s", "copy"])

export const subtitleCodec = (codec: SubtitleCodec) => make(["-c:s", codec])
