import vm from "node:vm"
import { Duration, Effect, Result, Sink, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { StandaloneReferences } from "../../src/core/references.ts"
import type { CommandError } from "../../src/errors.ts"
import {
  Argument,
  Command,
  Filter,
  Input,
  Options,
  Output
} from "../../src/index.ts"
import type { References } from "../../src/types/index.ts"

const compileError = (command: Command<any, any>): CommandError => {
  const result = command.compile()
  if (Result.isSuccess(result)) {
    throw new Error(`Expected compile to fail, got ${result.success.args}`)
  }
  return result.failure
}

describe("Command", () => {
  it("should compile args in order", () => {
    const input = Input.fromFile("/test/input.mp4")
    const output = Output.toFile("/test/output.mp4")
    const command = Command.make({
      global: Options.make("-y"),
      inputs: [input],
      outputs: [output]
    })

    const { args } = Result.getOrThrow(command.compile())

    expect(args).toEqual(["-y", "-i", "/test/input.mp4", "/test/output.mp4"])
  })

  it("should keep immutability for withGlobal/withInput/withOutput", () => {
    const base = Command.make({ inputs: [], outputs: [] })
    const input = Input.fromFile("/test/input.mp4")
    const output = Output.toFile("/test/output.mp4")

    const withInput = base.withInput(input)
    const withOutput = withInput.withOutput(output)
    const withGlobal = withOutput.withGlobal(Options.make("-vn"))

    expect(base).not.toBe(withInput)
    expect(base.inputs).toEqual([])
    expect(withInput.inputs).toEqual([input])
    expect(withInput.outputs).toEqual([])

    expect(withOutput.inputs).toEqual([input])
    expect(withOutput.outputs).toEqual([output])

    expect(withOutput.global).toBeUndefined()
    expect(Result.getOrThrow(withGlobal.compile()).args).toEqual([
      "-vn",
      "-i",
      "/test/input.mp4",
      "/test/output.mp4"
    ])
  })

  it("should pipe data-last combinators and accept data-first calls", () => {
    const input = Input.fromFile("/test/input.mp4")
    const output = Output.toFile("/test/output.mp4")
    const expected = ["-y", "-vn", "-i", "/test/input.mp4", "/test/output.mp4"]
    const base = Command.make({ global: Options.make("-y") })

    const piped = base.pipe(
      Command.withInput(input),
      Command.withOutput(output),
      Command.withGlobal(Options.make("-vn"))
    )
    const dataFirst = Command.withGlobal(
      Command.withOutput(Command.withInput(base, input), output),
      Options.make("-vn")
    )

    expect(base.inputs).toEqual([])
    expect(Result.getOrThrow(piped.compile()).args).toEqual(expected)
    expect(Result.getOrThrow(dataFirst.compile()).args).toEqual(expected)
  })

  it("should merge global options when adding", () => {
    const command = Command.make({
      global: Options.make("-y"),
      inputs: [],
      outputs: []
    })

    const next = command.withGlobal(Options.make("-vn"))

    expect(Result.getOrThrow(command.compile()).args).toEqual(["-y"])
    expect(Result.getOrThrow(next.compile()).args).toEqual(["-y", "-vn"])
  })

  it("should assign pipe descriptors from 4 to piped inputs then outputs in order", () => {
    const sourceA = Stream.make(new Uint8Array([1]))
    const sourceB = Stream.make(new Uint8Array([2]))
    const sinkA = Sink.drain
    const sinkB = Sink.forEach((chunk: Uint8Array) => Effect.log(chunk.length))

    const command = Command.make({
      inputs: [
        Input.fromStream(sourceA, Options.format("mp4")),
        Input.fromFile("/test/b.mp4"),
        Input.fromStream(sourceB)
      ],
      outputs: [
        Output.toSink(sinkA, Options.format("nut")),
        Output.toStream(Options.format("s16le")),
        Output.toFile("/test/out.mkv"),
        Output.toSink(sinkB)
      ]
    })

    const compiled = Result.getOrThrow(command.compile())

    expect(compiled.args).toEqual([
      "-f",
      "mp4",
      "-i",
      "pipe:4",
      "-i",
      "/test/b.mp4",
      "-i",
      "pipe:5",
      "-f",
      "nut",
      "pipe:6",
      "-f",
      "s16le",
      "pipe:7",
      "/test/out.mkv",
      "pipe:8"
    ])
    expect(compiled.inputStreams).toEqual([
      { fd: 4, source: sourceA },
      { fd: 5, source: sourceB }
    ])
    expect(compiled.outputStreams).toEqual([
      { fd: 6, sink: sinkA },
      { fd: 8, sink: sinkB }
    ])
    expect(compiled.streamOutputFds).toEqual([7])
  })

  it("should keep arbitrary argument ordering and resolve stream references", () => {
    const video = Input.fromFile("/test/video.mp4")
    const audio = Input.fromFile("/test/audio.wav", Options.startTime(2))
    const graph = Filter.graph(
      Filter.chain(
        Filter.scale(
          { w: 320, h: 180 },
          {
            inputs: [Filter.label(video.video)],
            outputs: [Filter.label("v")]
          }
        )
      )
    )

    const command = Command.make({
      global: Options.make(Options.overwrite(), Options.filterComplex(graph)),
      inputs: [video, audio],
      outputs: [
        Output.toFile(
          "/test/out.mp4",
          Options.make(
            Options.map("[v]"),
            Options.map(audio.audio.track(0)),
            Options.make(["-c:a", "aac"], "-shortest")
          )
        )
      ]
    })

    expect(Result.getOrThrow(command.compile()).args).toEqual([
      "-y",
      "-filter_complex",
      "[0:v]scale=w=320:h=180[v]",
      "-i",
      "/test/video.mp4",
      "-ss",
      "2",
      "-i",
      "/test/audio.wav",
      "-map",
      "[v]",
      "-map",
      "1:a:0",
      "-c:a",
      "aac",
      "-shortest",
      "/test/out.mp4"
    ])
  })

  it("should pass file paths, URLs and pseudo inputs through verbatim", () => {
    const command = Command.make({
      inputs: [
        Input.fromFile("testsrc=size=32x32:rate=1", Options.format("lavfi")),
        Input.fromFile("https://example.com/a.m3u8"),
        Input.fromFile("-starts-with-dash.mp4")
      ],
      outputs: [Output.toFile("rtmp://example.com/live/key")]
    })

    expect(Result.getOrThrow(command.compile()).args).toEqual([
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=32x32:rate=1",
      "-i",
      "https://example.com/a.m3u8",
      "-i",
      "-starts-with-dash.mp4",
      "rtmp://example.com/live/key"
    ])
  })

  it("should be deterministic and leave sources and sinks untouched", () => {
    let pulled = false
    const source = Stream.fromEffect(
      Effect.sync(() => {
        pulled = true
        return new Uint8Array([1])
      })
    )
    const command = Command.make({
      inputs: [Input.fromStream(source)],
      outputs: [Output.toSink(Sink.drain)]
    })

    const first = Result.getOrThrow(command.compile())
    const second = Result.getOrThrow(command.compile())

    expect(second).toEqual(first)
    expect(pulled).toBe(false)
  })

  it("should reject references to inputs outside the command", () => {
    const own = Input.fromFile("/test/own.mp4")
    const foreign = Input.fromFile("/test/foreign.mp4")
    const command = Command.make({
      inputs: [own],
      outputs: [Output.toFile("/test/out.mp4", Options.map(foreign.video))]
    })

    expect(compileError(command).reason._tag).toBe("ForeignReference")
    // Compiling again must not have registered the foreign input.
    expect(compileError(command).reason._tag).toBe("ForeignReference")
  })

  it("should reject foreign references nested in filter graphs", () => {
    const foreign = Input.fromFile("/test/foreign.mp4")
    const command = Command.make({
      global: Options.filterComplex(
        Filter.graph(
          Filter.chain(
            Filter.hflip({}, { inputs: [Filter.label(foreign.video)] })
          )
        )
      ),
      inputs: [Input.fromFile("/test/own.mp4")]
    })

    expect(compileError(command).reason._tag).toBe("ForeignReference")
  })

  it("should reject duplicate inputs and outputs", () => {
    const input = Input.fromStream(Stream.empty)
    const output = Output.toSink(Sink.drain)

    expect(
      compileError(Command.make({ inputs: [input, input] })).reason
    ).toMatchObject({ _tag: "DuplicateInput", index: 1, firstIndex: 0 })
    expect(
      compileError(
        Command.make({
          inputs: [Input.fromFile("a.mp4"), input]
        }).withInput(input)
      ).reason
    ).toMatchObject({ _tag: "DuplicateInput", index: 2, firstIndex: 1 })
    expect(
      compileError(Command.make({ outputs: [output, output] })).reason
    ).toMatchObject({ _tag: "DuplicateOutput", index: 1, firstIndex: 0 })
  })

  it.each([
    ["input path", Command.make({ inputs: [Input.fromFile("pipe:4")] })],
    ["stdin input", Command.make({ inputs: [Input.fromFile("-")] })],
    ["fd protocol", Command.make({ inputs: [Input.fromFile("fd:3")] })],
    [
      "nested protocol",
      Command.make({ inputs: [Input.fromFile("async:pipe:5")] })
    ],
    ["stdout output", Command.make({ outputs: [Output.toFile("-")] })],
    ["dev fd output", Command.make({ outputs: [Output.toFile("/dev/fd/3")] })],
    [
      "proc fd output",
      Command.make({
        outputs: [Output.toFile("/proc/self/fd/4")]
      })
    ],
    [
      "option value",
      Command.make({
        global: Options.make(["-attach", "pipe:3"])
      })
    ],
    ["raw input option", Command.make({ global: Options.make("-f", "pipe:0") })]
  ])("should reject runner-owned descriptors (%s)", (_, command) => {
    expect(compileError(command).reason._tag).toBe("ReservedPath")
  })

  it("should report where a runner-owned descriptor is used", () => {
    const input = Input.fromFile("in.mp4")
    const output = Output.toFile("out.mp4")

    expect(
      compileError(
        Command.make({
          inputs: [input, Input.fromFile("fd:3")]
        })
      ).reason
    ).toMatchObject({
      _tag: "ReservedPath",
      path: "fd:3",
      location: { _tag: "Input", index: 1 }
    })
    expect(
      compileError(
        Command.make({
          inputs: [input],
          outputs: [
            output,
            Output.toFile("b.mp4", Options.make(["-attach", "pipe:3"]))
          ]
        })
      ).reason
    ).toMatchObject({
      _tag: "ReservedPath",
      path: "pipe:3",
      location: { _tag: "Output", index: 1 }
    })
    expect(
      compileError(Command.make({ global: Options.make("-f", "pipe:0") }))
        .reason
    ).toMatchObject({
      _tag: "ReservedPath",
      path: "pipe:0",
      location: { _tag: "Global" }
    })
  })

  it.each([
    [
      "-progress to a file",
      Options.make(["-progress", "/tmp/p.txt"]),
      "onProgress"
    ],
    [
      "-progress with a specifier",
      Options.make(["-progress:v", "/tmp/p.txt"]),
      "onProgress"
    ],
    ["-stdin", Options.make("-stdin"), "stdin"],
    [
      "raw -i",
      Options.make(["-f", "lavfi"], ["-i", "testsrc=size=32x32"]),
      "Input.fromFile"
    ],
    [
      "raw -i with a specifier",
      Options.make(["-i:v", "in.mp4"]),
      "Input.fromFile"
    ]
  ])("should reject runner-owned options (%s)", (_, global, hint) => {
    const error = compileError(Command.make({ global }))
    expect(error.reason._tag).toBe("ReservedOption")
    expect(error.message).toContain(hint)
  })

  it("should reject a raw -i that would shift declared input indices", () => {
    const declared = Input.fromFile("declared.mp4")
    const command = Command.make({
      inputs: [declared],
      outputs: [Output.toFile("out.mp4", Options.map(declared.video))]
    })

    for (const at of ["global", "input", "output"] as const) {
      const injected = Options.make(["-f", "lavfi"], ["-i", "testsrc"])
      const variant =
        at === "global"
          ? command.withGlobal(injected)
          : at === "input"
            ? Command.make({
                inputs: [Input.fromFile("declared.mp4", injected), declared],
                outputs: command.outputs
              })
            : command.withOutput(Output.toFile("other.mp4", injected))
      expect(compileError(variant).reason).toMatchObject({
        _tag: "ReservedOption",
        option: "-i",
        location:
          at === "global"
            ? { _tag: "Global" }
            : at === "input"
              ? { _tag: "Input", index: 0 }
              : { _tag: "Output", index: 1 }
      })
    }
  })

  it("should allow option values and benign flags that look similar", () => {
    const command = Command.make({
      global: Options.make("-nostdin", "-nostats", "-hide_banner"),
      inputs: [Input.fromFile("in.mp4")],
      outputs: [
        Output.toFile(
          "out.mp4",
          Options.make(
            Options.metadata("title", "-i"),
            Options.make(["-map", "0:v:0"])
          )
        )
      ]
    })

    expect(Result.getOrThrow(command.compile()).args).toEqual([
      "-nostdin",
      "-nostats",
      "-hide_banner",
      "-i",
      "in.mp4",
      "-metadata",
      "title=-i",
      "-map",
      "0:v:0",
      "out.mp4"
    ])
  })

  it("should reject output paths that would parse as options", () => {
    const error = compileError(
      Command.make({ outputs: [Output.toFile("-out.mp4")] })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.message).toContain("./-out.mp4")
  })

  it("should report failures of custom arguments as CommandError", () => {
    const boom = new Error("boom")
    class Broken extends Argument {
      getArgs(): string[] {
        throw boom
      }
    }
    const error = compileError(
      Command.make({ global: Options.make({ map: new Broken() }) })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.message).toBe("Failed to render command arguments")
    expect(error.cause).toBe(boom)
  })

  it("should fail compilation, not construction, for invalid time values", () => {
    const input = Input.fromFile("/test/in.wav")
    const cases = [
      Command.make({
        global: Options.startTime(Duration.infinity),
        outputs: [Output.toFile("/test/out.wav")]
      }),
      Command.make({
        inputs: [input],
        outputs: [
          Output.toFile(
            "/test/out.wav",
            Options.duration(Temporal.Duration.from({ weeks: 1 }))
          )
        ]
      }),
      Command.make({
        inputs: [input],
        outputs: [
          Output.toFile(
            "/test/out.wav",
            Options.audioFilter(
              Filter.chain(
                Filter.atrim({ end: Temporal.Duration.from({ months: 1 }) })
              )
            )
          )
        ]
      }),
      Command.make({
        inputs: [input],
        outputs: [
          Output.toFile(
            "/test/out.wav",
            Options.audioFilter(
              Filter.chain(
                Filter.afade({ duration: Duration.negativeInfinity })
              )
            )
          )
        ]
      }),
      Command.make({
        global: Options.startTime(
          vm.runInNewContext("Temporal.Duration.from({ years: 1 })")
        ),
        outputs: [Output.toFile("/test/out.wav")]
      })
    ]

    for (const command of cases) {
      const error = compileError(command)
      expect(error.reason._tag).toBe("InvalidArgument")
      expect(error.cause).toBeInstanceOf(RangeError)
    }
  })

  it("should fail compilation for time values outside FFmpeg's range", () => {
    // FFmpeg parses the magnitude into an int64 before negating, so -2^63 µs
    // is rejected along with 2^63 µs.
    const max = 9_223_372_036_854_775_807n
    const refs = new StandaloneReferences()

    for (const [value, seconds] of [
      [Duration.micros(max), "9223372036854.775807"],
      [Duration.micros(-max), "-9223372036854.775807"]
    ] as const) {
      expect(Options.startTime(value).getArgs(refs)).toEqual(["-ss", seconds])
      expect(Filter.atrim({ start: value }).getArgs(refs)).toEqual([
        `atrim=start=${seconds}`
      ])
    }

    for (const value of [
      Duration.micros(max + 1n),
      Duration.micros(-max - 1n),
      Temporal.Duration.from({ seconds: 9_223_372_036_855 }),
      Temporal.Duration.from({ seconds: -9_223_372_036_855 })
    ]) {
      for (const command of [
        Command.make({
          global: Options.startTime(value),
          outputs: [Output.toFile("/test/out.wav")]
        }),
        Command.make({
          inputs: [Input.fromFile("/test/in.wav")],
          outputs: [
            Output.toFile(
              "/test/out.wav",
              Options.audioFilter(Filter.chain(Filter.atrim({ start: value })))
            )
          ]
        })
      ]) {
        const error = compileError(command)
        expect(error.reason._tag).toBe("InvalidArgument")
        expect(error.cause).toBeInstanceOf(RangeError)
      }
    }
  })

  it("should report custom failures with a throwing message as CommandError", () => {
    const boom = new Error()
    Object.defineProperty(boom, "message", {
      get() {
        throw new Error("unreadable")
      }
    })
    class Broken extends Argument {
      getArgs(): string[] {
        throw boom
      }
    }
    const error = compileError(
      Command.make({ global: Options.make({ map: new Broken() }) })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.cause).toBe(boom)
  })

  it("should report a tampered track index error as CommandError", () => {
    const input = Input.fromFile("in.mp4")
    let tampered: unknown
    class Wrapper extends Argument {
      getArgs(refs: References): string[] {
        try {
          return input.video.track(-1).getArgs(refs)
        } catch (error) {
          Object.defineProperty(error, "message", {
            get() {
              throw new Error("unreadable")
            }
          })
          tampered = error
          throw error
        }
      }
    }
    const error = compileError(
      Command.make({
        inputs: [input],
        outputs: [
          Output.toFile("out.mp4", Options.make({ map: new Wrapper() }))
        ]
      })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.message).toBe(
      "Failed to render command arguments: Stream index must be an integer from 0 to 2147483647, got: -1"
    )
    expect(error.cause).toBe(tampered)
  })

  it("should not copy an annotated track index error message into CommandError", () => {
    const input = Input.fromFile("https://user:secret@example.com/input.mp4")
    let annotated: unknown
    class Contextual extends Argument {
      getArgs(refs: References): string[] {
        try {
          return input.video.track(-1).getArgs(refs)
        } catch (error) {
          ;(error as Error).message += ` while reading ${input.source}`
          annotated = error
          throw error
        }
      }
    }
    const error = compileError(
      Command.make({
        inputs: [input],
        global: Options.make({ map: new Contextual() })
      })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.message).not.toContain("secret")
    expect(error.message).toContain("got: -1")
    expect(error.cause).toBe(annotated)
  })

  it("should not render a non-numeric track index into CommandError", () => {
    const input = Input.fromFile("in.mp4")
    const error = compileError(
      Command.make({
        inputs: [input],
        outputs: [
          Output.toFile(
            "out.mp4",
            Options.map(input.video.track("secret" as unknown as number))
          )
        ]
      })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.message).not.toContain("secret")
    expect(error.message).toContain("got: string")
  })

  it("should not copy caller text passed to a recovered track index error constructor", () => {
    const input = Input.fromFile("https://user:secret@example.com/input.mp4")
    class Rewrapping extends Argument {
      getArgs(refs: References): string[] {
        try {
          return input.video.track(-1).getArgs(refs)
        } catch (error) {
          const Recovered = (error as Error).constructor as new (
            ...args: Array<unknown>
          ) => Error
          throw new Recovered(
            `${(error as Error).message} while reading ${input.source}`
          )
        }
      }
    }
    const error = compileError(
      Command.make({
        inputs: [input],
        global: Options.make({ map: new Rewrapping() })
      })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.message).not.toContain("secret")
  })

  it("should validate and render the same track index when it is read repeatedly", () => {
    const input = Input.fromFile("in.mp4")
    const reads = [1.5, 1.5, "https://user:secret@example.com/input.mp4"]
    const track = input.video.track(0)
    Object.defineProperty(track, "index", { get: () => reads.shift() })
    const error = compileError(
      Command.make({
        inputs: [input],
        outputs: [Output.toFile("out.mp4", Options.map(track))]
      })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.message).not.toContain("secret")
    expect(error.message).toContain("got: 1.5")
  })

  it("should render the track index it validated when it is read repeatedly", () => {
    const input = Input.fromFile("in.mp4")
    const reads = [0, -1]
    const track = input.video.track(0)
    Object.defineProperty(track, "index", { get: () => reads.shift() })
    const args = Result.getOrThrow(
      Command.make({
        inputs: [input],
        outputs: [Output.toFile("out.mp4", Options.map(track))]
      }).toArgs()
    )

    expect(args).toContain("0:v:0")
    expect(reads).toEqual([-1])
  })

  it.each([-1, 1.5, 2147483648, 4294967296, 1e21])(
    "should reject an invalid track index (%s) as CommandError",
    (index) => {
      const input = Input.fromFile("in.mp4")
      const error = compileError(
        Command.make({
          inputs: [input],
          outputs: [
            Output.toFile("out.mp4", Options.map(input.video.track(index)))
          ]
        })
      )

      expect(error.reason._tag).toBe("InvalidArgument")
      expect(error.cause).toBeInstanceOf(RangeError)
      expect(error.message).toContain(`got: ${index}`)
    }
  )

  it("should expose compiled args through toArgs", () => {
    const command = Command.make({
      inputs: [Input.fromFile("/test/in.mp4")],
      outputs: [Output.toSink(Sink.drain)]
    })

    expect(Result.getOrThrow(command.toArgs())).toEqual([
      "-i",
      "/test/in.mp4",
      "pipe:4"
    ])
    expect(
      Result.isFailure(Command.make({ outputs: [Output.toFile("-")] }).toArgs())
    ).toBe(true)
  })

  it("should accept option forms directly for global, input and output options", () => {
    const input = Input.fromFile("/test/in.mp4", { ss: 5 }, ["t", 10])
    const command = Command.make({
      global: { y: true },
      inputs: [input],
      outputs: [
        Output.toFile(
          "/test/out.mp4",
          { map: input.video },
          Options.crf(23),
          "-an"
        )
      ]
    }).withGlobal(["loglevel", "error"])

    expect(Result.getOrThrow(command.toArgs())).toEqual([
      "-y",
      "-loglevel",
      "error",
      "-ss",
      "5",
      "-t",
      "10",
      "-i",
      "/test/in.mp4",
      "-map",
      "0:v",
      "-crf",
      "23",
      "-an",
      "/test/out.mp4"
    ])
  })

  it("should accept option forms directly for piped inputs and outputs", () => {
    const command = Command.make({
      inputs: [Input.fromStream(Stream.empty, { f: "s16le" })],
      outputs: [
        Output.toSink(Sink.drain, { f: "wav" }),
        Output.toStream(["f", "ogg"])
      ]
    })

    expect(Result.getOrThrow(command.toArgs())).toEqual([
      "-f",
      "s16le",
      "-i",
      "pipe:4",
      "-f",
      "wav",
      "pipe:5",
      "-f",
      "ogg",
      "pipe:6"
    ])
  })

  it("should skip an absent bundle among input and output options", () => {
    const seek: Options.Options | undefined = undefined
    const input = Input.fromFile("/test/in.mp4", seek)
    const command = Command.make({
      inputs: [input],
      outputs: [Output.toFile("/test/out.mp4", seek, Options.crf(23))]
    })

    expect(input.options).toBeUndefined()
    expect(Result.getOrThrow(command.toArgs())).toEqual([
      "-i",
      "/test/in.mp4",
      "-crf",
      "23",
      "/test/out.mp4"
    ])
  })

  it("should compile a command made without arguments to no arguments", () => {
    expect(Result.getOrThrow(Command.make().toArgs())).toEqual([])
  })
})
