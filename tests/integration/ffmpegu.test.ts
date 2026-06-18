import { createReadStream, createWriteStream } from "node:fs"
import { access, mkdir, readdir, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { PassThrough, Writable } from "node:stream"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type {
  FFmpeguFFprobeJson,
  FFmpeguFFprobeStream
} from "../../src/index.ts"
import { ffmpegu } from "../../src/index.ts"

describe.sequential("Integration", { timeout: 120_000 }, () => {
  const runner = ffmpegu.createFFmpegRunner("ffmpeg")
  const probeRunner = ffmpegu.createFFprobeRunner("ffprobe")
  const testOutputDir = "./tests/__output"

  const outputPath = (...parts: string[]) => join(testOutputDir, ...parts)

  const waitForEvent = (
    emitter: { once: (event: string, listener: () => void) => unknown },
    event: string
  ) =>
    new Promise<void>((resolve) => {
      emitter.once(event, () => resolve())
    })

  const createWritableSink = () => {
    const sink = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      }
    })

    sink.on("error", () => {})

    return sink
  }

  const createFailingWritable = (error: Error, failAfterWrites = 1) => {
    let writes = 0

    const sink = new Writable({
      write(_chunk, _encoding, callback) {
        writes += 1

        if (writes >= failAfterWrites) {
          callback(error)
          return
        }

        callback()
      }
    })

    sink.on("error", () => {})

    return sink
  }

  beforeAll(async () => {
    await rm(testOutputDir, { recursive: true, force: true })
    await mkdir(testOutputDir, { recursive: true })

    await expect(access(testOutputDir)).resolves.not.toThrow()

    const outputDir = await stat(testOutputDir)
    expect(outputDir.isDirectory()).toBe(true)
  })

  afterAll(async () => {
    await rm(testOutputDir, { recursive: true, force: true })
    await expect(access(testOutputDir)).rejects.toThrow()
  })

  const expectOutputFile = async (filePath: string) => {
    await expect(access(filePath)).resolves.not.toThrow()

    const file = await stat(filePath)
    expect(file.isFile()).toBe(true)
    expect(file.size).toBeGreaterThan(0)

    return file
  }

  const expectNoUsableOutputFile = async (filePath: string) => {
    const exists = await access(filePath).then(
      () => true,
      () => false
    )

    if (!exists) return

    const file = await stat(filePath)
    expect(file.isFile()).toBe(true)
    expect(file.size).toBe(0)
  }

  const probeOutput = async (filePath: string) => {
    await expectOutputFile(filePath)

    const result = await probeRunner.run(ffmpegu.probe.fromFile(filePath))
    expect(result.code).toBe(0)
    expect(result.result).toBeDefined()
    expect(result.result).toMatchObject({
      format: expect.any(Object),
      streams: expect.any(Array)
    })

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

  const expectDurationAtLeast = (
    media: FFmpeguFFprobeJson,
    seconds: number
  ) => {
    expect(Number(media.format?.duration ?? 0)).toBeGreaterThan(seconds)
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

  const expectFormatNameToContain = (
    media: FFmpeguFFprobeJson,
    expectedFormat: string
  ) => {
    expect(media.format?.format_name).toContain(expectedFormat)
  }

  it("should run validate a binary", async () => {
    await expect(runner.validateBinary()).resolves.not.toThrow()
  })

  it("should validate ffprobe binary", async () => {
    await expect(probeRunner.validateBinary()).resolves.not.toThrow()
  })

  it("should not run validate a binary", async () => {
    const runner = ffmpegu.createFFmpegRunner("unknown-binary")
    await expect(runner.validateBinary()).rejects.toThrow()
  })

  it("should run a simple ffmpeg command", async () => {
    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputPath("output.mp4"),
          ffmpegu.options.concat(
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.audioCodec("aac"),
            ffmpegu.options.audioBitrate("192k")
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputPath("output.mp4"))
    expectFormatNameToContain(media, "mp4")
    expectVideoStream(media, { width: 640, height: 360, codecName: "h264" })
    expectNoAudioStream(media)
    expectDurationAtLeast(media, 20)
  })

  it("should emit structured progress updates", async () => {
    const updates: Array<{ progress: string; frame?: number }> = []

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputPath("output-progress.mp4"),
          ffmpegu.options.concat(
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.audioCodec("aac"),
            ffmpegu.options.audioBitrate("192k")
          )
        )
      ]
    })

    const result = await runner.run(command, {
      onProgress: (progress) => {
        updates.push({ progress: progress.progress, frame: progress.frame })
      }
    })

    expect(result.code).toBe(0)
    expect(updates.length).toBeGreaterThan(0)
    expect(updates.at(-1)).toMatchObject({ progress: "end" })
    expect(updates.some((update) => (update.frame ?? 0) > 0)).toBe(true)

    const media = await probeOutput(outputPath("output-progress.mp4"))
    expectVideoStream(media, { width: 640, height: 360 })
    expectNoAudioStream(media)
  })

  it("should abort a running command via signal", async () => {
    const controller = new AbortController()
    const updates: Array<{ progress: string; frame?: number }> = []

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [
        ffmpegu.input.fromFile(
          "./assets/video.mp4",
          ffmpegu.options.custom(["-stream_loop", "-1"])
        )
      ],
      outputs: [
        ffmpegu.output.toFile(
          "/dev/null",
          ffmpegu.options.concat(
            ffmpegu.options.format("null"),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = runner.run(command, {
      signal: controller.signal,
      onProgress: (progress) => {
        updates.push({ progress: progress.progress, frame: progress.frame })

        if (updates.length === 1) {
          controller.abort()
        }
      }
    })

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(updates.length).toBeGreaterThan(0)
    expect(updates.some((update) => (update.frame ?? 0) > 0)).toBe(true)
    expect(controller.signal.aborted).toBe(true)
  })

  it("should reject when a stream input errors mid-run", async () => {
    const inputError = new Error("input stream failed")
    const inputStream = new PassThrough()
    inputStream.on("error", () => {})
    const inputClosed = waitForEvent(inputStream, "close")

    const outputStream = createWritableSink()
    const outputClosed = waitForEvent(outputStream, "close")
    const outputDestroySpy = vi.spyOn(outputStream, "destroy")

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [
        ffmpegu.input.fromStream(
          inputStream,
          ffmpegu.options.concat(
            ffmpegu.options.custom(["-re"]),
            ffmpegu.options.format("mp4")
          )
        )
      ],
      outputs: [
        ffmpegu.output.toStream(
          outputStream,
          ffmpegu.options.concat(
            ffmpegu.options.format("mpegts"),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = runner.run(command)

    const video = await readFile("./assets/video.mp4")
    inputStream.write(video)
    setTimeout(() => {
      inputStream.destroy(inputError)
    }, 100)

    await expect(result).rejects.toBe(inputError)
    await inputClosed
    await outputClosed
    expect(outputDestroySpy).toHaveBeenCalledWith(inputError)
  })

  it("should reject when a stream output errors mid-run", async () => {
    const outputError = new Error("output stream failed")
    const outputStream = createFailingWritable(outputError, 1)
    const outputClosed = waitForEvent(outputStream, "close")
    const outputDestroySpy = vi.spyOn(outputStream, "destroy")

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toStream(
          outputStream,
          ffmpegu.options.concat(
            ffmpegu.options.format("mpegts"),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    outputStream.once("pipe", () => {
      outputStream.destroy(outputError)
    })

    await expect(runner.run(command)).rejects.toBe(outputError)
    await outputClosed
    expect(outputDestroySpy).toHaveBeenCalled()
  })

  it("should fail clearly for an invalid input stream", async () => {
    const outputFile = outputPath("output-empty-input.mp4")
    await rm(outputFile, { force: true })

    const inputStream = new PassThrough()

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [
        ffmpegu.input.fromStream(inputStream, ffmpegu.options.format("mp4"))
      ],
      outputs: [ffmpegu.output.toFile(outputFile)]
    })

    const run = runner.run(command)
    setTimeout(() => {
      inputStream.end(Buffer.alloc(1))
    }, 100)
    const result = await run

    expect(result.code).not.toBe(0)
    expect(result.stderr).toMatch(
      /invalid data|moov atom not found|error reading header|could not find/i
    )
    await expectNoUsableOutputFile(outputFile)
  })

  it("should fail clearly when stream input omits a required format", async () => {
    const outputFile = outputPath("output-missing-input-format.wav")
    await rm(outputFile, { force: true })

    const rawPcmInput = new PassThrough()

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromStream(rawPcmInput)],
      outputs: [
        ffmpegu.output.toFile(
          outputFile,
          ffmpegu.options.concat(
            ffmpegu.options.format("wav"),
            ffmpegu.options.audioCodec("pcm_s16le")
          )
        )
      ]
    })

    const resultPromise = runner.run(command)
    rawPcmInput.end(Buffer.alloc(44_100 * 2))
    const result = await resultPromise

    expect(result.code).not.toBe(0)
    expect(result.stderr).toMatch(/invalid data|input|pipe/i)
    await expectNoUsableOutputFile(outputFile)
  })

  it("should fail clearly when stream output omits a required format", async () => {
    const outputStream = createWritableSink()
    const outputDestroySpy = vi.spyOn(outputStream, "destroy")

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [ffmpegu.output.toStream(outputStream)]
    })

    const result = await runner.run(command)

    expect(result.code).not.toBe(0)
    expect(result.stderr).toMatch(
      /output format|invalid argument|unable to (find|choose)/i
    )
    expect(outputDestroySpy).toHaveBeenCalled()
  })

  it("should run a command with input and output map", async () => {
    const input1 = ffmpegu.input.fromFile("./assets/video.mp4")
    const input2 = ffmpegu.input.fromFile("./assets/audio.mp3")
    const output1 = ffmpegu.output.toFile(
      outputPath("output-map1.mp4"),
      ffmpegu.options.concat(
        ffmpegu.options.map(input1.video),
        ffmpegu.options.map(input2.audio.track(0)),
        ffmpegu.options.videoCodec("libx264"),
        ffmpegu.options.preset("fast"),
        ffmpegu.options.crf(23)
      )
    )
    const output2 = ffmpegu.output.toFile(
      outputPath("output-map2.mp4"),
      ffmpegu.options.concat(
        ffmpegu.options.map(input1.video.track(0)),
        ffmpegu.options.map(input2.audio.track(0)),
        ffmpegu.options.videoCodec("libx264"),
        ffmpegu.options.videoFilter("scale=640:360"),
        ffmpegu.options.preset("veryfast"),
        ffmpegu.options.crf(29)
      )
    )

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [input1, input2],
      outputs: [output1, output2]
    })

    const result = await runner.run(command)
    expect(result.code).toBe(0)

    const media1 = await probeOutput(outputPath("output-map1.mp4"))
    expectFormatNameToContain(media1, "mp4")
    expectVideoStream(media1, { width: 640, height: 360, codecName: "h264" })
    expectAudioStream(media1, { codecName: "aac", channels: 2 })
    expectDurationAtLeast(media1, 100)

    const media2 = await probeOutput(outputPath("output-map2.mp4"))
    expectFormatNameToContain(media2, "mp4")
    expectVideoStream(media2, { width: 640, height: 360, codecName: "h264" })
    expectAudioStream(media2, { codecName: "aac", channels: 2 })
    expectDurationAtLeast(media2, 100)
  })

  it("should run a command with input and output streams", async () => {
    const inputStreamCloseSpy = vi.fn()
    const inputStream = createReadStream("./assets/video.mp4")
    inputStream.on("close", inputStreamCloseSpy)
    const inputStreamClosed = new Promise<void>((resolve) => {
      inputStream.on("close", () => resolve())
    })
    const input = ffmpegu.input.fromStream(
      inputStream,
      ffmpegu.options.format("mp4")
    )

    const outputStream1CloseSpy = vi.fn()
    const outputStream1 = createWriteStream(outputPath("output-stream1.mp4"))
    outputStream1.on("close", outputStream1CloseSpy)
    const outputStream1Closed = new Promise<void>((resolve) => {
      outputStream1.on("close", () => resolve())
    })
    const output1 = ffmpegu.output.toStream(
      outputStream1,
      ffmpegu.options.concat(
        ffmpegu.options.map(input.video),
        ffmpegu.options.format("mp4"),
        ffmpegu.options.movFlags("frag_keyframe+empty_moov"),
        ffmpegu.options.copy()
      )
    )

    const outputStream2CloseSpy = vi.fn()
    const outputStream2 = createWriteStream(outputPath("output-stream2.mp4"))
    outputStream2.on("close", outputStream2CloseSpy)
    const outputStream2Closed = new Promise<void>((resolve) => {
      outputStream2.on("close", () => resolve())
    })
    const output2 = ffmpegu.output.toStream(
      outputStream2,
      ffmpegu.options.concat(
        ffmpegu.options.map(input.video),
        ffmpegu.options.format("mp4"),
        ffmpegu.options.movFlags("frag_keyframe+empty_moov"),
        ffmpegu.options.copy()
      )
    )

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [input],
      outputs: [output1, output2]
    })

    const result = await runner.run(command)
    expect(result.code).toBe(0)

    await Promise.all([
      inputStreamClosed,
      outputStream1Closed,
      outputStream2Closed
    ])

    expect(inputStreamCloseSpy).toHaveBeenCalled()
    expect(outputStream1CloseSpy).toHaveBeenCalled()
    expect(outputStream2CloseSpy).toHaveBeenCalled()

    const media1 = await probeOutput(outputPath("output-stream1.mp4"))
    expectFormatNameToContain(media1, "mp4")
    expectVideoStream(media1, { width: 640, height: 360, codecName: "h264" })
    expectNoAudioStream(media1)

    const media2 = await probeOutput(outputPath("output-stream2.mp4"))
    expectFormatNameToContain(media2, "mp4")
    expectVideoStream(media2, { width: 640, height: 360, codecName: "h264" })
    expectNoAudioStream(media2)
  })

  it("should run a command with a PassThrough input pipeline", async () => {
    const passThrough = new PassThrough()
    const outputFile = outputPath("output-pass-through-input.mp4")

    createReadStream("./assets/video.mp4").pipe(passThrough)

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [
        ffmpegu.input.fromStream(passThrough, ffmpegu.options.format("mp4"))
      ],
      outputs: [
        ffmpegu.output.toFile(
          outputFile,
          ffmpegu.options.concat(
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputFile)
    expectFormatNameToContain(media, "mp4")
    expectVideoStream(media, { width: 640, height: 360, codecName: "h264" })
    expectNoAudioStream(media)
  })

  it("should run a command with filters", async () => {
    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputPath("output-filter.mp4"),
          ffmpegu.options.concat(
            ffmpegu.options.videoFilter(
              ffmpegu.filters.scale({ w: 320, h: 180 })
            ),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputPath("output-filter.mp4"))
    expectVideoStream(media, { width: 320, height: 180, codecName: "h264" })
    expectNoAudioStream(media)
    expectDurationAtLeast(media, 20)
  })

  it("should run a command with filter graph builder", async () => {
    const labelA = ffmpegu.filters.label("a")
    const labelB = ffmpegu.filters.label("b")
    const labelOut1 = ffmpegu.filters.label("out1")
    const labelOut2 = ffmpegu.filters.label("out2")

    const graph = ffmpegu.filters
      .builder()
      .chain(
        ffmpegu.filters.custom("split", { outputs: 2 }, [], [labelA, labelB])
      )
      .chain(
        ffmpegu.filters.scale(
          { w: 320, h: 180 },
          {
            inputs: [labelA],
            outputs: [labelOut1]
          }
        )
      )
      .chain(
        ffmpegu.filters.scale(
          { w: 160, h: 90 },
          {
            inputs: [labelB],
            outputs: [labelOut2]
          }
        )
      )
      .build()

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputPath("output-graph1.mp4"),
          ffmpegu.options.concat(
            ffmpegu.options.filterComplex(graph),
            ffmpegu.options.map(labelOut1),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.noAudio()
          )
        ),
        ffmpegu.output.toFile(
          outputPath("output-graph2.mp4"),
          ffmpegu.options.concat(
            ffmpegu.options.map(labelOut2),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media1 = await probeOutput(outputPath("output-graph1.mp4"))
    expectVideoStream(media1, { width: 320, height: 180, codecName: "h264" })
    expectNoAudioStream(media1)

    const media2 = await probeOutput(outputPath("output-graph2.mp4"))
    expectVideoStream(media2, { width: 160, height: 90, codecName: "h264" })
    expectNoAudioStream(media2)
  })

  it("should run a command with input refs in filter graph", async () => {
    const input = ffmpegu.input.fromFile("./assets/video.mp4")
    const inputVideo = ffmpegu.filters.label(input.video)
    const outLabel = ffmpegu.filters.label("scaled")

    const graph = ffmpegu.filters
      .builder()
      .chain(
        ffmpegu.filters.scale(
          { w: 320, h: 180 },
          {
            inputs: [inputVideo],
            outputs: [outLabel]
          }
        )
      )
      .build()

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [input],
      outputs: [
        ffmpegu.output.toFile(
          outputPath("output-filter-input.mp4"),
          ffmpegu.options.concat(
            ffmpegu.options.filterComplex(graph),
            ffmpegu.options.map(outLabel),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputPath("output-filter-input.mp4"))
    expectVideoStream(media, { width: 320, height: 180, codecName: "h264" })
    expectNoAudioStream(media)
  })

  it("should run a command with escaped filter values", async () => {
    const filterChain = ffmpegu.filters.chain(
      ffmpegu.filters.select({
        expr: "between(t,0,1)"
      }),
      ffmpegu.filters.setpts({
        expr: "PTS-STARTPTS"
      })
    )

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputPath("output-filter-select.mp4"),
          ffmpegu.options.concat(
            ffmpegu.options.videoFilter(filterChain),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.noAudio()
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const media = await probeOutput(outputPath("output-filter-select.mp4"))
    expectVideoStream(media, { width: 640, height: 360, codecName: "h264" })
    expectNoAudioStream(media)
    expectDurationBetween(media, 0.9, 1.1)
  })

  it("should run a command with HLS encoding", async () => {
    await mkdir(outputPath("hls"), { recursive: true })

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputPath("hls", "stream.m3u8"),
          ffmpegu.options.concat(
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.audioCodec("aac"),
            ffmpegu.options.audioBitrate("128k"),
            ffmpegu.options.hls({
              time: 4,
              listSize: 0,
              flags: "program_date_time",
              playlistType: "vod",
              segmentFilename: outputPath("hls", "segment-%03d.ts")
            })
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const manifestPath = outputPath("hls", "stream.m3u8")
    const manifest = await readFile(manifestPath, "utf-8")

    expect(manifest).toContain("#EXTM3U")
    expect(manifest).toContain("#EXT-X-ENDLIST")
    expect(manifest).toContain("segment-000.ts")
    expect(manifest).toContain("segment-003.ts")

    const files = await readdir(outputPath("hls"))
    expect(files).toEqual(
      expect.arrayContaining([
        "segment-000.ts",
        "segment-001.ts",
        "segment-002.ts",
        "segment-003.ts",
        "stream.m3u8"
      ])
    )

    await Promise.all(
      [
        "segment-000.ts",
        "segment-001.ts",
        "segment-002.ts",
        "segment-003.ts"
      ].map((file) => expectOutputFile(outputPath("hls", file)))
    )
  })

  it("should run a command with DASH encoding", async () => {
    await mkdir(outputPath("dash"), { recursive: true })

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          outputPath("dash", "stream.mpd"),
          ffmpegu.options.merge(
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.audioCodec("aac"),
            ffmpegu.options.audioBitrate("128k"),
            ffmpegu.options.dash({
              adaptationSets: "id=0,streams=v id=1,streams=a",
              windowSize: 8,
              streaming: true
            })
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)

    const manifestPath = outputPath("dash", "stream.mpd")
    const manifest = await readFile(manifestPath, "utf-8")

    expect(manifest).toContain("<MPD")
    expect(manifest).toContain('contentType="video"')
    expect(manifest).toContain("init-stream$RepresentationID$.m4s")
    expect(manifest).toContain(
      "chunk-stream$RepresentationID$-$Number%05d$.m4s"
    )

    const files = await readdir(outputPath("dash"))
    expect(files).toEqual(
      expect.arrayContaining([
        "init-stream0.m4s",
        "chunk-stream0-00001.m4s",
        "chunk-stream0-00002.m4s",
        "chunk-stream0-00003.m4s",
        "chunk-stream0-00004.m4s",
        "stream.mpd"
      ])
    )

    await Promise.all(
      [
        "init-stream0.m4s",
        "chunk-stream0-00001.m4s",
        "chunk-stream0-00002.m4s",
        "chunk-stream0-00003.m4s",
        "chunk-stream0-00004.m4s"
      ].map((file) => expectOutputFile(outputPath("dash", file)))
    )
  })

  it("should return non-zero for missing input", async () => {
    const available = await runner
      .validateBinary()
      .then(() => true)
      .catch(() => false)

    if (!available) return

    await rm(outputPath("missing.mp4"), { force: true })

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/does-not-exist.mp4")],
      outputs: [ffmpegu.output.toFile(outputPath("missing.mp4"))]
    })

    const result = await runner.run(command)

    expect(result.code).not.toBe(0)
    await expect(access(outputPath("missing.mp4"))).rejects.toThrow()
  })
})
