import { describe, expect, it } from "vitest"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"

describe.sequential("Stream References", () => {
  const refs = new FFmpeguReferences()

  it("should format stream references", () => {
    const input = FFmpeguInput.fromFile("/test/input.mp4")

    expect(input.video.getArgs(refs)).toEqual(["0:v"])
    expect(input.audio.getArgs(refs)).toEqual(["0:a"])
    expect(input.subtitle.getArgs(refs)).toEqual(["0:s"])
    expect(input.data.getArgs(refs)).toEqual(["0:d"])
  })

  it("should format stream track references", () => {
    const input = FFmpeguInput.fromFile("/test/input.mp4")

    expect(input.video.track(0).getArgs(refs)).toEqual(["1:v:0"])
    expect(input.audio.track(2).getArgs(refs)).toEqual(["1:a:2"])
  })

  it("should reject negative track indices", () => {
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    expect(() => input.video.track(-1)).toThrow()
  })
})
