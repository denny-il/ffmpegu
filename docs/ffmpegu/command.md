# Commands

```ts
import { Command, Input, Options, Output } from "ffmpegu"

const video = Input.fromFile("video.mp4")
const audio = Input.fromFile("audio.mp3")
const command = Command.make({
  global: Options.create("-y"),
  inputs: [video, audio],
  outputs: [
    Output.toFile(
      "merged.mp4",
      Options.create(["map", video.video], ["map", audio.audio.track(0)], {
        "c:v": "copy",
        "c:a": "aac"
      })
    )
  ]
})
```

`Command.create` is an alias for `Command.make`. `withInput`, `withOutput`, and `withGlobal` return new descriptions; source and destination errors and service requirements accumulate through those operations.

Commands are pipeable, and the same operations are available as data-first or data-last functions on `Command`, so reusable steps compose like other Effect values:

```ts
const overwrite = Command.withGlobal(Options.create("-y"))

const piped = Command.make({ inputs: [video] }).pipe(
  Command.withOutput(Output.toFile("out.mp4")),
  overwrite
)
const dataFirst = Command.withInput(piped, audio)
```

`command.compile()` returns a synchronous `Result`. Compilation validates references and produces arguments plus input/output descriptor assignments. It does not acquire resources. Descriptor 3 is reserved for progress; stream inputs/outputs use descriptors starting at 4. Use the input's `video`, `audio`, `subtitle`, or `data` references, optionally `.track(index)`, for mappings. A reference to an input outside the command fails validation.

Declare every input through `inputs`; raw `-i` options would invalidate stream-reference indices and are rejected. The compiler also rejects raw pipe descriptors and overrides of the engine's `-progress` and `-stdin` options, including stream-specifier forms such as `-progress:v`. Prefer `Input.fromStream` and `Output.toSink` so descriptor ownership is explicit. Relative output paths beginning with a dash should be written with a `./` prefix.

Option validation is conservative: a standalone token spelled exactly like a reserved option is rejected even when intended as another option's value. Embedded text such as `title=-i` is allowed.

Compilation can be repeated. Each execution evaluates its streams and sinks again; a stream wrapping an already-consumed external resource is still single-use. A command that writes files is not idempotent, and failed/interrupted operations may leave partial outputs.
