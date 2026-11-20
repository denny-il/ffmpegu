import { make } from "../core.ts"
import type { RateValue, SizeValue } from "../common.ts"
import { bitrateOption, filterOption } from "../internal.ts"

export type VideoCodec =
  | "libx264"
  | "libx265"
  | "libvpx"
  | "libvpx-vp9"
  | "libaom-av1"
  | "libsvtav1"
  | "librav1e"
  | "libtheora"
  | "libwebp"
  | "h264"
  | "hevc"
  | "vp8"
  | "vp9"
  | "av1"
  | "mpeg1video"
  | "mpeg2video"
  | "mpeg4"
  | "mjpeg"
  | "prores"
  | "dnxhd"
  | "ffv1"
  | "gif"
  | "png"
  | "rawvideo"
  | "copy"
  | ({} & string)

export const videoCopy = () => make(["-c:v", "copy"])

export const videoCodec = (codec: VideoCodec) => make(["-c:v", codec])

export const videoBitrate = bitrateOption("-b:v")
export const minRate = bitrateOption("-minrate")
export const maxRate = bitrateOption("-maxrate")
export const bufferSize = bitrateOption("-bufsize")

export const crf = (value: number) => make(["-crf", value])
export const preset = (value: string) => make(["-preset", value])
export const tune = (value: string) => make(["-tune", value])
export const videoProfile = (value: string) => make(["-profile:v", value])
export const level = (value: string | number) => make(["-level", value])

export const frameRate = (value: RateValue) => make(["-r", value])
export const gop = (value: number) => make(["-g", value])
export const keyintMin = (value: number) => make(["-keyint_min", value])
export const bFrames = (value: number) => make(["-bf", value])
export const refs = (value: number) => make(["-refs", value])
export const pixelFormat = (value: string) => make(["-pix_fmt", value])
export const size = (value: SizeValue) => make(["-s", value])
export const aspect = (value: string) => make(["-aspect", value])

export const videoFilter = filterOption("-vf")
