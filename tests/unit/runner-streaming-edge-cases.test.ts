import type { ChildProcess, SpawnOptions } from "node:child_process"
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { PassThrough, Readable, Writable } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FFmpeguCommand } from "../../src/core/command.ts"
import { FFmpeguFFmpegRunner } from "../../src/core/runner.ts"

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
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
  options: {
    code?: number | null
    autoClose?: boolean
    stdout?: string
    stderr?: string
    progress?: string | string[]
  } = {}
) => {
  const process = new EventEmitter() as MockChildProcess
  let closed = false

  const close = (code: number | null) => {
    if (closed) return
    closed = true
    process.emit("exit", code)
    process.emit("close", code)
  }

  process.stdout = Readable.from(
    options.stdout ? [Buffer.from(options.stdout)] : []
  )
  process.stderr = Readable.from(
    options.stderr ? [Buffer.from(options.stderr)] : []
  )
  const progressStream = Readable.from(
    (Array.isArray(options.progress)
      ? options.progress
      : options.progress
        ? [options.progress]
        : []
    ).map((chunk) => Buffer.from(chunk))
  )
  process.spawnargs = [command, ...args]
  process.stdio = [null, process.stdout, process.stderr, progressStream, null]
  process.kill = vi.fn(() => {
    setTimeout(() => close(null), 0)
    return true
  })

  if (options.autoClose !== false) {
    setTimeout(() => {
      close(options.code ?? 0)
    }, 0)
  }

  return process
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const waitFor = async (
  predicate: () => boolean,
  message: string,
  timeoutMs = 100
) => {
  const start = Date.now()

  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(message)
    await wait(0)
  }
}

const settlesWithin = async (promise: Promise<unknown>, ms: number) => {
  const marker = Symbol("timeout")
  const result = await Promise.race([
    promise.then(
      () => true,
      () => true
    ),
    wait(ms).then(() => marker)
  ])

  return result !== marker
}

const createOutputStreamCommand = (destination: Writable) => {
  const source = new PassThrough()
  const asyncDispose = vi.fn().mockImplementation(async () => {
    source.destroy()
  })

  return {
    source,
    command: {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [],
        outputStreams: [{ source, destination }],
        [Symbol.asyncDispose]: asyncDispose
      })
    } as unknown as FFmpeguCommand
  }
}

describe.sequential("FFmpeg runner streaming edge cases", () => {
  const spawnMock = vi.mocked(spawn)

  beforeEach(() => {
    spawnMock.mockReset()
  })

  it("should not resolve until output writable finishes flushing", async () => {
    let finalCallback: (() => void) | undefined
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
      final(callback) {
        finalCallback = callback
      }
    })
    destination.on("error", () => {})

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], { code: 0 })
    )

    const { command, source } = createOutputStreamCommand(destination)
    const result = new FFmpeguFFmpegRunner("ffmpeg").run(command)
    result.catch(() => {})

    await waitFor(
      () => typeof finalCallback === "function",
      "output writable never entered final()"
    )

    const settledBeforeFlush = await settlesWithin(result, 10)

    try {
      expect(settledBeforeFlush).toBe(false)
    } finally {
      finalCallback?.()
      source.destroy()
      await result.catch(() => {})
    }
  })

  it("should reject when output writable final flush fails after ffmpeg exits", async () => {
    const outputError = new Error("late output flush failed")
    let finalCallback: ((error?: Error | null) => void) | undefined
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
      final(callback) {
        finalCallback = callback
      }
    })
    destination.on("error", () => {})

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], { code: 0 })
    )

    const { command, source } = createOutputStreamCommand(destination)
    const result = new FFmpeguFFmpegRunner("ffmpeg").run(command)

    await waitFor(
      () => typeof finalCallback === "function",
      "output writable never entered final()"
    )
    finalCallback?.(outputError)

    try {
      await expect(result).rejects.toBe(outputError)
    } finally {
      source.destroy()
      await result.catch(() => {})
    }
  })

  it("should allow retrying a command when compile fails before ffmpeg starts", async () => {
    const compileError = new Error("fifo setup failed")
    const compile = vi
      .fn()
      .mockRejectedValueOnce(compileError)
      .mockResolvedValueOnce({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })

    const command = { compile } as unknown as FFmpeguCommand
    const runner = new FFmpeguFFmpegRunner("ffmpeg")

    await expect(runner.run(command)).rejects.toBe(compileError)

    spawnMock.mockImplementationOnce((bin, args) =>
      createProcess(bin, args as string[], { code: 0 })
    )

    await expect(runner.run(command)).resolves.toMatchObject({ code: 0 })
    expect(compile).toHaveBeenCalledTimes(2)
  })

  it("should settle after abort even when child process never emits close", async () => {
    const controller = new AbortController()
    let resolveSpawnStarted: (() => void) | undefined
    const spawnStarted = new Promise<void>((resolve) => {
      resolveSpawnStarted = resolve
    })

    spawnMock.mockImplementationOnce((command, args, spawnOptions) => {
      const process = createProcess(command, args as string[], {
        autoClose: false
      })
      const options = spawnOptions as SpawnOptions & { signal?: AbortSignal }

      options.signal?.addEventListener("abort", () => {
        process.emit(
          "error",
          Object.assign(new Error("The operation was aborted"), {
            name: "AbortError"
          })
        )
      })

      resolveSpawnStarted?.()

      return process
    })

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const result = new FFmpeguFFmpegRunner("ffmpeg").run(command, {
      signal: controller.signal
    })
    result.catch(() => {})

    await spawnStarted
    controller.abort()

    expect(await settlesWithin(result, 25)).toBe(true)
  })

  it("should reject stream errors emitted after compile but before runtime monitoring", async () => {
    const earlyError = new Error("stream failed before monitor attached")
    const source = new PassThrough()
    const destination = new PassThrough()

    source.on("error", () => {})
    destination.on("error", () => {})

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], { code: 0 })
    )

    const command = {
      compile: vi.fn().mockImplementation(async () => {
        source.destroy(earlyError)

        return {
          args: ["-i", "/tmp/input", "/tmp/output"],
          inputStreams: [{ source, destination }],
          outputStreams: [],
          [Symbol.asyncDispose]: vi.fn()
        }
      })
    } as unknown as FFmpeguCommand

    await expect(new FFmpeguFFmpegRunner("ffmpeg").run(command)).rejects.toBe(
      earlyError
    )
  })

  it("should reject input sources that are already destroyed before run starts", async () => {
    const sourceError = new Error("input was destroyed before run")
    const source = new PassThrough()
    const destination = new PassThrough()

    source.on("error", () => {})
    destination.on("error", () => {})
    source.destroy(sourceError)

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], { code: 0 })
    )

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [{ source, destination }],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    await expect(new FFmpeguFFmpegRunner("ffmpeg").run(command)).rejects.toBe(
      sourceError
    )
  })

  it("should support an idle timeout for stalled streaming inputs", async () => {
    const source = new PassThrough()
    const destination = new PassThrough()
    source.on("error", () => {})
    destination.on("error", () => {})

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], { autoClose: false })
    )

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [{ source, destination }],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const result = new FFmpeguFFmpegRunner("ffmpeg").run(command, {
      idleTimeoutMs: 10
    })
    result.catch(() => {})

    expect(await settlesWithin(result, 50)).toBe(true)
  })

  it("should destroy every bridged stream when one output destination fails", async () => {
    const outputError = new Error("one destination failed")
    const outputA = {
      source: new PassThrough(),
      destination: new PassThrough()
    }
    const outputB = {
      source: new PassThrough(),
      destination: new PassThrough()
    }
    const inputA = {
      source: new PassThrough(),
      destination: new PassThrough()
    }

    for (const stream of [
      outputA.source,
      outputA.destination,
      outputB.source,
      outputB.destination,
      inputA.source,
      inputA.destination
    ]) {
      stream.on("error", () => {})
    }

    const destroySpies = [
      vi.spyOn(outputA.source, "destroy"),
      vi.spyOn(outputA.destination, "destroy"),
      vi.spyOn(outputB.source, "destroy"),
      vi.spyOn(outputB.destination, "destroy"),
      vi.spyOn(inputA.source, "destroy"),
      vi.spyOn(inputA.destination, "destroy")
    ]

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], { autoClose: false })
    )

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output-a", "/tmp/output-b"],
        inputStreams: [inputA],
        outputStreams: [outputA, outputB],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const result = new FFmpeguFFmpegRunner("ffmpeg").run(command)

    await Promise.resolve()
    outputA.destination.destroy(outputError)

    await expect(result).rejects.toBe(outputError)
    for (const destroySpy of destroySpies) {
      expect(destroySpy).toHaveBeenCalled()
    }
  })

  it("should abort cleanly while an input source is backpressured", async () => {
    const controller = new AbortController()
    const source = new Readable({
      read() {
        this.push(Buffer.alloc(1024 * 1024))
      }
    })
    const destination = new Writable({
      write(_chunk, _encoding, _callback) {}
    })
    const sourceDestroySpy = vi.spyOn(source, "destroy")
    const destinationDestroySpy = vi.spyOn(destination, "destroy")
    let resolveSpawnStarted: (() => void) | undefined
    const spawnStarted = new Promise<void>((resolve) => {
      resolveSpawnStarted = resolve
    })

    source.on("error", () => {})
    destination.on("error", () => {})

    spawnMock.mockImplementationOnce((command, args, spawnOptions) => {
      const process = createProcess(command, args as string[], {
        autoClose: false
      })
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
      resolveSpawnStarted?.()

      return process
    })

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [{ source, destination }],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const result = new FFmpeguFFmpegRunner("ffmpeg").run(command, {
      signal: controller.signal
    })

    await spawnStarted
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(sourceDestroySpy).toHaveBeenCalled()
    expect(destinationDestroySpy).toHaveBeenCalled()
  })

  it("should settle when progress callback throws while ffmpeg keeps running", async () => {
    const progressError = new Error("progress handler failed")

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], {
        autoClose: false,
        progress: "frame=1\nout_time=00:00:00.100000\nprogress=continue\n"
      })
    )

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const result = new FFmpeguFFmpegRunner("ffmpeg").run(command, {
      onProgress: () => {
        throw progressError
      }
    })
    result.catch(() => {})

    expect(await settlesWithin(result, 25)).toBe(true)
    await expect(result).rejects.toBe(progressError)
  })

  it("should bound captured stdout and stderr for long-running streaming jobs", async () => {
    const stdout = "o".repeat(128 * 1024)
    const stderr = "e".repeat(128 * 1024)

    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], {
        code: 0,
        stdout,
        stderr
      })
    )

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-i", "/tmp/input", "/tmp/output"],
        inputStreams: [],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    const result = await new FFmpeguFFmpegRunner("ffmpeg").run(command)

    expect(result.stdout.length).toBeLessThanOrEqual(16 * 1024)
    expect(result.stderr.length).toBeLessThanOrEqual(16 * 1024)
  })

  it("should surface streaming muxer IO errors even when ffmpeg exits zero", async () => {
    spawnMock.mockImplementationOnce((command, args) =>
      createProcess(command, args as string[], {
        code: 0,
        stderr:
          "[hls @ 0x1] Opening 'https://cdn.example/segment.ts' for writing\n" +
          "Failed to open segment: HTTP error 500\n" +
          "[dash @ 0x2] failed to rename file, Broken pipe\n"
      })
    )

    const command = {
      compile: vi.fn().mockResolvedValue({
        args: ["-f", "hls", "https://cdn.example/live.m3u8"],
        inputStreams: [],
        outputStreams: [],
        [Symbol.asyncDispose]: vi.fn()
      })
    } as unknown as FFmpeguCommand

    await expect(
      new FFmpeguFFmpegRunner("ffmpeg").run(command)
    ).rejects.toThrow(/streaming muxer IO/i)
  })
})
