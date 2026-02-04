import { createReadStream, createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { describe, expect, it, vi } from "vitest"
import { ffmpegu } from "../../src/index.ts"

describe.sequential("Integration", { timeout: 120_000 }, () => {
  const runner = ffmpegu.createFFmpegRunner("ffmpeg")

  it("should run validate a binary", async () => {
    await expect(runner.validateBinary()).resolves.not.toThrow()
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
          "./assets/output/output.mp4",
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
  })

  it("should run a command with input and output map", async () => {
    const input1 = ffmpegu.input.fromFile("./assets/video.mp4")
    const input2 = ffmpegu.input.fromFile("./assets/audio.mp3")
    const output1 = ffmpegu.output.toFile(
      "./assets/output/output1.mp4",
      ffmpegu.options.concat(
        ffmpegu.options.map(input1.video),
        ffmpegu.options.map(input2.audio.track(0)),
        ffmpegu.options.videoCodec("libx264"),
        ffmpegu.options.preset("fast"),
        ffmpegu.options.crf(23)
      )
    )
    const output2 = ffmpegu.output.toFile(
      "./assets/output/output2.mp4",
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
  })

  it("should run a command with input and output streams", async () => {
    const inputStreamCloseSpy = vi.fn()
    const inputStream = createReadStream("./assets/video.mp4")
    inputStream.on("close", inputStreamCloseSpy)
    const input = ffmpegu.input.fromStream(
      inputStream,
      ffmpegu.options.format("mp4")
    )

    const outputStream1CloseSpy = vi.fn()
    const outputStream1 = createWriteStream("./assets/output/output1.mp4")
    outputStream1.on("close", outputStream1CloseSpy)
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
    const outputStream2 = createWriteStream("./assets/output/output2.mp4")
    outputStream2.on("close", outputStream2CloseSpy)
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

    expect(inputStreamCloseSpy).toHaveBeenCalled()
    expect(outputStream1CloseSpy).toHaveBeenCalled()
    expect(outputStream2CloseSpy).toHaveBeenCalled()
  })

  it("should run a command with filters", async () => {
    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          "./assets/output/output-filter.mp4",
          ffmpegu.options.concat(
            ffmpegu.options.videoFilter(
              ffmpegu.filters.scale({ w: 320, h: 180 })
            ),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            "-an"
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)
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
          "./assets/output/output-graph1.mp4",
          ffmpegu.options.concat(
            ffmpegu.options.filterComplex(graph),
            ffmpegu.options.map(labelOut1),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            "-an"
          )
        ),
        ffmpegu.output.toFile(
          "./assets/output/output-graph2.mp4",
          ffmpegu.options.concat(
            ffmpegu.options.map(labelOut2),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            "-an"
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)
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
          "./assets/output/output-filter-input.mp4",
          ffmpegu.options.concat(
            ffmpegu.options.filterComplex(graph),
            ffmpegu.options.map(outLabel),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            "-an"
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)
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
          "./assets/output/output-filter-select.mp4",
          ffmpegu.options.concat(
            ffmpegu.options.videoFilter(filterChain),
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            "-an"
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)
  })

  it("should run a command with HLS encoding", async () => {
    await mkdir("./assets/output/hls", { recursive: true })

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          "./assets/output/hls/stream.m3u8",
          ffmpegu.options.concat(
            ffmpegu.options.videoCodec("libx264"),
            ffmpegu.options.preset("fast"),
            ffmpegu.options.crf(23),
            ffmpegu.options.audioCodec("aac"),
            ffmpegu.options.audioBitrate("128k"),
            ffmpegu.options.hls({
              time: 4,
              listSize: 0,
              flags: "program_date_time"
            }),
            ["hls_playlist_type", "vod"],
            ["hls_segment_filename", "./assets/output/hls/segment-%03d.ts"]
          )
        )
      ]
    })

    const result = await runner.run(command)

    expect(result.code).toBe(0)
  })

  it("should run a command with DASH encoding", async () => {
    await mkdir("./assets/output/dash", { recursive: true })

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/video.mp4")],
      outputs: [
        ffmpegu.output.toFile(
          "./assets/output/dash/stream.mpd",
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
  })

  it("should return non-zero for missing input", async () => {
    const available = await runner
      .validateBinary()
      .then(() => true)
      .catch(() => false)

    if (!available) return

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("./assets/does-not-exist.mp4")],
      outputs: [ffmpegu.output.toFile("./assets/output/missing.mp4")]
    })

    const result = await runner.run(command)

    expect(result.code).not.toBe(0)
  })
})
