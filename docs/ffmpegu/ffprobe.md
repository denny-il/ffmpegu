# FFprobe

| Function                          | Returns                                             |
| --------------------------------- | --------------------------------------------------- |
| `probe(input)`                    | `Effect<ProbeResult, ProbeError, FFprobe>`          |
| `probeWith(input, options)`       | `Effect<ProjectedProbeResult, ProbeError, FFprobe>` |
| `probeWith(input, options, schema)` | `Effect<schema's Type, ProbeError, FFprobe \| schema's services>` |

`input` is any path or URL FFprobe can open. Every call starts a fresh FFprobe process and decodes its JSON output; there is no result wrapper to unpack.

## Probe

```ts
import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { FFprobe, probe } from "ffmpegu"

const program = Effect.gen(function* () {
  const metadata = yield* probe("input.mp4")
  const video = metadata.streams.find((stream) => stream.codec_type === "video")
  yield* Effect.logInfo("Probed", {
    duration: metadata.format?.duration,
    size: video && `${video.width}x${video.height}`
  })
}).pipe(Effect.provide(FFprobe.layer()), Effect.provide(NodeServices.layer))
```

`probe` runs `ffprobe -show_format -show_streams` and returns a `ProbeResult`: `streams` (empty when FFprobe printed none) and an optional `format`.

- Known fields are validated: each stream needs an integer `index`, and fields such as `width`, `channels`, or `codec_name` must have FFprobe's usual types.
- Numeric strings stay strings, as FFprobe prints them: `format.duration`, `stream.bit_rate`, `stream.sample_rate`, `stream.r_frame_rate`.
- Unknown and codec-specific fields are preserved as `unknown`, so output from newer FFprobe versions survives decoding.
- Invalid JSON, a non-object root, or an invalid known field fails with `ProbeDecodeError`.

`probe` is unary, so it can be passed directly to `Effect.forEach(paths, probe)`.

## Selecting metadata

`probeWith(input, options)` runs FFprobe with your options instead of the default selection. Use FFprobe's own option names:

```ts
import { Effect } from "effect"
import { Options, probeWith } from "ffmpegu"

const dimensions = probeWith(
  "input.mp4",
  Options.create({
    show_entries: "stream=codec_name,width,height:format=duration",
    select_streams: "v:0",
    protocol_whitelist: "file",
    v: "error"
  })
).pipe(Effect.timeout("10 seconds"))
```

Explicit options **replace** `-show_format -show_streams`. To keep the full output while adding input policy or logging options, include `{ show_format: true, show_streams: true }`. An empty bundle selects nothing and decodes to `{ streams: [] }`.

The result is a `ProjectedProbeResult`. It differs from `ProbeResult` only where a selection can change the output:

- stream `index` is optional, because `show_entries` can leave it out;
- `width`, `height`, `start_pts`, and `duration_ts` also accept `"N/A"`, which FFprobe prints with `show_optional_fields: "always"`.

Other sections (chapters, frames, packets) are preserved as `unknown`. Options that change the type of a known field, such as human-readable units, can fail decoding. The `ProbeResult`, `ProjectedProbeResult`, `ProbeStream`, `ProjectedProbeStream`, and `ProbeFormat` schemas are exported for your own use.

## Decoding with your own schema

Pass a schema as the third argument to decode the output into your own type:

```ts
import { Schema } from "effect"
import { Options, probeWith } from "ffmpegu"

const Dimensions = Schema.Struct({
  streams: Schema.Array(Schema.Struct({ width: Schema.Number, height: Schema.Number }))
})

// Effect<{ readonly streams: ReadonlyArray<{ readonly width: number; readonly height: number }> }, ProbeError, FFprobe>
const dimensions = probeWith(
  "input.mp4",
  Options.create({ show_entries: "stream=width,height", select_streams: "v:0" }),
  Dimensions
)
```

The schema decodes FFprobe's whole JSON document, so none of the `ProjectedProbeResult` defaults apply: FFprobe omits sections it did not print, including `streams`, so make keys optional when a selection can leave them out. Unlisted keys are dropped. Transformations such as `Schema.NumberFromString` work as usual, and services the schema needs are added to the Effect's requirements. A failing decode is a `ProbeDecodeError`.

## What the service owns

The service always sets the input, JSON output, and stdout itself. Options that would change them (`-i`, `-of`, `-output_format`, `-print_format`, `-o`, their stream-specifier spellings, or `--`) fail with `CommandError` before anything is spawned. So do stdin and descriptor paths (`-`, `pipe:`, `fd:`, `/dev/stdin`, …), NUL bytes, and FFmpeg stream references, which have no meaning without inputs.

The input is passed as the single argument after `-i`, without a shell, so spaces, leading dashes, and shell metacharacters keep their literal meaning. Other options go to FFprobe unchanged; an invalid flag fails with `ExitError`.

## Limits and concurrency

Output is capped by `maxOutputBytes` (16 MiB by default); exceeding it fails with `ProbeOutputError` and terminates the process. Raise it in [`FFprobe.layer`](configuration.md#layer-options) when probing unusually large metadata, such as frame-level output.

Timeouts and concurrency belong to your Effect composition:

```ts
import { Effect } from "effect"
import { probe } from "ffmpegu"

const probeAll = (paths: ReadonlyArray<string>) =>
  Effect.forEach(paths, (path) => probe(path).pipe(Effect.timeout("10 seconds")), {
    concurrency: 4
  })
```

Interruption terminates FFprobe like FFmpeg: SIGTERM, then SIGKILL after `forceKillAfter`.
