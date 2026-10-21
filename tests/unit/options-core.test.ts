import { describe, expect, it } from "vitest"
import { FFmpeguArgument } from "../../src/core/argument.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { FFmpeguOptions } from "../../src/options/core.ts"

class DummyArgument extends FFmpeguArgument {
  getArgs(_refs: FFmpeguReferences): string[] {
    return ["x", "y"]
  }
}

describe("Options Core", { concurrent: false }, () => {
  const refs = new FFmpeguReferences()

  it("should resolve string args", () => {
    const options = new FFmpeguOptions(["-y", "-i", "input.mp4"])
    expect(options.getArgs(refs)).toEqual(["-y", "-i", "input.mp4"])
  })

  it("should not change when the args array passed in changes", () => {
    const args = ["-y"]
    const options = new FFmpeguOptions(args)
    args.push("-n")
    expect(options.getArgs(refs)).toEqual(["-y"])
  })

  it("should not change when tuple or record args passed in change", () => {
    const tuple: [string, number] = ["-crf", 23]
    const record: Record<string, string> = { "-preset": "fast" }
    const created = FFmpeguOptions.create(tuple, record)
    const concat = FFmpeguOptions.concat(created, "-an")
    const merged = FFmpeguOptions.merge(created, FFmpeguOptions.create("-y"))

    tuple[1] = 51
    record["-preset"] = "slow"
    record["-tune"] = "film"

    expect(created.getArgs(refs)).toEqual(["-crf", "23", "-preset", "fast"])
    expect(concat.getArgs(refs)).toEqual([
      "-crf",
      "23",
      "-preset",
      "fast",
      "-an"
    ])
    expect(merged.getArgs(refs)).toEqual([
      "-crf",
      "23",
      "-preset",
      "fast",
      "-y"
    ])
  })

  it("should resolve array args with and without values", () => {
    const options = new FFmpeguOptions([
      ["-y"],
      ["-i", "input.mp4"],
      ["-vn"],
      ["-map"]
    ])
    expect(options.getArgs(refs)).toEqual([
      "-y",
      "-i",
      "input.mp4",
      "-vn",
      "-map"
    ])
  })

  it("should resolve object args with boolean values", () => {
    const options = new FFmpeguOptions([{ "-y": true }, { "-vn": false }])
    expect(options.getArgs(refs)).toEqual(["-y"])
  })

  it("should prefix object option names without dash", () => {
    const options = new FFmpeguOptions([{ y: true }, { i: "input.mp4" }])
    expect(options.getArgs(refs)).toEqual(["-y", "-i", "input.mp4"])
  })

  it("should prefix array option names without dash", () => {
    const options = new FFmpeguOptions([["y"], ["i", "input.mp4"]])
    expect(options.getArgs(refs)).toEqual(["-y", "-i", "input.mp4"])
  })

  it("should resolve nested arguments as values", () => {
    const options = new FFmpeguOptions([{ "-map": new DummyArgument() }])
    expect(options.getArgs(refs)).toEqual(["-map", "x", "y"])
  })

  it("should merge and concat options", () => {
    const base = FFmpeguOptions.create("-y")
    const merged = FFmpeguOptions.merge(
      base,
      FFmpeguOptions.create(["-i", "a.mp4"])
    )
    const concat = FFmpeguOptions.concat(base, ["-i", "b.mp4"], "-vn")

    expect(merged.getArgs(refs)).toEqual(["-y", "-i", "a.mp4"])
    expect(concat.getArgs(refs)).toEqual(["-y", "-i", "b.mp4", "-vn"])
  })
})
