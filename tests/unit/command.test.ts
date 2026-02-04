import type { ReadStream, WriteStream } from "node:fs"
import type { FileHandle } from "node:fs/promises"
import { PassThrough } from "node:stream"
import { describe, expect, it, vi } from "vitest"
import { FFmpeguCommand } from "../../src/core/command.ts"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguOutput } from "../../src/core/output.ts"
import { createPipeHandler } from "../../src/core/streams.ts"
import { FFmpeguOptions } from "../../src/options/core.ts"

vi.mock("../../src/core/streams.ts", () => ({
  createPipeHandler: vi.fn()
}))

describe.sequential("Command", () => {
  it("should compile args in order", async () => {
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const output = FFmpeguOutput.toFile("/test/output.mp4")
    const command = FFmpeguCommand.create({
      global: FFmpeguOptions.create("-y"),
      inputs: [input],
      outputs: [output]
    })

    const { args } = await command.compile()

    expect(args).toEqual(["-y", "-i", "/test/input.mp4", "/test/output.mp4"])
  })

  it("should keep immutability for withGlobal/withInput/withOutput", () => {
    const base = FFmpeguCommand.create({ inputs: [], outputs: [] })
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const output = FFmpeguOutput.toFile("/test/output.mp4")

    const withInput = base.withInput(input)
    const withOutput = withInput.withOutput(output)
    const withGlobal = withOutput.withGlobal(FFmpeguOptions.create("-vn"))

    expect(base).not.toBe(withInput)
    expect(withInput.inputs).toEqual([input])
    expect(withInput.outputs).toEqual([])

    expect(withOutput.inputs).toEqual([input])
    expect(withOutput.outputs).toEqual([output])

    expect(
      withGlobal.global!.getArgs({
        get: () => 0,
        has: () => true
      })
    ).toEqual(["-vn"])
  })

  it("should merge global options when adding", () => {
    const command = FFmpeguCommand.create({
      global: FFmpeguOptions.create("-y"),
      inputs: [],
      outputs: []
    })

    const next = command.withGlobal(FFmpeguOptions.create("-vn"))

    expect(command.global!.getArgs({ get: () => 0, has: () => true })).toEqual([
      "-y"
    ])
    expect(next.global!.getArgs({ get: () => 0, has: () => true })).toEqual([
      "-y",
      "-vn"
    ])
  })

  it("should clean pipe handlers on compile failure", async () => {
    const cleanSpy = vi.fn()
    const createPipeHandlerMock = vi.mocked(createPipeHandler)

    createPipeHandlerMock.mockResolvedValue({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0",
      handler: {
        createWriteStream: () => new PassThrough() as unknown as WriteStream,
        createReadStream: () => new PassThrough() as unknown as ReadStream
      } as unknown as FileHandle,
      clean: cleanSpy
    })

    const okInput = {
      source: new PassThrough(),
      pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/0" },
      compile: vi.fn().mockResolvedValue(["-i", "/tmp/ffmpegu/0"])
    } as unknown as FFmpeguInput

    const badInput = {
      source: new PassThrough(),
      compile: vi.fn().mockRejectedValue(new Error("compile failed"))
    } as unknown as FFmpeguInput

    const command = FFmpeguCommand.create({
      inputs: [okInput, badInput],
      outputs: []
    })

    await expect(command.compile()).rejects.toThrow("compile failed")
    expect(cleanSpy).toHaveBeenCalled()
  })

  it("should collect output pipe streams", async () => {
    const createPipeHandlerMock = vi.mocked(createPipeHandler)
    const readStream = new PassThrough()

    createPipeHandlerMock.mockResolvedValueOnce({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/1",
      handler: {
        createWriteStream: () => new PassThrough() as unknown as WriteStream,
        createReadStream: () => readStream as unknown as ReadStream
      } as unknown as FileHandle,
      clean: vi.fn()
    })

    const output = {
      destination: new PassThrough(),
      pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/1" },
      compile: vi.fn().mockResolvedValue(["/tmp/ffmpegu/1"])
    } as unknown as FFmpeguOutput

    const command = FFmpeguCommand.create({ inputs: [], outputs: [output] })
    const result = await command.compile()

    expect(result.outputStreams).toHaveLength(1)
    expect(result.outputStreams[0].source).toBe(readStream)
  })
})
