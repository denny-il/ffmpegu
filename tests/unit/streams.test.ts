import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { mkdtemp, open, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
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

  beforeEach(() => {
    spawnMock.mockReset()
    mkdtempMock.mockReset()
    openMock.mockReset()
    rmMock.mockReset()
  })

  it("should create a named pipe successfully", async () => {
    mkdtempMock.mockResolvedValueOnce("/tmp/ffmpegu-abc")
    spawnMock.mockImplementationOnce(() => createProcess(0))

    const pipe = await createPipe("0")

    expect(mkdtempMock).toHaveBeenCalledWith(join(tmpdir(), "ffmpegu-"))
    expect(spawnMock).toHaveBeenCalledWith("mkfifo", ["/tmp/ffmpegu-abc/0"], {
      stdio: "ignore"
    })
    expect(pipe).toEqual({
      dir: "/tmp/ffmpegu-abc",
      path: "/tmp/ffmpegu-abc/0"
    })
  })

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
    const closeSpy = vi.fn().mockResolvedValue(undefined)

    openMock.mockResolvedValueOnce({ close: closeSpy } as never)
    rmMock.mockResolvedValueOnce(undefined)

    const handler = await createPipeHandler({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0"
    })

    await handler.clean()

    expect(openMock).toHaveBeenCalledWith("/tmp/ffmpegu/0", "r+")
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(rmMock).toHaveBeenCalledWith("/tmp/ffmpegu", {
      recursive: true,
      force: true
    })
  })

  it("should explicitly close the file handle during cleanup", async () => {
    const closeSpy = vi.fn().mockResolvedValue(undefined)

    openMock.mockResolvedValueOnce({ close: closeSpy } as never)
    rmMock.mockResolvedValueOnce(undefined)

    const handler = await createPipeHandler({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0"
    })

    await handler.clean()

    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(rmMock).toHaveBeenCalledWith("/tmp/ffmpegu", {
      recursive: true,
      force: true
    })
  })

  it("should allow repeated cleanup calls", async () => {
    const closeSpy = vi.fn().mockResolvedValue(undefined)

    openMock.mockResolvedValueOnce({ close: closeSpy } as never)
    rmMock.mockResolvedValue(undefined)

    const handler = await createPipeHandler({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0"
    })

    await expect(handler.clean()).resolves.toBeUndefined()
    await expect(handler.clean()).resolves.toBeUndefined()

    expect(rmMock).toHaveBeenNthCalledWith(1, "/tmp/ffmpegu", {
      recursive: true,
      force: true
    })
    expect(rmMock).toHaveBeenNthCalledWith(2, "/tmp/ffmpegu", {
      recursive: true,
      force: true
    })
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})
