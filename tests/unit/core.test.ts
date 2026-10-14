import { Result, Sink, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { FFmpeguArgument } from "../../src/core/argument.ts"
import { FFmpeguCommand } from "../../src/core/command.ts"
import { StreamType } from "../../src/core/enums.ts"
import {
  FFmpeguInput,
  FFmpeguStreamReference,
  FFmpeguStreamTrackReference
} from "../../src/core/input.ts"
import { FFmpeguOutput } from "../../src/core/output.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { FFmpeguOptions } from "../../src/index.ts"

describe("FFmpegu", { concurrent: false }, () => {
  describe("Options", () => {
    const refs = new FFmpeguReferences()

    it("should create options", () => {
      const options = new FFmpeguOptions(["-y", "-i", "input.mp4"])
      expect(options).toBeDefined()
      expect(options).toBeInstanceOf(FFmpeguArgument)
    })

    it("should create options with args", () => {
      const options = new FFmpeguOptions(["-y", ["-i", "input.mp4"]])
      expect(options.args).toHaveLength(2)
      expect(options.args[0]).toBe("-y")
      expect(options.args[1]).toEqual(["-i", "input.mp4"])
    })

    it("should resolve simple args", () => {
      const options = new FFmpeguOptions(["-y", "-i", "input.mp4"])
      const args = options.getArgs(refs)
      expect(args).toEqual(["-y", "-i", "input.mp4"])
    })

    it("should resolve array args", () => {
      const options = new FFmpeguOptions([["-y"], ["-i", "input.mp4"]])
      const args = options.getArgs(refs)
      expect(args).toEqual(["-y", "-i", "input.mp4"])
    })

    it("should resolve object args", () => {
      const options = new FFmpeguOptions([
        { "-y": true },
        { "-i": "input.mp4" }
      ])
      const args = options.getArgs(refs)
      expect(args).toEqual(["-y", "-i", "input.mp4"])
    })

    it("should resolve mixed args", () => {
      const options = new FFmpeguOptions([
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
      const input = FFmpeguInput.fromFile(source)
      expect(input.source).toBe(source)
      expect(input.options).toBeUndefined()
    })

    it("should create input from stream", () => {
      const source = Stream.make(new Uint8Array([1]))
      const input = FFmpeguInput.fromStream(source)
      expect(input.source).toBe(source)
      expect(input.options).toBeUndefined()
    })

    it("should create input with args", () => {
      const input = new FFmpeguInput(
        "",
        new FFmpeguOptions(["test", ["test", "test"]])
      )
      expect(input.options).toBeDefined()
      expect(input.options).toBeInstanceOf(FFmpeguOptions)
      expect(input.options!.args.length).toBe(2)
    })

    it("should create references", () => {
      const input = FFmpeguInput.fromFile("/test/video.mp4")
      const videoRef = input.video
      const audioRef = input.audio
      const subtitleRef = input.subtitle
      const dataRef = input.data

      const videoTrackRef = videoRef.track(0)
      const audioTrackRef = audioRef.track(1)
      const subtitleTrackRef = subtitleRef.track(2)
      const dataTrackRef = dataRef.track(3)

      expect(videoRef).toBeInstanceOf(FFmpeguStreamReference)
      expect(videoRef.input).toBe(input)
      expect(videoRef.streamType).toBe(StreamType.VIDEO)
      expect(videoTrackRef).toBeInstanceOf(FFmpeguStreamTrackReference)
      expect(videoTrackRef.input).toBe(input)
      expect(videoTrackRef.streamType).toBe(StreamType.VIDEO)
      expect(videoTrackRef.index).toBe(0)

      expect(audioRef).toBeInstanceOf(FFmpeguStreamReference)
      expect(audioRef.input).toBe(input)
      expect(audioRef.streamType).toBe(StreamType.AUDIO)
      expect(audioTrackRef).toBeInstanceOf(FFmpeguStreamTrackReference)
      expect(audioTrackRef.input).toBe(input)
      expect(audioTrackRef.streamType).toBe(StreamType.AUDIO)
      expect(audioTrackRef.index).toBe(1)

      expect(subtitleRef).toBeInstanceOf(FFmpeguStreamReference)
      expect(subtitleRef.input).toBe(input)
      expect(subtitleRef.streamType).toBe(StreamType.SUBTITLE)
      expect(subtitleTrackRef).toBeInstanceOf(FFmpeguStreamTrackReference)
      expect(subtitleTrackRef.input).toBe(input)
      expect(subtitleTrackRef.streamType).toBe(StreamType.SUBTITLE)
      expect(subtitleTrackRef.index).toBe(2)

      expect(dataRef).toBeInstanceOf(FFmpeguStreamReference)
      expect(dataRef.input).toBe(input)
      expect(dataRef.streamType).toBe(StreamType.DATA)
      expect(dataTrackRef).toBeInstanceOf(FFmpeguStreamTrackReference)
      expect(dataTrackRef.input).toBe(input)
      expect(dataTrackRef.streamType).toBe(StreamType.DATA)
      expect(dataTrackRef.index).toBe(3)
    })
  })

  describe("Output", () => {
    it("should create output from file path", () => {
      const destination = "/test/output.mp4"
      const output = FFmpeguOutput.toFile(destination)
      expect(output.destination).toBe(destination)
      expect(output.options).toBeUndefined()
    })

    it("should create output from stream", () => {
      const stream = Sink.drain
      const output = FFmpeguOutput.toSink(stream)
      expect(output.destination).toBe(stream)
      expect(output.options).toBeUndefined()
    })

    it("should create output with args", () => {
      const output = new FFmpeguOutput(
        "",
        new FFmpeguOptions(["test", ["test", "test"]])
      )
      expect(output.options).toBeDefined()
      expect(output.options).toBeInstanceOf(FFmpeguOptions)
      expect(output.options!.args.length).toBe(2)
    })
  })

  describe("Command", () => {
    const input = FFmpeguInput.fromFile("/test/input.mp4")
    const output = FFmpeguOutput.toFile("/test/output.mp4")

    it("should create a valid command with input and output", () => {
      const command = new FFmpeguCommand({
        inputs: [input],
        outputs: [output]
      })

      expect(command.inputs).toContain(input)
      expect(command.outputs).toContain(output)
      expect(command.global).toBeUndefined()
    })

    it("should create a valid command with global arguments", () => {
      const command = new FFmpeguCommand({
        inputs: [input],
        outputs: [output],
        global: new FFmpeguOptions(["test", ["test", "test"]])
      })

      expect(command.inputs).toContain(input)
      expect(command.outputs).toContain(output)
      expect(command.global).toBeInstanceOf(FFmpeguOptions)
    })

    it("should reject a command with a duplicate input on compile", () => {
      const result = new FFmpeguCommand({
        inputs: [input, input],
        outputs: [output]
      }).compile()

      expect(Result.isFailure(result) && result.failure.reason).toBe(
        "DuplicateInput"
      )
    })

    it("should reject a command with a duplicate output on compile", () => {
      const result = new FFmpeguCommand({
        inputs: [input],
        outputs: [output, output]
      }).compile()

      expect(Result.isFailure(result) && result.failure.reason).toBe(
        "DuplicateOutput"
      )
    })

    it("should allow add inputs", () => {
      const command = new FFmpeguCommand({
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
      const command = new FFmpeguCommand({
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
      const command = new FFmpeguCommand({
        inputs: [],
        outputs: []
      })
      const arg = "test"
      const newCommand = command.withGlobal(new FFmpeguOptions([arg]))

      expect(command).not.toBe(newCommand)
      expect(command.global).toBeUndefined()
      expect(newCommand.global!.args.length).toBe(1)
    })

    it("should compile command to arguments", () => {
      const command = new FFmpeguCommand({
        inputs: [input],
        outputs: [output]
      })

      const { args } = Result.getOrThrow(command.compile())

      expect(args).toEqual(["-i", input.source, output.destination])
    })
  })
})
