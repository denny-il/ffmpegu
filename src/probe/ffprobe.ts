import type * as ByteSize from "effect/ByteSize"
import * as Cause from "effect/Cause"
import type * as Config from "effect/Config"
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import * as ChildProcess from "effect/process/ChildProcess"
import {
  type ChildProcessHandle,
  ChildProcessSpawner
} from "effect/process/ChildProcessSpawner"
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
  annotateExitCode,
  awaitExit,
  byteLimit,
  DEFAULT_FORCE_KILL_AFTER,
  DEFAULT_STDERR_TAIL_BYTES,
  drainToTail,
  durationOption,
  executableName,
  mapEffectErrors,
  mapStreamErrors,
  orDieInvalid,
  validatedConfig
} from "../core/process.ts"
import { probeArgs } from "./command.ts"
import { ProbeResult, ProjectedProbeResult } from "./schema.ts"

export interface FFprobeOptions {
  /** Binary name or path. Defaults to `"ffprobe"`. */
  readonly binary?: string | undefined
  /**
   * Grace period after SIGTERM before SIGKILL. Defaults to 5 seconds. Must
   * not be negative or NaN; `0` (or `-0`) escalates at once, `"Infinity"`
   * never does. Strings with a leading `-` are rejected. Every element of a tuple and field of a duration object must
   * be non-negative (mixed signs are rejected), with a total of at most
   * `Number.MAX_SAFE_INTEGER` nanoseconds (about 104 days).
   */
  readonly forceKillAfter?: Duration.Input | undefined
  /**
   * Largest accepted JSON output, as a byte count or a size such as
   * `"16 MiB"`. Defaults to 16 MiB.
   */
  readonly maxOutputBytes?: ByteSize.Input | undefined
  /** Bytes of stderr kept for errors, like `maxOutputBytes`. Defaults to 64 KiB. */
  readonly stderrTailBytes?: ByteSize.Input | undefined
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
   * Like `probeWith`, returning FFprobe's parsed JSON document undecoded.
   *
   * `probeWith(input, options, schema)` decodes this output with the caller's
   * schema. Decoding stays in the library so a custom implementation cannot
   * return a value that does not match the schema's type.
   */
  readonly probeJson: (
    input: string,
    options: FFmpeguOptions
  ) => Effect.Effect<unknown, ProbeError>
}

export class FFprobe extends Context.Service<FFprobe, FFprobeService>()(
  "ffmpegu/FFprobe"
) {
  /**
   * Layer running `ffprobe` through the provided `ChildProcessSpawner`.
   * Invalid options are defects.
   */
  static layer = (
    options: FFprobeOptions = {}
  ): Layer.Layer<FFprobe, never, ChildProcessSpawner> =>
    Layer.effect(
      FFprobe,
      Effect.flatMap(orDieInvalid(toSettings(options)), make)
    )

  /**
   * Like {@link FFprobe.layer}, reading options from `Config`: either a
   * `Config` of all options or a record of a `Config` per option. Invalid
   * values fail with `ConfigError`.
   */
  static layerConfig = (
    options: Config.Wrap<FFprobeOptions>
  ): Layer.Layer<FFprobe, Config.ConfigError, ChildProcessSpawner> =>
    Layer.effect(
      FFprobe,
      Effect.flatMap(validatedConfig(options, toSettings), make)
    )
}

/** Probe with the `FFprobe` service from the context. */
export const probe = (
  input: string
): Effect.Effect<ProbeResult, ProbeError, FFprobe> =>
  FFprobe.use((ffprobe) => ffprobe.probe(input))

/**
 * Probe selected metadata using the existing options builder, optionally
 * decoding the output with a caller-supplied schema. A schema decodes the
 * service's `probeJson` output here, not in the service.
 */
export function probeWith<S extends Schema.Top>(
  input: string,
  options: FFmpeguOptions,
  schema: S
): Effect.Effect<S["Type"], ProbeError, FFprobe | S["DecodingServices"]>
// Kept last: `Parameters`/`ReturnType` resolve to the final overload, so
// wrappers derived from them keep the two-argument API.
export function probeWith(
  input: string,
  options: FFmpeguOptions
): Effect.Effect<ProjectedProbeResult, ProbeError, FFprobe>
export function probeWith(
  input: string,
  options: FFmpeguOptions,
  schema?: Schema.Top
): Effect.Effect<unknown, ProbeError, unknown> {
  return schema === undefined
    ? FFprobe.use((ffprobe) => ffprobe.probeWith(input, options))
    : FFprobe.use((ffprobe) => ffprobe.probeJson(input, options)).pipe(
        Effect.flatMap(decodeOutput(schema)),
        // The service span ends before this decode; this one covers both.
        Effect.withSpan("ffmpegu/probeWith")
      )
}

const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/** Decodes parsed FFprobe output, reporting failures as `ProbeDecodeError`. */
const decodeOutput = <S extends Schema.Top>(schema: S) => {
  const decode = Schema.decodeUnknownEffect(schema)
  return (output: unknown) =>
    decode(output).pipe(
      mapEffectErrors(
        (cause) =>
          new ProbeDecodeError({
            message: `Invalid ffprobe output: ${cause.message}`,
            cause
          })
      )
    )
}

const parseJson = decodeOutput(Schema.fromJsonString(Schema.Unknown))
const decode = decodeOutput(ProbeResult)
const decodeProjected = decodeOutput(ProjectedProbeResult)

interface Settings {
  readonly binary: string
  readonly forceKillAfter: Duration.Duration
  readonly maxOutputBytes: number
  readonly stderrTailBytes: number
}

const toSettings = Effect.fnUntraced(function* (options: FFprobeOptions) {
  return {
    binary: options.binary ?? "ffprobe",
    forceKillAfter: yield* durationOption(
      "forceKillAfter",
      options.forceKillAfter,
      DEFAULT_FORCE_KILL_AFTER
    ),
    maxOutputBytes: yield* byteLimit(
      "maxOutputBytes",
      options.maxOutputBytes,
      DEFAULT_MAX_OUTPUT_BYTES
    ),
    stderrTailBytes: yield* byteLimit(
      "stderrTailBytes",
      options.stderrTailBytes,
      DEFAULT_STDERR_TAIL_BYTES
    )
  } satisfies Settings
})

const make = Effect.fnUntraced(function* ({
  binary,
  forceKillAfter,
  maxOutputBytes,
  stderrTailBytes
}: Settings) {
  const spawner = yield* ChildProcessSpawner

  const execute = Effect.fn("ffmpegu/FFprobe.probe")(function* <A, R>(
    input: string,
    decodeOutput: (output: unknown) => Effect.Effect<A, ProbeDecodeError, R>,
    options?: FFmpeguOptions
  ) {
    // The input path or URL can carry credentials, so it is not recorded.
    yield* Effect.annotateCurrentSpan(
      "process.executable.name",
      executableName(binary)
    )
    const compiled = probeArgs(input, options)
    if (Result.isFailure(compiled)) return yield* Effect.fail(compiled.failure)
    const args = compiled.success
    const { exit, stderr, stdout } = yield* Effect.scoped(
      Effect.gen(function* () {
        // For an output failure, which interrupts `awaitExit` before the
        // process exits. Registered before spawning, so that it runs after the
        // platform's release has terminated the process.
        let spawned: ChildProcessHandle | undefined
        yield* Effect.addFinalizer(() =>
          spawned === undefined ? Effect.void : annotateExitCode(spawned)
        )
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
        spawned = handle

        // Holds at most maxOutputBytes: exceeding the limit fails first.
        const stdout = new ByteTail(maxOutputBytes)
        const stderr = new ByteTail(stderrTailBytes)
        // Fails fast: an oversized output or broken pipe closes the scope,
        // which terminates the process.
        const [exit] = yield* Effect.all(
          [
            // Annotated as soon as known: draining may still fail after exit.
            Effect.tap(awaitExit(handle), ({ exitCode }) =>
              exitCode === null
                ? Effect.void
                : Effect.annotateCurrentSpan("process.exit.code", exitCode)
            ),
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
        binary,
        exitCode: exit.exitCode,
        stderr: stderr.text(),
        cause: exit.cause
      })
      return yield* Effect.failCause(
        Cause.fromReasons([Cause.makeFailReason(exitError), ...exit.reasons])
      )
    }

    const output = yield* parseJson(new TextDecoder().decode(stdout.bytes()))
    return yield* decodeOutput(output)
  })

  return FFprobe.of({
    probe: (input) => execute(input, decode),
    probeWith: (input, options) => execute(input, decodeProjected, options),
    probeJson: (input, options) => execute(input, Effect.succeed, options)
  })
})
