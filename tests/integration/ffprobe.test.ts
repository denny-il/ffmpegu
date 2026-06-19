import { describe, expect, it } from "vitest"
import { ffmpegu } from "../../src/index.ts"

describe.sequential("FFprobe Integration", { timeout: 120_000 }, () => {
  const runner = ffmpegu.createFFprobeRunner("ffprobe")

  it("should validate ffprobe binary", async () => {
    await expect(runner.validateBinary()).resolves.not.toThrow()
  })

  it("should reject unknown ffprobe binary during validation", async () => {
    const missingRunner = ffmpegu.createFFprobeRunner(
      "ffmpegu-definitely-missing-ffprobe"
    )

    await expect(missingRunner.validateBinary()).rejects.toThrow(
      "ffprobe binary not found"
    )
  })

  it("should probe file and parse json", async () => {
    const command = ffmpegu.probe.fromFile("./assets/video.mp4")
    const result = await runner.run(command)

    expect(result.code).toBe(0)
    expect(result.result).toBeDefined()
    expect(result.result).toMatchObject({
      format: expect.objectContaining({
        format_name: expect.stringContaining("mov")
      }),
      streams: expect.arrayContaining([
        expect.objectContaining({
          codec_type: "video",
          codec_name: "h264",
          width: 640,
          height: 360
        })
      ])
    })

    expect(
      (result.result?.streams ?? []).filter(
        (stream) => stream.codec_type === "audio"
      )
    ).toHaveLength(0)
    expect(result.json).toEqual(result.result)
  })

  it("should surface parse errors from non-ffprobe output", async () => {
    const echoRunner = ffmpegu.createFFprobeRunner("/bin/echo")
    const command = ffmpegu.probe.fromFile("./assets/video.mp4")

    await expect(echoRunner.run(command)).rejects.toThrow(
      "Failed to parse ffprobe JSON output"
    )
  })

  it("should return undefined json when a real process emits empty stdout", async () => {
    const trueRunner = ffmpegu.createFFprobeRunner("true")
    const command = ffmpegu.probe.fromFile("./assets/video.mp4")
    const result = await trueRunner.run(command)

    expect(result.code).toBe(0)
    expect(result.stdout).toBe("")
    expect(result.result).toBeUndefined()
    expect(result.json).toBeUndefined()
  })
})
