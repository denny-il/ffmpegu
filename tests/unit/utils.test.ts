import { describe, expect, it } from "vitest"
import { isTimeObject } from "../../src/utils.ts"

describe.sequential("Utils", () => {
  it("should only treat shaped numeric time objects as time objects", () => {
    expect(isTimeObject({})).toBe(false)
    expect(isTimeObject([])).toBe(false)
    expect(isTimeObject(new Date())).toBe(false)
    expect(isTimeObject({ seconds: 1 })).toBe(true)
  })
})
