import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import type { Readable } from "node:stream"
import type { FFmpeguCommand } from "./command.ts"

const _consumed = new WeakSet<FFmpeguCommand>()

export class FFmpeguFFmpegRunner {
  readonly binPath: string

  constructor(binPath: string = "ffmpeg") {
    this.binPath = binPath
  }

  async run(command: FFmpeguCommand) {
    this.consumeCommand(command)

    await using compiled = await command.compile()

    const process = exec(this.binPath, compiled.args)

    for (const streams of [compiled.inputStreams, compiled.outputStreams]) {
      for (const stream of streams) {
        stream.source.pipe(stream.destination)
      }
    }

    const result = await process

    const failed = result.code !== 0

    for (const stream of compiled.outputStreams) {
      if (failed)
        stream.destination.destroy(new Error("FFmpegu command failed"))
      else stream.destination.end()
    }

    return {
      ...result,
      args: compiled.args
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

function exec(command: string, args: string[]) {
  const process = spawn(command, args, { stdio: "pipe" })

  const stderr = stringFromReadable(process.stderr)
  const stdout = stringFromReadable(process.stdout)
  return new Promise<{
    code: number | null
    command: string
    stdout: string
    stderr: string
  }>((resolve) => {
    process.on("exit", async (code) => {
      resolve({
        code,
        command: process.spawnargs.join(" "),
        stdout: await stdout,
        stderr: await stderr
      })
    })
  })
}

async function stringFromReadable(readable: Readable): Promise<string> {
  return Buffer.concat(await Array.fromAsync(readable))
    .toString()
    .trim()
}
