# Commands

A `Command` describes one FFmpeg invocation. It renders as:

```text
ffmpeg [global options] ([input options] -i <input>)... ([output options] <output>)...
```

## Building commands

```ts
import { Command, Input, Options, Output, options } from "ffmpegu"

const video = Input.fromFile("video.mp4")
const audio = Input.fromFile("audio.mp3")

const command = Command.make({
  global: options.overwrite(),
  inputs: [video, audio],
  outputs: [
    Output.toFile(
      "merged.mp4",
      Options.create(
        { map: video.video },
        { map: audio.audio.track(0) },
        options.videoCopy(),
        options.audioCodec("aac"),
        options.shortest()
      )
    )
  ]
})
```

`Command.make` (alias `Command.create`) infers the command's error and requirement types from every input stream and output sink, so heterogeneous inputs and outputs keep their exact types.

Commands are immutable. `withGlobal`, `withInput`, and `withOutput` return a new command; `withGlobal` appends to existing global options. Each is also available as a data-first or data-last function, and commands are pipeable:

```ts
import { Command, Input, Output, options } from "ffmpegu"

const video = Input.fromFile("video.mp4")
const overwrite = Command.withGlobal(options.overwrite())

const command = Command.make({ inputs: [video] }).pipe(
  Command.withOutput(Output.toFile("out.mp4", options.copy())),
  overwrite
)
const withAudio = Command.withInput(command, Input.fromFile("audio.mp3"))
```

## Stream references

Every input exposes `video`, `audio`, `subtitle`, and `data` references. Use them wherever FFmpeg expects a stream specifier, such as `-map` or filter labels; `.track(n)` selects the nth stream of that type.

| Reference                | Renders as (for the second input) |
| ------------------------ | --------------------------------- |
| `input.video`            | `1:v`                             |
| `input.audio.track(1)`   | `1:a:1`                           |
| `filters.label(input.video)` | `[1:v]`                       |

Indices are resolved when the command compiles, so reordering `inputs` cannot leave a stale index behind. Compilation fails with a `CommandError` when a reference points at an input that is not part of the command (`ForeignReference`), or when a track index is not an integer from 0 to 2147483647 (`InvalidArgument`). Creating the reference never throws.

## Compiling and inspecting

`compile()` validates the command and returns a synchronous `Result`, without acquiring resources. `Command.toArgs` returns just the argv, which is convenient for logging, snapshots, and unit tests:

```ts
import { Result } from "effect"
import { Command, Input, Output, options } from "ffmpegu"

const input = Input.fromFile("in.mp4")
const command = Command.make({
  inputs: [input],
  outputs: [Output.toFile("out.mp4", options.map(input.video))]
})

const args = Result.getOrThrow(Command.toArgs(command))
// ["-i", "in.mp4", "-map", "0:v", "out.mp4"]
```

The compiled argv does not include the flags the runner prepends itself (`-nostdin`, plus `-progress pipe:3 -nostats` when progress is requested). `RunResult.args` contains the full argv that was executed. Stream inputs and outputs render as `pipe:<fd>`; descriptor 3 is reserved for progress and streams use descriptors from 4 upwards.

## Validation rules

Compilation rejects descriptions that would conflict with how ffmpegu drives the process. Each failure is a `CommandError` with a tagged [reason](errors.md#command-error-reasons).

- **Declare inputs through `inputs`.** A raw `-i` option would shift stream indices, so it is rejected (`ReservedOption`).
- **Leave process plumbing to the runner.** `-progress` and `-stdin`, including stream-specifier spellings such as `-progress:v`, are rejected (`ReservedOption`). Pass `onProgress` to `run` instead.
- **Use stream constructors for pipes.** Input and output paths and option values that address a descriptor, such as `pipe:1`, `fd:0`, `/dev/stdin`, or `/proc/self/fd/…`, are rejected (`ReservedPath`), as is an input or output path of `-`. Use `Input.fromStream`, `Output.toSink`, or `Output.toStream` instead.
- **Output paths cannot start with a dash.** FFmpeg would parse them as options, so they fail with `InvalidArgument`; write `./-name.mp4`.
- **One object, one position.** Passing the same input or output object twice is rejected (`DuplicateInput`, `DuplicateOutput`). Create a second `Input.fromFile` for the same file.

Option validation is deliberately conservative: a standalone token spelled exactly like a reserved option is rejected even when it was meant as another option's value. Embedded text such as `title=-i` is fine.

## Stream-output count

`Command<E, R, S>` carries, in `S`, how many `Output.toStream` outputs it has: `0`, `1`, or `2` (two or more). `run` accepts only `0` and `stream` only `1`, so using the wrong runner is a compile error. See [type parameters](errors.md#type-parameters) for the details and when the check falls back to runtime.

## Re-running

A command can be compiled and executed any number of times. Each execution evaluates its input streams and sinks afresh, so a `Stream` that reads a file is re-read; a stream that wraps an already-consumed external resource stays single-use. Outputs are neither atomic nor idempotent, and failed or interrupted runs can leave partial files. ffmpegu never retries automatically.
