import { Schema } from "effect"

/**
 * The command cannot be compiled into a safe ffmpeg or ffprobe invocation.
 */
export class CommandError extends Schema.TaggedError<CommandError>()(
  "CommandError",
  {
    reason: Schema.Literals([
      "DuplicateInput",
      "DuplicateOutput",
      "ForeignReference",
      "ReservedPath",
      "ReservedOption",
      "InvalidArgument",
      "StreamOutput"
    ]),
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}

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

/**
 * A caller-provided output sink completed before consuming the whole output.
 */
export class OutputError extends Schema.TaggedError<OutputError>()(
  "OutputError",
  {
    reason: Schema.Literal("SinkEndedEarly"),
    fd: Schema.Number
  }
) {
  override get message() {
    return `Output sink for fd ${this.fd} completed before the end of the output stream`
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
