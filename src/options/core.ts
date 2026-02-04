import { FFmpeguArgument } from "../core/argument.ts"
import type {
  FFmpeguReferencesInterface,
  FFmpeguUserArg,
  FFmpeguUserArgValue
} from "../types/index.ts"

export class FFmpeguOptions extends FFmpeguArgument {
  constructor(readonly args: FFmpeguUserArg[]) {
    super()
  }

  static create(...args: FFmpeguUserArg[]) {
    return new FFmpeguOptions(args)
  }

  static concat(source: FFmpeguOptions, ...args: FFmpeguUserArg[]) {
    return new FFmpeguOptions([...source.args, ...args])
  }

  static merge(...args: FFmpeguOptions[]) {
    return new FFmpeguOptions([...args.flatMap((arg) => arg.args)])
  }

  getArgs(refs: FFmpeguReferencesInterface): string[] {
    const args: string[] = []

    for (const arg of this.args) {
      args.push(...this.resolveOption(arg, refs))
    }

    return args
  }

  private resolveOption(
    arg: FFmpeguUserArg,
    refs: FFmpeguReferencesInterface
  ): string[] {
    if (this.isFFmpeguArgumentable(arg)) {
      return arg.getArgs(refs)
    }

    const args: string[] = []

    if (Array.isArray(arg)) {
      const [name, value] = arg
      if (typeof value !== "undefined") {
        args.push(...this.resolveOptionValue(name, value, refs))
      } else {
        args.push(name.startsWith("-") ? name : `-${name}`)
      }
    } else if (typeof arg === "object") {
      for (const [name, value] of Object.entries(arg)) {
        args.push(...this.resolveOptionValue(name, value, refs))
      }
    } else {
      args.push(String(arg))
    }

    return args
  }

  private resolveOptionValue(
    name: string,
    value: FFmpeguUserArgValue,
    refs: FFmpeguReferencesInterface
  ): string[] {
    if (name.startsWith("-") === false) {
      name = `-${name}`
    }

    if (this.isFFmpeguArgumentable(value)) {
      return [name, ...value.getArgs(refs)]
    }

    if (typeof value === "boolean") {
      if (value) return [name]
      else return []
    }

    return [name, String(value)]
  }

  private isFFmpeguArgumentable(value: unknown): value is FFmpeguArgument {
    return value instanceof FFmpeguArgument
  }
}
