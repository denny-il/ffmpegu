import * as Result from "effect/Result"
import {
  CommandError,
  type CommandErrorReason,
  type CommandLocation,
  ForeignReference as ForeignReferenceReason,
  InvalidArgument,
  ReservedOption,
  ReservedPath
} from "../errors.ts"
import type { FFmpeguOptions } from "../options/core.ts"
import { CommandReferences, ForeignReference } from "../core/references.ts"
import { isReservedInputPath } from "../core/validation.ts"

const RESERVED_OPTIONS = new Set([
  "i",
  "o",
  "of",
  "output_format",
  "print_format"
])

/** Pure compilation; the probe service always owns input, JSON and stdout. */
export const probeArgs = (
  input: string,
  options?: FFmpeguOptions
): Result.Result<ReadonlyArray<string>, CommandError> => {
  if (input.includes("\0")) {
    return fail(
      new InvalidArgument({ message: "Probe input contains a NUL byte." })
    )
  }
  if (isReservedInputPath(input)) {
    return fail(
      new ReservedPath({
        path: input,
        location: PROBE,
        message: `Probe input "${input}" addresses a process-owned descriptor.`
      })
    )
  }

  let args: string[]
  try {
    // FFmpeg stream references have no meaning in a single-input probe.
    args = options?.getArgs(new CommandReferences(new Map())) ?? [
      "-show_format",
      "-show_streams"
    ]
  } catch (cause) {
    const message = "Failed to render probe options."
    return fail(
      cause instanceof ForeignReference
        ? new ForeignReferenceReason({ message })
        : new InvalidArgument({ message }),
      cause
    )
  }

  for (const token of args) {
    if (token.includes("\0"))
      return fail(
        new InvalidArgument({ message: "Probe option contains a NUL byte." })
      )
    if (isReservedInputPath(token)) {
      return fail(
        new ReservedPath({
          path: token,
          location: PROBE,
          message: `Probe option "${token}" addresses a process-owned descriptor.`
        })
      )
    }
    // Normalize stream specifiers and FFmpeg's file-loaded option spelling.
    // Inspect all tokens, like Command.compile, including raw builder args.
    const name = token.replace(/^-+\/?/, "").split(":", 1)[0]
    if (
      token === "--" ||
      (token.startsWith("-") && RESERVED_OPTIONS.has(name))
    ) {
      return fail(
        new ReservedOption({
          option: token,
          location: PROBE,
          message: `Probe option "${token}" is managed by ffmpegu. Pass the input to probe; JSON output is collected from stdout.`
        })
      )
    }
  }

  if (options === undefined) {
    return Result.succeed(["-hide_banner", "-of", "json", ...args, "-i", input])
  }
  // ffprobe can keep the first positional input even when a later -i names
  // another one. Claim the input first so stray values and missing option
  // arguments cannot replace it or consume its -i marker.
  return Result.succeed(["-hide_banner", "-of", "json", "-i", input, ...args])
}

const PROBE: CommandLocation = { _tag: "Probe" }

const fail = (reason: CommandErrorReason, cause?: unknown) =>
  Result.fail(new CommandError({ reason, cause }))
