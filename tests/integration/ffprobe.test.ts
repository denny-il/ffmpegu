import { describe, expect, it } from "vitest"
import { ffmpegu } from "../../src/index.ts"

describe.sequential("FFprobe Integration", { timeout: 120_000 }, () => {
  const runner = ffmpegu.createFFprobeRunner("ffprobe")

  it("should validate ffprobe binary", async () => {
    await expect(runner.validateBinary()).resolves.not.toThrow()
  })

  it("should probe file and parse json", async () => {
    const command = ffmpegu.probe.fromFile("./assets/video.mp4")
    const result = await runner.run(command)
    expect(result.code).toBe(0)
    expect(result.result).toBeDefined()
    expect(result.result).toMatchObject({
      format: expect.any(Object),
      streams: expect.any(Array)
    })
  })

  it("should surface parse errors from non-ffprobe output", async () => {
    const echoRunner = ffmpegu.createFFprobeRunner("/bin/echo")
    const command = ffmpegu.probe.fromFile("./assets/video.mp4")

    await expect(echoRunner.run(command)).rejects.toThrow(
      "Failed to parse ffprobe JSON output"
    )
  })
})
