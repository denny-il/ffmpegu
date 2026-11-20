import { describe, expect, it } from "vitest"
import { StandaloneReferences } from "../../src/core/references.ts"
import { Argument, Options } from "../../src/index.ts"

class DummyArgument extends Argument {
  getArgs(_refs: StandaloneReferences): string[] {
    return ["x", "y"]
  }
}

describe("Options Core", { concurrent: false }, () => {
  const refs = new StandaloneReferences()

  it("should resolve string args", () => {
    const options = new Options.Options(["-y", "-i", "input.mp4"])
    expect(options.getArgs(refs)).toEqual(["-y", "-i", "input.mp4"])
  })

  it("should not change when the args array passed in changes", () => {
    const args = ["-y"]
    const options = new Options.Options(args)
    args.push("-n")
    expect(options.getArgs(refs)).toEqual(["-y"])
  })

  it("should not change when tuple or record args passed in change", () => {
    const tuple: [string, number] = ["-crf", 23]
    const record: Record<string, string> = { "-preset": "fast" }
    const created = Options.make(tuple, record)
    const nested = Options.make(created, "-an")

    tuple[1] = 51
    record["-preset"] = "slow"
    record["-tune"] = "film"

    expect(created.getArgs(refs)).toEqual(["-crf", "23", "-preset", "fast"])
    expect(nested.getArgs(refs)).toEqual([
      "-crf",
      "23",
      "-preset",
      "fast",
      "-an"
    ])
  })

  // The test above cannot tell whether a bundle copies the entries of a
  // bundle nested in it, since `make()` already copied the caller's values.
  it("should not share tuple or record entries with bundles nested in it", () => {
    const source = Options.make(["-crf", 23], { "-preset": "fast" })
    const derived = Options.make(source, "-an")

    expect(derived.args).toEqual([["-crf", 23], { "-preset": "fast" }, "-an"])
    expect(derived.args[0]).not.toBe(source.args[0])
    expect(derived.args[1]).not.toBe(source.args[1])
  })

  it("should let a nested bundle subclass render itself", () => {
    class StreamCopy extends Options.Options {
      constructor() {
        super([])
      }
      override getArgs(): string[] {
        return ["-c", "copy"]
      }
    }

    expect(Options.make(new StreamCopy(), { an: true }).getArgs(refs)).toEqual([
      "-c",
      "copy",
      "-an"
    ])
  })

  it("should resolve array args with and without values", () => {
    const options = new Options.Options([
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
    const options = new Options.Options([{ "-y": true }, { "-vn": false }])
    expect(options.getArgs(refs)).toEqual(["-y"])
  })

  it("should prefix object option names without dash", () => {
    const options = new Options.Options([{ y: true }, { i: "input.mp4" }])
    expect(options.getArgs(refs)).toEqual(["-y", "-i", "input.mp4"])
  })

  it("should prefix array option names without dash", () => {
    const options = new Options.Options([["y"], ["i", "input.mp4"]])
    expect(options.getArgs(refs)).toEqual(["-y", "-i", "input.mp4"])
  })

  it("should resolve nested arguments as values", () => {
    const options = new Options.Options([{ "-map": new DummyArgument() }])
    expect(options.getArgs(refs)).toEqual(["-map", "x", "y"])
  })

  it("should render nested bundles in order", () => {
    const base = Options.make("-y")
    const nested = Options.make(base, ["-i", "b.mp4"], Options.make("-vn"))

    expect(nested.getArgs(refs)).toEqual(["-y", "-i", "b.mp4", "-vn"])
  })

  it("should omit record entries set to undefined", () => {
    const settings: { crf?: number; preset?: string } = {
      crf: undefined,
      preset: "slow"
    }
    expect(Options.make(settings).getArgs(refs)).toEqual(["-preset", "slow"])
  })
})
