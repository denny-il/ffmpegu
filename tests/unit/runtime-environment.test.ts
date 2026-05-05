import { describe, expect, it } from "vitest"

describe("Runtime environment", () => {
  it("should run tests on the supported Node major version", () => {
    const major = Number(process.versions.node.split(".")[0])

    expect(major).toBeGreaterThanOrEqual(24)
  })
})
