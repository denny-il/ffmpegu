import { FFmpeguOptions } from "./core.ts"

export const custom = FFmpeguOptions.create
export const concat = FFmpeguOptions.concat
export const merge = FFmpeguOptions.merge

export * from "./common.ts"
export * from "./common/audio.ts"
export * from "./common/dash.ts"
export * from "./common/hls.ts"
export * from "./common/subtitle.ts"
export * from "./common/video.ts"
