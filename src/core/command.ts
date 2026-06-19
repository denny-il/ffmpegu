import assert from "node:assert"
import { createReadStream, createWriteStream } from "node:fs"
import type { Readable, Writable } from "node:stream"
import { FFmpeguOptions } from "../options/core.ts"
import type { FFmpeguPipeHandler } from "../types/index.ts"
import type { FFmpeguInput } from "./input.ts"
import type { FFmpeguOutput } from "./output.ts"
import { FFmpeguReferences } from "./references.ts"
import { createPipeHandler } from "./streams.ts"

export type FFmpeguPipeInputStream = FFmpeguPipeHandler & {
  destination: Writable
  source: Readable
}

export type FFmpeguPipeOutputStream = FFmpeguPipeHandler & {
  source: Readable
  destination: Writable
}

export class FFmpeguCommand {
  readonly global?: FFmpeguOptions
  readonly inputs: readonly FFmpeguInput[]
  readonly outputs: readonly FFmpeguOutput[]

  private readonly refs = new FFmpeguReferences()

  constructor(options: {
    global?: FFmpeguOptions
    inputs: FFmpeguInput[]
    outputs: FFmpeguOutput[]
  }) {
    this.global = options.global
    this.inputs = [...options.inputs]
    this.outputs = [...options.outputs]

    for (let i = 0; i < this.inputs.length; i++) {
      const input = this.inputs[i]
      assert(
        !this.refs.has(input),
        `Input[${i}] already exists in command. Consider creating a new Input instance.`
      )
      this.refs.set(input, i)
    }

    for (let i = 0; i < this.outputs.length; i++) {
      const output = this.outputs[i]
      assert(
        !this.refs.has(output),
        `Output[${i}] already exists in command. Consider creating a new Output instance.`
      )
      this.refs.set(output, i + this.inputs.length)
    }
  }

  static create(options: {
    global?: FFmpeguOptions
    inputs?: FFmpeguInput[]
    outputs?: FFmpeguOutput[]
  }) {
    return new FFmpeguCommand({
      global: options.global,
      inputs: options.inputs ?? [],
      outputs: options.outputs ?? []
    })
  }

  // Immutable updates
  withGlobal(args: FFmpeguOptions): FFmpeguCommand {
    return new FFmpeguCommand({
      inputs: [...this.inputs],
      outputs: [...this.outputs],
      global: this.global ? FFmpeguOptions.merge(this.global, args) : args
    })
  }

  withInput(input: FFmpeguInput): FFmpeguCommand {
    return new FFmpeguCommand({
      global: this.global,
      inputs: [...this.inputs, input],
      outputs: [...this.outputs]
    })
  }

  withOutput(output: FFmpeguOutput): FFmpeguCommand {
    return new FFmpeguCommand({
      global: this.global,
      inputs: [...this.inputs],
      outputs: [...this.outputs, output]
    })
  }

  async compile() {
    const args: string[] = []
    const inputStreams: FFmpeguPipeInputStream[] = []
    const outputStreams: FFmpeguPipeOutputStream[] = []

    if (this.global) args.push(...this.global.getArgs(this.refs))

    const compilations = await Promise.allSettled([
      ...this.inputs.map(async (input) => {
        const compiled = await input.compile(this.refs)
        if (compiled.pipe) {
          const pipeHandler = await createPipeHandler(compiled.pipe)
          const stream = createWriteStream(pipeHandler.path)
          let opened = false
          stream.once("open", () => {
            opened = true
          })
          stream.once("close", () => {
            if (opened) void pipeHandler.release()
          })
          inputStreams.push({
            ...pipeHandler,
            destination: stream,
            source: input.source as Readable
          })
        }
        return compiled.args
      }),
      ...this.outputs.map(async (output) => {
        const compiled = await output.compile(this.refs)
        if (compiled.pipe) {
          const pipeHandler = await createPipeHandler(compiled.pipe)
          const stream = createReadStream(pipeHandler.path)
          let opened = false
          stream.once("open", () => {
            opened = true
          })
          stream.once("close", () => {
            if (opened) void pipeHandler.release()
          })
          outputStreams.push({
            ...pipeHandler,
            source: stream,
            destination: output.destination as Writable
          })
        }
        return compiled.args
      })
    ])

    const errors = compilations.filter((result) => result.status === "rejected")

    if (errors.length > 0) {
      await cleanCompiledStreams(inputStreams, outputStreams)
      throw new Error(
        `Failed to compile command: ${errors.map((e) => e.reason).join(", ")}`
      )
    }

    args.push(
      ...compilations.flatMap(
        (v) => (v as PromiseFulfilledResult<string[]>).value
      )
    )

    const clean = createCompiledStreamsCleaner(inputStreams, outputStreams)

    return {
      args,
      inputStreams: [...inputStreams],
      outputStreams: [...outputStreams],
      [Symbol.asyncDispose]: clean
    }
  }
}

function createCompiledStreamsCleaner(
  inputStreams: FFmpeguPipeInputStream[],
  outputStreams: FFmpeguPipeOutputStream[]
) {
  let cleanPromise: Promise<void> | undefined

  return async () => {
    cleanPromise ??= cleanCompiledStreams(inputStreams, outputStreams)
    await cleanPromise
  }
}

async function cleanCompiledStreams(
  inputStreams: FFmpeguPipeInputStream[],
  outputStreams: FFmpeguPipeOutputStream[]
) {
  await Promise.all([
    ...inputStreams.map(async (stream) => {
      if (!stream.destination.destroyed) {
        stream.destination.destroy()
      }
      await stream.clean()
    }),
    ...outputStreams.map(async (stream) => {
      if (!stream.source.destroyed) {
        stream.source.destroy()
      }
      await stream.clean()
    })
  ])
}
