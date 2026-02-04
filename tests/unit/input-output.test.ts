import { PassThrough } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguOutput } from "../../src/core/output.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { createPipe } from "../../src/core/streams.ts"
import { ffmpegu } from "../../src/index.ts"

vi.mock("../../src/core/streams.ts", () => ({
  createPipe: vi.fn()
}))

describe.sequential("Input/Output", () => {
  const createPipeMock = vi.mocked(createPipe)

  beforeEach(() => {
    createPipeMock.mockReset()
  })

  it("should compile file input with options", async () => {
    const refs = new FFmpeguReferences()
    const input = FFmpeguInput.fromFile(
      "/test/input.mp4",
      ffmpegu.options.format("mp4")
    )

    const args = await input.compile(refs)

    expect(args).toEqual(["-f", "mp4", "-i", "/test/input.mp4"])
    expect(input.pipe).toBeUndefined()
  })

  it("should compile stream input with pipe", async () => {
    const refs = new FFmpeguReferences()
    const stream = new PassThrough()

    createPipeMock.mockResolvedValueOnce({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0"
    })

    const input = FFmpeguInput.fromStream(stream)
    const args = await input.compile(refs)

    expect(args).toEqual(["-i", "/tmp/ffmpegu/0"])
    expect(input.pipe).toEqual({ dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/0" })
  })

  it("should compile file output with options", async () => {
    const refs = new FFmpeguReferences()
    const output = FFmpeguOutput.toFile(
      "/test/output.mp4",
      ffmpegu.options.movFlags("faststart")
    )

    const args = await output.compile(refs)

    expect(args).toEqual(["-movflags", "faststart", "/test/output.mp4"])
    expect(output.pipe).toBeUndefined()
  })

  it("should compile stream output with pipe", async () => {
    const refs = new FFmpeguReferences()
    const stream = new PassThrough()

    createPipeMock.mockResolvedValueOnce({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/1"
    })

    const output = FFmpeguOutput.toStream(stream)
    const args = await output.compile(refs)

    expect(args).toEqual(["/tmp/ffmpegu/1"])
    expect(output.pipe).toEqual({ dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/1" })
  })

  it("should propagate pipe creation errors", async () => {
    const refs = new FFmpeguReferences()
    const stream = new PassThrough()
    const error = new Error("boom")

    createPipeMock.mockRejectedValueOnce(error)

    const input = FFmpeguInput.fromStream(stream)
    await expect(input.compile(refs)).rejects.toThrow("boom")
  })
})
