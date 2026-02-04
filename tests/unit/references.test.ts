import { describe, expect, it } from "vitest"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguOutput } from "../../src/core/output.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"

describe.sequential("References", () => {
  it("should auto-index new references", () => {
    const refs = new FFmpeguReferences()
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const output = FFmpeguOutput.toFile("/test/output.mp4")

    expect(refs.get(input)).toBe(0)
    expect(refs.get(output)).toBe(1)
    expect(refs.get(input)).toBe(0)
    expect(refs.has(input)).toBe(true)
    expect(refs.has(output)).toBe(true)
  })

  it("should throw when setting duplicate references", () => {
    const refs = new FFmpeguReferences()
    const input = FFmpeguInput.fromFile("/test/input.mp4")

    refs.set(input, 0)
    expect(() => refs.set(input, 1)).toThrow()
  })

  it("should throw when setting negative index", () => {
    const refs = new FFmpeguReferences()
    const output = FFmpeguOutput.toFile("/test/output.mp4")

    expect(() => refs.set(output, -1)).toThrow()
  })
})
