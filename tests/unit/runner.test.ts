import { beforeEach, describe, expect, it } from "vitest"
import { FFmpegTranscodeCommand } from "../../src/command.js"
import { FFmpegRunner } from "../../src/runner.js"

describe("FFmpegRunner", () => {
  let runner: FFmpegRunner

  beforeEach(() => {
    runner = new FFmpegRunner()
  })

  describe("constructor", () => {
    it("should create runner with default paths", () => {
      const runner = new FFmpegRunner()

      expect(runner.ffmpegPath).toBe("ffmpeg")
      expect(runner.ffprobePath).toBe("ffprobe")
    })

    it("should create runner with custom paths", () => {
      const runner = new FFmpegRunner({
        ffmpegPath: "/usr/local/bin/ffmpeg",
        ffprobePath: "/usr/local/bin/ffprobe"
      })

      expect(runner.ffmpegPath).toBe("/usr/local/bin/ffmpeg")
      expect(runner.ffprobePath).toBe("/usr/local/bin/ffprobe")
    })

    it("should handle partial options", () => {
      const runner = new FFmpegRunner({
        ffmpegPath: "/custom/ffmpeg"
      })

      expect(runner.ffmpegPath).toBe("/custom/ffmpeg")
      expect(runner.ffprobePath).toBe("ffprobe")
    })
  })

  describe("validate", () => {
    it("should be a method that returns a Promise<boolean>", () => {
      expect(typeof runner.validate).toBe("function")
      expect(runner.validate()).toBeInstanceOf(Promise)
    })
  })

  describe("run", () => {
    it("should be a method that accepts FFmpegCommand and returns Promise<ExecutionResult>", () => {
      const command = new FFmpegTranscodeCommand({ input: "", output: "" })

      expect(typeof runner.run).toBe("function")
      expect(runner.run(command)).toBeInstanceOf(Promise)
    })
  })

  describe("probe", () => {
    it("should be a method that accepts string and returns Promise<ProbeResult>", () => {
      expect(typeof runner.probe).toBe("function")
      expect(runner.probe("test.mp4")).toBeInstanceOf(Promise)
    })
  })
})
