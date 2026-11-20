import { describe, expect, it } from "vitest"
import { StandaloneReferences } from "../../src/core/references.ts"
import { Input } from "../../src/index.ts"

describe("Stream References", { concurrent: false }, () => {
  const refs = new StandaloneReferences()

  it("should format stream references", () => {
    const input = Input.fromFile("/test/input.mp4")

    expect(input.video.getArgs(refs)).toEqual(["0:v"])
    expect(input.audio.getArgs(refs)).toEqual(["0:a"])
    expect(input.subtitle.getArgs(refs)).toEqual(["0:s"])
    expect(input.data.getArgs(refs)).toEqual(["0:d"])
  })

  it("should format stream track references", () => {
    const input = Input.fromFile("/test/input.mp4")

    expect(input.video.track(0).getArgs(refs)).toEqual(["1:v:0"])
    expect(input.audio.track(2).getArgs(refs)).toEqual(["1:a:2"])
  })

  it("should reject invalid track indices when rendered", () => {
    const input = Input.fromFile("/test/input.mp4")
    const negative = input.video.track(-1)
    const fractional = input.audio.track(1.5)

    expect(() => negative.getArgs(refs)).toThrow(RangeError)
    expect(() => fractional.getArgs(refs)).toThrow(RangeError)
    expect(() => input.video.track(2147483648).getArgs(refs)).toThrow(
      RangeError
    )
  })

  it("should accept the largest index FFmpeg can parse", () => {
    const input = Input.fromFile("/test/input.mp4")

    expect(input.video.track(2147483647).getArgs(refs)).toEqual([
      `${refs.get(input)}:v:2147483647`
    ])
  })
})
