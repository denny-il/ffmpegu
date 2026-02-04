import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { access } from "node:fs/promises"
import { PassThrough, Readable } from "node:stream"
import { describe, expect, it, vi } from "vitest"
import { FFmpeguCommand } from "../../src/core/command.ts"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguOutput } from "../../src/core/output.ts"
import { FFmpeguFFmpegRunner } from "../../src/core/runner.ts"

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}))

vi.mock("node:fs/promises", () => ({
  access: vi.fn()
}))

const createProcess = (
  command: string,
  args: string[],
  code: number,
  stdout = "",
  stderr = ""
) => {
  const process = new EventEmitter() as EventEmitter & {
    stdout: Readable
    stderr: Readable
    spawnargs: string[]
  }

  process.stdout = Readable.from(stdout ? [Buffer.from(stdout)] : [])
  process.stderr = Readable.from(stderr ? [Buffer.from(stderr)] : [])
  process.spawnargs = [command, ...args]

  setTimeout(() => process.emit("exit", code), 0)
  return process as unknown as ChildProcess
}

describe.sequential("FFmpeg Runner", () => {
  const spawnMock = vi.mocked(spawn)
  const accessMock = vi.mocked(access)

  it("should validate binary via which", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0, "/usr/bin/ffmpeg")
    )
    accessMock.mockResolvedValueOnce(undefined)

    const runner = new FFmpeguFFmpegRunner("ffmpeg")
    await expect(runner.validateBinary()).resolves.not.toThrow()
  })

  it("should fail validation when which fails", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 1, "")
    )

    const runner = new FFmpeguFFmpegRunner("unknown")
    await expect(runner.validateBinary()).rejects.toThrow(
      "ffmpeg binary not found: unknown"
    )
  })

  it("should fail validation when binary path is empty", async () => {
    const runner = new FFmpeguFFmpegRunner("")
    await expect(runner.validateBinary()).rejects.toThrow(
      "Invalid ffmpeg binary path provided."
    )
  })

  it("should fail validation when absolute path is not accessible", async () => {
    accessMock.mockRejectedValueOnce(new Error("nope"))

    const runner = new FFmpeguFFmpegRunner("/usr/bin/ffmpeg")
    await expect(runner.validateBinary()).rejects.toThrow(
      "ffmpeg binary not found or not executable at path: /usr/bin/ffmpeg"
    )
  })

  it("should run a command and return args", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0)
    )

    const command = FFmpeguCommand.create({
      inputs: [FFmpeguInput.fromFile("/test/input.mp4")],
      outputs: [FFmpeguOutput.toFile("/test/output.mp4")]
    })
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    const result = await runner.run(command)

    expect(result.code).toBe(0)
    expect(result.args).toEqual(["-i", "/test/input.mp4", "/test/output.mp4"])
  })

  it("should prevent reusing commands", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0)
    )

    const command = FFmpeguCommand.create({
      inputs: [FFmpeguInput.fromFile("/test/input.mp4")],
      outputs: [FFmpeguOutput.toFile("/test/output.mp4")]
    })
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    await runner.run(command)
    await expect(runner.run(command)).rejects.toThrow(
      "Command has already been consumed"
    )
  })

  it("should destroy output streams on failure", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 1)
    )

    const destination = new PassThrough()
    destination.on("error", () => {})
    const destroySpy = vi.spyOn(destination, "destroy")
    const endSpy = vi.spyOn(destination, "end")

    const fakeCommand = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/test/input.mp4"],
        inputStreams: [],
        outputStreams: [
          {
            source: Readable.from([]),
            destination
          }
        ],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const runner = new FFmpeguFFmpegRunner("ffmpeg")
    const result = await runner.run(fakeCommand)

    expect(result.code).toBe(1)
    expect(destroySpy).toHaveBeenCalled()
    expect(endSpy).toHaveBeenCalled()
  })
})
