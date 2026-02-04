import { spawn } from "node:child_process"
import { mkdtemp, open, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { FFmpeguPipe, FFmpeguPipeHandler } from "../types/index.ts"

export async function createPipe(name: string): Promise<FFmpeguPipe> {
  const dir = await makeTemporaryPath()
  const path = join(dir, name)
  const process = spawn("mkfifo", [path], { stdio: "ignore" })
  await new Promise((resolve, reject) => {
    process.on("error", reject)
    process.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`mkfifo failed with code ${code}`))
      } else {
        resolve(undefined)
      }
    })
  })

  return { dir, path }
}

export async function createPipeHandler(
  pipe: FFmpeguPipe
): Promise<FFmpeguPipeHandler> {
  const handler = await open(pipe.path, "r+")
  const clean = () => rm(pipe.dir, { recursive: true })
  return { ...pipe, handler, clean }
}

async function makeTemporaryPath() {
  return await mkdtemp(join(tmpdir(), "ffmpegu-"))
}
