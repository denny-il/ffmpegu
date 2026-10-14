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

Spawning, output collection, and cleanup are scoped. Spawn and nonzero exit errors are typed failures; interruption terminates the child. Probe output is size-limited so an unexpected binary cannot cause unbounded JSON accumulation. Configure `maxOutputBytes` in `FFprobe.layer` when probing unusually large metadata.

A probe can be executed repeatedly. There is no consumed-command state and no `.json` or `.result` wrapper.
