import { Duration, Result } from "effect"
import { describe, expect, it } from "vitest"
import { FFmpeguReferences } from "../../src/core/references.ts"
import {
  Command,
  Input,
  Options,
  Output,
  filters,
  options,
  time
} from "../../src/index.ts"

const refs = new FFmpeguReferences()

describe("time adapters", () => {
  it("should escape timestamps for both filter parsing layers", () => {
    const start = time.timestamp(Duration.millis(61_500))
    expect(filters.atrim({ start }).getArgs(refs)).toEqual([
      String.raw`atrim=start=00\\:01\\:01.500`
    ])

    // Next to another option and labels, inside a graph from the builder.
    const graph = filters
      .builder()
      .chain(
        filters.custom(
          "atrim",
          { start, duration: time.seconds(Duration.micros(250_125n)) },
          [filters.label("in")],
          [filters.label("out")]
        )
      )
      .build()
    expect(graph.getArgs(refs)).toEqual([
      String.raw`[in]atrim=start=00\\:01\\:01.500:duration=0.250125[out]`
    ])
  })

  it("should render unescaped as CLI option values", () => {
    const start = time.timestamp(Duration.millis(61_500))
    expect(Options.create(["ss", start]).getArgs(refs)).toEqual([
      "-ss",
      "00:01:01.500"
    ])
    expect(options.startTime(start).getArgs(refs)).toEqual([
      "-ss",
      "00:01:01.500"
    ])
    expect(
      options.duration(time.seconds(Duration.millis(1_500))).getArgs(refs)
    ).toEqual(["-t", "1.5"])
    expect(
      options
        .hls({ hls_time: time.timestamp(Duration.seconds(4)) })
        .getArgs(refs)
    ).toEqual(["-f", "hls", "-hls_time", "00:00:04.000"])
    // Untyped keys get no automatic conversion, but take an adapter.
    expect(
      options
        .dash({
          suggested_presentation_delay: time.seconds(Duration.millis(2_500))
        })
        .getArgs(refs)
    ).toEqual(["-f", "dash", "-suggested_presentation_delay", "2.5"])
  })

  it("should truncate a time object's total to milliseconds", () => {
    // Truncating each field instead would give 1000 ms.
    const object = { seconds: 1.0005, milliseconds: 0.6 }
    expect(Options.create(["t", time.seconds(object)]).getArgs(refs)).toEqual([
      "-t",
      "1.001"
    ])
    expect(
      Options.create(
        ["ss", time.timestamp({ seconds: -1, milliseconds: -500 })],
        ["to", time.seconds({ minutes: 1, seconds: 1.5 })]
      ).getArgs(refs)
    ).toEqual(["-ss", "-00:00:01.500", "-to", "61.5"])
  })

  it("should not change after the time object is mutated", () => {
    const object = { seconds: 1 }
    const value = time.seconds(object)
    object.seconds = 2
    expect(Options.create(["t", value]).getArgs(refs)).toEqual(["-t", "1"])
  })

  it("should fail compilation, not construction, for invalid values", () => {
    const invalid = [
      time.timestamp({ seconds: Number.NaN }),
      time.seconds({ hours: Number.POSITIVE_INFINITY }),
      time.seconds(Duration.infinity),
      time.timestamp(Temporal.Duration.from({ months: 1 }))
    ]
    for (const value of invalid) {
      for (const output of [
        Output.toFile("/test/out.wav", Options.create(["t", value])),
        Output.toFile(
          "/test/out.wav",
          options.audioFilter(filters.chain(filters.atrim({ start: value })))
        )
      ]) {
        const result = Command.make({
          inputs: [Input.fromFile("/test/in.wav")],
          outputs: [output]
        }).compile()
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure.reason._tag).toBe("InvalidArgument")
        }
      }
    }
  })
})
