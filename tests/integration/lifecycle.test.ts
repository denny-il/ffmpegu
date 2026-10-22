import { describe, expect, it } from "@effect/vitest"
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Sink,
  Stream
} from "effect"
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { afterAll, afterEach } from "vitest"
import {
  Command,
  FFmpeg,
  FFprobe,
  Input,
  Options,
  Output,
  probeWith,
  run
} from "../../src/index.ts"
import { PlatformLive } from "../helpers/platform.ts"

// Real OS pipes: the sibling's writes block on a full descriptor, so its
// source is stopped while the descriptor sink (not the source) is pending.

const dir = mkdtempSync(`${tmpdir()}/ffmpegu-lifecycle-`)
const pidFile = `${dir}/pids`
let fixtures = 0

const pids = () =>
  existsSync(pidFile)
    ? readFileSync(pidFile, "utf8").split("\n").filter(Boolean).map(Number)
    : []
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const killAll = () => {
  for (const pid of pids().filter(alive)) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {}
  }
}
afterEach(() => {
  const leaked = pids().filter(alive)
  killAll()
  expect(leaked, "processes alive after the test").toEqual([])
})
afterAll(() => {
  killAll()
  rmSync(dir, { recursive: true, force: true })
})

/** Executable recording its pid, then replacing itself with the command. */
const wrapper = (command: string) => {
  const file = `${dir}/bin-${fixtures++}`
  writeFileSync(
    file,
    `#!/bin/sh\necho $$ >> '${pidFile}'\nexec ${command} "$@"\n`,
    { mode: 0o755 }
  )
  return file
}

const ffmpeg = wrapper("ffmpeg")

/**
 * A process that ignores SIGTERM, reports progress once, then never reads its
 * inputs, exiting on its own only as a safety net.
 */
const stubborn = () => {
  const script = `${dir}/stubborn-${fixtures++}.mjs`
  writeFileSync(
    script,
    [
      `import { writeSync } from "node:fs"`,
      `process.on("SIGTERM", () => {})`,
      `setTimeout(() => process.exit(3), 20_000)`,
      // Reported after the handler is installed; requires onProgress (fd 3).
      `writeSync(3, "progress=continue\\n")`,
      `setInterval(() => {}, 1_000)`
    ].join("\n")
  )
  return wrapper(`'${process.execPath}' '${script}'`)
}

/** Installs its signal handler before reporting readiness or flooding stdout. */
const stubbornProbe = (flood = false) => {
  const script = `${dir}/probe-${fixtures++}.mjs`
  const ready = `${script}.ready`
  writeFileSync(
    script,
    [
      `import { writeFileSync, writeSync } from "node:fs"`,
      `process.on("SIGTERM", () => {})`,
      `writeFileSync(${JSON.stringify(ready)}, "ready")`,
      `setTimeout(() => process.exit(3), 20_000)`,
      flood
        ? `writeSync(1, "x".repeat(100000))`
        : `setInterval(() => {}, 1_000)`
    ].join("\n")
  )
  return { binary: wrapper(`'${process.execPath}' '${script}'`), ready }
}

it.live(
  "interrupting a probe waits for a child ignoring SIGTERM to be killed",
  () =>
    Effect.gen(function* () {
      const { binary, ready } = stubbornProbe()
      const fiber = yield* Effect.forkChild(
        probeWith("unused", Options.create("-show_streams")).pipe(
          Effect.provide(
            FFprobe.layer({ binary, forceKillAfter: "100 millis" })
          ),
          Effect.provide(PlatformLive)
        )
      )
      while (!existsSync(ready)) yield* Effect.sleep("10 millis")
      const started = Date.now()
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
      expect(Date.now() - started).toBeLessThan(3_000)
      expect(pids().filter(alive)).toEqual([])
    }).pipe(Effect.timeout("5 seconds"))
)

it.live("a caller deadline cleans up a probe ignoring SIGTERM", () =>
  Effect.gen(function* () {
    const { binary, ready } = stubbornProbe()
    const error = yield* probeWith(
      "unused",
      Options.create("-show_streams")
    ).pipe(
      Effect.provide(FFprobe.layer({ binary, forceKillAfter: "100 millis" })),
      Effect.provide(PlatformLive),
      Effect.timeout("1 second"),
      Effect.flip
    )
    expect(existsSync(ready)).toBe(true)
    expect(error).toMatchObject({ _tag: "TimeoutError" })
    expect(pids().filter(alive)).toEqual([])
  })
)

it.live("oversized probe output kills a child ignoring SIGTERM", () =>
  Effect.gen(function* () {
    const { binary } = stubbornProbe(true)
    const error = yield* probeWith(
      "unused",
      Options.create("-show_format")
    ).pipe(
      Effect.provide(
        FFprobe.layer({
          binary,
          forceKillAfter: "100 millis",
          maxOutputBytes: 128
        })
      ),
      Effect.provide(PlatformLive),
      Effect.flip
    )
    expect(error).toMatchObject({
      _tag: "ProbeOutputError",
      maxOutputBytes: 128
    })
    expect(pids().filter(alive)).toEqual([])
  }).pipe(Effect.timeout("5 seconds"))
)

const live = <A, E>(
  binary: string,
  effect: Effect.Effect<A, E, FFmpeg>
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.provide(
      FFmpeg.layer({ binary, forceKillAfter: "100 millis" }).pipe(
        Layer.provide(PlatformLive)
      )
    )
  )

const raw = Options.create({ f: "s16le", ar: 8000, ac: 1 })
const chunk = () => new Uint8Array(1024 * 1024)

/**
 * An endless source of 1 MiB chunks with a dying finalizer, signalling
 * `pulled` once its first chunk was produced.
 */
const sibling = (
  pulled: Deferred.Deferred<void>,
  cleanups: { count: number },
  defect: unknown
) =>
  Stream.forever(
    Stream.fromEffect(
      Deferred.succeed(pulled, undefined).pipe(Effect.as(chunk()))
    )
  ).pipe(
    Stream.ensuring(
      Effect.suspend(() => {
        cleanups.count++
        return Effect.die(defect)
      })
    )
  )

/**
 * Completes once the sibling's write is pending: a 1 MiB write cannot fit a
 * pipe buffer nobody reads, so shortly after the first pull it is blocked.
 */
const writeBlocked = (pulled: Deferred.Deferred<void>) =>
  Deferred.await(pulled).pipe(Effect.andThen(Effect.sleep("50 millis")))

const reasonsOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? exit.cause.reasons : []
const hasDefect = (exit: Exit.Exit<unknown, unknown>, defect: unknown) =>
  reasonsOf(exit).some(
    (reason) => Cause.isDieReason(reason) && reason.defect === defect
  )
const failures = (exit: Exit.Exit<unknown, unknown>) =>
  reasonsOf(exit)
    .filter(Cause.isFailReason)
    .map((reason) => reason.error)

it.live(
  "a failing input keeps the cleanup defect of a sibling blocked on a real ffmpeg pipe",
  () =>
    live(
      ffmpeg,
      Effect.gen(function* () {
        const pulled = yield* Deferred.make<void>()
        const cleanups = { count: 0 }
        const failure = { kind: "source-error" }
        const defect = { kind: "sibling-cleanup" }
        // ffmpeg opens inputs in order and waits for the first one, so it
        // never reads the second: the sibling's writes block on a full pipe.
        const first = Stream.fromEffect(
          writeBlocked(pulled).pipe(Effect.andThen(Effect.fail(failure)))
        )
        const command = Command.make({
          inputs: [
            Input.fromStream(first, raw),
            Input.fromStream(sibling(pulled, cleanups, defect), raw)
          ],
          outputs: [Output.toFile("/dev/null", Options.create({ f: "null" }))]
        })

        const exit = yield* Effect.exit(run(command))

        expect(failures(exit)).toEqual([failure])
        expect(hasDefect(exit, defect)).toBe(true)
        expect(cleanups.count).toBe(1)
        expect(pids().filter(alive)).toEqual([])
      })
    ),
  20_000
)

it.live(
  "a failing input keeps a blocked sibling's cleanup defect with a process ignoring SIGTERM",
  () =>
    live(
      stubborn(),
      Effect.gen(function* () {
        const pulled = yield* Deferred.make<void>()
        // Sent by the child after it installed its SIGTERM handler.
        const reported = yield* Deferred.make<void>()
        const cleanups = { count: 0 }
        const failure = { kind: "source-error" }
        const defect = { kind: "sibling-cleanup" }
        const command = Command.make({
          inputs: [
            Input.fromStream(
              Stream.fromEffect(
                Deferred.await(reported).pipe(
                  Effect.andThen(writeBlocked(pulled)),
                  Effect.andThen(Effect.fail(failure))
                )
              )
            ),
            Input.fromStream(sibling(pulled, cleanups, defect))
          ],
          outputs: [Output.toFile("unused")]
        })

        const exit = yield* Effect.exit(
          run(command, {
            onProgress: () =>
              Deferred.succeed(reported, undefined).pipe(Effect.asVoid)
          })
        )

        expect(failures(exit)).toEqual([failure])
        expect(hasDefect(exit, defect)).toBe(true)
        expect(cleanups.count).toBe(1)
        expect(pids().filter(alive)).toEqual([])
      })
    ),
  20_000
)

it.live(
  "cancelling a run blocked on a real input pipe keeps the source cleanup defect",
  () =>
    live(
      stubborn(),
      Effect.gen(function* () {
        const pulled = yield* Deferred.make<void>()
        const reported = yield* Deferred.make<void>()
        const cleanups = { count: 0 }
        const defect = { kind: "input-cleanup" }
        const command = Command.make({
          inputs: [Input.fromStream(sibling(pulled, cleanups, defect))],
          outputs: [Output.toFile("unused")]
        })
        const fiber = yield* Effect.forkChild(
          run(command, {
            onProgress: () =>
              Deferred.succeed(reported, undefined).pipe(Effect.asVoid)
          })
        )
        yield* Deferred.await(reported)
        yield* writeBlocked(pulled)

        const started = Date.now()
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        // SIGTERM is ignored; the configured escalation bounds the shutdown.
        expect(Date.now() - started).toBeLessThan(3_000)
        expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(
          true
        )
        expect(failures(exit)).toEqual([])
        expect(hasDefect(exit, defect)).toBe(true)
        expect(cleanups.count).toBe(1)
        expect(pids().filter(alive)).toEqual([])
      })
    ),
  20_000
)

/** Real ffmpeg with the default SIGKILL grace (5 seconds). */
const withDefaultGrace = <A, E>(
  effect: Effect.Effect<A, E, FFmpeg>
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.provide(
      FFmpeg.layer({ binary: ffmpeg }).pipe(Layer.provide(PlatformLive))
    )
  )

/** Well under the default grace: the shutdown did not wait for SIGKILL. */
const SHUTDOWN_BOUND = 3_000

const openFds = () => readdirSync("/dev/fd").length

/**
 * Fails if the run left descriptors open. The platform releases them
 * asynchronously after the process exited, so the count may lag briefly.
 */
const expectNoLeakedFds = (before: number) =>
  Effect.gen(function* () {
    for (let poll = 0; poll < 40 && openFds() > before; poll++) {
      yield* Effect.sleep("25 millis")
    }
    expect(openFds()).toBeLessThanOrEqual(before)
  })

/**
 * Endless raw video into a sink. ffmpeg produces it far faster than any sink
 * reads it, so an unread output pipe fills within milliseconds and ffmpeg
 * blocks writing, where it does not act on SIGTERM.
 */
const videoIntoSink = <E>(sink: Sink.Sink<void, Uint8Array, never, E>) =>
  Command.make({
    inputs: [
      Input.fromFile("testsrc2=s=640x360:r=30", Options.create({ f: "lavfi" }))
    ],
    outputs: [Output.toSink(sink, Options.create({ f: "rawvideo" }))]
  })

describe("abandoning a run with a sink output drains it instead of waiting for SIGKILL", () => {
  it.live("when interrupted while the sink is blocked", () =>
    withDefaultGrace(
      Effect.gen(function* () {
        const fds = openFds()
        const received = yield* Deferred.make<void>()
        const fiber = yield* Effect.forkChild(
          run(
            videoIntoSink(
              Sink.forEach(() =>
                Deferred.succeed(received, undefined).pipe(
                  Effect.andThen(Effect.never)
                )
              )
            )
          )
        )
        yield* Deferred.await(received)
        // Long enough for ffmpeg to fill the pipe and block writing.
        yield* Effect.sleep("200 millis")

        const started = Date.now()
        const exit = yield* Fiber.interrupt(fiber).pipe(
          Effect.andThen(Fiber.await(fiber))
        )
        expect(Date.now() - started).toBeLessThan(SHUTDOWN_BOUND)
        expect(
          Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
        ).toBe(true)
        expect(pids().filter(alive)).toEqual([])
        yield* expectNoLeakedFds(fds)
      })
    )
  )

  it.live("when the sink fails", () =>
    withDefaultGrace(
      Effect.gen(function* () {
        const fds = openFds()
        const failure = { kind: "sink-error" }
        let chunks = 0
        const started = Date.now()
        const error = yield* run(
          videoIntoSink(
            Sink.forEach(() =>
              ++chunks > 5 ? Effect.fail(failure) : Effect.void
            )
          )
        ).pipe(Effect.flip)
        expect(Date.now() - started).toBeLessThan(SHUTDOWN_BOUND)
        expect(error).toBe(failure)
        expect(pids().filter(alive)).toEqual([])
        yield* expectNoLeakedFds(fds)
      })
    )
  )

  it.live("when a caller deadline expires on a slow sink", () =>
    withDefaultGrace(
      Effect.gen(function* () {
        const fds = openFds()
        const started = Date.now()
        const error = yield* run(
          videoIntoSink(Sink.forEach(() => Effect.sleep("50 millis")))
        ).pipe(Effect.timeout("500 millis"), Effect.flip)
        expect(Date.now() - started).toBeLessThan(500 + SHUTDOWN_BOUND)
        expect(error).toMatchObject({ _tag: "TimeoutError" })
        expect(pids().filter(alive)).toEqual([])
        yield* expectNoLeakedFds(fds)
      })
    )
  )
})

it.live(
  "cancelling a run completes when a sink's finalizer waits for an input to be released",
  () =>
    withDefaultGrace(
      Effect.gen(function* () {
        const fds = openFds()
        const released = yield* Deferred.make<void>()
        const received = yield* Deferred.make<void>()
        const finalized = { sink: 0 }
        // E.g. a sink and a source sharing a connection: the sink can only
        // close once the source let go of it.
        const source = Stream.forever(Stream.sync(chunk)).pipe(
          Stream.ensuring(Deferred.succeed(released, undefined))
        )
        const sink = Sink.forEach(() =>
          Deferred.succeed(received, undefined)
        ).pipe(
          Sink.ensuring(
            Deferred.await(released).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  finalized.sink++
                })
              )
            )
          )
        )
        const fiber = yield* Effect.forkChild(
          run(
            Command.make({
              inputs: [Input.fromStream(source, raw)],
              outputs: [
                Output.toSink(
                  sink,
                  Options.create({ "c:a": "copy", f: "s16le" })
                )
              ]
            })
          )
        )
        yield* Deferred.await(received)

        const started = Date.now()
        // Interrupting waits for the run's finalizers, so it is forked: a hung
        // shutdown fails the bound below rather than the test timeout.
        yield* Effect.forkChild(Fiber.interrupt(fiber))
        const exit = yield* Fiber.await(fiber).pipe(
          Effect.timeoutOrElse({
            duration: "10 seconds",
            orElse: () => Effect.die(new Error("cancellation did not complete"))
          })
        )
        expect(Date.now() - started).toBeLessThan(SHUTDOWN_BOUND)
        expect(
          Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
        ).toBe(true)
        expect(finalized.sink).toBe(1)
        expect(pids().filter(alive)).toEqual([])
        yield* expectNoLeakedFds(fds)
      })
    ),
  20_000
)
