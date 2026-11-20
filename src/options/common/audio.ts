import { make } from "../core.ts"
import { bitrateOption, filterOption } from "../internal.ts"

export type AudioCodec =
  | "aac"
  | "libfdk_aac"
  | "libopus"
  | "libvorbis"
  | "libmp3lame"
  | "mp3"
  | "mp2"
  | "opus"
  | "vorbis"
  | "flac"
  | "alac"
  | "ac3"
  | "eac3"
  | "pcm_s16le"
  | "pcm_s16be"
  | "pcm_s24le"
  | "pcm_s32le"
  | "pcm_f32le"
  | "pcm_u8"
  | "pcm_mulaw"
  | "pcm_alaw"
  | "copy"
  | ({} & string)

export const audioCopy = () => make(["-c:a", "copy"])

export const audioCodec = (codec: AudioCodec) => make(["-c:a", codec])

export const audioBitrate = bitrateOption("-b:a")

export const audioProfile = (value: string) => make(["-profile:a", value])

export const audioChannels = (value: number) => make(["-ac", value])
export const audioSampleRate = (value: number) => make(["-ar", value])
export const audioSampleFormat = (value: string) => make(["-sample_fmt", value])
export const audioQuality = (value: number) => make(["-q:a", value])

export const audioFilter = filterOption("-af")
