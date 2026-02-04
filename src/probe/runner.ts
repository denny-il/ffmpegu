import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import type { Readable } from "node:stream"
import type { FFmpeguFFprobeJson } from "../types/index.ts"
import type { FFmpeguProbeCommand } from "./command.ts"

const _consumed = new WeakSet<FFmpeguProbeCommand>()

export class FFmpeguFFprobeRunner {
  readonly binPath: string

  constructor(binPath: string = "ffprobe") {
    this.binPath = binPath
  }

  async run(command: FFmpeguProbeCommand) {
    this.consumeCommand(command)

    const args = await command.compile()

    const process = await exec(this.binPath, args)

    let result: FFmpeguFFprobeJson | undefined

    if (process.stdout.length > 0) {
      try {
        result = JSON.parse(process.stdout) as FFmpeguFFprobeJson
      } catch {
        throw new Error(`Failed to parse ffprobe JSON output`, {
          cause: process.stdout
        })
      }
    }

    return {
      ...process,
      args,
      result
    }
  }

  private consumeCommand(command: FFmpeguProbeCommand) {
    if (_consumed.has(command))
      throw new Error(
        "Command has already been consumed. Create a new command instance."
      )

    _consumed.add(command)
  }

  async validateBinary() {
    if (!this.binPath) {
      throw new Error("Invalid ffprobe binary path provided.")
    }

    let path: string

    if (this.binPath.startsWith("/") || this.binPath.startsWith(".")) {
      path = this.binPath
    } else {
      const which = await exec("which", [this.binPath])
      if (which.code !== 0)
        throw new Error(`ffprobe binary not found: ${this.binPath}`)
      path = which.stdout
    }

    const ok = await access(path).then(
      () => true,
      () => false
    )

    if (!ok)
      throw new Error(
        `ffprobe binary not found or not executable at path: ${this.binPath}`
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
