/**
 * Streaming stress tests against real ffmpeg processes and OS pipes.
 *
 * Payloads are position-addressed (`byteAt`), so every received byte can be
 * checked against its absolute offset: loss, duplication, reordering and
 * corruption all surface as a mismatch offset. Raw PCM is stream-copied, so
 * ffmpeg reproduces its input byte for byte.
 *
 * Synchronization relies on observed state (bytes received, producer
 * counters that stopped moving) rather than on elapsed time; timers only
 * bound how long a test may wait for that state.
 */
import { describe, expect, it } from "@effect/vitest"
import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Scope,
  Sink,
  Stream
} from "effect"
import {
  Command,
  FFmpeg,
  Input,
  Options,
  Output,
  run
} from "../../src/index.ts"
import { MediaLive, PlatformLive } from "../helpers/platform.ts"

const live = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof MediaLive> | Scope.Scope>
) => Effect.scoped(effect).pipe(Effect.provide(MediaLive))
const opts = Options.create

const KiB = 1024
const MiB = 1024 * KiB

// 48 kHz stereo s16le: 4-byte frames, 192 000 bytes per second.
const PCM = { f: "s16le", ar: 48_000, ac: 2 } as const
const PCM_COPY = { "c:a": "copy", f: "s16le" } as const

/** Deterministic, position-dependent byte: a 32-bit integer hash of `p`. */
const byteAt = (p: number): number => {
  let x = Math.imul(p ^ (p >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return (x ^ (x >>> 16)) & 0xff
}

const bytesAt = (offset: number, length: number): Uint8Array => {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) bytes[i] = byteAt(offset + i)
  return bytes
}

/** First offset where `chunks` deviate from the payload, or -1. */
const firstMismatch = (chunks: ReadonlyArray<Uint8Array>): number => {
  let offset = 0
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++, offset++) {
      if (chunk[i] !== byteAt(offset)) return offset
    }
  }
  return -1
}

/**
 * Irregular chunk sizes: single bytes, sizes misaligned with PCM frames and
 * pipe pages, and chunks larger than a Linux pipe buffer (64 KiB).
 */
const CHUNK_SIZES = [1, 3, 4093, 65_536, 17, 131_072, 999, 32_768, 7, 250_000]

interface SourceProbe {
  /** Bytes handed downstream so far. */
  pulled: number
  chunks: number
  /** Set once the source emitted its last chunk. */
  completed: boolean
  /** Exit tags observed by the source's finalizer, in order. */
  readonly exits: Array<ExitTag>
}

const makeProbe = (): SourceProbe => ({
  pulled: 0,
  chunks: 0,
  completed: false,
  exits: []
})

/**
 * A payload source emitting `total` bytes (or forever) in `CHUNK_SIZES`
 * order. `delay(i)` is slept before emitting chunk `i`.
 */
const payloadSource = (
  probe: SourceProbe,
  options: {
    readonly total?: number | undefined
    readonly delay?: ((index: number) => Duration.Input | undefined) | undefined
    readonly sizes?: ReadonlyArray<number> | undefined
  } = {}
): Stream.Stream<Uint8Array> => {
  const total = options.total ?? Infinity
  const sizes = options.sizes ?? CHUNK_SIZES
  return Stream.unfold(0, (offset) =>
    Effect.gen(function* () {
      if (offset >= total) {
        probe.completed = true
        return undefined
      }
      const index = probe.chunks
      const pause = options.delay?.(index)
      if (pause !== undefined) yield* Effect.sleep(pause)
      const length = Math.min(sizes[index % sizes.length]!, total - offset)
      const chunk = bytesAt(offset, length)
      probe.pulled += length
      probe.chunks++
      return [chunk, offset + length] as const
    })
  ).pipe(recordExit(probe.exits))
}

type ExitTag = "success" | "failure" | "interrupted"

/** Records how a stream ended, from its finalizer. */
const recordExit =
  (exits: Array<ExitTag>) =>
  <A, E, R>(stream: Stream.Stream<A, E, R>): Stream.Stream<A, E, R> =>
    Stream.onExit(stream, (exit) =>
      Effect.sync(() => {
        exits.push(
          Exit.isSuccess(exit)
            ? "success"
            : Cause.hasInterruptsOnly(exit.cause)
              ? "interrupted"
              : "failure"
        )
      })
    )

interface Collector {
  /** Chunks kept as received (not copied), so later buffer reuse shows up. */
  readonly chunks: Array<Uint8Array>
  received: number
  finalized: number
  interrupted: number
}

/**
 * A sink recording every chunk. `delay(i)` is slept after receiving chunk
 * `i`; once `holdAfter` bytes were received the sink blocks until `release`
 * completes, signalling `held` first.
 */
const collect = (
  collector: Collector,
  options: {
    readonly delay?: ((index: number) => Duration.Input | undefined) | undefined
    readonly reached?:
      | { readonly bytes: number; readonly signal: Deferred.Deferred<void> }
      | undefined
    readonly hold?:
      | {
          readonly afterBytes: number
          readonly held: Deferred.Deferred<void>
          readonly release: Deferred.Deferred<void>
        }
      | undefined
  } = {}
): Sink.Sink<void, Uint8Array> =>
  Sink.forEach((chunk: Uint8Array) =>
    Effect.gen(function* () {
      const index = collector.chunks.length
      collector.chunks.push(chunk)
      collector.received += chunk.length
      const { reached, hold } = options
      if (reached && collector.received >= reached.bytes) {
        yield* Deferred.succeed(reached.signal, undefined)
      }
      if (hold && collector.received >= hold.afterBytes) {
        if (yield* Deferred.succeed(hold.held, undefined)) {
          yield* Deferred.await(hold.release).pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                collector.interrupted++
              })
            )
          )
        }
      }
      const pause = options.delay?.(index)
      if (pause !== undefined) yield* Effect.sleep(pause)
    })
  ).pipe(
    Sink.ensuring(
      Effect.sync(() => {
        collector.finalized++
      })
    )
  )

const makeCollector = (): Collector => ({
  chunks: [],
  received: 0,
  finalized: 0,
  interrupted: 0
})

/**
 * Waits until `read` has not changed for `quietPolls` consecutive polls and
 * returns its value. A fast producer that keeps going advances by megabytes
 * per poll, so an unchanged counter means it is blocked (or done, which the
 * caller tells apart). Bounded so a broken run fails instead of hanging.
 */
const awaitQuiescent = (read: () => number) =>
  Effect.gen(function* () {
    // 6 quiet polls of 50 ms; gives up after 20 s.
    let last = read()
    let quiet = 0
    for (let poll = 0; poll < 400; poll++) {
      yield* Effect.sleep("50 millis")
      const now = read()
      quiet = now === last ? quiet + 1 : 0
      last = now
      if (quiet >= 6) return now
    }
    return yield* Effect.die(new Error("counter never stopped changing"))
  })

const expectExactPayload = (collector: Collector, total: number) => {
  expect(collector.received).toBe(total)
  expect(firstMismatch(collector.chunks)).toBe(-1)
}

const expectPayloadPrefix = (collector: Collector) => {
  expect(firstMismatch(collector.chunks)).toBe(-1)
}

const pcmCopy = (
  source: Stream.Stream<Uint8Array>,
  sink: Sink.Sink<void, Uint8Array>
) =>
  Command.make({
    inputs: [Input.fromStream(source, opts(PCM))],
    outputs: [Output.toSink(sink, opts(PCM_COPY))]
  })

const pace = (millis: number) => () => Duration.millis(millis)

describe("producer/consumer rate matrix", () => {
  // 4 MiB is 64x a Linux pipe buffer (macOS: 16-64 KiB), so the pipes fill
  // and drain repeatedly whichever side is slower. Delays add roughly
  // 2 ms x ~70 input chunks and 1 ms per output chunk.
  const TOTAL = 4 * MiB
  const cases = [
    { name: "fast producer, fast consumer", producer: 0, consumer: 0 },
    { name: "delayed producer, fast consumer", producer: 2, consumer: 0 },
    { name: "fast producer, delayed consumer", producer: 0, consumer: 1 },
    { name: "delayed producer, delayed consumer", producer: 2, consumer: 1 }
  ] as const

  it.live.each(cases)(
    "$name: copies 4 MiB of PCM byte for byte",
    ({ producer, consumer }) =>
      live(
        Effect.gen(function* () {
          const probe = makeProbe()
          const collector = makeCollector()
          const progress: Array<string> = []
          yield* run(
            pcmCopy(
              payloadSource(probe, {
                total: TOTAL,
                delay: producer > 0 ? pace(producer) : undefined
              }),
              collect(collector, {
                delay: consumer > 0 ? pace(consumer) : undefined
              })
            ),
            {
              onProgress: (p) =>
                Effect.sync(() => {
                  progress.push(p.progress)
                })
            }
          )
          expect(probe.completed).toBe(true)
          expect(probe.pulled).toBe(TOTAL)
          expect(probe.exits).toEqual(["success"])
          expectExactPayload(collector, TOTAL)
          expect(collector.finalized).toBe(1)
          expect(progress.at(-1)).toBe("end")
        })
      ),
    30_000
  )
})

it.live(
  "a blocked sink backpressures a fast producer through both OS pipes",
  () =>
    live(
      Effect.gen(function* () {
        // Far more than every buffer between producer and sink combined
        // (Node stream buffers, two pipes, ffmpeg's demux/mux queues).
        const TOTAL = 32 * MiB
        const probe = makeProbe()
        const collector = makeCollector()
        const held = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const fiber = yield* Effect.forkChild(
          run(
            pcmCopy(
              payloadSource(probe, { total: TOTAL }),
              collect(collector, { hold: { afterBytes: 1, held, release } })
            )
          )
        )
        yield* Deferred.await(held)
        const stalledAt = yield* awaitQuiescent(() => probe.pulled)
        // The producer is parked, not finished, while the sink is blocked.
        expect(probe.completed).toBe(false)
        expect(stalledAt).toBeLessThan(TOTAL)
        // Only the first chunk(s) reached the sink before it blocked.
        const receivedWhileHeld = collector.received
        expect(receivedWhileHeld).toBeLessThan(stalledAt)
        expect(fiber.pollUnsafe()).toBeUndefined()

        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(fiber)
        expect(probe.completed).toBe(true)
        expect(probe.exits).toEqual(["success"])
        expectExactPayload(collector, TOTAL)
      })
    ),
  30_000
)

/**
 * Runs ffmpeg through a transparent wrapper that records its PID and then
 * `exec`s the real ffmpeg from `PATH`, so the recorded PID is the ffmpeg
 * process itself.
 */
const pidTrackingFFmpeg = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  const binary = `${dir}/ffmpeg-pid`
  const pidFile = `${dir}/pids`
  yield* fs.writeFileString(pidFile, "")
  yield* fs.writeFileString(
    binary,
    `#!/bin/sh\nprintf '%s\\n' "$$" >> '${pidFile}'\nexec ffmpeg "$@"\n`
  )
  yield* fs.chmod(binary, 0o755)
  const pids = fs
    .readFileString(pidFile)
    .pipe(Effect.map((text) => text.split("\n").filter(Boolean).map(Number)))
  return {
    layer: FFmpeg.layer({ binary, forceKillAfter: "250 millis" }),
    pids
  }
})

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/**
 * Interrupts a run and returns its exit, bounded well above the wrapper's
 * `forceKillAfter`. ffmpeg ignores SIGTERM while blocked writing to a full
 * output pipe, so a stalled consumer is stopped by the SIGKILL escalation.
 */
const cancel = <A, E>(fiber: Fiber.Fiber<A, E>) =>
  Fiber.interrupt(fiber).pipe(
    Effect.andThen(Fiber.await(fiber)),
    Effect.timeoutOrElse({
      duration: "10 seconds",
      orElse: () => Effect.die(new Error("cancellation did not complete"))
    })
  )

const expectInterruptedOnly = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    // A cancelled run reports no PipeError/EPIPE or other spurious failure.
    expect(Cause.pretty(exit.cause)).not.toMatch(/PipeError|EPIPE/)
    expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  }
}

describe("cancellation", () => {
  const withPlatform = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      FileSystem.FileSystem | Scope.Scope | Layer.Success<typeof PlatformLive>
    >
  ) => Effect.scoped(effect).pipe(Effect.provide(PlatformLive))

  it.live(
    "while the producer is blocked waiting for data",
    () =>
      withPlatform(
        Effect.gen(function* () {
          const ffmpeg = yield* pidTrackingFFmpeg
          const probe = makeProbe()
          const collector = makeCollector()
          const flowing = yield* Deferred.make<void>()
          // 2 MiB, then the producer waits forever for more data. ffmpeg
          // holds a few hundred KiB while its input stalls, so the payload
          // must exceed that for bytes to reach the sink before cancelling.
          const parked: Array<ExitTag> = []
          const source = Stream.concat(
            payloadSource(probe, { total: 2 * MiB }),
            Stream.never
          ).pipe(recordExit(parked))
          const fiber = yield* Effect.forkChild(
            run(
              pcmCopy(
                source,
                collect(collector, {
                  reached: { bytes: 1 * MiB, signal: flowing }
                })
              )
            ).pipe(Effect.provide(ffmpeg.layer))
          )
          // Bytes made it through ffmpeg: it runs and drained the producer.
          yield* Deferred.await(flowing)
          yield* awaitQuiescent(() => collector.received)
          const [pid] = yield* ffmpeg.pids
          expect(isAlive(pid!)).toBe(true)

          const exit = yield* cancel(fiber)
          expectInterruptedOnly(exit)
          expect(probe.completed).toBe(true)
          expect(probe.exits).toEqual(["success"])
          expect(parked).toEqual(["interrupted"])
          expect(collector.finalized).toBe(1)
          expectPayloadPrefix(collector)
          expect(isAlive(pid!)).toBe(false)
        })
      ),
    20_000
  )

  it.live(
    "while the consumer is blocked and the producer is backpressured",
    () =>
      withPlatform(
        Effect.gen(function* () {
          const ffmpeg = yield* pidTrackingFFmpeg
          const probe = makeProbe()
          const collector = makeCollector()
          const held = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const fiber = yield* Effect.forkChild(
            run(
              pcmCopy(
                payloadSource(probe),
                collect(collector, { hold: { afterBytes: 1, held, release } })
              )
            ).pipe(Effect.provide(ffmpeg.layer))
          )
          yield* Deferred.await(held)
          yield* awaitQuiescent(() => probe.pulled)
          const [pid] = yield* ffmpeg.pids
          expect(isAlive(pid!)).toBe(true)

          const exit = yield* cancel(fiber)
          expectInterruptedOnly(exit)
          expect(collector.interrupted).toBe(1)
          expect(collector.finalized).toBe(1)
          expect(probe.completed).toBe(false)
          expect(probe.exits).toEqual(["interrupted"])
          expectPayloadPrefix(collector)
          expect(isAlive(pid!)).toBe(false)
        })
      ),
    20_000
  )

  it.live(
    "while both sides are actively streaming",
    () =>
      withPlatform(
        Effect.gen(function* () {
          const ffmpeg = yield* pidTrackingFFmpeg
          const probe = makeProbe()
          const collector = makeCollector()
          const flowing = yield* Deferred.make<void>()
          const fiber = yield* Effect.forkChild(
            run(
              pcmCopy(
                payloadSource(probe, { delay: pace(1) }),
                collect(collector, {
                  delay: pace(1),
                  reached: { bytes: 1 * MiB, signal: flowing }
                })
              )
            ).pipe(Effect.provide(ffmpeg.layer))
          )
          yield* Deferred.await(flowing)
          const [pid] = yield* ffmpeg.pids
          expect(isAlive(pid!)).toBe(true)

          const exit = yield* cancel(fiber)
          expectInterruptedOnly(exit)
          expect(collector.finalized).toBe(1)
          expect(probe.completed).toBe(false)
          expect(probe.exits).toEqual(["interrupted"])
          expect(collector.received).toBeGreaterThanOrEqual(1 * MiB)
          expectPayloadPrefix(collector)
          expect(isAlive(pid!)).toBe(false)
        })
      ),
    20_000
  )

  it.live(
    "at staggered points from spawn to steady state leaks no process",
    () =>
      withPlatform(
        Effect.gen(function* () {
          const ffmpeg = yield* pidTrackingFFmpeg
          // Interrupt points from "before spawn completes" to "mid-stream".
          const delays = [0, 1, 2, 5, 10, 20, 50, 100, 200]
          for (const millis of delays) {
            const probe = makeProbe()
            const collector = makeCollector()
            const fiber = yield* Effect.forkChild(
              run(
                pcmCopy(
                  payloadSource(probe, { delay: pace(1) }),
                  collect(collector, { delay: pace(1) })
                )
              ).pipe(Effect.provide(ffmpeg.layer))
            )
            yield* Effect.sleep(Duration.millis(millis))
            const exit = yield* cancel(fiber)
            expectInterruptedOnly(exit)
            expectPayloadPrefix(collector)
            // A source that was started has been finalized exactly once.
            expect(probe.exits.length).toBeLessThanOrEqual(1)
            if (probe.chunks > 0) expect(probe.exits).toEqual(["interrupted"])
          }
          // Every wrapper that got to record a PID is gone.
          for (const pid of yield* ffmpeg.pids) {
            expect(isAlive(pid)).toBe(false)
          }
        })
      ),
    30_000
  )
})

describe("FFmpeg exits before an infinite producer ends", () => {
  it.live(
    "-t trims PCM sample-exactly and stops the producer without EPIPE",
    () =>
      live(
        Effect.gen(function* () {
          // Repeated: whether ffmpeg exits while a write is pending is a race.
          for (let attempt = 0; attempt < 5; attempt++) {
            const probe = makeProbe()
            const collector = makeCollector()
            // Re-encoding (lossless for s16le) lets ffmpeg trim at sample
            // precision: 0.5 s at 48 kHz stereo = 24 000 frames x 4 bytes.
            yield* run(
              Command.make({
                inputs: [Input.fromStream(payloadSource(probe), opts(PCM))],
                outputs: [
                  Output.toSink(
                    collect(collector),
                    opts({ t: 0.5, "c:a": "pcm_s16le", f: "s16le" })
                  )
                ]
              })
            )
            expectExactPayload(collector, 96_000)
            expect(collector.finalized).toBe(1)
            expect(probe.completed).toBe(false)
            expect(probe.pulled).toBeGreaterThanOrEqual(96_000)
            expect(probe.exits).toEqual(["interrupted"])
          }
        })
      ),
    30_000
  )

  it.live(
    "-frames:v emits exactly N raw frames from an infinite producer",
    () =>
      live(
        Effect.gen(function* () {
          const FRAME = 32 * 24 * 3
          for (let attempt = 0; attempt < 5; attempt++) {
            const probe = makeProbe()
            const collector = makeCollector()
            yield* run(
              Command.make({
                inputs: [
                  Input.fromStream(
                    payloadSource(probe),
                    opts({
                      f: "rawvideo",
                      pixel_format: "rgb24",
                      video_size: "32x24",
                      framerate: 25
                    })
                  )
                ],
                outputs: [
                  Output.toSink(
                    collect(collector),
                    opts({ "frames:v": 7, "c:v": "copy", f: "rawvideo" })
                  )
                ]
              })
            )
            expectExactPayload(collector, 7 * FRAME)
            expect(probe.completed).toBe(false)
            expect(probe.exits).toEqual(["interrupted"])
          }
        })
      ),
    30_000
  )

  // ffmpeg 7 does not exit while its demuxer is blocked reading a pipe, even
  // once -t is satisfied, so a producer that never emits again keeps the run
  // alive. A slow producer unblocks it; the runner must then stop the
  // producer while it is idle between chunks.
  it.live(
    "-t while the producer is idle between slow chunks",
    () =>
      live(
        Effect.gen(function* () {
          const probe = makeProbe()
          const collector = makeCollector()
          // About one second of audio at once, then a chunk every 100 ms.
          const source = payloadSource(probe, {
            delay: () =>
              probe.pulled >= 192_000 ? Duration.millis(100) : undefined
          })
          yield* run(
            Command.make({
              inputs: [Input.fromStream(source, opts(PCM))],
              outputs: [
                Output.toSink(
                  collect(collector),
                  opts({ t: 0.25, "c:a": "pcm_s16le", f: "s16le" })
                )
              ]
            })
          )
          expectExactPayload(collector, 48_000)
          expect(probe.completed).toBe(false)
          expect(probe.exits).toEqual(["interrupted"])
        })
      ),
    20_000
  )
})

describe("multiple descriptors with asymmetric rates", () => {
  it.live(
    "two inputs at different byte rates and speeds into two outputs",
    () =>
      live(
        Effect.gen(function* () {
          // Ten seconds of audio each: 1 920 000 bytes at 48 kHz stereo and
          // 160 000 bytes at 8 kHz mono. The large stream has a fast producer
          // and a slow consumer; the small one the opposite.
          const LARGE = 1_920_000
          const SMALL = 160_000
          const largeProbe = makeProbe()
          const smallProbe = makeProbe()
          const largeOut = makeCollector()
          const smallOut = makeCollector()
          const large = Input.fromStream(
            payloadSource(largeProbe, { total: LARGE }),
            opts(PCM)
          )
          const small = Input.fromStream(
            payloadSource(smallProbe, {
              total: SMALL,
              sizes: [1_601, 397, 4_000],
              delay: pace(2)
            }),
            opts({ f: "s16le", ar: 8_000, ac: 1 })
          )
          yield* run(
            Command.make({
              inputs: [large, small],
              outputs: [
                Output.toSink(
                  collect(largeOut, { delay: pace(1) }),
                  opts({ map: large.audio, ...PCM_COPY })
                ),
                Output.toSink(
                  collect(smallOut),
                  opts({ map: small.audio, ...PCM_COPY })
                )
              ]
            })
          )
          expectExactPayload(largeOut, LARGE)
          expectExactPayload(smallOut, SMALL)
          expect(largeProbe.exits).toEqual(["success"])
          expect(smallProbe.exits).toEqual(["success"])
        })
      ),
    30_000
  )

  it.live(
    "one input fanned out to a held output and a fast output",
    () =>
      live(
        Effect.gen(function* () {
          const TOTAL = 8 * MiB
          const probe = makeProbe()
          const fast = makeCollector()
          const slow = makeCollector()
          const held = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const input = Input.fromStream(
            payloadSource(probe, { total: TOTAL }),
            opts(PCM)
          )
          const fiber = yield* Effect.forkChild(
            run(
              Command.make({
                inputs: [input],
                outputs: [
                  Output.toSink(
                    collect(slow, { hold: { afterBytes: 1, held, release } }),
                    opts({ map: input.audio, ...PCM_COPY })
                  ),
                  Output.toSink(
                    collect(fast),
                    opts({ map: input.audio, ...PCM_COPY })
                  )
                ]
              })
            )
          )
          yield* Deferred.await(held)
          // The held branch stalls the shared demuxer, and with it the
          // producer and the fast branch.
          yield* awaitQuiescent(() => probe.pulled + fast.received)
          expect(probe.completed).toBe(false)
          expect(fast.received).toBeLessThan(TOTAL)
          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(fiber)
          expectExactPayload(slow, TOTAL)
          expectExactPayload(fast, TOTAL)
        })
      ),
    30_000
  )
})
