import { access, rm, stat } from "node:fs/promises"
import { createPipe, createPipeHandler } from "../../src/core/streams.ts"
import { describe, expect, it } from "vitest"

describe.sequential("Streams Integration", () => {
  it("should create and clean a real named pipe", async () => {
    let pipe: Awaited<ReturnType<typeof createPipe>> | undefined

    try {
      pipe = await createPipe("0")

      const pipeStat = await stat(pipe.path)
      expect(pipeStat.isFIFO()).toBe(true)

      const handler = await createPipeHandler(pipe)
      await handler.clean()

      await expect(access(pipe.dir)).rejects.toThrow()
    } finally {
      if (pipe) {
        await rm(pipe.dir, { recursive: true, force: true })
      }
    }
  })
})
