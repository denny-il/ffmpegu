import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { mkdtemp, open, rm } from "node:fs/promises"
import { describe, expect, it, vi } from "vitest"
import { createPipe, createPipeHandler } from "../../src/core/streams.ts"

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}))

vi.mock("node:fs/promises", () => ({
  mkdtemp: vi.fn(),
  open: vi.fn(),
  rm: vi.fn()
}))

const createProcess = (code?: number, error?: Error) => {
  const process = new EventEmitter() as EventEmitter & ChildProcess

  if (error) {
    setTimeout(() => process.emit("error", error), 0)
  } else {
    setTimeout(() => process.emit("exit", code ?? 0), 0)
  }

  return process
}

describe.sequential("Streams", () => {
  const spawnMock = vi.mocked(spawn)
  const mkdtempMock = vi.mocked(mkdtemp)
  const openMock = vi.mocked(open)
  const rmMock = vi.mocked(rm)

  it("should reject when mkfifo exits non-zero", async () => {
    mkdtempMock.mockResolvedValueOnce("/tmp/ffmpegu")
    spawnMock.mockImplementationOnce(() => createProcess(1))

    await expect(createPipe("0")).rejects.toThrow("mkfifo failed with code 1")
  })

  it("should reject when mkfifo emits error", async () => {
    mkdtempMock.mockResolvedValueOnce("/tmp/ffmpegu")
    spawnMock.mockImplementationOnce(() =>
      createProcess(undefined, new Error("boom"))
    )

    await expect(createPipe("1")).rejects.toThrow("boom")
  })

  it("should create pipe handler and clean up", async () => {
    openMock.mockResolvedValueOnce({} as never)
    rmMock.mockResolvedValueOnce(undefined)

    const handler = await createPipeHandler({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0"
    })

    await handler.clean()

    expect(openMock).toHaveBeenCalledWith("/tmp/ffmpegu/0", "r+")
    expect(rmMock).toHaveBeenCalledWith("/tmp/ffmpegu", { recursive: true })
  })
})
