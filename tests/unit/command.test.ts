import vm from "node:vm"
import { Duration, Effect, Result, Sink, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { FFmpeguArgument } from "../../src/core/argument.ts"
import { FFmpeguCommand } from "../../src/core/command.ts"
import { FFmpeguInput } from "../../src/core/input.ts"
import { FFmpeguOutput } from "../../src/core/output.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import type { CommandError } from "../../src/errors.ts"
import { filters, options } from "../../src/index.ts"
import { FFmpeguOptions } from "../../src/options/core.ts"

const compileError = (command: FFmpeguCommand<any, any>): CommandError => {
  const result = command.compile()
  if (Result.isSuccess(result)) {
    throw new Error(`Expected compile to fail, got ${result.success.args}`)
  }
  return result.failure
}

describe("Command", () => {
  it("should compile args in order", () => {
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const output = FFmpeguOutput.toFile("/test/output.mp4")
    const command = FFmpeguCommand.create({
      global: FFmpeguOptions.create("-y"),
      inputs: [input],
      outputs: [output]
    })

    const { args } = Result.getOrThrow(command.compile())

    expect(args).toEqual(["-y", "-i", "/test/input.mp4", "/test/output.mp4"])
  })

  it("should keep immutability for withGlobal/withInput/withOutput", () => {
    const base = FFmpeguCommand.create({ inputs: [], outputs: [] })
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const output = FFmpeguOutput.toFile("/test/output.mp4")

    const withInput = base.withInput(input)
    const withOutput = withInput.withOutput(output)
    const withGlobal = withOutput.withGlobal(FFmpeguOptions.create("-vn"))

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
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const output = FFmpeguOutput.toFile("/test/output.mp4")
    const expected = ["-y", "-vn", "-i", "/test/input.mp4", "/test/output.mp4"]
    const base = FFmpeguCommand.make({ global: FFmpeguOptions.create("-y") })

    const piped = base.pipe(
      FFmpeguCommand.withInput(input),
      FFmpeguCommand.withOutput(output),
      FFmpeguCommand.withGlobal(FFmpeguOptions.create("-vn"))
    )
    const dataFirst = FFmpeguCommand.withGlobal(
      FFmpeguCommand.withOutput(FFmpeguCommand.withInput(base, input), output),
      FFmpeguOptions.create("-vn")
    )

    expect(base.inputs).toEqual([])
    expect(Result.getOrThrow(piped.compile()).args).toEqual(expected)
    expect(Result.getOrThrow(dataFirst.compile()).args).toEqual(expected)
  })

  it("should merge global options when adding", () => {
    const command = FFmpeguCommand.create({
      global: FFmpeguOptions.create("-y"),
      inputs: [],
      outputs: []
    })

    const next = command.withGlobal(FFmpeguOptions.create("-vn"))

    expect(Result.getOrThrow(command.compile()).args).toEqual(["-y"])
    expect(Result.getOrThrow(next.compile()).args).toEqual(["-y", "-vn"])
  })

  it("should assign pipe descriptors from 4 to piped inputs then outputs in order", () => {
    const sourceA = Stream.make(new Uint8Array([1]))
    const sourceB = Stream.make(new Uint8Array([2]))
    const sinkA = Sink.drain
    const sinkB = Sink.forEach((chunk: Uint8Array) => Effect.log(chunk.length))

    const command = FFmpeguCommand.make({
      inputs: [
        FFmpeguInput.fromStream(sourceA, options.format("mp4")),
        FFmpeguInput.fromFile("/test/b.mp4"),
        FFmpeguInput.fromStream(sourceB)
      ],
      outputs: [
        FFmpeguOutput.toSink(sinkA, options.format("nut")),
        FFmpeguOutput.toStream(options.format("s16le")),
        FFmpeguOutput.toFile("/test/out.mkv"),
        FFmpeguOutput.toSink(sinkB)
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
    const video = FFmpeguInput.fromFile("/test/video.mp4")
    const audio = FFmpeguInput.fromFile("/test/audio.wav", options.startTime(2))
    const graph = filters
      .builder()
      .chain(
        filters.scale(
          { w: 320, h: 180 },
          {
            inputs: [filters.label(video.video)],
            outputs: [filters.label("v")]
          }
        )
      )
      .build()

    const command = FFmpeguCommand.make({
      global: options.merge(options.overwrite(), options.filterComplex(graph)),
      inputs: [video, audio],
      outputs: [
        FFmpeguOutput.toFile(
          "/test/out.mp4",
          options.merge(
            options.map("[v]"),
            options.map(audio.audio.track(0)),
            options.custom(["-c:a", "aac"], "-shortest")
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
    const command = FFmpeguCommand.make({
      inputs: [
        FFmpeguInput.fromFile(
          "testsrc=size=32x32:rate=1",
          options.format("lavfi")
        ),
        FFmpeguInput.fromFile("https://example.com/a.m3u8"),
        FFmpeguInput.fromFile("-starts-with-dash.mp4")
      ],
      outputs: [FFmpeguOutput.toFile("rtmp://example.com/live/key")]
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
    const command = FFmpeguCommand.make({
      inputs: [FFmpeguInput.fromStream(source)],
      outputs: [FFmpeguOutput.toSink(Sink.drain)]
    })

    const first = Result.getOrThrow(command.compile())
    const second = Result.getOrThrow(command.compile())

    expect(second).toEqual(first)
    expect(pulled).toBe(false)
  })

  it("should reject references to inputs outside the command", () => {
    const own = FFmpeguInput.fromFile("/test/own.mp4")
    const foreign = FFmpeguInput.fromFile("/test/foreign.mp4")
    const command = FFmpeguCommand.make({
      inputs: [own],
      outputs: [
        FFmpeguOutput.toFile("/test/out.mp4", options.map(foreign.video))
      ]
    })

    expect(compileError(command).reason._tag).toBe("ForeignReference")
    // Compiling again must not have registered the foreign input.
    expect(compileError(command).reason._tag).toBe("ForeignReference")
  })

  it("should reject foreign references nested in filter graphs", () => {
    const foreign = FFmpeguInput.fromFile("/test/foreign.mp4")
    const command = FFmpeguCommand.make({
      global: options.filterComplex(
        filters.graph(
          filters.chain(
            filters.hflip({}, { inputs: [filters.label(foreign.video)] })
          )
        )
      ),
      inputs: [FFmpeguInput.fromFile("/test/own.mp4")]
    })

    expect(compileError(command).reason._tag).toBe("ForeignReference")
  })

  it("should reject duplicate inputs and outputs", () => {
    const input = FFmpeguInput.fromStream(Stream.empty)
    const output = FFmpeguOutput.toSink(Sink.drain)

    expect(
      compileError(FFmpeguCommand.make({ inputs: [input, input] })).reason
    ).toMatchObject({ _tag: "DuplicateInput", index: 1, firstIndex: 0 })
    expect(
      compileError(
        FFmpeguCommand.make({
          inputs: [FFmpeguInput.fromFile("a.mp4"), input]
        }).withInput(input)
      ).reason
    ).toMatchObject({ _tag: "DuplicateInput", index: 2, firstIndex: 1 })
    expect(
      compileError(FFmpeguCommand.make({ outputs: [output, output] })).reason
    ).toMatchObject({ _tag: "DuplicateOutput", index: 1, firstIndex: 0 })
  })

  it.each([
    [
      "input path",
      FFmpeguCommand.make({ inputs: [FFmpeguInput.fromFile("pipe:4")] })
    ],
    [
      "stdin input",
      FFmpeguCommand.make({ inputs: [FFmpeguInput.fromFile("-")] })
    ],
    [
      "fd protocol",
      FFmpeguCommand.make({ inputs: [FFmpeguInput.fromFile("fd:3")] })
    ],
    [
      "nested protocol",
      FFmpeguCommand.make({ inputs: [FFmpeguInput.fromFile("async:pipe:5")] })
    ],
    [
      "stdout output",
      FFmpeguCommand.make({ outputs: [FFmpeguOutput.toFile("-")] })
    ],
    [
      "dev fd output",
      FFmpeguCommand.make({ outputs: [FFmpeguOutput.toFile("/dev/fd/3")] })
    ],
    [
      "proc fd output",
      FFmpeguCommand.make({
        outputs: [FFmpeguOutput.toFile("/proc/self/fd/4")]
      })
    ],
    [
      "option value",
      FFmpeguCommand.make({
        global: options.custom(["-attach", "pipe:3"])
      })
    ],
    [
      "raw input option",
      FFmpeguCommand.make({ global: options.custom("-f", "pipe:0") })
    ]
  ])("should reject runner-owned descriptors (%s)", (_, command) => {
    expect(compileError(command).reason._tag).toBe("ReservedPath")
  })

  it("should report where a runner-owned descriptor is used", () => {
    const input = FFmpeguInput.fromFile("in.mp4")
    const output = FFmpeguOutput.toFile("out.mp4")

    expect(
      compileError(
        FFmpeguCommand.make({
          inputs: [input, FFmpeguInput.fromFile("fd:3")]
        })
      ).reason
    ).toMatchObject({
      _tag: "ReservedPath",
      path: "fd:3",
      location: { _tag: "Input", index: 1 }
    })
    expect(
      compileError(
        FFmpeguCommand.make({
          inputs: [input],
          outputs: [
            output,
            FFmpeguOutput.toFile("b.mp4", options.custom(["-attach", "pipe:3"]))
          ]
        })
      ).reason
    ).toMatchObject({
      _tag: "ReservedPath",
      path: "pipe:3",
      location: { _tag: "Output", index: 1 }
    })
    expect(
      compileError(
        FFmpeguCommand.make({ global: options.custom("-f", "pipe:0") })
      ).reason
    ).toMatchObject({
      _tag: "ReservedPath",
      path: "pipe:0",
      location: { _tag: "Global" }
    })
  })

  it.each([
    [
      "-progress to a file",
      options.custom(["-progress", "/tmp/p.txt"]),
      "onProgress"
    ],
    [
      "-progress with a specifier",
      options.custom(["-progress:v", "/tmp/p.txt"]),
      "onProgress"
    ],
    ["-stdin", options.custom("-stdin"), "stdin"],
    [
      "raw -i",
      options.custom(["-f", "lavfi"], ["-i", "testsrc=size=32x32"]),
      "Input.fromFile"
    ],
    [
      "raw -i with a specifier",
      options.custom(["-i:v", "in.mp4"]),
      "Input.fromFile"
    ]
  ])("should reject runner-owned options (%s)", (_, global, hint) => {
    const error = compileError(FFmpeguCommand.make({ global }))
    expect(error.reason._tag).toBe("ReservedOption")
    expect(error.message).toContain(hint)
  })

  it("should reject a raw -i that would shift declared input indices", () => {
    const declared = FFmpeguInput.fromFile("declared.mp4")
    const command = FFmpeguCommand.make({
      inputs: [declared],
      outputs: [FFmpeguOutput.toFile("out.mp4", options.map(declared.video))]
    })

    for (const at of ["global", "input", "output"] as const) {
      const injected = options.custom(["-f", "lavfi"], ["-i", "testsrc"])
      const variant =
        at === "global"
          ? command.withGlobal(injected)
          : at === "input"
            ? FFmpeguCommand.make({
                inputs: [
                  FFmpeguInput.fromFile("declared.mp4", injected),
                  declared
                ],
                outputs: command.outputs
              })
            : command.withOutput(FFmpeguOutput.toFile("other.mp4", injected))
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
    const command = FFmpeguCommand.make({
      global: options.custom("-nostdin", "-nostats", "-hide_banner"),
      inputs: [FFmpeguInput.fromFile("in.mp4")],
      outputs: [
        FFmpeguOutput.toFile(
          "out.mp4",
          options.merge(
            options.metadata("title", "-i"),
            options.custom(["-map", "0:v:0"])
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
      FFmpeguCommand.make({ outputs: [FFmpeguOutput.toFile("-out.mp4")] })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.message).toContain("./-out.mp4")
  })

  it("should report failures of custom arguments as CommandError", () => {
    const boom = new Error("boom")
    class Broken extends FFmpeguArgument {
      getArgs(): string[] {
        throw boom
      }
    }
    const error = compileError(
      FFmpeguCommand.make({ global: options.custom(new Broken()) })
    )

    expect(error.reason._tag).toBe("InvalidArgument")
    expect(error.cause).toBe(boom)
  })

  it("should fail compilation, not construction, for invalid time values", () => {
    const input = FFmpeguInput.fromFile("/test/in.wav")
    const cases = [
      FFmpeguCommand.make({
        global: options.startTime(Duration.infinity),
        outputs: [FFmpeguOutput.toFile("/test/out.wav")]
      }),
      FFmpeguCommand.make({
        inputs: [input],
        outputs: [
          FFmpeguOutput.toFile(
            "/test/out.wav",
            options.duration(Temporal.Duration.from({ weeks: 1 }))
          )
        ]
      }),
      FFmpeguCommand.make({
        inputs: [input],
        outputs: [
          FFmpeguOutput.toFile(
            "/test/out.wav",
            options.audioFilter(
              filters.chain(
                filters.atrim({ end: Temporal.Duration.from({ months: 1 }) })
              )
            )
          )
        ]
      }),
      FFmpeguCommand.make({
        inputs: [input],
        outputs: [
          FFmpeguOutput.toFile(
            "/test/out.wav",
            options.audioFilter(
              filters.chain(
                filters.afade({ duration: Duration.negativeInfinity })
              )
            )
          )
        ]
      }),
      FFmpeguCommand.make({
        global: options.startTime(
          vm.runInNewContext("Temporal.Duration.from({ years: 1 })")
        ),
        outputs: [FFmpeguOutput.toFile("/test/out.wav")]
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
    const refs = new FFmpeguReferences()

    for (const [value, seconds] of [
      [Duration.micros(max), "9223372036854.775807"],
      [Duration.micros(-max), "-9223372036854.775807"]
    ] as const) {
      expect(options.startTime(value).getArgs(refs)).toEqual(["-ss", seconds])
      expect(filters.atrim({ start: value }).getArgs(refs)).toEqual([
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
        FFmpeguCommand.make({
          global: options.startTime(value),
          outputs: [FFmpeguOutput.toFile("/test/out.wav")]
        }),
        FFmpeguCommand.make({
          inputs: [FFmpeguInput.fromFile("/test/in.wav")],
          outputs: [
            FFmpeguOutput.toFile(
              "/test/out.wav",
              options.audioFilter(
                filters.chain(filters.atrim({ start: value }))
              )
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

  it("should expose compiled args through toArgs", () => {
    const command = FFmpeguCommand.make({
      inputs: [FFmpeguInput.fromFile("/test/in.mp4")],
      outputs: [FFmpeguOutput.toSink(Sink.drain)]
    })

    expect(Result.getOrThrow(FFmpeguCommand.toArgs(command))).toEqual([
      "-i",
      "/test/in.mp4",
      "pipe:4"
    ])
    expect(
      Result.isFailure(
        FFmpeguCommand.toArgs(
          FFmpeguCommand.make({ outputs: [FFmpeguOutput.toFile("-")] })
        )
      )
    ).toBe(true)
  })
})
