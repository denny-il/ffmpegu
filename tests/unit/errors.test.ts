import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  CommandError,
  OutputError,
  ReservedPath,
  SinkEndedEarly
} from "../../src/errors.ts"

describe("errors", () => {
  // The message is derived from the reason rather than encoded, yet JSON log
  // consumers and native stack output still expect to find it on the error.
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
    ]
  ] as const)(
    "should expose the reason message to diagnostics (%s)",
    (_, schema, error, message) => {
      expect(error.message).toBe(message)
      expect(error.toJSON()).toMatchObject({ message })
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
