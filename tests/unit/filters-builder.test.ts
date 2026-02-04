import { describe, expect, it } from "vitest"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { FFmpeguFilterBuilder } from "../../src/filters/builder.ts"
import { FFmpeguFilterLabelRef } from "../../src/filters/label.ts"
import { FFmpeguSimpleFilter } from "../../src/filters/simple.ts"

describe.sequential("Filters Builder", () => {
  const refs = new FFmpeguReferences()

  it("should build a graph from chained filters", () => {
    const builder = FFmpeguFilterBuilder.create()
    const graph = builder
      .chain(FFmpeguSimpleFilter.create("scale", { w: 320, h: 180 }))
      .chain(FFmpeguSimpleFilter.create("fps", { fps: 30 }))
      .build()

    expect(graph.getArgs(refs)).toEqual(["scale=w=320:h=180;fps=fps=30"])
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
