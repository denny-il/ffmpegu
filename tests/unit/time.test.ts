import { Duration, Result } from "effect"
import { describe, expect, it } from "vitest"
import { StandaloneReferences } from "../../src/core/references.ts"
import {
  Command,
  Filter,
  Input,
  Options,
  Output,
  Time
} from "../../src/index.ts"

const refs = new StandaloneReferences()

describe("time adapters", () => {
  it("should escape timestamps for both filter parsing layers", () => {
    const start = Time.timestamp(Duration.millis(61_500))
    expect(Filter.atrim({ start }).getArgs(refs)).toEqual([
      String.raw`atrim=start=00\\:01\\:01.500`
    ])

    // Next to another option and labels, inside a graph.
    const graph = Filter.graph(
      Filter.chain(
        Filter.make(
          "atrim",
          { start, duration: Time.seconds(Duration.micros(250_125n)) },
          { inputs: ["in"], outputs: ["out"] }
        )
      )
    )
    expect(graph.getArgs(refs)).toEqual([
      String.raw`[in]atrim=start=00\\:01\\:01.500:duration=0.250125[out]`
    ])
  })

  it("should render unescaped as CLI option values", () => {
    const start = Time.timestamp(Duration.millis(61_500))
    expect(Options.make(["ss", start]).getArgs(refs)).toEqual([
      "-ss",
      "00:01:01.500"
    ])
    expect(Options.startTime(start).getArgs(refs)).toEqual([
      "-ss",
      "00:01:01.500"
    ])
    expect(
      Options.duration(Time.seconds(Duration.millis(1_500))).getArgs(refs)
    ).toEqual(["-t", "1.5"])
    expect(
      Options.hls({ hls_time: Time.timestamp(Duration.seconds(4)) }).getArgs(
        refs
      )
    ).toEqual(["-f", "hls", "-hls_time", "00:00:04.000"])
    // Untyped keys get no automatic conversion, but take an adapter.
    expect(
      Options.dash({
        suggested_presentation_delay: Time.seconds(Duration.millis(2_500))
      }).getArgs(refs)
    ).toEqual(["-f", "dash", "-suggested_presentation_delay", "2.5"])
  })

  it("should truncate a time object's total to milliseconds", () => {
    // Truncating each field instead would give 1000 ms.
    const object = { seconds: 1.0005, milliseconds: 0.6 }
    expect(Options.make(["t", Time.seconds(object)]).getArgs(refs)).toEqual([
      "-t",
      "1.001"
    ])
    expect(
      Options.make(
        ["ss", Time.timestamp({ seconds: -1, milliseconds: -500 })],
        ["to", Time.seconds({ minutes: 1, seconds: 1.5 })]
      ).getArgs(refs)
    ).toEqual(["-ss", "-00:00:01.500", "-to", "61.5"])
  })

  it("should not change after the time object is mutated", () => {
    const object = { seconds: 1 }
    const value = Time.seconds(object)
    object.seconds = 2
    expect(Options.make(["t", value]).getArgs(refs)).toEqual(["-t", "1"])
  })

  it("should fail compilation, not construction, for invalid values", () => {
    const invalid = [
      Time.timestamp({ seconds: Number.NaN }),
      Time.seconds({ hours: Number.POSITIVE_INFINITY }),
      Time.seconds(Duration.infinity),
      Time.timestamp(Temporal.Duration.from({ months: 1 }))
    ]
    for (const value of invalid) {
      for (const output of [
        Output.toFile("/test/out.wav", Options.make(["t", value])),
        Output.toFile(
          "/test/out.wav",
          Options.audioFilter(Filter.chain(Filter.atrim({ start: value })))
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
