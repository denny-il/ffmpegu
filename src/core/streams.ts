import { spawn } from "node:child_process"
import { mkdtemp, open, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { FFmpeguPipe, FFmpeguPipeHandler } from "../types/index.ts"

export async function createPipe(name: string): Promise<FFmpeguPipe> {
  const dir = await makeTemporaryPath()
  const path = join(dir, name)
  try {
    const process = spawn("mkfifo", [path], { stdio: "ignore" })
    await new Promise((resolve, reject) => {
      process.on("error", (error) => {
        reject(normalizeMkfifoError(error))
      })
      process.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`mkfifo failed with code ${code}`))
        } else {
          resolve(undefined)
        }
      })
    })
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }

  return { dir, path }
}

export async function createPipeHandler(
  pipe: FFmpeguPipe
): Promise<FFmpeguPipeHandler> {
  const handler = await open(pipe.path, "r+")
  let released = false

  const release = async () => {
    if (released) return
    released = true
    await handler.close()
  }

  const clean = async () => {
    await release()
    await rm(pipe.dir, { recursive: true, force: true })
  }

  return { ...pipe, handler, release, clean }
}

async function makeTemporaryPath() {
  return await mkdtemp(join(tmpdir(), "ffmpegu-"))
}

function normalizeMkfifoError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "ENOENT") {
      return new Error("mkfifo executable not found in PATH.", {
        cause: error
      })
    }
  }

  return error
}
