import { inspect } from "node:util"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  CommandError,
  ExitError,
  OutputError,
  PipeError,
  ProbeOutputError,
  ReservedPath,
  SinkEndedEarly,
  SpawnError
} from "../../src/errors.ts"

describe("errors", () => {
  // The message is derived from the other fields rather than encoded, yet
  // console and Effect logging (both via inspect), JSON log consumers and
  // native stack output still expect to find it on the error.
  it.each([
    [
      "CommandError",
      CommandError,
      new CommandError({
        reason: new ReservedPath({
          path: "pipe:4",
          location: { _tag: "Input", index: 0 },
          message: "pipe:4 is reserved"
        })
      }),
      "pipe:4 is reserved"
    ],
    [
      "OutputError",
      OutputError,
      new OutputError({ reason: new SinkEndedEarly({ fd: 4 }) }),
      "Output sink for fd 4 completed before the end of the output stream"
    ],
    [
      "SpawnError",
      SpawnError,
      new SpawnError({ binary: "/usr/bin/ffmpeg", cause: new Error("ENOENT") }),
      "Failed to spawn /usr/bin/ffmpeg"
    ],
    [
      "ExitError",
      ExitError,
      new ExitError({ exitCode: 1, stderr: "Invalid data found" }),
      "Process exited with exit code 1: Invalid data found"
    ],
    [
      "PipeError",
      PipeError,
      new PipeError({ fd: 3, direction: "input", cause: new Error("EPIPE") }),
      "Failed to write to fd 3"
    ],
    [
      "ProbeOutputError",
      ProbeOutputError,
      new ProbeOutputError({ maxOutputBytes: 1024 }),
      "ffprobe output exceeded 1024 bytes"
    ]
  ] as const)(
    "should expose the derived message to diagnostics (%s)",
    (_, schema, error, message) => {
      expect(error.message).toBe(message)
      expect(error.toJSON()).toMatchObject({ message })
      expect(inspect(error)).toContain(message)
      expect(error.stack).toContain(message)

      const encoded = Schema.encodeUnknownSync(schema)(error)
      expect(encoded).not.toHaveProperty("message")
      const decoded = Schema.decodeUnknownSync(schema)(encoded)
      expect(decoded).toBeInstanceOf(schema)
      expect(decoded.message).toBe(message)
      expect(decoded.toJSON()).toMatchObject({ message })
    }
  )
})
