import { describe, expect, it } from "vitest"
import { FFmpeguArgument } from "../../src/core/argument.ts"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { FFmpeguFilterChain } from "../../src/filters/chain.ts"
import { FFmpeguFilterLabelRef } from "../../src/filters/label.ts"
import { FFmpeguSimpleFilter } from "../../src/filters/simple.ts"
import { FFmpeguFilterGraph } from "../../src/index.ts"

describe.sequential("Filters", () => {
  const refs = new FFmpeguReferences()

  class DummyArgument extends FFmpeguArgument {
    getArgs(): string[] {
      return ["1", "2"]
    }
  }

  it("should build a simple filter with options", () => {
    const filter = FFmpeguSimpleFilter.create("scale", { w: 640, h: 360 })
    expect(filter.getArgs(refs)).toEqual(["scale=w=640:h=360"])
  })

  it("should build a filter with labels", () => {
    const filter = FFmpeguSimpleFilter.create(
      "overlay",
      { x: 0, y: 0 },
      [
        FFmpeguFilterLabelRef.create("main"),
        FFmpeguFilterLabelRef.create("logo")
      ],
      [FFmpeguFilterLabelRef.create("out")]
    )

    expect(filter.getArgs(refs)).toEqual(["[main][logo]overlay=x=0:y=0[out]"])
  })

  it("should escape filter option values", () => {
    const filter = FFmpeguSimpleFilter.create("drawtext", {
      text: "hello:world"
    })

    expect(filter.getArgs(refs)).toEqual(["drawtext=text=hello\\:world"])
  })

  it("should escape special characters in options", () => {
    const filter = FFmpeguSimpleFilter.create("drawtext", {
      text: "a,b;[c]\\'d"
    })

    expect(filter.getArgs(refs)).toEqual([
      "drawtext=text=a\\,b\\;\\[c\\]\\\\\\'d"
    ])
  })

  it("should escape select expressions", () => {
    const filter = FFmpeguSimpleFilter.create("select", {
      expr: "between(t,0,1)"
    })

    expect(filter.getArgs(refs)).toEqual(["select=expr=between(t\\,0\\,1)"])
  })

  it("should include boolean options when true", () => {
    const filter = FFmpeguSimpleFilter.create("scale", {
      w: 640,
      h: 360,
      eval: true
    })

    expect(filter.getArgs(refs)).toEqual(["scale=w=640:h=360:eval"])
  })

  it("should omit boolean options when false", () => {
    const filter = FFmpeguSimpleFilter.create("scale", {
      w: 640,
      h: 360,
      eval: false
    })

    expect(filter.getArgs(refs)).toEqual(["scale=w=640:h=360"])
  })

  it("should support argumentable option values", () => {
    const filter = FFmpeguSimpleFilter.create("fps", {
      fps: new DummyArgument()
    })

    expect(filter.getArgs(refs)).toEqual(["fps=fps=1:2"])
  })

  it("should render multiple input and output labels", () => {
    const filter = FFmpeguSimpleFilter.create(
      "overlay",
      { x: 10, y: 20 },
      [
        FFmpeguFilterLabelRef.create("left"),
        FFmpeguFilterLabelRef.create("right")
      ],
      [
        FFmpeguFilterLabelRef.create("out1"),
        FFmpeguFilterLabelRef.create("out2")
      ]
    )

    expect(filter.getArgs(refs)).toEqual([
      "[left][right]overlay=x=10:y=20[out1][out2]"
    ])
  })

  it("should build a filter chain", () => {
    const scale = FFmpeguSimpleFilter.create("scale", { w: 640, h: 360 })
    const fps = FFmpeguSimpleFilter.create("fps", { fps: 30 })
    const chain = FFmpeguFilterChain.create(scale, fps)

    expect(chain.getArgs(refs)).toEqual(["scale=w=640:h=360,fps=fps=30"])
  })

  it("should build a filter graph", () => {
    const chain1 = FFmpeguFilterChain.create(
      FFmpeguSimpleFilter.create("scale", { w: 640, h: 360 })
    )
    const chain2 = FFmpeguFilterChain.create(
      FFmpeguSimpleFilter.create("volume", { volume: 0.8 })
    )
    const graph = FFmpeguFilterGraph.create(chain1, chain2)

    expect(graph.getArgs(refs)).toEqual(["scale=w=640:h=360;volume=volume=0.8"])
  })

  it("should render labels from input stream references", () => {
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const labelVideo = FFmpeguFilterLabelRef.create(input.video)
    const labelAudioTrack = FFmpeguFilterLabelRef.create(input.audio.track(1))

    expect(labelVideo.getArgs(refs)).toEqual(["[0:v]"])
    expect(labelAudioTrack.getArgs(refs)).toEqual(["[0:a:1]"])
  })

  it("should build a graph with labeled chains", () => {
    const aLabel = FFmpeguFilterLabelRef.create("a")
    const bLabel = FFmpeguFilterLabelRef.create("b")
    const out1Label = FFmpeguFilterLabelRef.create("out1")
    const out2Label = FFmpeguFilterLabelRef.create("out2")

    const chain1 = FFmpeguFilterChain.create(
      FFmpeguSimpleFilter.create("split", { outputs: 2 }, [], [aLabel, bLabel])
    )
    const chain2 = FFmpeguFilterChain.create(
      FFmpeguSimpleFilter.create(
        "scale",
        { w: 320, h: 180 },
        [aLabel],
        [out1Label]
      )
    )
    const chain3 = FFmpeguFilterChain.create(
      FFmpeguSimpleFilter.create(
        "scale",
        { w: 160, h: 90 },
        [bLabel],
        [out2Label]
      )
    )

    const graph = FFmpeguFilterGraph.create(chain1, chain2, chain3)

    expect(graph.getArgs(refs)).toEqual([
      "split=outputs=2[a][b];[a]scale=w=320:h=180[out1];[b]scale=w=160:h=90[out2]"
    ])
  })
})
