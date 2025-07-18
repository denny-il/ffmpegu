import { describe, expect, it } from "vitest"
import { FFmpegTranscodeCommand } from "../../src/command.js"

describe("FFmpegCommand", () => {
  describe("constructor", () => {
    it("should create command with default options", () => {
      const command = new FFmpegTranscodeCommand({
        input: undefined as any,
        output: undefined as any
      })

      expect(command.input).toBeUndefined()
      expect(command.inputOptions).toEqual([])
      expect(command.output).toBeUndefined()
      expect(command.outputOptions).toEqual([])
    })

    it("should create command with provided options", () => {
      const options = {
        input: "input.mp4",
        inputOptions: ["-ss", "00:01:00"],
        output: "output.mp4",
        outputOptions: ["-t", "10", "-vcodec", "libx264"]
      }

      const command = new FFmpegTranscodeCommand(options)

      expect(command.input).toBe("input.mp4")
      expect(command.inputOptions).toEqual(["-ss", "00:01:00"])
      expect(command.output).toBe("output.mp4")
      expect(command.outputOptions).toEqual(["-t", "10", "-vcodec", "libx264"])
    })

    it("should freeze options arrays to make them immutable", () => {
      const inputOptions = ["-ss", "00:01:00"]
      const outputOptions = ["-t", "10"]

      const command = new FFmpegTranscodeCommand({
        input: "input.mp4",
        output: "output.mp4",
        inputOptions,
        outputOptions
      })

      expect(Object.isFrozen(command.inputOptions)).toBe(true)
      expect(Object.isFrozen(command.outputOptions)).toBe(true)
    })
  })

  describe("toArgs", () => {
    it("should generate correct args for file-based input/output", () => {
      const command = new FFmpegTranscodeCommand({
        input: "input.mp4",
        inputOptions: ["-ss", "00:01:00"],
        output: "output.mp4",
        outputOptions: ["-t", "10", "-vcodec", "libx264"]
      })

      const args = command.toArgs()

      expect(args).toEqual([
        "-ss",
        "00:01:00", // input options
        "-i",
        "input.mp4", // input
        "-t",
        "10",
        "-vcodec",
        "libx264", // output options
        "output.mp4" // output
      ])
    })

    it("should handle missing input and output", () => {
      const command = new FFmpegTranscodeCommand({
        input: undefined as any,
        output: undefined as any,
        inputOptions: ["-f", "lavfi"],
        outputOptions: ["-t", "5"]
      })

      const args = command.toArgs()

      expect(args).toEqual([
        "-f",
        "lavfi", // input options
        "-t",
        "5" // output options
      ])
    })

    it("should use pipe:0 for stream input", () => {
      const mockStream = { pipe: () => {} }
      const command = new FFmpegTranscodeCommand({
        input: mockStream as any,
        output: "output.mp4"
      })

      const args = command.toArgs()

      expect(args).toEqual(["-i", "pipe:0", "output.mp4"])
    })

    it("should use pipe:1 for stream output", () => {
      const mockStream = { write: () => {} }
      const command = new FFmpegTranscodeCommand({
        input: "input.mp4",
        output: mockStream as any
      })

      const args = command.toArgs()

      expect(args).toEqual(["-i", "input.mp4", "pipe:1"])
    })
  })

  describe("usesStdin", () => {
    it("should return false for string input", () => {
      const command = new FFmpegTranscodeCommand({
        input: "input.mp4",
        output: "output.mp4"
      })
      expect(command.usesStdin).toBe(false)
    })

    it("should return false for undefined input", () => {
      const command = new FFmpegTranscodeCommand({
        input: undefined as any,
        output: "output.mp4"
      })
      expect(command.usesStdin).toBe(false)
    })

    it("should return true for stream input", () => {
      const mockStream = { pipe: () => {} }
      const command = new FFmpegTranscodeCommand({
        input: mockStream as any,
        output: "output.mp4"
      })
      expect(command.usesStdin).toBe(true)
    })
  })

  describe("usesStdout", () => {
    it("should return false for string output", () => {
      const command = new FFmpegTranscodeCommand({
        input: "input.mp4",
        output: "output.mp4"
      })
      expect(command.usesStdout).toBe(false)
    })

    it("should return false for undefined output", () => {
      const command = new FFmpegTranscodeCommand({
        input: "input.mp4",
        output: undefined as any
      })
      expect(command.usesStdout).toBe(false)
    })

    it("should return true for stream output", () => {
      const mockStream = { write: () => {} }
      const command = new FFmpegTranscodeCommand({
        input: "input.mp4",
        output: mockStream as any
      })
      expect(command.usesStdout).toBe(true)
    })
  })
})
