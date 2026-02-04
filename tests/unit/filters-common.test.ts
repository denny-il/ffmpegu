import { describe, expect, it } from "vitest"
import { FFmpeguReferences } from "../../src/core/references.ts"
import {
  afade,
  aformat,
  aresample,
  asetpts,
  atempo,
  atrim,
  crop,
  drawtext,
  format,
  fps,
  hflip,
  highpass,
  lowpass,
  overlay,
  pad,
  scale,
  select,
  setdar,
  setpts,
  setsar,
  transpose,
  vflip,
  volume
} from "../../src/filters/common.ts"
import { FFmpeguFilterLabelRef } from "../../src/filters/label.ts"

describe.sequential("Filters Common", () => {
  const refs = new FFmpeguReferences()

  it("should build video filters", () => {
    expect(scale({ w: 320, h: 180 }).getArgs(refs)).toEqual([
      "scale=w=320:h=180"
    ])
    expect(fps({ fps: 30 }).getArgs(refs)).toEqual(["fps=fps=30"])
    expect(crop({ w: 100, h: 80, x: 1, y: 2 }).getArgs(refs)).toEqual([
      "crop=w=100:h=80:x=1:y=2"
    ])
    expect(pad({ w: 640, h: 360, x: 10, y: 20 }).getArgs(refs)).toEqual([
      "pad=w=640:h=360:x=10:y=20"
    ])
    expect(format({ pix_fmts: "yuv420p" }).getArgs(refs)).toEqual([
      "format=pix_fmts=yuv420p"
    ])
    expect(setsar({ sar: "1/1" }).getArgs(refs)).toEqual(["setsar=sar=1/1"])
    expect(setdar({ dar: "16/9" }).getArgs(refs)).toEqual(["setdar=dar=16/9"])
    expect(transpose({ dir: 1 }).getArgs(refs)).toEqual(["transpose=dir=1"])
    expect(hflip().getArgs(refs)).toEqual(["hflip"])
    expect(vflip().getArgs(refs)).toEqual(["vflip"])
  })

  it("should build labeled video filters", () => {
    const inLabel = FFmpeguFilterLabelRef.create("in")
    const outLabel = FFmpeguFilterLabelRef.create("out")

    expect(
      overlay(
        { x: 0, y: 0 },
        { inputs: [inLabel], outputs: [outLabel] }
      ).getArgs(refs)
    ).toEqual(["[in]overlay=x=0:y=0[out]"])

    expect(
      drawtext(
        { text: "hello" },
        { inputs: [inLabel], outputs: [outLabel] }
      ).getArgs(refs)
    ).toEqual(["[in]drawtext=text=hello[out]"])

    expect(select({ expr: "gte(t,0)" }).getArgs(refs)).toEqual([
      "select=expr=gte(t\\,0)"
    ])
    expect(setpts({ expr: "PTS-STARTPTS" }).getArgs(refs)).toEqual([
      "setpts=expr=PTS-STARTPTS"
    ])
  })

  it("should build audio filters", () => {
    expect(volume({ volume: 0.8 }).getArgs(refs)).toEqual(["volume=volume=0.8"])
    expect(atempo({ tempo: 1.25 }).getArgs(refs)).toEqual(["atempo=tempo=1.25"])
    expect(aresample({ sample_rate: 48000 }).getArgs(refs)).toEqual([
      "aresample=sample_rate=48000"
    ])
    expect(atrim({ start: 1, end: 2 }).getArgs(refs)).toEqual([
      "atrim=start=1:end=2"
    ])
    expect(asetpts({ expr: "PTS-STARTPTS" }).getArgs(refs)).toEqual([
      "asetpts=expr=PTS-STARTPTS"
    ])
    expect(afade({ type: "in", duration: 1 }).getArgs(refs)).toEqual([
      "afade=type=in:duration=1"
    ])
    expect(highpass({ f: 200 }).getArgs(refs)).toEqual(["highpass=f=200"])
    expect(lowpass({ f: 300 }).getArgs(refs)).toEqual(["lowpass=f=300"])
    expect(aformat({ sample_fmts: "fltp" }).getArgs(refs)).toEqual([
      "aformat=sample_fmts=fltp"
    ])
  })
})
