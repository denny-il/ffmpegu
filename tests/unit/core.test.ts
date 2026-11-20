import { Result, Sink, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { StandaloneReferences } from "../../src/core/references.ts"
import {
  Argument,
  Command,
  Input,
  Options,
  Output,
  StreamReference,
  StreamTrackReference
} from "../../src/index.ts"

describe("FFmpegu", { concurrent: false }, () => {
  describe("Options", () => {
    const refs = new StandaloneReferences()

    it("should create options", () => {
      const options = new Options.Options(["-y", "-i", "input.mp4"])
      expect(options).toBeDefined()
      expect(options).toBeInstanceOf(Argument)
    })

    it("should create options with args", () => {
      const options = new Options.Options(["-y", ["-i", "input.mp4"]])
      expect(options.args).toHaveLength(2)
      expect(options.args[0]).toBe("-y")
      expect(options.args[1]).toEqual(["-i", "input.mp4"])
    })

    it("should resolve simple args", () => {
      const options = new Options.Options(["-y", "-i", "input.mp4"])
      const args = options.getArgs(refs)
      expect(args).toEqual(["-y", "-i", "input.mp4"])
    })

    it("should resolve array args", () => {
      const options = new Options.Options([["-y"], ["-i", "input.mp4"]])
      const args = options.getArgs(refs)
      expect(args).toEqual(["-y", "-i", "input.mp4"])
    })

    it("should resolve object args", () => {
      const options = new Options.Options([
        { "-y": true },
        { "-i": "input.mp4" }
      ])
      const args = options.getArgs(refs)
      expect(args).toEqual(["-y", "-i", "input.mp4"])
    })

    it("should resolve mixed args", () => {
      const options = new Options.Options([
        "-y",
        ["-i", "input.mp4"],
        { "-c:v": "libx264" }
      ])
      const args = options.getArgs(refs)
      expect(args).toEqual(["-y", "-i", "input.mp4", "-c:v", "libx264"])
    })
  })

  describe("Input", () => {
    it("should create input from file path", () => {
      const source = "/test/video.mp4"
      const input = Input.fromFile(source)
      expect(input.source).toBe(source)
      expect(input.options).toBeUndefined()
    })

    it("should create input from stream", () => {
      const source = Stream.make(new Uint8Array([1]))
      const input = Input.fromStream(source)
      expect(input.source).toBe(source)
      expect(input.options).toBeUndefined()
    })

    it("should create input with args", () => {
      const input = new Input(
        "",
        new Options.Options(["test", ["test", "test"]])
      )
      expect(input.options).toBeDefined()
      expect(input.options).toBeInstanceOf(Options.Options)
      expect(input.options!.args.length).toBe(2)
    })

    it("should create references", () => {
      const input = Input.fromFile("/test/video.mp4")
      const videoRef = input.video
      const audioRef = input.audio
      const subtitleRef = input.subtitle
      const dataRef = input.data

      const videoTrackRef = videoRef.track(0)
      const audioTrackRef = audioRef.track(1)
      const subtitleTrackRef = subtitleRef.track(2)
      const dataTrackRef = dataRef.track(3)

      expect(videoRef).toBeInstanceOf(StreamReference)
      expect(videoRef.input).toBe(input)
      expect(videoRef.streamType).toBe("v")
      expect(videoTrackRef).toBeInstanceOf(StreamTrackReference)
      expect(videoTrackRef.input).toBe(input)
      expect(videoTrackRef.streamType).toBe("v")
      expect(videoTrackRef.index).toBe(0)

      expect(audioRef).toBeInstanceOf(StreamReference)
      expect(audioRef.input).toBe(input)
      expect(audioRef.streamType).toBe("a")
      expect(audioTrackRef).toBeInstanceOf(StreamTrackReference)
      expect(audioTrackRef.input).toBe(input)
      expect(audioTrackRef.streamType).toBe("a")
      expect(audioTrackRef.index).toBe(1)

      expect(subtitleRef).toBeInstanceOf(StreamReference)
      expect(subtitleRef.input).toBe(input)
      expect(subtitleRef.streamType).toBe("s")
      expect(subtitleTrackRef).toBeInstanceOf(StreamTrackReference)
      expect(subtitleTrackRef.input).toBe(input)
      expect(subtitleTrackRef.streamType).toBe("s")
      expect(subtitleTrackRef.index).toBe(2)

      expect(dataRef).toBeInstanceOf(StreamReference)
      expect(dataRef.input).toBe(input)
      expect(dataRef.streamType).toBe("d")
      expect(dataTrackRef).toBeInstanceOf(StreamTrackReference)
      expect(dataTrackRef.input).toBe(input)
      expect(dataTrackRef.streamType).toBe("d")
      expect(dataTrackRef.index).toBe(3)
    })
  })

  describe("Output", () => {
    it("should create output from file path", () => {
      const destination = "/test/output.mp4"
      const output = Output.toFile(destination)
      expect(output.destination).toBe(destination)
      expect(output.options).toBeUndefined()
    })

    it("should create output from stream", () => {
      const stream = Sink.drain
      const output = Output.toSink(stream)
      expect(output.destination).toBe(stream)
      expect(output.options).toBeUndefined()
    })

    it("should create output with args", () => {
      const output = new Output(
        "",
        new Options.Options(["test", ["test", "test"]])
      )
      expect(output.options).toBeDefined()
      expect(output.options).toBeInstanceOf(Options.Options)
      expect(output.options!.args.length).toBe(2)
    })
  })

  describe("Command", () => {
    const input = Input.fromFile("/test/input.mp4")
    const output = Output.toFile("/test/output.mp4")

    it("should create a valid command with input and output", () => {
      const command = new Command({
        inputs: [input],
        outputs: [output]
      })

      expect(command.inputs).toContain(input)
      expect(command.outputs).toContain(output)
      expect(command.global).toBeUndefined()
    })

    it("should create a valid command with global arguments", () => {
      const command = new Command({
        inputs: [input],
        outputs: [output],
        global: new Options.Options(["test", ["test", "test"]])
      })

      expect(command.inputs).toContain(input)
      expect(command.outputs).toContain(output)
      expect(command.global).toBeInstanceOf(Options.Options)
    })

    it("should reject a command with a duplicate input on compile", () => {
      const result = new Command({
        inputs: [input, input],
        outputs: [output]
      }).compile()

      expect(Result.isFailure(result) && result.failure.reason._tag).toBe(
        "DuplicateInput"
      )
    })

    it("should reject a command with a duplicate output on compile", () => {
      const result = new Command({
        inputs: [input],
        outputs: [output, output]
      }).compile()

      expect(Result.isFailure(result) && result.failure.reason._tag).toBe(
        "DuplicateOutput"
      )
    })

    it("should allow add inputs", () => {
      const command = new Command({
        inputs: [],
        outputs: []
      })
      const newCommand = command.withInput(input)

      expect(command).not.toBe(newCommand)
      expect(command.inputs).toEqual([])
      expect(command.outputs).toEqual([])

      expect(newCommand.inputs).toContain(input)
      expect(newCommand.outputs).toEqual([])
    })

    it("should allow add outputs", () => {
      const command = new Command({
        inputs: [],
        outputs: []
      })
      const newCommand = command.withOutput(output)

      expect(command).not.toBe(newCommand)
      expect(command.inputs).toEqual([])
      expect(command.outputs).toEqual([])

      expect(newCommand.inputs).toEqual([])
      expect(newCommand.outputs).toContain(output)
    })

    it("should allow add global arguments", () => {
      const command = new Command({
        inputs: [],
        outputs: []
      })
      const arg = "test"
      const newCommand = command.withGlobal(new Options.Options([arg]))

      expect(command).not.toBe(newCommand)
      expect(command.global).toBeUndefined()
      expect(newCommand.global!.args.length).toBe(1)
    })

    it("should compile command to arguments", () => {
      const command = new Command({
        inputs: [input],
        outputs: [output]
      })

      const { args } = Result.getOrThrow(command.compile())

      expect(args).toEqual(["-i", input.source, output.destination])
    })
  })
})
