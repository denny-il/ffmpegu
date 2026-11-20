import { Argument } from "../core/argument.ts"
import type { References } from "../types/index.ts"

/**
 * Value of a named option. `true` renders the bare flag and `false` omits the
 * option; arguments render themselves.
 */
export type ArgValue = string | number | boolean | Argument

/**
 * One entry of an options bundle: a token passed verbatim, a nested bundle, a
 * `[name, value?]` tuple, or a record of named options. Record entries set to
 * `undefined` are omitted.
 */
export type Arg =
  | string
  | Options
  | readonly [string, ArgValue?]
  | Readonly<Record<string, ArgValue | undefined>>

/** An immutable list of ffmpeg or ffprobe arguments. */
export class Options extends Argument {
  readonly args: ReadonlyArray<Arg>

  constructor(args: ReadonlyArray<Arg>) {
    super()
    // Flatten nested bundles and copy tuple and record entries, so later
    // changes to the caller's values or to another bundle's entries cannot
    // alter this one. A subclass may render differently from its entries, so
    // it stays nested and renders itself.
    this.args = args.flatMap((arg) =>
      arg instanceof Options && arg.constructor === Options
        ? arg.args.map(copyArg)
        : [copyArg(arg)]
    )
  }

  getArgs(refs: References): string[] {
    const args: string[] = []

    for (const arg of this.args) {
      if (arg instanceof Argument) {
        args.push(...arg.getArgs(refs))
      } else if (isTupleArg(arg)) {
        const [name, value] = arg
        if (value === undefined) args.push(optionName(name))
        else pushOption(args, name, value, refs)
      } else if (typeof arg === "object") {
        for (const [name, value] of Object.entries(arg)) {
          // An optional key set to undefined means "not set", as in filters.
          if (value !== undefined) pushOption(args, name, value, refs)
        }
      } else {
        args.push(String(arg))
      }
    }

    return args
  }
}

/** Build a bundle from any mix of option forms, rendered in order. */
export const make = (...args: ReadonlyArray<Arg>): Options => new Options(args)

/**
 * @internal Bundle for a parameter that accepts option forms directly;
 * `undefined` when there are none. `undefined` entries are skipped, so a
 * caller can pass an optional bundle. A lone bundle is used as it is.
 */
export const fromArgs = (
  args: ReadonlyArray<Arg | undefined>
): Options | undefined => {
  const given = args.filter((arg) => arg !== undefined)
  return given.length === 0
    ? undefined
    : given.length === 1 && given[0] instanceof Options
      ? given[0]
      : new Options(given)
}

type TupleArg = Extract<Arg, ReadonlyArray<unknown>>

// `Array.isArray` does not narrow readonly tuples, so check them explicitly.
const isTupleArg = (arg: Arg): arg is TupleArg => Array.isArray(arg)

const copyArg = (arg: Arg): Arg =>
  typeof arg !== "object" || arg instanceof Argument
    ? arg
    : isTupleArg(arg)
      ? [...arg]
      : { ...arg }

const optionName = (name: string) => (name.startsWith("-") ? name : `-${name}`)

const pushOption = (
  args: string[],
  name: string,
  value: ArgValue,
  refs: References
): void => {
  if (value instanceof Argument) {
    args.push(optionName(name), ...value.getArgs(refs))
  } else if (typeof value !== "boolean") {
    args.push(optionName(name), String(value))
  } else if (value) {
    args.push(optionName(name))
  }
}
