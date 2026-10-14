import {
  Deferred,
  Effect,
  Layer,
  PlatformError,
  Queue,
  Ref,
  Sink,
  Stream
} from "effect"
import type * as Cause from "effect/Cause"
import { type ChildProcess, ChildProcessSpawner } from "effect/process"

/**
 * In-memory stand-in for a spawned process. Tests drive it explicitly:
 * output descriptors are queues, input descriptors record what was written,
 * and the exit is a deferred completed by `exit`, `exitWithSignal` or `kill`.
 */
export interface FakeProcess {
  readonly command: ChildProcess.StandardCommand
  readonly args: ReadonlyArray<string>
  /** Bytes written to an input descriptor, by fd. */
  readonly written: (fd: number) => Effect.Effect<ReadonlyArray<number>>
  /** Whether the input stream for `fd` reached its end (EOF was sent). */
  readonly inputEnded: (fd: number) => Effect.Effect<boolean>
  /** Await the first write to `fd`. */
  readonly awaitWrite: (fd: number) => Effect.Effect<void>
  /** Block writes to `fd` (as a full pipe would) until `releaseInput`. */
  readonly holdInput: (fd: number) => Effect.Effect<void>
  readonly releaseInput: (fd: number) => Effect.Effect<void>
  /** Await a write to `fd` being attempted. */
  readonly awaitWriteAttempt: (fd: number) => Effect.Effect<void>
  /** Make further writes to `fd` fail as if the reader closed its end. */
  readonly closeInput: (fd: number, code?: string) => Effect.Effect<void>
  /** Emit chunks on an output descriptor (stdout is fd 1 when piped, stderr fd 2), in one batch. */
  readonly emit: (
    fd: number,
    ...chunks: Array<string | Uint8Array>
  ) => Effect.Effect<void>
  /** End an output descriptor. */
  readonly endOutput: (fd: number) => Effect.Effect<void>
  /** Fail an output descriptor with a platform error. */
  readonly failOutput: (fd: number) => Effect.Effect<void>
  /** End all outputs and exit with the code. */
  readonly exit: (code: number) => Effect.Effect<void>
  /** Complete the exit wait with an arbitrary cause. */
  readonly exitWithCause: (
    cause: Cause.Cause<PlatformError.PlatformError>
  ) => Effect.Effect<void>
  /** Exit without code, as the platform reports signal termination. */
  readonly exitWithSignal: () => Effect.Effect<PlatformError.PlatformError>
  readonly kills: Effect.Effect<
    ReadonlyArray<ChildProcess.KillOptions | undefined>
  >
  readonly released: Effect.Effect<boolean>
}

export interface FakeSpawnerOptions {
  /** Fail spawning with this error. */
  readonly spawnError?: PlatformError.PlatformError
  /** Keep running when killed (a process ignoring SIGTERM). */
  readonly ignoreKill?: boolean
}

const encoder = new TextEncoder()

export const platformError = (method: string, code?: string) =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "ChildProcess",
    method,
    cause:
      code === undefined
        ? new Error(method)
        : Object.assign(new Error(`${method} ${code}`), { code })
  })

export const makeFakeSpawner = Effect.fnUntraced(function* (
  options: FakeSpawnerOptions = {}
) {
  const spawned = yield* Queue.unbounded<FakeProcess>()

  const spawn = (command: ChildProcess.Command) =>
    Effect.gen(function* () {
      if (command._tag !== "StandardCommand") {
        return yield* Effect.die("piped commands are not supported")
      }
      if (options.spawnError) return yield* options.spawnError

      const exitCode = yield* Deferred.make<
        ChildProcessSpawner.ExitCode,
        PlatformError.PlatformError
      >()
      const kills = yield* Ref.make<
        Array<ChildProcess.KillOptions | undefined>
      >([])
      const released = yield* Ref.make(false)
      const outputs = new Map<
        number,
        Queue.Queue<Uint8Array, PlatformError.PlatformError | Cause.Done>
      >()
      const inputs = new Map<
        number,
        {
          readonly written: Array<number>
          readonly firstWrite: Deferred.Deferred<void>
          readonly attempted: Deferred.Deferred<void>
          gate: Deferred.Deferred<void> | undefined
          ended: boolean
          closed: string | undefined
        }
      >()

      const fds = Object.entries(command.options.additionalFds ?? {})
      const outputFds = [
        ...(command.options.stdout === "pipe" ? [1] : []),
        2,
        ...fds
          .filter(([, c]) => c.type === "output")
          .map(([n]) => Number(n.slice(2)))
      ]
      for (const fd of outputFds) {
        outputs.set(
          fd,
          yield* Queue.unbounded<
            Uint8Array,
            PlatformError.PlatformError | Cause.Done
          >()
        )
      }
      for (const [name, config] of fds) {
        if (config.type !== "input") continue
        inputs.set(Number(name.slice(2)), {
          written: [],
          firstWrite: yield* Deferred.make<void>(),
          attempted: yield* Deferred.make<void>(),
          gate: undefined,
          ended: false,
          closed: undefined
        })
      }

      const output = (fd: number) => {
        const queue = outputs.get(fd)
        if (!queue) throw new Error(`fd ${fd} is not an output`)
        return queue
      }
      const input = (fd: number) => {
        const state = inputs.get(fd)
        if (!state) throw new Error(`fd ${fd} is not an input`)
        return state
      }
      const endAll = Effect.forEach(outputs.values(), Queue.end, {
        discard: true
      })
      const signalExit = Effect.gen(function* () {
        const error = platformError("exitCode")
        yield* endAll
        yield* Deferred.fail(exitCode, error)
        return error
      })

      const inputSink = (fd: number) => {
        const state = input(fd)
        return Sink.forEach((chunk: Uint8Array) =>
          Deferred.succeed(state.attempted, undefined).pipe(
            Effect.andThen(
              Effect.suspend(() =>
                state.gate ? Deferred.await(state.gate) : Effect.void
              )
            ),
            Effect.andThen(
              Effect.suspend(() => {
                if (state.closed !== undefined) {
                  return Effect.fail(
                    platformError(`fromWritable(fd${fd})`, state.closed)
                  )
                }
                state.written.push(...chunk)
                return Deferred.succeed(state.firstWrite, undefined)
              })
            )
          )
        ).pipe(
          Sink.mapEffect(() => Effect.sync(() => void (state.ended = true)))
        )
      }

      const process: FakeProcess = {
        command,
        args: command.args,
        written: (fd) => Effect.sync(() => [...input(fd).written]),
        inputEnded: (fd) => Effect.sync(() => input(fd).ended),
        awaitWrite: (fd) => Deferred.await(input(fd).firstWrite),
        holdInput: (fd) =>
          Deferred.make<void>().pipe(
            Effect.flatMap((gate) =>
              Effect.sync(() => void (input(fd).gate = gate))
            )
          ),
        releaseInput: (fd) =>
          Effect.suspend(() => {
            const gate = input(fd).gate
            input(fd).gate = undefined
            return gate
              ? Deferred.succeed(gate, undefined).pipe(Effect.asVoid)
              : Effect.void
          }),
        awaitWriteAttempt: (fd) => Deferred.await(input(fd).attempted),
        closeInput: (fd, code = "EPIPE") =>
          Effect.sync(() => void (input(fd).closed = code)),
        emit: (fd, ...chunks) =>
          Queue.offerAll(
            output(fd),
            chunks.map((chunk) =>
              typeof chunk === "string" ? encoder.encode(chunk) : chunk
            )
          ).pipe(Effect.asVoid),
        endOutput: (fd) => Queue.end(output(fd)).pipe(Effect.asVoid),
        failOutput: (fd) =>
          Queue.fail(output(fd), platformError(`fromReadable(fd${fd})`)).pipe(
            Effect.asVoid
          ),
        exit: (code) =>
          endAll.pipe(
            Effect.andThen(
              Deferred.succeed(exitCode, ChildProcessSpawner.ExitCode(code))
            ),
            Effect.asVoid
          ),
        exitWithSignal: () => signalExit,
        exitWithCause: (cause) =>
          endAll.pipe(
            Effect.andThen(Deferred.failCause(exitCode, cause)),
            Effect.asVoid
          ),
        kills: Ref.get(kills),
        released: Ref.get(released)
      }

      const kill = (killOptions?: ChildProcess.KillOptions) =>
        Ref.update(kills, (all) => [...all, killOptions]).pipe(
          Effect.andThen(
            options.ignoreKill ? Effect.void : Effect.asVoid(signalExit)
          )
        )

      yield* Effect.addFinalizer(() =>
        Ref.set(released, true).pipe(
          Effect.andThen(Deferred.isDone(exitCode)),
          Effect.flatMap((done) => (done ? Effect.void : kill(command.options)))
        )
      )
      yield* Queue.offer(spawned, process)

      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1234),
        exitCode: Deferred.await(exitCode),
        isRunning: Effect.map(Deferred.isDone(exitCode), (done) => !done),
        kill,
        stdin: Sink.drain,
        stdout: outputs.has(1) ? Stream.fromQueue(output(1)) : Stream.empty,
        stderr: Stream.fromQueue(output(2)),
        all: Stream.fromQueue(output(2)),
        getInputFd: (fd) => (inputs.has(fd) ? inputSink(fd) : Sink.drain),
        getOutputFd: (fd) =>
          outputs.has(fd) ? Stream.fromQueue(output(fd)) : Stream.empty,
        unref: Effect.succeed(Effect.void)
      })
    })

  const spawner = ChildProcessSpawner.make(
    spawn as ChildProcessSpawner.ChildProcessSpawner["Service"]["spawn"]
  )

  return {
    /** Awaits the next spawned process. */
    next: Queue.take(spawned),
    layer: Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(spawner)
  }
})
