import {
  createReadStream,
  createWriteStream,
  type ReadStream,
  type WriteStream
} from "node:fs"
import type { FileHandle } from "node:fs/promises"
import { PassThrough } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FFmpeguCommand } from "../../src/core/command.ts"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguOutput } from "../../src/core/output.ts"
import { createPipeHandler } from "../../src/core/streams.ts"
import { FFmpeguOptions } from "../../src/options/core.ts"

vi.mock("../../src/core/streams.ts", () => ({
  createPipeHandler: vi.fn()
}))

vi.mock("node:fs", () => ({
  createReadStream: vi.fn(),
  createWriteStream: vi.fn()
}))

describe.sequential("Command", () => {
  const createPipeHandlerMock = vi.mocked(createPipeHandler)
  const createReadStreamMock = vi.mocked(createReadStream)
  const createWriteStreamMock = vi.mocked(createWriteStream)

  beforeEach(() => {
    createPipeHandlerMock.mockReset()
    createReadStreamMock.mockReset()
    createWriteStreamMock.mockReset()
  })

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

    createPipeHandlerMock.mockResolvedValue({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0",
      handler: {} as FileHandle,
      release: vi.fn().mockResolvedValue(undefined),
      clean: cleanSpy
    })

    createWriteStreamMock.mockReturnValueOnce(
      new PassThrough() as unknown as WriteStream
    )

    const okInput = {
      source: new PassThrough(),
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/ffmpegu/0"],
        pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/0" }
      })
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

  it("should collect input pipe streams with source and destination", async () => {
    const source = new PassThrough()
    const destination = new PassThrough() as unknown as WriteStream

    createPipeHandlerMock.mockResolvedValueOnce({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0",
      handler: {} as FileHandle,
      release: vi.fn().mockResolvedValue(undefined),
      clean: vi.fn()
    })

    createWriteStreamMock.mockReturnValueOnce(destination)

    const input = {
      source,
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/ffmpegu/0"],
        pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/0" }
      })
    } as unknown as FFmpeguInput

    const command = FFmpeguCommand.create({ inputs: [input], outputs: [] })
    const result = await command.compile()

    expect(result.args).toEqual(["-i", "/tmp/ffmpegu/0"])
    expect(result.inputStreams).toHaveLength(1)
    expect(createWriteStreamMock).toHaveBeenCalledWith("/tmp/ffmpegu/0")
    expect(result.inputStreams[0]).toMatchObject({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0",
      source,
      destination
    })
  })

  it("should clean created handlers when output pipe handler creation fails", async () => {
    const inputCleanSpy = vi.fn()

    createPipeHandlerMock
      .mockResolvedValueOnce({
        dir: "/tmp/ffmpegu",
        path: "/tmp/ffmpegu/0",
        handler: {} as FileHandle,
        release: vi.fn().mockResolvedValue(undefined),
        clean: inputCleanSpy
      })
      .mockRejectedValueOnce(new Error("output handler failed"))

    createWriteStreamMock.mockReturnValueOnce(
      new PassThrough() as unknown as WriteStream
    )

    const input = {
      source: new PassThrough(),
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/ffmpegu/0"],
        pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/0" }
      })
    } as unknown as FFmpeguInput

    const output = {
      destination: new PassThrough(),
      compile: vi.fn().mockResolvedValue({
        args: ["/tmp/ffmpegu/1"],
        pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/1" }
      })
    } as unknown as FFmpeguOutput

    const command = FFmpeguCommand.create({
      inputs: [input],
      outputs: [output]
    })

    await expect(command.compile()).rejects.toThrow("output handler failed")
    expect(inputCleanSpy).toHaveBeenCalledTimes(1)
  })

  it("should clean earlier output handlers when a later output compile fails", async () => {
    const outputCleanSpy = vi.fn()

    createPipeHandlerMock.mockResolvedValueOnce({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/0",
      handler: {} as FileHandle,
      release: vi.fn().mockResolvedValue(undefined),
      clean: outputCleanSpy
    })

    createReadStreamMock.mockReturnValueOnce(
      new PassThrough() as unknown as ReadStream
    )

    const outputA = {
      destination: new PassThrough(),
      compile: vi.fn().mockResolvedValue({
        args: ["/tmp/ffmpegu/0"],
        pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/0" }
      })
    } as unknown as FFmpeguOutput

    const outputB = {
      destination: new PassThrough(),
      compile: vi.fn().mockRejectedValue(new Error("second output failed"))
    } as unknown as FFmpeguOutput

    const command = FFmpeguCommand.create({
      inputs: [],
      outputs: [outputA, outputB]
    })

    await expect(command.compile()).rejects.toThrow("second output failed")
    expect(outputCleanSpy).toHaveBeenCalledTimes(1)
  })

  it("should collect output pipe streams", async () => {
    const readStream = new PassThrough()

    createPipeHandlerMock.mockResolvedValueOnce({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/1",
      handler: {} as FileHandle,
      release: vi.fn().mockResolvedValue(undefined),
      clean: vi.fn()
    })

    createReadStreamMock.mockReturnValueOnce(
      readStream as unknown as ReadStream
    )

    const output = {
      destination: new PassThrough(),
      compile: vi.fn().mockResolvedValue({
        args: ["/tmp/ffmpegu/1"],
        pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/1" }
      })
    } as unknown as FFmpeguOutput

    const command = FFmpeguCommand.create({ inputs: [], outputs: [output] })
    const result = await command.compile()

    expect(createReadStreamMock).toHaveBeenCalledWith("/tmp/ffmpegu/1")
    expect(result.outputStreams).toHaveLength(1)
    expect(result.outputStreams[0].source).toBe(readStream)
  })

  it("should clean only streams owned by the compiled command result", async () => {
    const firstCleanSpy = vi.fn().mockResolvedValue(undefined)
    const secondCleanSpy = vi.fn().mockResolvedValue(undefined)

    createPipeHandlerMock
      .mockResolvedValueOnce({
        dir: "/tmp/ffmpegu",
        path: "/tmp/ffmpegu/1",
        handler: {} as FileHandle,
        release: vi.fn().mockResolvedValue(undefined),
        clean: firstCleanSpy
      })
      .mockResolvedValueOnce({
        dir: "/tmp/ffmpegu",
        path: "/tmp/ffmpegu/2",
        handler: {} as FileHandle,
        release: vi.fn().mockResolvedValue(undefined),
        clean: secondCleanSpy
      })

    createReadStreamMock
      .mockReturnValueOnce(new PassThrough() as unknown as ReadStream)
      .mockReturnValueOnce(new PassThrough() as unknown as ReadStream)

    const output = {
      destination: new PassThrough(),
      compile: vi
        .fn()
        .mockResolvedValueOnce({
          args: ["/tmp/ffmpegu/1"],
          pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/1" }
        })
        .mockResolvedValueOnce({
          args: ["/tmp/ffmpegu/2"],
          pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/2" }
        })
    } as unknown as FFmpeguOutput

    const command = FFmpeguCommand.create({ inputs: [], outputs: [output] })

    const firstResult = await command.compile()
    await command.compile()

    await firstResult[Symbol.asyncDispose]()

    expect(firstCleanSpy).toHaveBeenCalledTimes(1)
    expect(secondCleanSpy).not.toHaveBeenCalled()
  })

  it("should allow compiled command cleanup to run more than once", async () => {
    const cleanSpy = vi.fn().mockResolvedValue(undefined)

    createPipeHandlerMock.mockResolvedValueOnce({
      dir: "/tmp/ffmpegu",
      path: "/tmp/ffmpegu/1",
      handler: {} as FileHandle,
      release: vi.fn().mockResolvedValue(undefined),
      clean: cleanSpy
    })

    createReadStreamMock.mockReturnValueOnce(
      new PassThrough() as unknown as ReadStream
    )

    const output = {
      destination: new PassThrough(),
      compile: vi.fn().mockResolvedValue({
        args: ["/tmp/ffmpegu/1"],
        pipe: { dir: "/tmp/ffmpegu", path: "/tmp/ffmpegu/1" }
      })
    } as unknown as FFmpeguOutput

    const command = FFmpeguCommand.create({ inputs: [], outputs: [output] })
    const result = await command.compile()

    await expect(result[Symbol.asyncDispose]()).resolves.toBeUndefined()
    await expect(result[Symbol.asyncDispose]()).resolves.toBeUndefined()

    expect(cleanSpy).toHaveBeenCalledTimes(1)
  })
})
