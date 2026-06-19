import defaultFFmpegu, { ffmpegu } from "../../src/index.ts"
import { describe, expect, it } from "vitest"

describe.sequential("Public API", () => {
  it("should expose the default and named namespace API", async () => {
    expect(defaultFFmpegu).toBe(ffmpegu)
    expect(ffmpegu.command).toBeTypeOf("function")
    expect(ffmpegu.input.fromFile).toBeTypeOf("function")
    expect(ffmpegu.output.toFile).toBeTypeOf("function")
    expect(ffmpegu.probe.fromFile).toBeTypeOf("function")

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("input.mp4")],
      outputs: [ffmpegu.output.toFile("output.mp4")]
    })

    await expect(command.compile()).resolves.toMatchObject({
      args: ["-y", "-i", "input.mp4", "output.mp4"]
    })
  })
})
