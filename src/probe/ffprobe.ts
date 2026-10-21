import * as Cause from "effect/Cause"
import type * as Config from "effect/Config"
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import * as ChildProcess from "effect/process/ChildProcess"
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  ExitError,
  PipeError,
  ProbeDecodeError,
  type ProbeError,
  ProbeOutputError,
  SpawnError
} from "../errors.ts"
import { ByteTail } from "../core/diagnostics.ts"
import type { FFmpeguOptions } from "../options/core.ts"
import {
  awaitExit,
  byteLimit,
  DEFAULT_FORCE_KILL_AFTER,
  DEFAULT_STDERR_TAIL_BYTES,
  drainToTail,
  durationOption,
  mapEffectErrors,
  mapStreamErrors
} from "../core/process.ts"
import { probeArgs } from "./command.ts"
import { ProbeResult, ProjectedProbeResult } from "./schema.ts"

export interface FFprobeOptions {
  /** Binary name or path. Defaults to `"ffprobe"`. */
  readonly binary?: string | undefined
  /** Grace period after SIGTERM before SIGKILL. Defaults to 5 seconds. */
  readonly forceKillAfter?: Duration.Input | undefined
  /** Largest accepted JSON output. Defaults to 16 MiB. */
  readonly maxOutputBytes?: number | undefined
  /** Bytes of stderr kept for errors. Defaults to 64 KiB. */
  readonly stderrTailBytes?: number | undefined
}

export interface FFprobeService {
  /** Probe a file path or URL for its format and streams. */
  readonly probe: (input: string) => Effect.Effect<ProbeResult, ProbeError>
  /** Explicit options replace the default format/stream selection. */
  readonly probeWith: (
    input: string,
    options: FFmpeguOptions
  ) => Effect.Effect<ProjectedProbeResult, ProbeError>
  /**
   * Like `probeWith`, decoding the JSON document with `schema` instead of
   * `ProjectedProbeResult`.
   *
   * A separate method with a single generic signature, so an implementation
   * that ignores the schema does not type-check. Overloads on `probeWith` or
   * an `S["Type"]` result would both accept one: TypeScript erases generics
   * when checking against overloads, and `S["Type"]` accepts any value.
   */
  readonly probeWithSchema: <A, R>(
    input: string,
    options: FFmpeguOptions,
    schema: Schema.Decoder<A, R>
  ) => Effect.Effect<A, ProbeError, R>
}

export class FFprobe extends Context.Service<FFprobe, FFprobeService>()(
  "ffmpegu/FFprobe"
) {
  /** Layer running `ffprobe` through the provided `ChildProcessSpawner`. */
  static layer = (
    options: FFprobeOptions = {}
  ): Layer.Layer<FFprobe, never, ChildProcessSpawner> =>
    Layer.effect(FFprobe, make(options))

  /** Like {@link FFprobe.layer}, reading options from `Config`. */
  static layerConfig = (
    options: Config.Config<FFprobeOptions>
  ): Layer.Layer<FFprobe, Config.ConfigError, ChildProcessSpawner> =>
    Layer.effect(FFprobe, Effect.flatMap(options, make))
}

/** Probe with the `FFprobe` service from the context. */
export const probe = (
  input: string
): Effect.Effect<ProbeResult, ProbeError, FFprobe> =>
  FFprobe.use((ffprobe) => ffprobe.probe(input))

/**
 * Probe selected metadata using the existing options builder, optionally
 * decoding the output with a caller-supplied schema.
 */
export function probeWith(
  input: string,
  options: FFmpeguOptions
): Effect.Effect<ProjectedProbeResult, ProbeError, FFprobe>
export function probeWith<S extends Schema.Top>(
  input: string,
  options: FFmpeguOptions,
  schema: S
): Effect.Effect<S["Type"], ProbeError, FFprobe | S["DecodingServices"]>
export function probeWith(
  input: string,
  options: FFmpeguOptions,
  schema?: Schema.Top
): Effect.Effect<unknown, ProbeError, unknown> {
  return FFprobe.use((ffprobe) =>
    schema === undefined
      ? ffprobe.probeWith(input, options)
      : ffprobe.probeWithSchema(input, options, schema)
  )
}

const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024

const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(ProbeResult))
const decodeProjected = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ProjectedProbeResult)
)

const make = Effect.fnUntraced(function* (options: FFprobeOptions) {
  const spawner = yield* ChildProcessSpawner
  const binary = options.binary ?? "ffprobe"
  const forceKillAfter = yield* durationOption(
    "forceKillAfter",
    options.forceKillAfter,
    DEFAULT_FORCE_KILL_AFTER
  )
  const maxOutputBytes = yield* byteLimit(
    "maxOutputBytes",
    options.maxOutputBytes,
    DEFAULT_MAX_OUTPUT_BYTES
  )
  const stderrTailBytes = yield* byteLimit(
    "stderrTailBytes",
    options.stderrTailBytes,
    DEFAULT_STDERR_TAIL_BYTES
  )

  const execute = Effect.fn("ffmpegu/FFprobe.probe")(function* <A, R>(
    input: string,
    decodeOutput: (json: string) => Effect.Effect<A, Schema.SchemaError, R>,
    options?: FFmpeguOptions
  ) {
    const compiled = probeArgs(input, options)
    if (Result.isFailure(compiled)) return yield* Effect.fail(compiled.failure)
    const args = compiled.success
    const { exit, stderr, stdout } = yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner
          .spawn(
            ChildProcess.make(binary, args, {
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
              forceKillAfter
            })
          )
          .pipe(mapEffectErrors((cause) => new SpawnError({ binary, cause })))

        // Holds at most maxOutputBytes: exceeding the limit fails first.
        const stdout = new ByteTail(maxOutputBytes)
        const stderr = new ByteTail(stderrTailBytes)
        // Fails fast: an oversized output or broken pipe closes the scope,
        // which terminates the process.
        const [exit] = yield* Effect.all(
          [
            awaitExit(handle),
            handle.stdout.pipe(
              mapStreamErrors(
                (cause) => new PipeError({ fd: 1, direction: "output", cause })
              ),
              Stream.runForEach((chunk) =>
                stdout.size + chunk.length > maxOutputBytes
                  ? Effect.fail(new ProbeOutputError({ maxOutputBytes }))
                  : Effect.sync(() => stdout.push(chunk))
              )
            ),
            drainToTail(handle.stderr, 2, stderr)
          ],
          { concurrency: "unbounded" }
        )
        return { exit, stderr, stdout }
      })
    )

    if (exit.exitCode !== 0) {
      const exitError = new ExitError({
        exitCode: exit.exitCode,
        stderr: stderr.text(),
        cause: exit.cause
      })
      return yield* Effect.failCause(
        Cause.fromReasons([Cause.makeFailReason(exitError), ...exit.reasons])
      )
    }

    const json = new TextDecoder().decode(stdout.bytes())
    return yield* decodeOutput(json).pipe(
      mapEffectErrors(
        (cause) =>
          new ProbeDecodeError({
            message: `Invalid ffprobe output: ${cause.message}`,
            cause
          })
      )
    )
  })

  return FFprobe.of({
    probe: (input) => execute(input, decode),
    probeWith: (input, options) => execute(input, decodeProjected, options),
    probeWithSchema: (input, options, schema) =>
      execute(
        input,
        Schema.decodeUnknownEffect(Schema.fromJsonString(schema)),
        options
      )
  })
})
