import { createReadStream, createWriteStream, existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough, Readable } from "node:stream"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FFmpegTranscodeCommand } from "../../src/command.js"
import { FFmpegRunner } from "../../src/runner.js"

describe("FFmpeg Integration Tests", () => {
  let runner: FFmpegRunner
  let tempDir: string
  let assetDir: string

  beforeEach(async () => {
    runner = new FFmpegRunner()
    tempDir = await mkdtemp(join(tmpdir(), "ffmpeg-test-"))
    assetDir = join(process.cwd(), "assets")
  })

  afterEach(async () => {
    if (tempDir && existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  describe("validation", () => {
    it("should validate FFmpeg binaries are available", async () => {
      const isValid = await runner.validate()
      expect(isValid).toBe(true)
    })

    it("should fail validation with invalid binary paths", async () => {
      const invalidRunner = new FFmpegRunner({
        ffmpegPath: "/nonexistent/ffmpeg",
        ffprobePath: "/nonexistent/ffprobe"
      })

      const isValid = await invalidRunner.validate()
      expect(isValid).toBe(false)
    })
  })

  describe("probe functionality", () => {
    it("should probe video file and return structured data", async () => {
      const videoPath = join(assetDir, "video.mp4")
      const result = await runner.probe(videoPath)

      expect(result.raw).toBeDefined()
      expect(result.data).toBeDefined()
      expect(typeof result.raw).toBe("string")
      expect(typeof result.data).toBe("object")

      // Verify it's valid JSON
      const parsed = JSON.parse(result.raw)
      expect(parsed).toEqual(result.data)
    })

    it("should probe audio file and return structured data", async () => {
      const audioPath = join(assetDir, "audio.mp3")
      const result = await runner.probe(audioPath)

      expect(result.raw).toBeDefined()
      expect(result.data).toBeDefined()
      expect(typeof result.raw).toBe("string")
      expect(typeof result.data).toBe("object")
    })

    it("should handle nonexistent file gracefully", async () => {
      const nonexistentPath = join(tempDir, "nonexistent.mp4")

      await expect(runner.probe(nonexistentPath)).rejects.toThrow()
    })

    it("should handle invalid media file", async () => {
      const invalidPath = join(tempDir, "invalid.txt")
      await writeFile(invalidPath, "This is not a media file")

      await expect(runner.probe(invalidPath)).rejects.toThrow()
    })
  })

  describe("file-to-file operations", () => {
    it("should handle successful file conversion", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "output.mp4")

      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: outputPath,
        outputOptions: ["-c", "copy", "-t", "1"] // Copy codecs, limit to 1 second
      })

      const result = await runner.run(command)

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)
    })

    it("should handle file operation errors", async () => {
      const inputPath = join(tempDir, "nonexistent.mp4")
      const outputPath = join(tempDir, "output.mp4")

      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: outputPath,
        outputOptions: ["-c", "copy"]
      })

      const result = await runner.run(command)

      expect(result.success).toBe(false)
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("No such file or directory")
    })

    it("should handle invalid output path", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = "/invalid/path/output.mp4"

      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: outputPath,
        outputOptions: ["-c", "copy", "-t", "1"]
      })

      const result = await runner.run(command)

      expect(result.success).toBe(false)
      expect(result.exitCode).not.toBe(0)
    })
  })

  describe("stream handling", () => {
    it("should handle readable stream input to file output", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "stream-output.mp4")
      const inputStream = createReadStream(inputPath)

      const command = new FFmpegTranscodeCommand({
        input: inputStream,
        output: outputPath,
        outputOptions: ["-c", "copy", "-t", "1"]
      })

      const result = await runner.run(command)

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)
    })

    it("should handle file input to writable stream output", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "stream-output.ts")
      const outputStream = createWriteStream(outputPath)

      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: outputStream,
        outputOptions: ["-c", "copy", "-t", "1", "-f", "mpegts"]
      })

      const result = await runner.run(command)

      // Close the stream if it's still open
      if (!outputStream.writableEnded) {
        outputStream.end()
      }

      // Wait for stream to finish writing
      await new Promise<void>((resolve, reject) => {
        if (outputStream.writableEnded) {
          resolve()
        } else {
          outputStream.on("finish", () => resolve())
          outputStream.on("close", () => resolve())
          outputStream.on("error", reject)
        }
      })

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)
    })

    it("should handle stream-to-stream operations", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "stream-to-stream.ts")

      const inputStream = createReadStream(inputPath)
      const outputStream = createWriteStream(outputPath)

      const command = new FFmpegTranscodeCommand({
        input: inputStream,
        output: outputStream,
        outputOptions: ["-c", "copy", "-t", "1", "-f", "mpegts"]
      })

      const result = await runner.run(command)

      // Close the stream if it's still open
      if (!outputStream.writableEnded) {
        outputStream.end()
      }

      // Wait for stream to finish writing
      await new Promise<void>((resolve, reject) => {
        if (outputStream.writableEnded) {
          resolve()
        } else {
          outputStream.on("finish", () => resolve())
          outputStream.on("close", () => resolve())
          outputStream.on("error", reject)
        }
      })

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)
    })

    it("should handle PassThrough streams", async () => {
      const inputPath = join(assetDir, "audio.mp3")
      const outputPath = join(tempDir, "passthrough-output.mp3")

      const passthroughInput = new PassThrough()
      const passthroughOutput = new PassThrough()
      const outputFileStream = createWriteStream(outputPath)

      // Pipe the output stream to file
      passthroughOutput.pipe(outputFileStream)

      const command = new FFmpegTranscodeCommand({
        input: passthroughInput,
        output: passthroughOutput,
        outputOptions: ["-c", "copy", "-t", "1", "-f", "mp3"]
      })

      // Start the FFmpeg process
      const runPromise = runner.run(command)

      // Pipe input file to the PassThrough stream after a small delay
      // to ensure FFmpeg is ready
      setTimeout(() => {
        const inputFileStream = createReadStream(inputPath)
        inputFileStream.pipe(passthroughInput)

        inputFileStream.on("error", (error) => {
          console.warn("Input file stream error:", error.message)
        })
      }, 100)

      const result = await runPromise

      // Wait for output file to be written
      await new Promise<void>((resolve) => {
        if (outputFileStream.writableEnded) {
          resolve()
        } else {
          outputFileStream.on("finish", () => resolve())
          outputFileStream.on("close", () => resolve())
        }
      })

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)
    })

    it("should handle stream errors gracefully", async () => {
      const outputPath = join(tempDir, "error-output.mp4")

      // Create a readable stream that will error after a delay
      const errorStream = new Readable({
        read() {
          // Error after a small delay to let FFmpeg start
          setTimeout(() => {
            this.emit("error", new Error("Stream error"))
          }, 100)
        }
      })

      const command = new FFmpegTranscodeCommand({
        input: errorStream,
        output: outputPath,
        outputOptions: ["-c", "copy", "-f", "mp4"]
      })

      // This should handle the error and reject
      await expect(runner.run(command)).rejects.toThrow("Stream error")
    })
  })

  describe("command options handling", () => {
    it("should handle input options correctly", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "input-options.mp4")

      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        inputOptions: ["-ss", "0"], // Seek to start
        output: outputPath,
        outputOptions: ["-c", "copy", "-t", "1"]
      })

      const result = await runner.run(command)

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)
    })

    it("should handle complex output options", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "complex-options.mp4")

      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: outputPath,
        outputOptions: [
          "-c:v",
          "copy",
          "-c:a",
          "copy",
          "-t",
          "1",
          "-avoid_negative_ts",
          "make_zero"
        ]
      })

      const result = await runner.run(command)

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)
    })

    it("should handle invalid options gracefully", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "invalid-options.mp4")

      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: outputPath,
        outputOptions: ["-invalid_option", "value"]
      })

      const result = await runner.run(command)

      expect(result.success).toBe(false)
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("Unrecognized option")
    })
  })

  describe("execution result handling", () => {
    it("should capture stderr output for successful operations", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "stderr-test.mp4")

      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: outputPath,
        outputOptions: ["-c", "copy", "-t", "1"]
      })

      const result = await runner.run(command)

      expect(result.success).toBe(true)
      expect(result.stderr).toBeDefined()
      expect(result.stderr.length).toBeGreaterThan(0)
      // FFmpeg typically outputs progress info to stderr
      expect(result.stderr).toMatch(/time=|frame=|speed=/)
    })

    it("should handle commands with no output", async () => {
      const inputPath = join(assetDir, "video.mp4")

      // Use -f null to discard output
      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: "-",
        outputOptions: ["-t", "1", "-f", "null"]
      })

      const result = await runner.run(command)

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
    })

    it("should timeout on hanging operations", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const outputPath = join(tempDir, "timeout-test.mp4")

      // This should complete quickly due to -t 1
      const command = new FFmpegTranscodeCommand({
        input: inputPath,
        output: outputPath,
        outputOptions: ["-c", "copy", "-t", "1"]
      })

      const startTime = Date.now()
      const result = await runner.run(command)
      const endTime = Date.now()

      expect(result.success).toBe(true)
      expect(endTime - startTime).toBeLessThan(5000) // Should complete in less than 5 seconds
    })
  })

  describe("concurrent operations", () => {
    it("should handle multiple concurrent operations", async () => {
      const inputPath = join(assetDir, "video.mp4")
      const operations = Array.from({ length: 3 }, (_, i) => {
        const outputPath = join(tempDir, `concurrent-${i}.mp4`)
        const command = new FFmpegTranscodeCommand({
          input: inputPath,
          output: outputPath,
          outputOptions: ["-c", "copy", "-t", "1"]
        })
        return runner.run(command)
      })

      const results = await Promise.all(operations)

      results.forEach((result, i) => {
        expect(result.success).toBe(true)
        expect(result.exitCode).toBe(0)
        expect(existsSync(join(tempDir, `concurrent-${i}.mp4`))).toBe(true)
      })
    })

    it("should handle mixed success/failure concurrent operations", async () => {
      const validInputPath = join(assetDir, "video.mp4")
      const invalidInputPath = join(tempDir, "nonexistent.mp4")

      const operations = [
        runner.run(
          new FFmpegTranscodeCommand({
            input: validInputPath,
            output: join(tempDir, "success.mp4"),
            outputOptions: ["-c", "copy", "-t", "1"]
          })
        ),
        runner.run(
          new FFmpegTranscodeCommand({
            input: invalidInputPath,
            output: join(tempDir, "failure.mp4"),
            outputOptions: ["-c", "copy"]
          })
        )
      ]

      const results = await Promise.all(operations)

      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
    })
  })
})
