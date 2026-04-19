import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type { Readable, Writable } from "node:stream";
import type {
    FFmpeguFFmpegProgress,
    FFmpeguFFmpegRunOptions
} from "../types/index.ts";
import type { FFmpeguCommand } from "./command.ts";

const _consumed = new WeakSet<FFmpeguCommand>()

export class FFmpeguFFmpegRunner {
  readonly binPath: string

  constructor(binPath: string = "ffmpeg") {
    this.binPath = binPath
  }

  async run(command: FFmpeguCommand, options: FFmpeguFFmpegRunOptions = {}) {
    this.consumeCommand(command)

    await using compiled = await command.compile()

    try {
      const process = exec(this.binPath, compiled.args, options)

      for (const streams of [compiled.inputStreams, compiled.outputStreams]) {
        for (const stream of streams) {
          stream.source.pipe(stream.destination)
        }
      }

      const result = await process

      const failed = result.code !== 0

      closeOutputStreams(compiled.outputStreams, failed)

      const { progressError, ...processResult } = result

      if (progressError) throw progressError

      return {
        ...processResult,
        args: compiled.args
      }
    } catch (error) {
      destroyOutputStreams(compiled.outputStreams, error)
      throw error
    }
  }

  private consumeCommand(command: FFmpeguCommand) {
    if (_consumed.has(command))
      throw new Error(
        "Command has already been consumed. Create a new command instance."
      )

    _consumed.add(command)
  }

  async validateBinary() {
    if (!this.binPath) {
      throw new Error("Invalid ffmpeg binary path provided.")
    }

    let path: string

    if (this.binPath.startsWith("/") || this.binPath.startsWith(".")) {
      path = this.binPath
    } else {
      const which = await exec("which", [this.binPath])
      if (which.code !== 0)
        throw new Error(`ffmpeg binary not found: ${this.binPath}`)
      path = which.stdout
    }

    const ok = await access(path).then(
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

  const {onProgress, signal} = options

  signal?.throwIfAborted()

  const spawnArgs = withProgressArgs(args, options)
  const process = spawn(command, spawnArgs, {
    signal: signal,
    stdio: onProgress ? ["pipe", "pipe", "pipe", "pipe"] : "pipe"
  })

  const stderr = stringFromReadable(process.stderr)
  const stdout = stringFromReadable(process.stdout)
  const progress = onProgress
    ? progressFromReadable( process.stdio[3] as Readable, onProgress)
    : Promise.resolve<unknown | undefined>(undefined)

  return new Promise<{
    code: number | null
    command: string
    stdout: string
    stderr: string
    progressError?: unknown
  }>((resolve, reject) => {
    let settled = false

    const settle = async (code: number | null, processError?: unknown) => {
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
      void settle(null, error)
    })

    process.on("close", (code) => {
      void settle(code)
    })
  })
}

function closeOutputStreams(
  outputStreams: Array<{ destination: Writable }>,
  failed: boolean
) {
  for (const stream of outputStreams) {
    if (failed)
      stream.destination.destroy(new Error("FFmpegu command failed"))
    else stream.destination.end()
  }
}

function destroyOutputStreams(
  outputStreams: Array<{ destination: Writable }>,
  error: unknown
) {
  const destroyError =
    error instanceof Error ? error : new Error("FFmpegu command failed")

  for (const stream of outputStreams) {
    stream.destination.destroy(destroyError)
  }
}

function withProgressArgs(
  args: string[],
  options: FFmpeguFFmpegRunOptions
): string[] {
  if (!options.onProgress) return args
  return ["-progress", "pipe:3", "-nostats", ...args]
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
      }

      current = {}
    }

    readable.on("data", (chunk) => {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk)

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        flushLine(line)
      }
    })

    readable.on("end", () => {
      if (buffer.length > 0) flushLine(buffer)
      resolve(error)
    })

    readable.on("error", (err) => {
      resolve(error ?? err)
    })
  })
}

function parseProgress(
  current: Record<string, string>
): FFmpeguFFmpegProgress {
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
  readable: Readable | null | undefined
): Promise<string> {
  if (!readable) return ""

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    readable.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    readable.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8").trim())
    })
    readable.on("error", (err) => {
      reject(err)
    })
  })
}
