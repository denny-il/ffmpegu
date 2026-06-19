import { execFile } from "node:child_process"
import { access, mkdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type {
  FFmpeguFFprobeJson,
  FFmpeguFFprobeStream
} from "../../src/index.ts"
import { ffmpegu } from "../../src/index.ts"

const execFileAsync = promisify(execFile)

describe.sequential("Options and Filters Real Paths", {
  timeout: 120_000
}, () => {
  const runner = ffmpegu.createFFmpegRunner("ffmpeg")
  const probeRunner = ffmpegu.createFFprobeRunner("ffprobe")
  const testOutputDir = "./tests/__output-options-filters"
  const outputPath = (...parts: string[]) => join(testOutputDir, ...parts)

  beforeAll(async () => {
    await rm(testOutputDir, { recursive: true, force: true })
    await mkdir(testOutputDir, { recursive: true })
  })

  afterAll(async () => {
    await rm(testOutputDir, { recursive: true, force: true })
  })

  const expectOutputFile = async (filePath: string) => {
    await expect(access(filePath)).resolves.not.toThrow()

    const file = await stat(filePath)
    expect(file.isFile()).toBe(true)
    expect(file.size).toBeGreaterThan(0)

    return file
  }

  const probeOutput = async (filePath: string) => {
    await expectOutputFile(filePath)

    const result = await probeRunner.run(ffmpegu.probe.fromFile(filePath))
    expect(result.code).toBe(0)
    expect(result.result).toBeDefined()

    return result.result as FFmpeguFFprobeJson
  }

  const getStreams = (media: FFmpeguFFprobeJson, codecType: string) =>
    (media.streams ?? []).filter(
      (stream): stream is FFmpeguFFprobeStream =>
        stream.codec_type === codecType
    )

  const expectVideoStream = (
    media: FFmpeguFFprobeJson,
    options: {
      width: number
      height: number
      codecName?: string
    }
  ) => {
    const videoStreams = getStreams(media, "video")

    expect(videoStreams).toHaveLength(1)
    expect(videoStreams[0]).toMatchObject({
      width: options.width,
      height: options.height,
      codec_name: options.codecName ?? expect.any(String)
    })
  }

  const expectAudioStream = (
    media: FFmpeguFFprobeJson,
    options: {
      codecName?: string
      channels?: number
    } = {}
  ) => {
    const audioStreams = getStreams(media, "audio")

    expect(audioStreams).toHaveLength(1)

    if (typeof options.codecName !== "undefined") {
      expect(audioStreams[0]?.codec_name).toBe(options.codecName)
    }

    if (typeof options.channels !== "undefined") {
      expect(audioStreams[0]?.channels).toBe(options.channels)
    }
  }

  const expectNoAudioStream = (media: FFmpeguFFprobeJson) => {
    expect(getStreams(media, "audio")).toHaveLength(0)
  }

  const expectDurationBetween = (
    media: FFmpeguFFprobeJson,
    minSeconds: number,
    maxSeconds: number
  ) => {
    const duration = Number(media.format?.duration ?? 0)
    expect(duration).toBeGreaterThan(minSeconds)
    expect(duration).toBeLessThan(maxSeconds)
  }

  const hasFFmpegFilter = async (name: string) => {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-filters"
    ])
    return new RegExp(`\\b${name}\\b`).test(stdout)
  }

  it("should apply time object start and duration options", async () => {
    const outputFile = outputPath("output-trimmed.mp4")
    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [
        ffmpegu.input.fromFile(
          "./assets/video.mp4",
          ffmpegu.options.startTime({ seconds: 1 })
        )
      ],
      outputs: [
        ffmpegu.output.toFile(
          outputFile,
          ffmpegu.options.concat(
            ffmpegu.options.duration({ seconds: 2 }),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("veryfast"),
            ffmpegu.options.crf(29),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputFile)
    expectVideoStream(media, { width: 640, height: 360, codecName: "h264" })
    expectNoAudioStream(media)
    expectDurationBetween(media, 1.8, 2.3)
  })

  it("should write format metadata that ffprobe can read", async () => {
    const title = "ffmpegu metadata title"
    const outputFile = outputPath("output-metadata.mp4")
    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputFile,
          ffmpegu.options.concat(
            ffmpegu.options.duration(1),
            ffmpegu.options.metadata("title", title),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("veryfast"),
            ffmpegu.options.crf(29),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputFile)
    expect(media.format?.tags?.title).toBe(title)
  })

  it("should run a command with escaped drawtext values when supported", async () => {
    if (!(await hasFFmpegFilter("drawtext"))) return

    const outputFile = outputPath("output-filter-drawtext.mp4")
    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputFile,
          ffmpegu.options.concat(
            ffmpegu.options.duration(1),
            ffmpegu.options.videoFilter(
              ffmpegu.filters.drawtext({
                text: String.raw`a,b;[c]\\'d:ok`,
                x: 10,
                y: 10,
                fontsize: 24,
                fontcolor: "white"
              })
            ),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("veryfast"),
            ffmpegu.options.crf(29),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputFile)
    expectVideoStream(media, { width: 640, height: 360, codecName: "h264" })
    expectNoAudioStream(media)
  })

  it("should run a command with audio filter helpers", async () => {
    const outputFile = outputPath("output-audio-filter.wav")
    const filterChain = ffmpegu.filters.chain(
      ffmpegu.filters.atrim({
        duration: { seconds: 1, milliseconds: 500 }
      }),
      ffmpegu.filters.volume({ volume: 0.5 })
    )
    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/audio.mp3")],
      outputs: [
        ffmpegu.output.toFile(
          outputFile,
          ffmpegu.options.concat(
            ffmpegu.options.audioFilter(filterChain),
            ffmpegu.options.audioCodec("pcm_s16le")
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputFile)
    expectAudioStream(media, { codecName: "pcm_s16le", channels: 2 })
    expectDurationBetween(media, 1.4, 1.7)
  })
})
