import { describe, expect, it } from "vitest"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { FFmpeguFilterBuilder } from "../../src/filters/builder.ts"
import { FFmpeguFilterChain } from "../../src/filters/chain.ts"
import { FFmpeguFilterGraph } from "../../src/filters/graph.ts"
import { FFmpeguFilterLabelRef } from "../../src/filters/label.ts"
import { FFmpeguSimpleFilter } from "../../src/filters/simple.ts"

describe("Filters Builder", { concurrent: false }, () => {
  const refs = new FFmpeguReferences()

  it("should build a graph from chained filters", () => {
    const builder = FFmpeguFilterBuilder.create()
    const graph = builder
      .chain(FFmpeguSimpleFilter.create("scale", { w: 320, h: 180 }))
      .chain(FFmpeguSimpleFilter.create("fps", { fps: 30 }))
      .build()

    expect(graph.getArgs(refs)).toEqual(["scale=w=320:h=180;fps=fps=30"])
  })

  it("should not change a builder when chaining from it", () => {
    const base = FFmpeguFilterBuilder.create().chain(
      FFmpeguSimpleFilter.create("scale", { w: 320, h: 180 })
    )
    const withFps = base.chain(FFmpeguSimpleFilter.create("fps", { fps: 30 }))
    const withFlip = base.chain(FFmpeguSimpleFilter.create("hflip"))

    expect(base.build().getArgs(refs)).toEqual(["scale=w=320:h=180"])
    expect(withFps.build().getArgs(refs)).toEqual([
      "scale=w=320:h=180;fps=fps=30"
    ])
    expect(withFlip.build().getArgs(refs)).toEqual(["scale=w=320:h=180;hflip"])
  })

  it("should not change when the values passed to constructors change", () => {
    const options: Record<string, number> = { w: 320 }
    const inputs = [FFmpeguFilterLabelRef.create("in")]
    const outputs = [FFmpeguFilterLabelRef.create("out")]
    const filters = [
      FFmpeguSimpleFilter.create("scale", options, inputs, outputs)
    ]
    const chains = [new FFmpeguFilterChain(filters)]
    const graph = new FFmpeguFilterGraph(chains)
    const builder = new FFmpeguFilterBuilder(chains)

    options.w = 640
    options.h = 360
    inputs.push(FFmpeguFilterLabelRef.create("extra_in"))
    outputs.push(FFmpeguFilterLabelRef.create("extra_out"))
    filters.push(FFmpeguSimpleFilter.create("hflip"))
    chains.push(FFmpeguFilterChain.create(FFmpeguSimpleFilter.create("vflip")))

    expect(graph.getArgs(refs)).toEqual(["[in]scale=w=320[out]"])
    expect(builder.build().getArgs(refs)).toEqual(["[in]scale=w=320[out]"])
  })

  it("should create custom filters via builder", () => {
    const builder = FFmpeguFilterBuilder.create()
    const filter = builder.custom("crop", { w: 640, h: 360 })

    expect(filter.getArgs(refs)).toEqual(["crop=w=640:h=360"])
  })

  it("should resolve label refs from strings and streams", () => {
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const label = FFmpeguFilterLabelRef.create("out")
    const streamLabel = FFmpeguFilterLabelRef.create(input.video)

    expect(label.getArgs(refs)).toEqual(["[out]"])
    expect(streamLabel.getArgs(refs)).toEqual(["[0:v]"])
  })
})
