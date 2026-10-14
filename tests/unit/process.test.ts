import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Stream } from "effect"
import {
  failureReasons,
  isClosedByReader,
  mapStreamErrors,
  settle
} from "../../src/core/process.ts"
import { platformError } from "./fake-spawner.ts"

describe("process helpers", () => {
  it.effect(
    "settles fibers keeping failures and cleanup defects, not interruptions",
    () =>
      Effect.gen(function* () {
        const error = new Error("already failed")
        const failed = yield* Effect.forkChild(Effect.fail(error))
        yield* Fiber.await(failed)
        assert.deepStrictEqual(failureReasons(yield* settle(failed)), [
          Cause.makeFailReason(error)
        ])

        const defect = new Error("finalizer defect")
        const running = yield* Effect.forkChild(
          Effect.never.pipe(Effect.ensuring(Effect.die(defect)))
        )
        yield* Effect.yieldNow
        const reasons = failureReasons(yield* settle(running))
        assert.strictEqual(reasons.length, 1)
        assert.isTrue(
          reasons[0]?._tag === "Die" && reasons[0].defect === defect
        )

        const idle = yield* Effect.forkChild(Effect.never)
        yield* Effect.yieldNow
        assert.deepStrictEqual(failureReasons(yield* settle(idle)), [])
      })
  )

  it.effect("maps stream errors without dropping other reasons", () =>
    Effect.gen(function* () {
      const defect = new Error("defect")
      const exit = yield* Stream.failCause(
        Cause.combine(Cause.fail("a"), Cause.die(defect))
      ).pipe(
        mapStreamErrors((error: string) => `${error}!`),
        Stream.runDrain,
        Effect.exit
      )

      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        assert.deepStrictEqual(
          exit.cause.reasons.map((reason) =>
            reason._tag === "Fail"
              ? reason.error
              : reason._tag === "Die"
                ? reason.defect
                : reason._tag
          ),
          ["a!", defect]
        )
      }
    })
  )

  it("only treats errno codes of a closed reader as expected", () => {
    assert.isTrue(isClosedByReader(platformError("fromWritable(fd4)", "EPIPE")))
    assert.isTrue(
      isClosedByReader(platformError("fromWritable(fd4)", "ECONNRESET"))
    )
    assert.isTrue(
      isClosedByReader(
        platformError("fromWritable(fd4)", "ERR_STREAM_DESTROYED")
      )
    )
    assert.isFalse(isClosedByReader(platformError("fromWritable(fd4)", "EIO")))
    assert.isFalse(isClosedByReader(platformError("fromWritable(fd4)")))
    // Not a platform error: never classified, whatever it looks like.
    assert.isFalse(isClosedByReader({ code: "EPIPE" }))
    assert.isFalse(isClosedByReader(new Error("EPIPE")))
  })
})
