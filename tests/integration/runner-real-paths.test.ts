import { chmod, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { PassThrough, Writable } from "node:stream"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { ffmpegu } from "../../src/index.ts"

describe.sequential("Runner Real Paths", { timeout: 120_000 }, () => {
  const runner = ffmpegu.createFFmpegRunner("ffmpeg")
  const testOutputDir = "./tests/__output-runner-real-paths"
  const outputPath = (...parts: string[]) => join(testOutputDir, ...parts)

  const waitForEvent = (
    emitter: { once: (event: string, listener: () => void) => unknown },
    event: string
  ) =>
    new Promise<void>((resolve) => {
      emitter.once(event, () => resolve())
    })

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms)
    })

  const waitFor = async (
    predicate: () => boolean,
    message: string,
    timeoutMs = 10_000
  ) => {
    const startedAt = Date.now()

    while (!predicate()) {
      if (Date.now() - startedAt > timeoutMs) throw new Error(message)
      await wait(5)
    }
  }

  const settlesWithin = async (promise: Promise<unknown>, ms: number) => {
    const timeout = Symbol("timeout")
    const result = await Promise.race([
      promise.then(
        () => true,
        () => true
      ),
      wait(ms).then(() => timeout)
    ])

    return result !== timeout
  }

  const createWritableSink = () => {
    const sink = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      }
    })

    sink.on("error", () => {})

    return sink
  }

  beforeAll(async () => {
    await rm(testOutputDir, { recursive: true, force: true })
    await mkdir(testOutputDir, { recursive: true })
  })

  afterAll(async () => {
    await rm(testOutputDir, { recursive: true, force: true })
  })

  it("should reject absolute binary paths that are not executable", async () => {
    const binaryPath = join(process.cwd(), outputPath("not-executable-binary"))

    await writeFile(binaryPath, "#!/bin/sh\nexit 0\n")
    await chmod(binaryPath, 0o644)

    await expect(
      ffmpegu.createFFmpegRunner(binaryPath).validateBinary()
    ).rejects.toThrow("ffmpeg binary not found or not executable")
    await expect(
      ffmpegu.createFFprobeRunner(binaryPath).validateBinary()
    ).rejects.toThrow("ffprobe binary not found or not executable")
  })

  it("should destroy stream output when ffmpeg exits non-zero", async () => {
    const outputStream = createWritableSink()
    const outputClosed = waitForEvent(outputStream, "close")
    const outputDestroySpy = vi.spyOn(outputStream, "destroy")

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/does-not-exist.mp4")],
      outputs: [
        ffmpegu.output.toStream(outputStream, ffmpegu.options.format("mpegts"))
      ]
    })

    const result = await runner.run(command)

    expect(result.code).not.toBe(0)
    await outputClosed
    expect(outputDestroySpy).toHaveBeenCalled()
  })

  it("should destroy stream output when spawning ffmpeg fails", async () => {
    const outputStream = createWritableSink()
    const outputClosed = waitForEvent(outputStream, "close")
    const outputDestroySpy = vi.spyOn(outputStream, "destroy")
    const missingRunner = ffmpegu.createFFmpegRunner(
      "ffmpegu-definitely-missing-binary"
    )

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toStream(outputStream, ffmpegu.options.format("mpegts"))
      ]
    })

    await expect(missingRunner.run(command)).rejects.toMatchObject({
      code: "ENOENT"
    })
    await outputClosed
    expect(outputDestroySpy).toHaveBeenCalled()
  })

  it("should wait for output stream final flush before resolving", async () => {
    let finalCallback: (() => void) | undefined
    const outputStream = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
      final(callback) {
        finalCallback = callback
      }
    })
    outputStream.on("error", () => {})

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toStream(
          outputStream,
          ffmpegu.options.concat(
            ffmpegu.options.format("mpegts"),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = runner.run(command)
    result.catch(() => {})

    await waitFor(
      () => typeof finalCallback === "function",
      "output stream did not enter final()"
    )

    expect(await settlesWithin(result, 25)).toBe(false)
    finalCallback?.()
    await expect(result).resolves.toMatchObject({ code: 0 })
  })

  it("should reject when output stream final flush fails", async () => {
    const outputError = new Error("final flush failed")
    let finalCallback: ((error?: Error | null) => void) | undefined
    const outputStream = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
      final(callback) {
        finalCallback = callback
      }
    })
    outputStream.on("error", () => {})

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toStream(
          outputStream,
          ffmpegu.options.concat(
            ffmpegu.options.format("mpegts"),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = runner.run(command)

    await waitFor(
      () => typeof finalCallback === "function",
      "output stream did not enter final()"
    )
    finalCallback?.(outputError)

    await expect(result).rejects.toBe(outputError)
  })

  it("should reject input streams already destroyed before run starts", async () => {
    const inputError = new Error("input destroyed before run")
    const inputStream = new PassThrough()
    inputStream.on("error", () => {})
    inputStream.destroy(inputError)

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [
        ffmpegu.input.fromStream(inputStream, ffmpegu.options.format("mp4"))
      ],
      outputs: [ffmpegu.output.toFile(outputPath("destroyed-input.mp4"))]
    })

    await expect(runner.run(command)).rejects.toBe(inputError)
  })

  it("should reject stalled stream inputs after idle timeout", async () => {
    const inputStream = new PassThrough()
    inputStream.on("error", () => {})

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [
        ffmpegu.input.fromStream(inputStream, ffmpegu.options.format("mp4"))
      ],
      outputs: [ffmpegu.output.toFile(outputPath("stalled-input.mp4"))]
    })

    await expect(
      runner.run(command, { idleTimeoutMs: 10, closeTimeoutMs: 100 })
    ).rejects.toThrow("idle timeout")
  })

  it("should reject when the progress callback throws", async () => {
    const progressError = new Error("progress callback failed")

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [
        ffmpegu.input.fromFile(
          "./assets/video.mp4",
          ffmpegu.options.custom(["-stream_loop", "-1"])
        )
      ],
      outputs: [
        ffmpegu.output.toFile(
          "/dev/null",
          ffmpegu.options.concat(
            ffmpegu.options.format("null"),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    await expect(
      runner.run(command, {
        onProgress: () => {
          throw progressError
        }
      })
    ).rejects.toBe(progressError)
  })

  it("should cap captured stdout from real ffmpeg output", async () => {
    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          "pipe:1",
          ffmpegu.options.concat(
            ffmpegu.options.format("rawvideo"),
            ffmpegu.options.videoCodec("rawvideo"),
            ffmpegu.options.custom(["-frames:v", "1"])
          )
        )
      ]
    })

    const result = await runner.run(command, { maxOutputBuffer: 1024 })

    expect(result.code).toBe(0)
    expect(result.stdout.length).toBeLessThanOrEqual(1024)
  })
})
