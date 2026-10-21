import { FFmpeguArgument } from "../core/argument.ts"
import type {
  FFmpeguReferencesInterface,
  FFmpeguUserArg,
  FFmpeguUserArgValue
} from "../types/index.ts"

export class FFmpeguOptions extends FFmpeguArgument {
  readonly args: ReadonlyArray<FFmpeguUserArg>

  constructor(args: ReadonlyArray<FFmpeguUserArg>) {
    super()
    // Copy the array and its tuple and record entries so later changes to the
    // caller's values cannot alter this value or bundles derived from it.
    this.args = args.map(copyArg)
  }

  static create(...args: FFmpeguUserArg[]) {
    return new FFmpeguOptions(args)
  }

  static concat(source: FFmpeguOptions, ...args: FFmpeguUserArg[]) {
    return new FFmpeguOptions([...source.args, ...args])
  }

  static merge(...args: FFmpeguOptions[]) {
    return new FFmpeguOptions(args.flatMap((arg) => arg.args))
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

    if (isTupleArg(arg)) {
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

type FFmpeguTupleArg = Extract<FFmpeguUserArg, ReadonlyArray<unknown>>

// `Array.isArray` does not narrow readonly tuples, so check them explicitly.
function isTupleArg(arg: FFmpeguUserArg): arg is FFmpeguTupleArg {
  return Array.isArray(arg)
}

function copyArg(arg: FFmpeguUserArg): FFmpeguUserArg {
  if (typeof arg !== "object" || arg instanceof FFmpeguArgument) return arg
  return isTupleArg(arg) ? [...arg] : { ...arg }
}
