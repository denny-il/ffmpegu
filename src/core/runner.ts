import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access } from "node:fs/promises"
import type { Readable, Writable } from "node:stream"
import { finished } from "node:stream/promises"
import type {
  FFmpeguFFmpegProgress,
  FFmpeguFFmpegRunOptions
} from "../types/index.ts"
import type { FFmpeguCommand } from "./command.ts"

const _consumed = new WeakSet<FFmpeguCommand>()
const _reserved = new WeakSet<FFmpeguCommand>()
const DEFAULT_PROCESS_CLOSE_TIMEOUT_MS = 10
const DEFAULT_MAX_OUTPUT_BUFFER = 16 * 1024

export class FFmpeguFFmpegRunner {
  readonly binPath: string

  constructor(binPath: string = "ffmpeg") {
    this.binPath = binPath
  }

  async run(command: FFmpeguCommand, options: FFmpeguFFmpegRunOptions = {}) {
    this.reserveCommand(command)

    let compiled: Awaited<ReturnType<FFmpeguCommand["compile"]>>
    try {
      compiled = await command.compile()
      this.consumeCommand(command)
    } catch (error) {
      this.releaseCommand(command)
      throw error
    }

    await using disposableCompiled = compiled

    const signal = withRuntimeSignal(options.signal)
    const runtimeStreams = [
      ...disposableCompiled.inputStreams.map((stream) => ({
        ...stream,
        ignoreDestinationError: isIgnorablePipeBridgeError
      })),
      ...disposableCompiled.outputStreams.map((stream) => ({
        ...stream,
        ignoreSourceError: isIgnorablePipeBridgeError
      }))
    ]
    const runtimeErrors = monitorStreamErrors(runtimeStreams, (error) => {
      signal.controller.abort(error)
      process?.kill()
    })
    const idleTimeout = monitorIdleTimeout(runtimeStreams, options, (error) => {
      signal.controller.abort(error)
      process?.kill()
    })
    let process: ReturnType<typeof exec> | undefined

    try {
      process = exec(this.binPath, disposableCompiled.args, {
        ...options,
        signal: signal.signal
      })

      for (const streams of [
        disposableCompiled.inputStreams,
        disposableCompiled.outputStreams
      ]) {
        for (const stream of streams) {
          stream.source.pipe(stream.destination)
        }
      }

      const result = await Promise.race([
        process.result,
        runtimeErrors.promise,
        idleTimeout.promise,
        process.progressFailure
      ])
      runtimeErrors.dispose()
      idleTimeout.dispose()

      const { progressError, ...processResult } = result

      if (progressError) throw progressError

      const failed = result.code !== 0

      const streamingMuxerError =
        result.code === 0
          ? detectStreamingMuxerIoError(result.stderr, disposableCompiled.args)
          : undefined

      if (streamingMuxerError) throw streamingMuxerError

      await closeOutputStreams(disposableCompiled.outputStreams, failed)

      return {
        ...processResult,
        args: disposableCompiled.args
      }
    } catch (error) {
      runtimeErrors.dispose()
      idleTimeout.dispose()
      process?.kill()
      destroyPipeBridgeStreams(
        disposableCompiled.inputStreams,
        disposableCompiled.outputStreams,
        error
      )
      destroyOutputStreams(disposableCompiled.outputStreams, error)
      await process?.waitForClose(
        options.closeTimeoutMs ?? DEFAULT_PROCESS_CLOSE_TIMEOUT_MS
      )
      throw error
    }
  }

  private reserveCommand(command: FFmpeguCommand) {
    if (_consumed.has(command) || _reserved.has(command))
      throw new Error(
        "Command has already been consumed. Create a new command instance."
      )

    _reserved.add(command)
  }

  private consumeCommand(command: FFmpeguCommand) {
    _reserved.delete(command)
    _consumed.add(command)
  }

  private releaseCommand(command: FFmpeguCommand) {
    _reserved.delete(command)
  }

  async validateBinary() {
    if (!this.binPath) {
      throw new Error("Invalid ffmpeg binary path provided.")
    }

    let path: string

    if (this.binPath.startsWith("/") || this.binPath.startsWith(".")) {
      path = this.binPath
    } else {
      const which = await exec("which", [this.binPath]).result
      if (which.code !== 0)
        throw new Error(`ffmpeg binary not found: ${this.binPath}`)
      path = which.stdout
    }

    const ok = await access(path, constants.X_OK).then(
      () => true,
      () => false
    )

    if (!ok)
      throw new Error(
        `ffmpeg binary not found or not executable at path: ${this.binPath}`
      )
  }
}

function exec(
  command: string,
  args: string[],
  options: FFmpeguFFmpegRunOptions = {}
) {
  const { onProgress, signal } = options

  signal?.throwIfAborted()

  const spawnArgs = withProgressArgs(args, options)
  const process = spawn(command, spawnArgs, {
    signal: signal,
    stdio: onProgress ? ["pipe", "pipe", "pipe", "pipe"] : "pipe"
  })

  const maxOutputBuffer = options.maxOutputBuffer ?? DEFAULT_MAX_OUTPUT_BUFFER
  const stderr = stringFromReadable(process.stderr, maxOutputBuffer)
  const stdout = stringFromReadable(process.stdout, maxOutputBuffer)
  const progress = onProgress
    ? progressFromReadable(process.stdio[3] as Readable, onProgress)
    : Promise.resolve<unknown | undefined>(undefined)
  const progressFailure = onProgress
    ? progress.then((error) => {
        if (error) throw error
        return new Promise<never>(() => {})
      })
    : new Promise<never>(() => {})

  const closed = new Promise<number | null>((resolve) => {
    process.on("close", (code) => {
      resolve(code)
    })
  })

  const result = new Promise<{
    code: number | null
    command: string
    stdout: string
    stderr: string
    progressError?: unknown
  }>((resolve, reject) => {
    let settled = false
    let processError: unknown

    const settle = async (code: number | null) => {
      if (settled) return
      settled = true

      try {
        const result = {
          code,
          command:
            process.spawnargs.length > 0
              ? process.spawnargs.join(" ")
              : [command, ...spawnArgs].join(" "),
          stdout: await stdout,
          stderr: await stderr,
          progressError: await progress
        }

        if (processError) reject(processError)
        else resolve(result)
      } catch (error) {
        reject(error)
      }
    }

    process.on("error", (error) => {
      processError = error
      reject(error)
    })

    process.on("close", (code) => {
      void settle(code)
    })
  })

  return {
    result,
    closed,
    progressFailure,
    waitForClose(timeoutMs: number) {
      return waitForPromise(closed, timeoutMs)
    },
    kill() {
      if (typeof process.kill === "function") {
        process.kill()
      }
    }
  }
}

async function closeOutputStreams(
  outputStreams: Array<{ destination: Writable }>,
  failed: boolean
) {
  await Promise.all(
    outputStreams.map(async (stream) => {
      if (failed) {
        safeDestroy(stream.destination, new Error("FFmpegu command failed"))
        return
      }

      stream.destination.end()
      await finished(stream.destination)
    })
  )
}

function destroyOutputStreams(
  outputStreams: Array<{ destination: Writable }>,
  error: unknown
) {
  const destroyError =
    error instanceof Error ? error : new Error("FFmpegu command failed")

  for (const stream of outputStreams) {
    safeDestroy(stream.destination, destroyError)
  }
}

function destroyPipeBridgeStreams(
  inputStreams: Array<{ source: Readable; destination: Writable }>,
  outputStreams: Array<{ source: Readable; destination: Writable }>,
  error: unknown
) {
  const destroyError =
    error instanceof Error ? error : new Error("FFmpegu command failed")

  for (const stream of inputStreams) {
    stream.source.unpipe(stream.destination)
    safeDestroy(stream.destination, destroyError)
    if (!stream.source.destroyed) {
      safeDestroy(stream.source)
    }
  }

  for (const stream of outputStreams) {
    stream.source.unpipe(stream.destination)
    safeDestroy(stream.source, destroyError)
  }
}

function safeDestroy(stream: Readable | Writable, error?: Error) {
  if (stream.destroyed) return
  if (error && stream.listenerCount("error") === 0) {
    stream.once("error", () => {})
  }
  stream.destroy(error)
}

function withProgressArgs(
  args: string[],
  options: FFmpeguFFmpegRunOptions
): string[] {
  if (!options.onProgress) return args
  return ["-progress", "pipe:3", "-nostats", ...args]
}

function withRuntimeSignal(signal?: AbortSignal) {
  const controller = new AbortController()

  return {
    controller,
    signal: signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal
  }
}

function monitorStreamErrors(
  streams: Array<{
    source: Readable
    destination: Writable
    ignoreSourceError?: (error: unknown) => boolean
    ignoreDestinationError?: (error: unknown) => boolean
  }>,
  onError: (error: unknown) => void
) {
  const disposers: Array<() => void> = []
  let settled = false

  const promise = new Promise<never>((_, reject) => {
    const rejectOnce = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error)
      onError(error)
    }

    for (const stream of streams) {
      const sourceErrorState = getStreamError(stream.source)
      if (sourceErrorState && !stream.ignoreSourceError?.(sourceErrorState)) {
        queueMicrotask(() => rejectOnce(sourceErrorState))
        return
      }

      const destinationErrorState = getStreamError(stream.destination)
      if (
        destinationErrorState &&
        !stream.ignoreDestinationError?.(destinationErrorState)
      ) {
        queueMicrotask(() => rejectOnce(destinationErrorState))
        return
      }

      const sourceError = (error: unknown) => {
        if (stream.ignoreSourceError?.(error)) return
        rejectOnce(error)
      }
      const destinationError = (error: unknown) => {
        if (stream.ignoreDestinationError?.(error)) return
        rejectOnce(error)
      }

      stream.source.once("error", sourceError)
      stream.destination.once("error", destinationError)

      disposers.push(() => stream.source.off("error", sourceError))
      disposers.push(() => stream.destination.off("error", destinationError))
    }
  })

  return {
    promise,
    dispose() {
      settled = true
      for (const dispose of disposers) {
        dispose()
      }
      disposers.length = 0
    }
  }
}

function monitorIdleTimeout(
  streams: Array<{ source: Readable; destination: Writable }>,
  options: FFmpeguFFmpegRunOptions,
  onTimeout: (error: Error) => void
) {
  const idleTimeoutMs = options.idleTimeoutMs

  if (!idleTimeoutMs || idleTimeoutMs <= 0 || streams.length === 0) {
    return {
      promise: new Promise<never>(() => {}),
      dispose() {}
    }
  }

  const disposers: Array<() => void> = []
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const promise = new Promise<never>((_, reject) => {
    const fail = () => {
      if (settled) return
      settled = true
      const error = new Error(
        `FFmpegu command idle timeout after ${idleTimeoutMs}ms.`
      )
      reject(error)
      onTimeout(error)
    }

    const reset = () => {
      if (settled) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(fail, idleTimeoutMs)
    }

    for (const stream of streams) {
      stream.source.on("data", reset)
      stream.destination.on("drain", reset)
      disposers.push(() => stream.source.off("data", reset))
      disposers.push(() => stream.destination.off("drain", reset))
    }

    reset()
  })

  return {
    promise,
    dispose() {
      settled = true
      if (timer) clearTimeout(timer)
      for (const dispose of disposers) {
        dispose()
      }
      disposers.length = 0
    }
  }
}

function getStreamError(stream: Readable | Writable) {
  const errored = (stream as { errored?: unknown }).errored
  if (errored) return errored

  if (stream.destroyed) {
    return new Error("Stream was destroyed before FFmpegu command started.")
  }
}

function isIgnorablePipeBridgeError(error: unknown) {
  if (!error || typeof error !== "object") return false

  const code = "code" in error ? error.code : undefined
  return code === "EPIPE" || code === "ECONNRESET"
}

function progressFromReadable(
  readable: Readable | null | undefined,
  onProgress: (progress: FFmpeguFFmpegProgress) => void
): Promise<unknown | undefined> {
  if (!readable) {
    return Promise.resolve(new Error("FFmpeg progress pipe is unavailable."))
  }

  return new Promise((resolve) => {
    let buffer = ""
    let error: unknown
    let current: Record<string, string> = {}
    let settled = false

    const finish = (err?: unknown) => {
      if (settled) return
      settled = true
      if (err) error = err
      cleanup()
      resolve(error)
    }

    const onData = (chunk: Buffer | string) => {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk)

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        flushLine(line)
      }
    }

    const onEnd = () => {
      if (buffer.length > 0) flushLine(buffer)
      finish()
    }

    const onError = (err: unknown) => {
      finish(error ?? err)
    }

    const cleanup = () => {
      readable.off("data", onData)
      readable.off("end", onEnd)
      readable.off("error", onError)
    }

    const flushLine = (line: string) => {
      if (error) return

      const trimmed = line.trim()
      if (!trimmed) return

      const separatorIndex = trimmed.indexOf("=")
      if (separatorIndex < 0) return

      const key = trimmed.slice(0, separatorIndex)
      const value = trimmed.slice(separatorIndex + 1)

      current[key] = value

      if (key !== "progress") return

      try {
        onProgress(parseProgress(current))
      } catch (err) {
        error = err
        finish(err)
      }

      current = {}
    }

    readable.on("data", onData)
    readable.on("end", onEnd)
    readable.on("error", onError)
  })
}

function parseProgress(current: Record<string, string>): FFmpeguFFmpegProgress {
  const progress = {
    progress: current.progress ?? "continue",
    raw: { ...current }
  } as FFmpeguFFmpegProgress

  for (const [key, value] of Object.entries(current)) {
    progress[key] = parseProgressValue(key, value)
  }

  return progress
}

function parseProgressValue(key: string, value: string) {
  if (key === "progress" || key === "bitrate" || key === "out_time") {
    return value
  }

  if (key === "speed") {
    const numeric = Number(value.endsWith("x") ? value.slice(0, -1) : value)
    return Number.isNaN(numeric) ? value : numeric
  }

  const numeric = Number(value)
  return Number.isNaN(numeric) ? value : numeric
}

async function stringFromReadable(
  readable: Readable | null | undefined,
  maxBytes: number = DEFAULT_MAX_OUTPUT_BUFFER
): Promise<string> {
  if (!readable) return ""

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    readable.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(buffer)
      totalBytes += buffer.length

      while (totalBytes > maxBytes && chunks.length > 0) {
        const first = chunks[0]
        const overflow = totalBytes - maxBytes

        if (first.length <= overflow) {
          totalBytes -= first.length
          chunks.shift()
        } else {
          chunks[0] = first.subarray(overflow)
          totalBytes -= overflow
        }
      }
    })
    readable.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8").trim())
    })
    readable.on("error", (err) => {
      reject(err)
    })
  })
}

function detectStreamingMuxerIoError(stderr: string, args: string[]) {
  if (!isStreamingMuxerCommand(args)) return
  if (!/(failed|error|broken pipe|connection reset|timed out)/i.test(stderr))
    return

  return new Error("FFmpegu streaming muxer IO error.", {
    cause: stderr
  })
}

function isStreamingMuxerCommand(args: string[]) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-f" && (args[i + 1] === "hls" || args[i + 1] === "dash")) {
      return true
    }

    if (/\.(m3u8|mpd)(\?|$)/i.test(args[i])) {
      return true
    }
  }

  return false
}

function waitForPromise<T>(promise: Promise<T>, timeoutMs: number) {
  if (timeoutMs <= 0) return Promise.resolve<T | undefined>(undefined)

  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), timeoutMs)
    })
  ])
}
