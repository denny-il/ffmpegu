import { Duration } from "effect"
import { describe, expect, it } from "vitest"
import { StandaloneReferences } from "../../src/core/references.ts"
import { atrim } from "../../src/filters/common/audio.ts"
import { scale } from "../../src/filters/common/video.ts"
import { Argument, Filter } from "../../src/index.ts"

class DummyArgument extends Argument {
  getArgs(_refs: StandaloneReferences): string[] {
    return ["1", "2"]
  }
}

describe("Filters Core", { concurrent: false }, () => {
  const refs = new StandaloneReferences()

  it("should escape special characters in values", () => {
    const filter = Filter.make("drawtext", {
      text: "a\\b;c'd"
    })

    expect(filter.getArgs(refs)).toEqual([
      String.raw`drawtext=text=a\\\\b\;c\\\'d`
    ])
  })

  it("should render boolean options as 1 or 0", () => {
    const filter = Filter.make("scale", {
      w: 640,
      h: 360,
      interl: true,
      eval: false
    })

    expect(filter.getArgs(refs)).toEqual(["scale=w=640:h=360:interl=1:eval=0"])
  })

  it("should support argument values in options", () => {
    const filter = Filter.make("select", {
      expr: new DummyArgument()
    })

    expect(filter.getArgs(refs)).toEqual(["select=expr=1:2"])
  })

  it("should skip options set to undefined", () => {
    expect(scale({ w: undefined, h: 360 }).getArgs(refs)).toEqual([
      "scale=h=360"
    ])
  })

  it("should reject object values outside the helpers' time keys", () => {
    // A variable skips excess-property checks, so the removed `end_time` key
    // type-checks; its Duration would otherwise render as "2000 millis".
    const options = { start: 0, end_time: Duration.seconds(2) }
    expect(() => atrim(options).getArgs(refs)).toThrow(TypeError)
  })
})
