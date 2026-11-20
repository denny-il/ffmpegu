import { describe, expect, it } from "vitest"
import { StandaloneReferences } from "../../src/core/references.ts"
import { Input, Output } from "../../src/index.ts"

describe("References", { concurrent: false }, () => {
  it("should auto-index new references", () => {
    const refs = new StandaloneReferences()
    const input = Input.fromFile("/test/input.mp4")
    const output = Output.toFile("/test/output.mp4")

    expect(refs.get(input)).toBe(0)
    expect(refs.get(output)).toBe(1)
    expect(refs.get(input)).toBe(0)
    expect(refs.has(input)).toBe(true)
    expect(refs.has(output)).toBe(true)
  })

  it("should throw when setting duplicate references", () => {
    const refs = new StandaloneReferences()
    const input = Input.fromFile("/test/input.mp4")

    refs.set(input, 0)
    expect(() => refs.set(input, 1)).toThrow()
  })

  it("should throw when setting negative index", () => {
    const refs = new StandaloneReferences()
    const output = Output.toFile("/test/output.mp4")

    expect(() => refs.set(output, -1)).toThrow()
  })
})
