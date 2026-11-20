import { describe, expect, it } from "vitest"
import { StandaloneReferences } from "../../src/core/references.ts"
import { Argument, Filter, Input } from "../../src/index.ts"

describe("Filters", { concurrent: false }, () => {
  const refs = new StandaloneReferences()

  class DummyArgument extends Argument {
    getArgs(): string[] {
      return ["1", "2"]
    }
  }

  it("should build a simple filter with options", () => {
    const filter = Filter.make("scale", { w: 640, h: 360 })
    expect(filter.getArgs(refs)).toEqual(["scale=w=640:h=360"])
  })

  it("should build a filter with labels", () => {
    const filter = Filter.make(
      "overlay",
      { x: 0, y: 0 },
      {
        inputs: [Filter.label("main"), Filter.label("logo")],
        outputs: [Filter.label("out")]
      }
    )

    expect(filter.getArgs(refs)).toEqual(["[main][logo]overlay=x=0:y=0[out]"])
  })

  it("should escape filter option values", () => {
    const filter = Filter.make("drawtext", {
      text: "hello:world"
    })

    expect(filter.getArgs(refs)).toEqual([
      String.raw`drawtext=text=hello\\:world`
    ])
  })

  it("should escape special characters in options", () => {
    const filter = Filter.make("drawtext", {
      text: "a,b;[c]\\'d"
    })

    expect(filter.getArgs(refs)).toEqual([
      String.raw`drawtext=text=a\,b\;\[c\]\\\\\\\'d`
    ])
  })

  it("should escape select expressions", () => {
    const filter = Filter.make("select", {
      expr: "between(t,0,1)"
    })

    expect(filter.getArgs(refs)).toEqual(["select=expr=between(t\\,0\\,1)"])
  })

  it("should render true boolean options as 1", () => {
    const filter = Filter.make("scale", {
      w: 640,
      h: 360,
      eval: true
    })

    expect(filter.getArgs(refs)).toEqual(["scale=w=640:h=360:eval=1"])
  })

  it("should render false boolean options as 0", () => {
    const filter = Filter.make("scale", {
      w: 640,
      h: 360,
      eval: false
    })

    expect(filter.getArgs(refs)).toEqual(["scale=w=640:h=360:eval=0"])
  })

  it("should support argumentable option values", () => {
    const filter = Filter.make("fps", {
      fps: new DummyArgument()
    })

    expect(filter.getArgs(refs)).toEqual(["fps=fps=1:2"])
  })

  it("should render multiple input and output labels", () => {
    const filter = Filter.make(
      "overlay",
      { x: 10, y: 20 },
      {
        inputs: [Filter.label("left"), Filter.label("right")],
        outputs: [Filter.label("out1"), Filter.label("out2")]
      }
    )

    expect(filter.getArgs(refs)).toEqual([
      "[left][right]overlay=x=10:y=20[out1][out2]"
    ])
  })

  it("should build a filter chain", () => {
    const scale = Filter.make("scale", { w: 640, h: 360 })
    const fps = Filter.make("fps", { fps: 30 })
    const chain = Filter.chain(scale, fps)

    expect(chain.getArgs(refs)).toEqual(["scale=w=640:h=360,fps=fps=30"])
  })

  it("should build a filter graph", () => {
    const chain1 = Filter.chain(Filter.make("scale", { w: 640, h: 360 }))
    const chain2 = Filter.chain(Filter.make("volume", { volume: 0.8 }))
    const graph = Filter.graph(chain1, chain2)

    expect(graph.getArgs(refs)).toEqual(["scale=w=640:h=360;volume=volume=0.8"])
  })

  it("should accept names and stream references as labels", () => {
    const input = Input.fromFile("/test/input.mp4")
    const filter = Filter.overlay(
      { x: 0 },
      {
        inputs: [input.video, "logo", Filter.label(input.video.track(1))],
        outputs: ["out"]
      }
    )

    // A resolver of its own: the shared one numbers inputs across tests.
    expect(filter.getArgs(new StandaloneReferences())).toEqual([
      "[0:v][logo][0:v:1]overlay=x=0[out]"
    ])
  })

  it("should treat a filter in a graph as a chain of its own", () => {
    const graph = Filter.graph(
      Filter.make("split", {}, { outputs: ["a", "b"] }),
      Filter.chain(Filter.scale({ w: 320 }, { inputs: ["a"] }), Filter.hflip())
    )

    expect(graph.getArgs(refs)).toEqual(["split[a][b];[a]scale=w=320,hflip"])
  })

  it("should render labels from input stream references", () => {
    const input = Input.fromFile("/test/input.mp4")
    const labelVideo = Filter.label(input.video)
    const labelAudioTrack = Filter.label(input.audio.track(1))

    expect(labelVideo.getArgs(refs)).toEqual(["[0:v]"])
    expect(labelAudioTrack.getArgs(refs)).toEqual(["[0:a:1]"])
  })

  it("should build a graph with labeled chains", () => {
    const aLabel = Filter.label("a")
    const bLabel = Filter.label("b")
    const out1Label = Filter.label("out1")
    const out2Label = Filter.label("out2")

    const chain1 = Filter.chain(
      Filter.make("split", { outputs: 2 }, { outputs: [aLabel, bLabel] })
    )
    const chain2 = Filter.chain(
      Filter.make(
        "scale",
        { w: 320, h: 180 },
        { inputs: [aLabel], outputs: [out1Label] }
      )
    )
    const chain3 = Filter.chain(
      Filter.make(
        "scale",
        { w: 160, h: 90 },
        { inputs: [bLabel], outputs: [out2Label] }
      )
    )

    const graph = Filter.graph(chain1, chain2, chain3)

    expect(graph.getArgs(refs)).toEqual([
      "split=outputs=2[a][b];[a]scale=w=320:h=180[out1];[b]scale=w=160:h=90[out2]"
    ])
  })
})
