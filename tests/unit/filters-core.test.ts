import { describe, expect, it } from "vitest"
import { FFmpeguArgument } from "../../src/core/argument.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { FFmpeguSimpleFilter } from "../../src/filters/simple.ts"

class DummyArgument extends FFmpeguArgument {
  getArgs(_refs: FFmpeguReferences): string[] {
    return ["1", "2"]
  }
}

describe.sequential("Filters Core", () => {
  const refs = new FFmpeguReferences()

  it("should escape special characters in values", () => {
    const filter = FFmpeguSimpleFilter.create("drawtext", {
      text: "a\\b;c'd"
    })

    expect(filter.getArgs(refs)).toEqual(["drawtext=text=a\\\\b\\;c\\'d"])
  })

  it("should include boolean options only when true", () => {
    const filter = FFmpeguSimpleFilter.create("scale", {
      w: 640,
      h: 360,
      interl: true,
      eval: false
    })

    expect(filter.getArgs(refs)).toEqual(["scale=w=640:h=360:interl"])
  })

  it("should support argument values in options", () => {
    const filter = FFmpeguSimpleFilter.create("select", {
      expr: new DummyArgument()
    })

    expect(filter.getArgs(refs)).toEqual(["select=expr=1:2"])
  })
})
