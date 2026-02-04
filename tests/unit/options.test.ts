import { describe, expect, it } from "vitest"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { ffmpegu } from "../../src/index.ts"

describe.sequential("Options", () => {
  const refs = new FFmpeguReferences()

  it("should format overwrite options", () => {
    expect(ffmpegu.options.overwrite().getArgs(refs)).toEqual(["-y"])
    expect(ffmpegu.options.noOverwrite().getArgs(refs)).toEqual(["-n"])
  })

  it("should format container and log options", () => {
    expect(ffmpegu.options.format("mp4").getArgs(refs)).toEqual(["-f", "mp4"])
    expect(ffmpegu.options.logLevel("warning").getArgs(refs)).toEqual([
      "-loglevel",
      "warning"
    ])
    expect(ffmpegu.options.threads(4).getArgs(refs)).toEqual(["-threads", "4"])
  })

  it("should format mapping and timing options", () => {
    expect(ffmpegu.options.map("0:v").getArgs(refs)).toEqual(["-map", "0:v"])
    expect(ffmpegu.options.shortest().getArgs(refs)).toEqual(["-shortest"])
    expect(ffmpegu.options.startTime(1.5).getArgs(refs)).toEqual(["-ss", "1.5"])
    expect(ffmpegu.options.duration("00:00:10").getArgs(refs)).toEqual([
      "-t",
      "00:00:10"
    ])
    expect(ffmpegu.options.to(42).getArgs(refs)).toEqual(["-to", "42"])
  })

  it("should format codec options", () => {
    expect(ffmpegu.options.copy().getArgs(refs)).toEqual(["-c", "copy"])
    expect(ffmpegu.options.videoCopy().getArgs(refs)).toEqual(["-c:v", "copy"])
    expect(ffmpegu.options.audioCopy().getArgs(refs)).toEqual(["-c:a", "copy"])
    expect(ffmpegu.options.subtitleCopy().getArgs(refs)).toEqual([
      "-c:s",
      "copy"
    ])

    expect(ffmpegu.options.videoCodec("libx264").getArgs(refs)).toEqual([
      "-c:v",
      "libx264"
    ])
    expect(ffmpegu.options.audioCodec("aac").getArgs(refs)).toEqual([
      "-c:a",
      "aac"
    ])
    expect(ffmpegu.options.subtitleCodec("srt").getArgs(refs)).toEqual([
      "-c:s",
      "srt"
    ])
  })

  it("should format quality and rate options", () => {
    expect(ffmpegu.options.crf(23).getArgs(refs)).toEqual(["-crf", "23"])
    expect(ffmpegu.options.preset("fast").getArgs(refs)).toEqual([
      "-preset",
      "fast"
    ])
    expect(ffmpegu.options.tune("film").getArgs(refs)).toEqual([
      "-tune",
      "film"
    ])
    expect(ffmpegu.options.profileVideo("high").getArgs(refs)).toEqual([
      "-profile:v",
      "high"
    ])
    expect(ffmpegu.options.profileAudio("aac_low").getArgs(refs)).toEqual([
      "-profile:a",
      "aac_low"
    ])
    expect(ffmpegu.options.level(4.1).getArgs(refs)).toEqual(["-level", "4.1"])
    expect(ffmpegu.options.frameRate(30).getArgs(refs)).toEqual(["-r", "30"])
    expect(ffmpegu.options.gop(120).getArgs(refs)).toEqual(["-g", "120"])
    expect(ffmpegu.options.keyintMin(24).getArgs(refs)).toEqual([
      "-keyint_min",
      "24"
    ])
  })

  it("should format video and audio settings", () => {
    expect(ffmpegu.options.bFrames(3).getArgs(refs)).toEqual(["-bf", "3"])
    expect(ffmpegu.options.refs(2).getArgs(refs)).toEqual(["-refs", "2"])
    expect(ffmpegu.options.pixelFormat("yuv420p").getArgs(refs)).toEqual([
      "-pix_fmt",
      "yuv420p"
    ])
    expect(ffmpegu.options.size("1280x720").getArgs(refs)).toEqual([
      "-s",
      "1280x720"
    ])
    expect(ffmpegu.options.aspect("16:9").getArgs(refs)).toEqual([
      "-aspect",
      "16:9"
    ])
    expect(ffmpegu.options.audioChannels(2).getArgs(refs)).toEqual(["-ac", "2"])
    expect(ffmpegu.options.audioSampleRate(48000).getArgs(refs)).toEqual([
      "-ar",
      "48000"
    ])
    expect(ffmpegu.options.audioSampleFormat("fltp").getArgs(refs)).toEqual([
      "-sample_fmt",
      "fltp"
    ])
    expect(ffmpegu.options.audioQuality(2).getArgs(refs)).toEqual(["-q:a", "2"])
  })

  it("should format filter options", () => {
    const graph = ffmpegu.filters.chain(
      ffmpegu.filters.scale({ w: 640, h: 360 })
    )
    expect(ffmpegu.options.videoFilter("scale=640:360").getArgs(refs)).toEqual([
      "-vf",
      "scale=640:360"
    ])
    expect(ffmpegu.options.audioFilter("volume=0.8").getArgs(refs)).toEqual([
      "-af",
      "volume=0.8"
    ])
    expect(ffmpegu.options.filterComplex(graph).getArgs(refs)).toEqual([
      "-filter_complex",
      "scale=w=640:h=360"
    ])
  })

  it("should format movflags and metadata options", () => {
    expect(ffmpegu.options.movFlags("faststart").getArgs(refs)).toEqual([
      "-movflags",
      "faststart"
    ])
    expect(ffmpegu.options.metadata("title", "hello").getArgs(refs)).toEqual([
      "-metadata",
      "title=hello"
    ])
    expect(ffmpegu.options.metadata("track", 2).getArgs(refs)).toEqual([
      "-metadata",
      "track=2"
    ])
  })

  it("should format HLS options", () => {
    expect(
      ffmpegu.options
        .hls({
          time: 4,
          listSize: 0,
          flags: ["split_by_time", "delete_segments"]
        })
        .getArgs(refs)
    ).toEqual([
      "-f",
      "hls",
      "-hls_time",
      "4",
      "-hls_list_size",
      "0",
      "-hls_flags",
      "split_by_time,delete_segments"
    ])

    expect(
      ffmpegu.options.hls({ flags: "program_date_time" }).getArgs(refs)
    ).toEqual(["-f", "hls", "-hls_flags", "program_date_time"])

    expect(ffmpegu.options.hls({ listSize: 6 }).getArgs(refs)).toEqual([
      "-f",
      "hls",
      "-hls_list_size",
      "6"
    ])
  })

  it("should format DASH options", () => {
    expect(
      ffmpegu.options
        .dash({
          adaptationSets: "id=0,streams=v id=1,streams=a",
          windowSize: 5,
          streaming: true
        })
        .getArgs(refs)
    ).toEqual([
      "-f",
      "dash",
      "-adaptation_sets",
      "id=0,streams=v id=1,streams=a",
      "-window_size",
      "5",
      "-streaming",
      "1"
    ])

    expect(ffmpegu.options.dash({ streaming: 0 }).getArgs(refs)).toEqual([
      "-f",
      "dash",
      "-streaming",
      "0"
    ])

    expect(ffmpegu.options.dash({ streaming: false }).getArgs(refs)).toEqual([
      "-f",
      "dash",
      "-streaming",
      "0"
    ])

    expect(ffmpegu.options.dash({ windowSize: 8 }).getArgs(refs)).toEqual([
      "-f",
      "dash",
      "-window_size",
      "8"
    ])
  })

  it("should format video bitrate with unit", () => {
    const options = ffmpegu.options.videoBitrate(320, "k")
    expect(options.getArgs(refs)).toEqual(["-b:v", "320k"])
  })

  it("should keep video bitrate strings as-is", () => {
    const options = ffmpegu.options.videoBitrate("1.5M")
    expect(options.getArgs(refs)).toEqual(["-b:v", "1.5M"])
  })

  it("should format audio bitrate without unit", () => {
    const options = ffmpegu.options.audioBitrate(192)
    expect(options.getArgs(refs)).toEqual(["-b:a", "192"])
  })

  it("should format min rate with unit", () => {
    const options = ffmpegu.options.minRate(400, "k")
    expect(options.getArgs(refs)).toEqual(["-minrate", "400k"])
  })

  it("should format max rate with unit", () => {
    const options = ffmpegu.options.maxRate(2, "M")
    expect(options.getArgs(refs)).toEqual(["-maxrate", "2M"])
  })

  it("should format buffer size with unit", () => {
    const options = ffmpegu.options.bufferSize(512, "k")
    expect(options.getArgs(refs)).toEqual(["-bufsize", "512k"])
  })
})
