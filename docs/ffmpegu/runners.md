# Execution services

`run(command, options?)` requires `FFmpeg`; `probe(path)` requires `FFprobe`. Provide their live Layers with Node or Bun platform services. Custom binaries can be configured with `FFmpeg.layer({ binary: "/path/to/ffmpeg" })` and `FFprobe.layer({ binary: "/path/to/ffprobe" })`.

Each run starts a fresh scoped process. Input feeders, output sinks, stderr, and progress readers are supervised together. Source/sink errors and defects stop the operation and terminate its child. Nonzero exit codes are typed failures. Successful execution waits for output EOF and sink finalization and returns a bounded stderr tail for diagnostics.

`forceKillAfter` controls escalation when a child ignores SIGTERM; the default is five seconds. FFmpeg blocked writing to a full output pipe may need this escalation, so cancellation can take the configured grace period. `stderrTailBytes` bounds retained diagnostics. Paths and arguments can contain credentials, so automatic tracing does not record argv or stderr. Treat explicitly inspected diagnostics as potentially sensitive.

## Progress

```ts
const execution = run(command, {
  onProgress: (progress) =>
    Effect.logDebug("Encoding", {
      frame: progress.frame,
      state: progress.progress
    })
})
```

The callback returns an Effect. Progress parsing and callback execution are separated by a bounded queue retaining the latest update, so a slow callback does not stop media processing. Updates may be coalesced. Successful completion waits for pending callback work. Callback failure fails the run; callbacks are interrupted on run failure/cancellation. A callback that never completes keeps the run pending: apply your own timeout if needed.

The library only reports parsed updates. It does not fabricate `progress=end` for a killed process or missing/malformed progress. Numeric `N/A` values become `undefined`; original strings remain in `raw`.

## Cancellation

```ts
import { Effect, Fiber } from "effect"

const program = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(run(command))
  // Other application work happens here.
  yield* Fiber.interrupt(fiber)
})
```

Use `forkScoped` when the operation should belong to a surrounding scope. `Effect.timeout` also interrupts the run and performs cleanup. The library never detaches a process or starts a hidden runtime. Applications may use `NodeRuntime.runMain`, `BunRuntime.runMain`, or their existing managed runtime at the boundary.

Cleanup waits for caller-owned stream, sink, and callback finalizers. As with other scoped Effects, a finalizer that never completes can prevent cancellation from completing; `forceKillAfter` bounds process termination, not arbitrary application finalizers.

## Configuration and testing

Both services offer `layerConfig` for application-owned configuration:

```ts
import { Config } from "effect"
import { FFmpeg } from "ffmpegu"

const FFmpegLive = FFmpeg.layerConfig(
  Config.all({
    binary: Config.String("FFMPEG_PATH").pipe(Config.withDefault("ffmpeg"))
  })
)
```

A configuration provider can be replaced in tests. Byte limits must be non-negative safe integers; invalid programmatic settings are defects during Layer construction. No binary is started until an execution Effect runs.

For deterministic tests, supply a fake `ChildProcessSpawner` to the live service Layer and use `@effect/vitest`'s `it.effect`. Real process tests use `it.live` so process shutdown and platform timers advance normally. Applications can also provide a fake `FFmpeg` or `FFprobe` service when testing higher-level workflows without testing process behavior.
