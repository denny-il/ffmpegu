# FFprobe

```ts
import { Effect } from "effect"
import { FFprobe, probe } from "ffmpegu"
import { NodeServices } from "@effect/platform-node"

const metadata = probe("input.mp4").pipe(
  Effect.provide(FFprobe.layer()),
  Effect.provide(NodeServices.layer)
)
```

The Effect returns the decoded object directly: `streams` and optional `format`, with codec-specific and future fields preserved. Known fields are validated, numeric strings retain FFprobe's representation, and absent streams become an empty array. Invalid JSON, a non-object root, and invalid known fields fail decoding.

## Selecting metadata and input options

`probeWith(input, options)` and `FFprobeService.probeWith` accept an `Options` builder; `probe(input)` remains unary and safe to pass directly to `Effect.forEach` or `Array.map`. Use FFprobe's native option names and values; `Options.merge`, `Options.concat`, and `options.custom` compose as they do for FFmpeg commands.

```ts
import { Effect } from "effect"
import { FFprobe, Options, probeWith } from "ffmpegu"
import { NodeServices } from "@effect/platform-node"

const selection = Options.create({
  show_entries: "stream=codec_name,width,height:format=duration",
  select_streams: "v:0",
  protocol_whitelist: "file",
  v: "error"
})

const metadata = probeWith("input.mp4", selection).pipe(
  Effect.timeout("10 seconds"),
  Effect.provide(FFprobe.layer({ maxOutputBytes: 2 * 1024 * 1024 })),
  Effect.provide(NodeServices.layer)
)
```

Explicit options **replace** `-show_format -show_streams`. Select the desired sections with `show_entries`, `show_streams`, `show_chapters`, or other FFprobe options. To keep full format and streams while configuring input policy or logging, include `{ show_format: true, show_streams: true }`. An empty builder requests no sections and returns `{ streams: [] }` for a successful probe.

`probe(input)` still returns `ProbeResult`, whose streams require an integer `index`. `probeWith` returns `ProjectedProbeResult` with `ProjectedProbeStream`: `index` is optional because `show_entries` can omit it. Other known fields keep their validation and optionality, except projected `width`, `height`, `start_pts`, and `duration_ts` also accept `"N/A"`: with `show_optional_fields: "always"`, FFprobe prints it for unavailable timestamps and for subtitle streams without dimensions. Absent streams still decode to `[]`; `format` stays optional. Other sections and unknown fields are preserved as `unknown`. Both projected schemas are exported for use outside the service. Options that change the types of known fields (for example human-readable units) can cause `ProbeDecodeError`.

## Decoding with your own schema

Pass a schema as the third argument to decode the selected metadata into your own type instead of `ProjectedProbeResult`:

```ts
import { Schema } from "effect"
import { options, probeWith } from "ffmpegu"

const Dims = Schema.Struct({
  streams: Schema.Array(
    Schema.Struct({ width: Schema.Number, height: Schema.Number })
  )
})

// Effect<{ readonly streams: ReadonlyArray<{ readonly width: number; readonly height: number }> }, ProbeError, FFprobe>
const dims = probeWith(
  "input.mp4",
  options.custom({ show_entries: "stream=width,height", select_streams: "v:0" }),
  Dims
)
```

The schema decodes FFprobe's whole JSON document in place of `ProjectedProbeResult`, so none of the projected defaults apply. FFprobe omits sections it did not print, including `streams`, so make a key optional if the selection can leave it out. Unlisted keys are dropped under Effect's default parse options. Transformations such as `Schema.NumberFromString` run as usual, and services the schema needs for decoding are added to the Effect's requirements. A failing decode is reported as `ProbeDecodeError`.

The service exposes this as a separate method, `FFprobeService.probeWithSchema(input, options, schema)`; `FFprobeService.probeWith` keeps its two-argument signature. Custom implementations and mocks of `FFprobeService` must add `probeWithSchema`, and its result must come from decoding with `schema`. Its single generic signature rejects an implementation that returns a fixed value, so a mock can decode its fixture instead:

```ts
const fixture = { streams: [] }
const mock: FFprobeService = {
  probe: () => Effect.succeed(fixture),
  probeWith: () => Effect.succeed(fixture),
  probeWithSchema: (_input, _options, schema) =>
    Schema.decodeUnknownEffect(schema)(fixture).pipe(Effect.orDie)
}
```

The service owns `-i`, `-of`/`-output_format`/`-print_format`, and `-o`. Attempts to set them, their file-loaded or stream-specifier spellings, or `--` fail with `CommandError` before spawning. The input is one argument following `-i`, so spaces, leading dashes, and shell metacharacters retain their literal meaning. Stdin/descriptor paths (`-`, `pipe:`, `fd:`, `/dev/stdin`, etc.) and NUL bytes are rejected in input and options. FFmpeg stream references are invalid in probe options. The builder passes other flags to FFprobe; invalid flags can fail with `ExitError`, and invalid output fails decoding. No shell is used.

## Process policy and cleanup

Spawning, output collection, and cleanup are scoped. Spawn and nonzero exit errors are typed failures; interruption terminates the child. Probe output is size-limited so an unexpected binary cannot cause unbounded JSON accumulation. Configure `maxOutputBytes` in `FFprobe.layer` when probing unusually large metadata.

`FFprobeOptions` configures the process service: `binary` (default `"ffprobe"`), `maxOutputBytes` (16 MiB), `stderrTailBytes` (64 KiB), and `forceKillAfter` (5 seconds). These defaults are unchanged. Stderr is drained even with a zero-byte tail; `v: "quiet"` suppresses FFprobe's diagnostics at the source. Output overflow fails with `ProbeOutputError` and closes the process scope.

Timeouts, queue admission, and concurrency belong to caller Effect composition. For example, `Effect.forEach(inputs, input => probeWith(input, selection), { concurrency: 2 })` limits that batch to two probes. Place a timeout around each probe for a per-operation deadline, or around a larger operation to include queue waiting. Interruption from a timeout, cancelled fiber, or enclosing scope closes the process scope and waits for cleanup. The spawner sends SIGTERM, escalating to SIGKILL after `forceKillAfter` if needed; cleanup can extend past the operation's timeout by that grace period. No additional runtime, queue, or kill-signal configuration is introduced.

A probe can be executed repeatedly. There is no consumed-command state and no `.json` or `.result` wrapper.

## Compatibility in 0.3.0

Existing `probe(input)` calls, callback composition, strict result types, and process defaults are preserved. Custom implementations or mocks of `FFprobeService` must implement the new `probeWith` method. `ProbeError` now includes `CommandError`; exhaustive error handlers must handle that tag. Stdin/descriptor paths and NUL bytes now fail validation before spawning rather than reaching FFprobe or becoming a spawn failure.
