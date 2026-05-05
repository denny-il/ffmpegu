import type { ChildProcess, SpawnOptions } from "node:child_process"
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { access } from "node:fs/promises"
import { PassThrough, Readable, Writable } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
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

type MockChildProcess = ChildProcess &
  EventEmitter & {
    stdout: Readable
    stderr: Readable
    spawnargs: string[]
    stdio: ChildProcess["stdio"]
  }

const createProcess = (
  command: string,
  args: string[],
  code: number | null,
  stdout = "",
  stderr = "",
  progress: string | string[] = "",
  autoClose = true
) => {
  const process = new EventEmitter() as MockChildProcess
  const progressStream = Readable.from(
    (Array.isArray(progress) ? progress : progress ? [progress] : []).map(
      (chunk) => Buffer.from(chunk)
    )
  )

  process.stdout = Readable.from(stdout ? [Buffer.from(stdout)] : [])
  process.stderr = Readable.from(stderr ? [Buffer.from(stderr)] : [])
  process.spawnargs = [command, ...args]
  process.stdio = [null, process.stdout, process.stderr, progressStream, null]

  if (autoClose) {
    setTimeout(() => {
      process.emit("exit", code)
      process.emit("close", code)
    }, 0)
  }

  return process
}

const createOutputDestination = () => {
  const destination = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    }
  })

  destination.on("error", () => {})

  return {
    destination,
    endSpy: vi.spyOn(destination, "end"),
    destroySpy: vi.spyOn(destination, "destroy")
  }
}

const createCompiledCommand = (
  outputStreams: Array<{
    source: Readable
    destination: Writable
  }>
) =>
  ({
    compile: vi.fn().mockResolvedValue({
      args: ["-i", "/test/input.mp4", "/test/output.mp4"],
      inputStreams: [],
      outputStreams,
      [Symbol.asyncDispose]: vi.fn()
    })
  }) as unknown as FFmpeguCommand

const createCompiledCommandWithDispose = (options?: {
  args?: string[]
  inputStreams?: Array<{ source: Readable; destination: Writable }>
  outputStreams?: Array<{ source: Readable; destination: Writable }>
}) => {
  const asyncDispose = vi.fn().mockResolvedValue(undefined)

  return {
    asyncDispose,
    command: {
      compile: vi.fn().mockResolvedValue({
        args: options?.args ?? ["-i", "/test/input.mp4", "/test/output.mp4"],
        inputStreams: options?.inputStreams ?? [],
        outputStreams: options?.outputStreams ?? [],
        [Symbol.asyncDispose]: asyncDispose
      })
    } as unknown as FFmpeguCommand
  }
}

describe.sequential("FFmpeg Runner", () => {
  const spawnMock = vi.mocked(spawn)
  const accessMock = vi.mocked(access)

  beforeEach(() => {
    spawnMock.mockReset()
    accessMock.mockReset()
  })

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

  it("should dispose compiled resources after a successful run", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0)
    )

    const compiled = createCompiledCommandWithDispose()
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    const result = await runner.run(compiled.command)

    expect(result.code).toBe(0)
    expect(compiled.asyncDispose).toHaveBeenCalledTimes(1)
  })

  it("should dispose compiled resources after a non-zero exit", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 1)
    )

    const compiled = createCompiledCommandWithDispose()
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    const result = await runner.run(compiled.command)

    expect(result.code).toBe(1)
    expect(compiled.asyncDispose).toHaveBeenCalledTimes(1)
  })

  it("should parse and emit ffmpeg progress", async () => {
    const onProgress = vi.fn()

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0, "", "", [
        "frame=1\nfps=2.5\nout_time=00:00:00.500000\nprogress=continue\n",
        "frame=10\nspeed=1.25x\nstream_0_0_q=24.0\nprogress=end\n"
      ])
    )

    const command = FFmpeguCommand.create({
      inputs: [FFmpeguInput.fromFile("/test/input.mp4")],
      outputs: [FFmpeguOutput.toFile("/test/output.mp4")]
    })
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    const result = await runner.run(command, { onProgress })

    expect(result.code).toBe(0)
    expect(result.args).toEqual(["-i", "/test/input.mp4", "/test/output.mp4"])
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        frame: 1,
        fps: 2.5,
        out_time: "00:00:00.500000",
        progress: "continue",
        raw: expect.objectContaining({
          frame: "1",
          fps: "2.5",
          out_time: "00:00:00.500000",
          progress: "continue"
        })
      })
    )
    expect(onProgress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        frame: 10,
        speed: 1.25,
        stream_0_0_q: 24,
        progress: "end"
      })
    )
  })

  it("should pass a signal and reject when aborted", async () => {
    const controller = new AbortController()
    let resolveSpawnStarted: (() => void) | undefined
    const spawnStarted = new Promise<void>((resolve) => {
      resolveSpawnStarted = resolve
    })

    spawnMock.mockImplementationOnce((command, args, spawnOptions) => {
      const process = createProcess(
        command,
        args as string[],
        null,
        "",
        "",
        "",
        false
      )
      const options = spawnOptions as SpawnOptions & { signal?: AbortSignal }

      resolveSpawnStarted?.()

      options.signal?.addEventListener("abort", () => {
        const abortError = Object.assign(
          new Error("The operation was aborted"),
          {
            name: "AbortError"
          }
        )

        process.emit("error", abortError)
        process.emit("close", null)
      })

      return process
    })

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/test/input.mp4", "/test/output.mp4"],
        inputStreams: [],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    const result = runner.run(command, { signal: controller.signal })
    await spawnStarted
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(spawnMock).toHaveBeenCalledWith(
      "ffmpeg",
      ["-i", "/test/input.mp4", "/test/output.mp4"],
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        stdio: "pipe"
      })
    )
  })

  it("should reject immediately when signal is already aborted", async () => {
    spawnMock.mockClear()

    const controller = new AbortController()
    const abortError = new Error("already aborted")
    controller.abort(abortError)

    const command = FFmpeguCommand.create({
      inputs: [FFmpeguInput.fromFile("/test/input.mp4")],
      outputs: [FFmpeguOutput.toFile("/test/output.mp4")]
    })
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    await expect(
      runner.run(command, { signal: controller.signal })
    ).rejects.toBe(abortError)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it("should dispose compiled resources after abort", async () => {
    const controller = new AbortController()
    let resolveSpawnStarted: (() => void) | undefined
    const spawnStarted = new Promise<void>((resolve) => {
      resolveSpawnStarted = resolve
    })

    spawnMock.mockImplementationOnce((command, args, spawnOptions) => {
      const process = createProcess(
        command,
        args as string[],
        null,
        "",
        "",
        "",
        false
      )
      const options = spawnOptions as SpawnOptions & { signal?: AbortSignal }

      resolveSpawnStarted?.()

      options.signal?.addEventListener("abort", () => {
        process.emit(
          "error",
          Object.assign(new Error("The operation was aborted"), {
            name: "AbortError"
          })
        )
        process.emit("close", null)
      })

      return process
    })

    const compiled = createCompiledCommandWithDispose()
    const runner = new FFmpeguFFmpegRunner("ffmpeg")
    const result = runner.run(compiled.command, { signal: controller.signal })

    await spawnStarted
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(compiled.asyncDispose).toHaveBeenCalledTimes(1)
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

  it("should end output streams on success without destroying them", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0)
    )

    const { destination, destroySpy, endSpy } = createOutputDestination()
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    const result = await runner.run(
      createCompiledCommand([{ source: new PassThrough(), destination }])
    )

    expect(result.code).toBe(0)
    expect(endSpy).toHaveBeenCalledTimes(1)
    expect(destroySpy).not.toHaveBeenCalledWith(expect.any(Error))
  })

  it("should destroy output streams with a stable error on non-zero exit", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 1)
    )

    const { destination, destroySpy, endSpy } = createOutputDestination()
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    const result = await runner.run(
      createCompiledCommand([{ source: new PassThrough(), destination }])
    )

    expect(result.code).toBe(1)
    expect(endSpy).not.toHaveBeenCalled()
    expect(destroySpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "FFmpegu command failed" })
    )
  })

  it("should destroy output streams when ffmpeg spawn emits an error", async () => {
    const processError = new Error("spawn failed")

    spawnMock.mockImplementationOnce((command, args) => {
      const process = createProcess(
        command,
        args as string[],
        null,
        "",
        "",
        "",
        false
      )

      setTimeout(() => {
        process.emit("error", processError)
        process.emit("close", null)
      }, 0)

      return process
    })

    const { destination, destroySpy, endSpy } = createOutputDestination()
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    await expect(
      runner.run(
        createCompiledCommand([{ source: new PassThrough(), destination }])
      )
    ).rejects.toBe(processError)

    expect(endSpy).not.toHaveBeenCalled()
    expect(destroySpy).toHaveBeenCalledWith(processError)
  })

  it("should destroy output streams when aborted during an active run", async () => {
    const controller = new AbortController()
    let resolveSpawnStarted: (() => void) | undefined
    const spawnStarted = new Promise<void>((resolve) => {
      resolveSpawnStarted = resolve
    })

    spawnMock.mockImplementationOnce((command, args, spawnOptions) => {
      const process = createProcess(
        command,
        args as string[],
        null,
        "",
        "",
        "",
        false
      )
      const options = spawnOptions as SpawnOptions & { signal?: AbortSignal }

      resolveSpawnStarted?.()

      options.signal?.addEventListener("abort", () => {
        const abortError = Object.assign(
          new Error("The operation was aborted"),
          {
            name: "AbortError"
          }
        )

        process.emit("error", abortError)
        process.emit("close", null)
      })

      return process
    })

    const { destination, destroySpy, endSpy } = createOutputDestination()
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    const result = runner.run(
      createCompiledCommand([{ source: new PassThrough(), destination }]),
      { signal: controller.signal }
    )

    await spawnStarted
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(endSpy).not.toHaveBeenCalled()
    expect(destroySpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "AbortError" })
    )
  })

  it("should close input sources when aborted during an active run", async () => {
    const controller = new AbortController()
    const inputSource = new PassThrough()
    let resolveSpawnStarted: (() => void) | undefined
    const spawnStarted = new Promise<void>((resolve) => {
      resolveSpawnStarted = resolve
    })

    spawnMock.mockImplementationOnce((command, args, spawnOptions) => {
      const process = createProcess(
        command,
        args as string[],
        null,
        "",
        "",
        "",
        false
      )
      const options = spawnOptions as SpawnOptions & { signal?: AbortSignal }

      resolveSpawnStarted?.()

      options.signal?.addEventListener("abort", () => {
        process.emit(
          "error",
          Object.assign(new Error("The operation was aborted"), {
            name: "AbortError"
          })
        )
        process.emit("close", null)
      })

      return process
    })

    const inputDestroySpy = vi.spyOn(inputSource, "destroy")
    const output = createOutputDestination()
    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [
          {
            source: inputSource,
            destination: new Writable({
              write(_chunk, _encoding, callback) {
                callback()
              }
            })
          }
        ],
        outputStreams: [
          { source: new PassThrough(), destination: output.destination }
        ],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const runner = new FFmpeguFFmpegRunner("ffmpeg")
    const result = runner.run(command, { signal: controller.signal })

    await spawnStarted
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(inputDestroySpy).toHaveBeenCalled()
    expect(output.destroySpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "AbortError" })
    )
  })

  it("should reject when an input stream errors during an active run", async () => {
    const inputError = new Error("input boom")
    const inputSource = new PassThrough()
    const output = createOutputDestination()

    spawnMock.mockImplementationOnce((command, args, spawnOptions) => {
      const process = createProcess(
        command,
        args as string[],
        null,
        "",
        "",
        "",
        false
      )
      const options = spawnOptions as SpawnOptions & { signal?: AbortSignal }

      options.signal?.addEventListener("abort", () => {
        process.emit(
          "error",
          Object.assign(new Error("The operation was aborted"), {
            name: "AbortError"
          })
        )
        process.emit("close", null)
      })

      return process
    })

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [
          {
            source: inputSource,
            destination: new Writable({
              write(_chunk, _encoding, callback) {
                callback()
              }
            })
          }
        ],
        outputStreams: [
          { source: new PassThrough(), destination: output.destination }
        ],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const runner = new FFmpeguFFmpegRunner("ffmpeg")
    const result = runner.run(command)

    await Promise.resolve()
    inputSource.destroy(inputError)

    await expect(result).rejects.toBe(inputError)
    expect(output.destroySpy).toHaveBeenCalledWith(inputError)
    expect(output.endSpy).not.toHaveBeenCalled()
  })

  it("should reject when an output stream errors during an active run", async () => {
    const outputError = new Error("output boom")
    const { destination, destroySpy, endSpy } = createOutputDestination()

    spawnMock.mockImplementationOnce((command, args, spawnOptions) => {
      const process = createProcess(
        command,
        args as string[],
        null,
        "",
        "",
        "",
        false
      )
      const options = spawnOptions as SpawnOptions & { signal?: AbortSignal }

      options.signal?.addEventListener("abort", () => {
        process.emit(
          "error",
          Object.assign(new Error("The operation was aborted"), {
            name: "AbortError"
          })
        )
        process.emit("close", null)
      })

      return process
    })

    const runner = new FFmpeguFFmpegRunner("ffmpeg")
    const result = runner.run(
      createCompiledCommand([{ source: new PassThrough(), destination }])
    )

    await Promise.resolve()
    destination.destroy(outputError)

    await expect(result).rejects.toBe(outputError)
    expect(destroySpy).toHaveBeenCalledWith(outputError)
    expect(endSpy).not.toHaveBeenCalled()
  })

  it("should destroy output streams when onProgress throws", async () => {
    const progressError = new Error("progress boom")

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], 0, "", "", [
        "frame=1\nout_time=00:00:00.500000\nprogress=continue\n"
      ])
    )

    const { destination, destroySpy, endSpy } = createOutputDestination()
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    await expect(
      runner.run(
        createCompiledCommand([{ source: new PassThrough(), destination }]),
        {
          onProgress: () => {
            throw progressError
          }
        }
      )
    ).rejects.toBe(progressError)

    expect(endSpy).not.toHaveBeenCalled()
    expect(destroySpy).toHaveBeenCalledWith(progressError)
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
