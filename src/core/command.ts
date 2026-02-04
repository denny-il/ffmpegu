import assert from "node:assert"
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
  private readonly inputPipeStreams = new Map<
    FFmpeguInput,
    FFmpeguPipeInputStream
  >()
  private readonly outputPipeStreams = new Map<
    FFmpeguOutput,
    FFmpeguPipeOutputStream
  >()

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

    if (this.global) args.push(...this.global.getArgs(this.refs))

    const compilations = await Promise.allSettled([
      ...this.inputs.map(async (input) => {
        const args = await input.compile(this.refs)
        if (input.pipe) {
          const pipeHandler = await createPipeHandler(input.pipe)
          const stream = pipeHandler.handler.createWriteStream()
          this.inputPipeStreams.set(input, {
            ...pipeHandler,
            destination: stream,
            source: input.source as Readable
          })
        }
        return args
      }),
      ...this.outputs.map(async (output) => {
        const args = await output.compile(this.refs)
        if (output.pipe) {
          const pipeHandler = await createPipeHandler(output.pipe)
          const stream = pipeHandler.handler.createReadStream()
          this.outputPipeStreams.set(output, {
            ...pipeHandler,
            source: stream,
            destination: output.destination as Writable
          })
        }
        return args
      })
    ])

    const errors = compilations.filter((result) => result.status === "rejected")

    if (errors.length > 0) {
      await this.clean()
      throw new Error(
        `Failed to compile command: ${errors.map((e) => e.reason).join(", ")}`
      )
    }

    args.push(
      ...compilations.flatMap(
        (v) => (v as PromiseFulfilledResult<string[]>).value
      )
    )

    const inputStreams = Array.from(this.inputPipeStreams.values())
    const outputStreams = Array.from(this.outputPipeStreams.values())

    return {
      args,
      inputStreams,
      outputStreams,
      [Symbol.asyncDispose]: this.clean.bind(this)
    }
  }

  protected async clean() {
    await Promise.all([
      ...Array.from(this.inputPipeStreams.values()).map((stream) =>
        stream.clean()
      ),
      ...Array.from(this.outputPipeStreams.values()).map((stream) =>
        stream.clean()
      )
    ])
    this.inputPipeStreams.clear()
    this.outputPipeStreams.clear()
  }
}
