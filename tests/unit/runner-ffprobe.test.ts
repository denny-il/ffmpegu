import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { access } from "node:fs/promises"
import { Readable } from "node:stream"
import { describe, expect, it, vi } from "vitest"
import { FFmpeguProbeCommand } from "../../src/probe/command.ts"
import { FFmpeguFFprobeRunner } from "../../src/probe/runner.ts"

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

describe.sequential("FFprobe Runner", () => {
  const spawnMock = vi.mocked(spawn)
  const accessMock = vi.mocked(access)

  it("should validate binary via which", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0, "/usr/bin/ffprobe")
    )
    accessMock.mockResolvedValueOnce(undefined)

    const runner = new FFmpeguFFprobeRunner("ffprobe")
    await expect(runner.validateBinary()).resolves.not.toThrow()
  })

  it("should fail validation when which fails", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 1, "")
    )

    const runner = new FFmpeguFFprobeRunner("unknown")
    await expect(runner.validateBinary()).rejects.toThrow(
      "ffprobe binary not found: unknown"
    )
  })

  it("should fail validation when absolute path is not accessible", async () => {
    accessMock.mockRejectedValueOnce(new Error("nope"))

    const runner = new FFmpeguFFprobeRunner("/usr/bin/ffprobe")
    await expect(runner.validateBinary()).rejects.toThrow(
      "ffprobe binary not found or not executable at path: /usr/bin/ffprobe"
    )
  })

  it("should parse JSON output on success", async () => {
    const payload = JSON.stringify({ format: { filename: "test" } })

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0, payload)
    )

    const runner = new FFmpeguFFprobeRunner("ffprobe")
    const result = await runner.run(new FFmpeguProbeCommand("/test/input.mp4"))

    expect(result.code).toBe(0)
    expect(result.result).toEqual({ format: { filename: "test" } })
  })

  it("should throw on invalid JSON output", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0, "not-json")
    )

    const runner = new FFmpeguFFprobeRunner("ffprobe")

    await expect(
      runner.run(new FFmpeguProbeCommand("/test/input.mp4"))
    ).rejects.toThrow("Failed to parse ffprobe JSON output")
  })

  it("should prevent reusing commands", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0, "{}")
    )

    const runner = new FFmpeguFFprobeRunner("ffprobe")
    const command = new FFmpeguProbeCommand("/test/input.mp4")

    await runner.run(command)
    await expect(runner.run(command)).rejects.toThrow(
      "Command has already been consumed"
    )
  })

  it("should return undefined result on empty stdout", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0, "")
    )

    const runner = new FFmpeguFFprobeRunner("ffprobe")
    const result = await runner.run(new FFmpeguProbeCommand("/test/input.mp4"))

    expect(result.result).toBeUndefined()
  })
})
