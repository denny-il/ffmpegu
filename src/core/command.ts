import { dual } from "effect/Function"
import * as Pipeable from "effect/Pipeable"
import * as Result from "effect/Result"
import type * as Sink from "effect/Sink"
import type * as Stream from "effect/Stream"
import { CommandError } from "../errors.ts"
import { FFmpeguOptions } from "../options/core.ts"
import type { FFmpeguInput } from "./input.ts"
import {
  type FFmpeguOutput,
  STREAM_DESTINATION,
  StreamOutputs
} from "./output.ts"
import { CommandReferences, ForeignReference } from "./references.ts"
import { isDescriptorPath, isReservedInputPath } from "./validation.ts"

/** File descriptor reserved for `-progress`; set up only when progress is requested. */
export const PROGRESS_FD = 3
/** First file descriptor assigned to stream inputs and piped outputs. */
export const FIRST_STREAM_FD = 4

export interface CompiledInputStream<E, R> {
  readonly fd: number
  readonly source: Stream.Stream<Uint8Array, E, R>
}

export interface CompiledOutputStream<E, R> {
  readonly fd: number
  readonly sink: Sink.Sink<void, Uint8Array, never, E, R>
}

/**
 * Deterministic execution plan of a command. `args` reference stream inputs,
 * sink outputs and stream outputs as `pipe:<fd>`; the runner owns those
 * descriptors.
 */
export interface CompiledCommand<E, R> {
  readonly args: ReadonlyArray<string>
  readonly inputStreams: ReadonlyArray<CompiledInputStream<E, R>>
  /** Sink outputs. */
  readonly outputStreams: ReadonlyArray<CompiledOutputStream<E, R>>
  /** Descriptors of `Output.toStream` outputs, in output order. */
  readonly streamOutputFds: ReadonlyArray<number>
}

type ValidInput = FFmpeguInput<unknown, unknown>
type ValidOutput = FFmpeguOutput<unknown, unknown, any>

// Constraints of `make` that do not mention `E`/`R`: `new FFmpeguInput(path)`
// has no argument to infer them from and would otherwise adopt them from its
// contextual type, i.e. `any` from `FFmpeguInput<any, any>`. `ValidElements`
// checks sources and destinations once the arrays are inferred.
type AnyInput = Omit<ValidInput, "source"> & { readonly source: unknown }
type AnyOutput = Omit<ValidOutput, "destination"> & {
  readonly destination: unknown
}
type ValidElements<I, O> = ([I] extends [ReadonlyArray<ValidInput>]
  ? unknown
  : { readonly inputs?: ReadonlyArray<ValidInput> | undefined }) &
  ([O] extends [ReadonlyArray<ValidOutput>]
    ? unknown
    : { readonly outputs?: ReadonlyArray<ValidOutput> | undefined })

type InputError<I> = I extends FFmpeguInput<infer E, infer _R> ? E : never
type InputContext<I> = I extends FFmpeguInput<infer _E, infer R> ? R : never
type OutputError<O> = O extends FFmpeguOutput<infer E, infer _R> ? E : never
type OutputContext<O> = O extends FFmpeguOutput<infer _E, infer R> ? R : never
type OutputStreams<O> =
  O extends FFmpeguOutput<infer _E, infer _R, infer S> ? S : never

/**
 * Number of `Output.toStream` outputs of a command: `0`, `1`, or `2` for two
 * or more. `any` means unknown and is not checked at compile time.
 */
type StreamOutputCount = 0 | 1 | 2

// `0 extends 1 & X` holds only when `X` is `any`: an unknown count stays
// unknown. Otherwise distributes, so a possible stream output (`0 | 1`) keeps
// both outcomes and neither runner accepts the command.
type AddStreamOutputs<S, O> = 0 extends 1 & (S | O)
  ? any
  : S extends unknown
    ? O extends 0
      ? S
      : S extends 0
        ? 1
        : 2
    : never

/**
 * Counts tuples element by element into the accumulator `S`. Arrays of unknown
 * length add nothing only when none of their elements can be a stream output.
 * Tail-recursive so that long output tuples stay within the instantiation
 * depth limit.
 */
type CountStreamOutputs<
  O extends ReadonlyArray<AnyOutput>,
  S extends StreamOutputCount = 0
> = O extends readonly [
  infer Head,
  ...infer Tail extends ReadonlyArray<AnyOutput>
]
  ? CountStreamOutputs<Tail, AddStreamOutputs<S, OutputStreams<Head>>>
  : O extends readonly []
    ? S
    : 0 extends 1 & OutputStreams<O[number]>
      ? any
      : [OutputStreams<O[number]>] extends [0]
        ? S
        : any

export interface FFmpeguCommandOptions<E, R> {
  readonly global?: FFmpeguOptions | undefined
  readonly inputs?: ReadonlyArray<FFmpeguInput<E, R>> | undefined
  readonly outputs?: ReadonlyArray<FFmpeguOutput<E, R>> | undefined
}

/**
 * Immutable description of an ffmpeg invocation:
 * `[global options] ([input options] -i input)* ([output options] output)*`.
 *
 * `E` and `R` are the unions of the error and requirement types of all stream
 * inputs and sink outputs. `S` counts `Output.toStream` outputs so that `run`
 * accepts only `0` and `stream` only `1`. It defaults to `any` (unknown), which
 * leaves the check to runtime, e.g. for commands typed as `FFmpeguCommand<E, R>`.
 *
 * Pipeable: `withGlobal`, `withInput` and `withOutput` are also available as
 * data-first or data-last statics, e.g.
 * `command.pipe(Command.withOutput(output))`.
 */
export class FFmpeguCommand<
  E = never,
  R = never,
  S extends StreamOutputCount = any
>
  extends Pipeable.Class
{
  declare readonly [StreamOutputs]: S
  readonly global: FFmpeguOptions | undefined
  readonly inputs: ReadonlyArray<FFmpeguInput<E, R>>
  readonly outputs: ReadonlyArray<FFmpeguOutput<E, R>>

  constructor(options: FFmpeguCommandOptions<E, R> = {}) {
    super()
    this.global = options.global
    this.inputs = [...(options.inputs ?? [])]
    this.outputs = [...(options.outputs ?? [])]
  }

  /**
   * Create a command, inferring `E`/`R` as the union over all inputs and
   * outputs, including heterogeneous arrays.
   */
  static make<
    const I extends ReadonlyArray<AnyInput> = readonly [],
    const O extends ReadonlyArray<AnyOutput> = readonly []
  >(
    options: {
      readonly global?: FFmpeguOptions | undefined
      readonly inputs?: I | undefined
      readonly outputs?: O | undefined
    } & ValidElements<I, O>
  ): FFmpeguCommand<
    InputError<I[number]> | OutputError<O[number]>,
    InputContext<I[number]> | OutputContext<O[number]>,
    CountStreamOutputs<O>
  > {
    return new FFmpeguCommand(options as FFmpeguCommandOptions<any, any>)
  }

  /** Alias of {@link FFmpeguCommand.make}. */
  static create = FFmpeguCommand.make

  /** Compiled argv of a command without runtime-owned flags. */
  static toArgs(
    command: FFmpeguCommand<any, any>
  ): Result.Result<ReadonlyArray<string>, CommandError> {
    return Result.map(command.compile(), (compiled) => compiled.args)
  }

  /** Data-first or data-last {@link FFmpeguCommand.prototype.withGlobal}. */
  static withGlobal: {
    (
      options: FFmpeguOptions
    ): <E, R, S extends StreamOutputCount = any>(
      self: FFmpeguCommand<E, R, S>
    ) => FFmpeguCommand<E, R, S>
    <E, R, S extends StreamOutputCount = any>(
      self: FFmpeguCommand<E, R, S>,
      options: FFmpeguOptions
    ): FFmpeguCommand<E, R, S>
  } = dual(
    2,
    <E, R, S extends StreamOutputCount>(
      self: FFmpeguCommand<E, R, S>,
      options: FFmpeguOptions
    ) => self.withGlobal(options)
  )

  /** Data-first or data-last {@link FFmpeguCommand.prototype.withInput}. */
  static withInput: {
    <E2, R2>(
      input: FFmpeguInput<E2, R2>
    ): <E, R, S extends StreamOutputCount = any>(
      self: FFmpeguCommand<E, R, S>
    ) => FFmpeguCommand<E | E2, R | R2, S>
    <E, R, E2, R2, S extends StreamOutputCount = any>(
      self: FFmpeguCommand<E, R, S>,
      input: FFmpeguInput<E2, R2>
    ): FFmpeguCommand<E | E2, R | R2, S>
  } = dual(
    2,
    <E, R, E2, R2, S extends StreamOutputCount>(
      self: FFmpeguCommand<E, R, S>,
      input: FFmpeguInput<E2, R2>
    ) => self.withInput(input)
  )

  /** Data-first or data-last {@link FFmpeguCommand.prototype.withOutput}. */
  static withOutput: {
    <E2, R2, S2 extends 0 | 1 = any>(
      output: FFmpeguOutput<E2, R2, S2>
    ): <E, R, S extends StreamOutputCount = any>(
      self: FFmpeguCommand<E, R, S>
    ) => FFmpeguCommand<E | E2, R | R2, AddStreamOutputs<S, S2>>
    <E, R, E2, R2, S extends StreamOutputCount = any, S2 extends 0 | 1 = any>(
      self: FFmpeguCommand<E, R, S>,
      output: FFmpeguOutput<E2, R2, S2>
    ): FFmpeguCommand<E | E2, R | R2, AddStreamOutputs<S, S2>>
  } = dual(
    2,
    <E, R, E2, R2, S extends StreamOutputCount, S2 extends 0 | 1>(
      self: FFmpeguCommand<E, R, S>,
      output: FFmpeguOutput<E2, R2, S2>
    ) => self.withOutput(output)
  )

  withGlobal(options: FFmpeguOptions): FFmpeguCommand<E, R, S> {
    return new FFmpeguCommand<E, R, S>({
      inputs: this.inputs,
      outputs: this.outputs,
      global: this.global ? FFmpeguOptions.merge(this.global, options) : options
    })
  }

  withInput<E2, R2>(
    input: FFmpeguInput<E2, R2>
  ): FFmpeguCommand<E | E2, R | R2, S> {
    return new FFmpeguCommand<E | E2, R | R2, S>({
      global: this.global,
      inputs: [...this.inputs, input],
      outputs: this.outputs
    })
  }

  withOutput<E2, R2, S2 extends 0 | 1 = any>(
    output: FFmpeguOutput<E2, R2, S2>
  ): FFmpeguCommand<E | E2, R | R2, AddStreamOutputs<S, S2>> {
    return new FFmpeguCommand<E | E2, R | R2, AddStreamOutputs<S, S2>>({
      global: this.global,
      inputs: this.inputs,
      outputs: [...this.outputs, output]
    })
  }

  /**
   * Validate and render the command. Pure: no resources are created and
   * stream sources/sinks are not touched.
   */
  compile(): Result.Result<CompiledCommand<E, R>, CommandError> {
    const indices = new Map<object, number>()
    for (const [index, input] of this.inputs.entries()) {
      if (indices.has(input)) {
        return fail(
          "DuplicateInput",
          `Input[${index}] is already part of the command as Input[${indices.get(input)}]. Create a separate input instead.`
        )
      }
      indices.set(input, index)
    }

    const outputs = new Map<object, number>()
    for (const [index, output] of this.outputs.entries()) {
      if (outputs.has(output)) {
        return fail(
          "DuplicateOutput",
          `Output[${index}] is already part of the command as Output[${outputs.get(output)}]. Create a separate output instead.`
        )
      }
      outputs.set(output, index)
    }

    const refs = new CommandReferences(indices)
    const args: string[] = []
    const inputStreams: Array<CompiledInputStream<E, R>> = []
    const outputStreams: Array<CompiledOutputStream<E, R>> = []
    const streamOutputFds: Array<number> = []
    let fd = FIRST_STREAM_FD

    try {
      if (this.global) {
        const error = pushOptions(args, this.global, refs, "global options")
        if (error) return Result.fail(error)
      }

      for (const [index, input] of this.inputs.entries()) {
        const at = `Input[${index}]`
        if (input.options) {
          const error = pushOptions(args, input.options, refs, `${at} options`)
          if (error) return Result.fail(error)
        }
        if (typeof input.source === "string") {
          const error = validateInputPath(input.source, at)
          if (error) return Result.fail(error)
          args.push("-i", input.source)
        } else {
          inputStreams.push({ fd, source: input.source })
          args.push("-i", `pipe:${fd++}`)
        }
      }

      for (const [index, output] of this.outputs.entries()) {
        const at = `Output[${index}]`
        if (output.options) {
          const error = pushOptions(args, output.options, refs, `${at} options`)
          if (error) return Result.fail(error)
        }
        if (typeof output.destination === "string") {
          const error = validateOutputPath(output.destination, at)
          if (error) return Result.fail(error)
          args.push(output.destination)
        } else if (output.destination === STREAM_DESTINATION) {
          streamOutputFds.push(fd)
          args.push(`pipe:${fd++}`)
        } else {
          outputStreams.push({ fd, sink: output.destination })
          args.push(`pipe:${fd++}`)
        }
      }
    } catch (cause) {
      if (cause instanceof ForeignReference) {
        return fail(
          "ForeignReference",
          "A stream reference points to an input that is not part of the command. Add the input to the command or reference one of its inputs.",
          cause
        )
      }
      return fail(
        "InvalidArgument",
        "Failed to render command arguments",
        cause
      )
    }

    return Result.succeed({
      args,
      inputStreams,
      outputStreams,
      streamOutputFds
    })
  }
}

const fail = (
  reason: CommandError["reason"],
  message: string,
  cause?: unknown
) => Result.fail(new CommandError({ reason, message, cause }))

const reservedPath = (what: string, value: string) =>
  new CommandError({
    reason: "ReservedPath",
    message: `${what} uses "${value}", which addresses a file descriptor owned by ffmpegu. Use Input.fromStream/Output.toSink/Output.toStream for piped data.`
  })

/**
 * Options owned by the compiler and runner, with the hint shown when a user
 * option sets them:
 * - `-i` declares an input; inputs added outside `inputs` would shift the
 *   positional indices that stream references resolve to.
 * - `-progress` would redirect the progress report away from the runner.
 * - `-stdin` would re-enable interaction on a stdin the runner does not
 *   provide.
 */
const ENGINE_OPTIONS: ReadonlyMap<string, string> = new Map([
  ["-i", "Declare inputs with Input.fromFile or Input.fromStream."],
  ["-progress", "Pass onProgress to run instead."],
  ["-stdin", "The runner never provides stdin."]
])

/**
 * ffmpeg resolves an option by the name before its first `:`, so stream
 * specifiers (`-progress:v`) do not change which option is set.
 */
const optionName = (token: string) => {
  const separator = token.indexOf(":")
  return separator === -1 ? token : token.slice(0, separator)
}

function pushOptions(
  args: string[],
  options: FFmpeguOptions,
  refs: CommandReferences,
  what: string
): CommandError | undefined {
  const rendered = options.getArgs(refs)
  for (const token of rendered) {
    if (isDescriptorPath(token)) return reservedPath(what, token)
    const hint = token.startsWith("-")
      ? ENGINE_OPTIONS.get(optionName(token))
      : undefined
    if (hint !== undefined) {
      return new CommandError({
        reason: "ReservedOption",
        message: `${what} set "${token}", which is managed by ffmpegu. ${hint}`
      })
    }
  }
  args.push(...rendered)
  return undefined
}

function validateInputPath(path: string, what: string) {
  // "-" is stdin, which the runner does not provide.
  if (isReservedInputPath(path)) {
    return reservedPath(what, path)
  }
  return undefined
}

function validateOutputPath(path: string, what: string) {
  if (isReservedInputPath(path)) {
    return reservedPath(what, path)
  }
  // Output names are positional, so ffmpeg would parse them as options.
  if (path.startsWith("-")) {
    return new CommandError({
      reason: "InvalidArgument",
      message: `${what} path "${path}" starts with "-" and would be parsed as an option. Use "./${path}" instead.`
    })
  }
  return undefined
}
