import { Schema } from "effect"

/**
 * Part of a command a rejected value belongs to: the global options, the
 * input or output at `index` (its path or options), or an FFprobe invocation
 * (its input or options).
 */
export const CommandLocation = Schema.Union([
  Schema.TaggedStruct("Global", {}),
  Schema.TaggedStruct("Input", { index: Schema.Int }),
  Schema.TaggedStruct("Output", { index: Schema.Int }),
  Schema.TaggedStruct("Probe", {})
])
export type CommandLocation = typeof CommandLocation.Type

// Reasons keep the message written where they are detected, since it carries
// the remedy for that call site; the other fields are for programmatic use.

/** An input object appears more than once in a command. */
export class DuplicateInput extends Schema.TaggedClass<DuplicateInput>()(
  "DuplicateInput",
  {
    index: Schema.Int,
    /** Position of the first occurrence. */
    firstIndex: Schema.Int,
    message: Schema.String
  }
) {}

/** An output object appears more than once in a command. */
export class DuplicateOutput extends Schema.TaggedClass<DuplicateOutput>()(
  "DuplicateOutput",
  {
    index: Schema.Int,
    /** Position of the first occurrence. */
    firstIndex: Schema.Int,
    message: Schema.String
  }
) {}

/** A stream reference points to an input that is not part of the command. */
export class ForeignReference extends Schema.TaggedClass<ForeignReference>()(
  "ForeignReference",
  { message: Schema.String }
) {}

/** A path or option value addresses a descriptor owned by ffmpegu. */
export class ReservedPath extends Schema.TaggedClass<ReservedPath>()(
  "ReservedPath",
  {
    path: Schema.String,
    location: CommandLocation,
    message: Schema.String
  }
) {}

/** An option managed by ffmpegu is set by the caller. */
export class ReservedOption extends Schema.TaggedClass<ReservedOption>()(
  "ReservedOption",
  {
    /** The option as given, including any stream specifier. */
    option: Schema.String,
    location: CommandLocation,
    message: Schema.String
  }
) {}

/**
 * Any other invalid value, including a builder that failed to render; the
 * failure is then the `cause` of the {@link CommandError}.
 */
export class InvalidArgument extends Schema.TaggedClass<InvalidArgument>()(
  "InvalidArgument",
  { message: Schema.String }
) {}

/**
 * The command's `Output.toStream` outputs do not fit the runner: `run`
 * accepts none, `stream` exactly one.
 */
export class StreamOutput extends Schema.TaggedClass<StreamOutput>()(
  "StreamOutput",
  {
    /** Number of `Output.toStream` outputs in the command. */
    count: Schema.Int,
    message: Schema.String
  }
) {}

export type CommandErrorReason =
  | DuplicateInput
  | DuplicateOutput
  | ForeignReference
  | ReservedPath
  | ReservedOption
  | InvalidArgument
  | StreamOutput

/**
 * The command cannot be compiled into a safe ffmpeg or ffprobe invocation.
 * Handle a single reason with `Effect.catchReason("CommandError", tag, f)`.
 */
export class CommandError extends Schema.TaggedError<CommandError>()(
  "CommandError",
  {
    reason: Schema.Union([
      DuplicateInput,
      DuplicateOutput,
      ForeignReference,
      ReservedPath,
      ReservedOption,
      InvalidArgument,
      StreamOutput
    ]),
    cause: Schema.optional(Schema.Unknown)
  }
) {
  override get message() {
    return this.reason.message
  }
}

/**
 * The binary could not be started (missing, not executable, bad cwd, ...).
 */
export class SpawnError extends Schema.TaggedError<SpawnError>()("SpawnError", {
  binary: Schema.String,
  cause: Schema.Unknown
}) {
  override get message() {
    return `Failed to spawn ${this.binary}`
  }
}

/**
 * The process exited unsuccessfully.
 *
 * `exitCode` is `null` when the process did not report an exit code, which
 * happens when it was terminated by a signal; `cause` then carries the
 * platform error describing the termination.
 */
export class ExitError extends Schema.TaggedError<ExitError>()("ExitError", {
  exitCode: Schema.NullOr(Schema.Number),
  stderr: Schema.String,
  cause: Schema.optional(Schema.Unknown)
}) {
  override get message() {
    const status =
      this.exitCode === null
        ? "without an exit code"
        : `with exit code ${this.exitCode}`
    return this.stderr.length > 0
      ? `Process exited ${status}: ${this.stderr}`
      : `Process exited ${status}`
  }
}

/**
 * A library-owned pipe (media file descriptor, stderr or progress) failed.
 * Errors raised by caller-provided streams or sinks are never wrapped in this
 * error; they surface unchanged.
 */
export class PipeError extends Schema.TaggedError<PipeError>()("PipeError", {
  fd: Schema.Number,
  direction: Schema.Literals(["input", "output"]),
  cause: Schema.Unknown
}) {
  override get message() {
    return `Failed to ${this.direction === "input" ? "write to" : "read from"} fd ${this.fd}`
  }
}

/** The output sink for `fd` completed before the end of the output stream. */
export class SinkEndedEarly extends Schema.TaggedClass<SinkEndedEarly>()(
  "SinkEndedEarly",
  { fd: Schema.Number }
) {
  get message() {
    return `Output sink for fd ${this.fd} completed before the end of the output stream`
  }
}

/** A caller-provided output sink completed before consuming the whole output. */
export class OutputError extends Schema.TaggedError<OutputError>()(
  "OutputError",
  { reason: SinkEndedEarly }
) {
  override get message() {
    return this.reason.message
  }
}

/**
 * ffprobe wrote more to stdout than the configured limit.
 */
export class ProbeOutputError extends Schema.TaggedError<ProbeOutputError>()(
  "ProbeOutputError",
  {
    maxOutputBytes: Schema.Number
  }
) {
  override get message() {
    return `ffprobe output exceeded ${this.maxOutputBytes} bytes`
  }
}

/**
 * ffprobe output is not valid JSON or does not match the expected shape.
 */
export class ProbeDecodeError extends Schema.TaggedError<ProbeDecodeError>()(
  "ProbeDecodeError",
  {
    message: Schema.String,
    cause: Schema.Unknown
  }
) {}

export type FFmpegError =
  | CommandError
  | SpawnError
  | ExitError
  | PipeError
  | OutputError

export type ProbeError =
  | CommandError
  | SpawnError
  | ExitError
  | PipeError
  | ProbeOutputError
  | ProbeDecodeError
