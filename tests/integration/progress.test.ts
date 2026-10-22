import { expect, it } from "@effect/vitest"
import { Deferred, Duration, Effect, Fiber, Sink } from "effect"
import {
  Command,
  Input,
  Options,
  Output,
  type Progress,
  run
} from "../../src/index.ts"
import { MediaLive } from "../helpers/platform.ts"

it.live(
  "slow progress callbacks do not block media, and final progress is awaited",
  () =>
    Effect.gen(function* () {
      const firstStarted = yield* Deferred.make<void>()
      const releaseFirst = yield* Deferred.make<void>()
      const finalStarted = yield* Deferred.make<void>()
      const releaseFinal = yield* Deferred.make<void>()
      const mediaDone = yield* Deferred.make<void>()
      const updates: string[] = []
      let bytes = 0
      let activeCallbacks = 0
      let maximumCallbacks = 0
      const sink = Sink.forEach((chunk: Uint8Array) =>
        Effect.sync(() => {
          bytes += chunk.length
        })
      ).pipe(Sink.ensuring(Deferred.succeed(mediaDone, undefined)))
      const command = Command.make({
        // Enough progress traffic to fill a pipe if callback execution also
        // blocked the progress reader. Media is counted, never accumulated.
        global: Options.create({ stats_period: 0.000001 }),
        inputs: [
          Input.fromFile(
            "sine=sample_rate=48000:duration=600",
            Options.create({ f: "lavfi" })
          )
        ],
        outputs: [Output.toSink(sink, Options.create({ f: "s16le" }))]
      })
      const fiber = yield* Effect.forkChild(
        run(command, {
          onProgress: (progress) =>
            Effect.gen(function* () {
              activeCallbacks++
              maximumCallbacks = Math.max(maximumCallbacks, activeCallbacks)
              updates.push(progress.progress)
              if (updates.length === 1) {
                yield* Deferred.succeed(firstStarted, undefined)
                yield* Deferred.await(releaseFirst)
              }
              if (progress.progress === "end") {
                yield* Deferred.succeed(finalStarted, undefined)
                yield* Deferred.await(releaseFinal)
              }
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  activeCallbacks--
                })
              )
            )
        })
      )

      yield* Deferred.await(firstStarted)
      // EOF on the actual output pipe must arrive even while the first
      // progress callback is parked. No simulated process or clock is used.
      yield* Deferred.await(mediaDone)
      expect(bytes).toBe(57_600_000)
      expect(updates).toHaveLength(1)
      expect(fiber.pollUnsafe()).toBeUndefined()

      yield* Deferred.succeed(releaseFirst, undefined)
      yield* Deferred.await(finalStarted)
      expect(fiber.pollUnsafe()).toBeUndefined()
      yield* Deferred.succeed(releaseFinal, undefined)
      yield* Fiber.join(fiber)
      expect(updates.at(-1)).toBe("end")
      expect(maximumCallbacks).toBe(1)
      expect(activeCallbacks).toBe(0)
    }).pipe(Effect.provide(MediaLive), Effect.timeout("15 seconds"))
)

it.live("decodes real progress fields into numbers and a Duration", () =>
  Effect.gen(function* () {
    let bytes = 0
    let final: Progress | undefined
    yield* run(
      Command.make({
        inputs: [
          Input.fromFile(
            "sine=sample_rate=8000:duration=2",
            Options.create({ f: "lavfi" })
          )
        ],
        outputs: [
          Output.toSink(
            Sink.forEach((chunk: Uint8Array) =>
              Effect.sync(() => {
                bytes += chunk.length
              })
            ),
            Options.create({ f: "s16le" })
          )
        ]
      }),
      {
        onProgress: (progress) =>
          Effect.sync(() => {
            final = progress
          })
      }
    )
    expect(final?.progress).toBe("end")
    expect(bytes).toBe(2 * 8000 * 2)
    expect(final?.totalSize).toBe(bytes)
    expect(Duration.isDuration(final?.outTime)).toBe(true)
    expect(Duration.toNanosUnsafe(final!.outTime!)).toBe(
      BigInt(final!.raw.out_time_us!) * 1000n
    )
    // FFmpeg 6.1 reports the last packet's timestamp rather than the end.
    expect(Duration.toMillis(final!.outTime!)).toBeGreaterThan(1500)
    expect(Duration.toMillis(final!.outTime!)).toBeLessThan(2100)
  }).pipe(Effect.provide(MediaLive), Effect.timeout("15 seconds"))
)
