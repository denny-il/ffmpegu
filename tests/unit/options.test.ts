import vm from "node:vm"
import { Duration, Result } from "effect"
import { describe, expect, it } from "vitest"
import { FFmpeguCommand } from "../../src/core/command.ts"
import { FFmpeguOutput } from "../../src/core/output.ts"
import { FFmpeguReferences } from "../../src/core/references.ts"
import { ffmpegu } from "../../src/index.ts"

describe("Options", { concurrent: false }, () => {
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
    expect(ffmpegu.options.noVideo().getArgs(refs)).toEqual(["-vn"])
    expect(ffmpegu.options.noAudio().getArgs(refs)).toEqual(["-an"])
    expect(ffmpegu.options.noSubtitle().getArgs(refs)).toEqual(["-sn"])
    expect(ffmpegu.options.noData().getArgs(refs)).toEqual(["-dn"])
    expect(ffmpegu.options.shortest().getArgs(refs)).toEqual(["-shortest"])
    expect(ffmpegu.options.startTime(1.5).getArgs(refs)).toEqual(["-ss", "1.5"])
    expect(ffmpegu.options.duration("00:00:10").getArgs(refs)).toEqual([
      "-t",
      "00:00:10"
    ])
    expect(ffmpegu.options.to(42).getArgs(refs)).toEqual(["-to", "42"])

    expect(
      ffmpegu.options.startTime({ hours: 1, minutes: 30 }).getArgs(refs)
    ).toEqual(["-ss", "01:30:00.000"])
    expect(
      ffmpegu.options
        .duration({ minutes: 1, seconds: 30, milliseconds: 500 })
        .getArgs(refs)
    ).toEqual(["-t", "00:01:30.500"])
    expect(ffmpegu.options.to({ seconds: 45 }).getArgs(refs)).toEqual([
      "-to",
      "00:00:45.000"
    ])
    expect(
      ffmpegu.options
        .duration({ seconds: 75, milliseconds: 1500 })
        .getArgs(refs)
    ).toEqual(["-t", "00:01:16.500"])
    expect(
      ffmpegu.options.duration({ minutes: 61, seconds: 120 }).getArgs(refs)
    ).toEqual(["-t", "01:03:00.000"])
  })

  it("should format Effect durations as timestamps", () => {
    expect(
      ffmpegu.options.startTime(Duration.minutes(90)).getArgs(refs)
    ).toEqual(["-ss", "01:30:00.000"])
    expect(
      ffmpegu.options.duration(Duration.millis(90_500)).getArgs(refs)
    ).toEqual(["-t", "00:01:30.500"])
    expect(ffmpegu.options.to(Duration.millis(-1_500)).getArgs(refs)).toEqual([
      "-to",
      "-00:00:01.500"
    ])
    expect(ffmpegu.options.duration(Duration.hours(100)).getArgs(refs)).toEqual(
      ["-t", "100:00:00.000"]
    )
    // Microseconds are ffmpeg's time base; finer precision is truncated.
    expect(
      ffmpegu.options.startTime(Duration.micros(1_500_250n)).getArgs(refs)
    ).toEqual(["-ss", "00:00:01.500250"])
    expect(
      ffmpegu.options.startTime(Duration.nanos(1_500_999n)).getArgs(refs)
    ).toEqual(["-ss", "00:00:00.001500"])
    // Beyond 2^53 microseconds, where number arithmetic would round.
    expect(
      ffmpegu.options
        .startTime(Duration.micros(9_007_199_254_740_993n))
        .getArgs(refs)
    ).toEqual(["-ss", "9007199254.740993"])
  })

  it("should render seconds once hours exceed four digits", () => {
    // FFmpeg rejects HH:MM:SS with more than four hour digits.
    expect(
      ffmpegu.options
        .startTime(Duration.micros(36_000_000_000_000n - 1n))
        .getArgs(refs)
    ).toEqual(["-ss", "9999:59:59.999999"])
    expect(
      ffmpegu.options.startTime(Duration.hours(10_000)).getArgs(refs)
    ).toEqual(["-ss", "36000000.000"])
    expect(
      ffmpegu.options
        .to(Temporal.Duration.from({ hours: -10_000, microseconds: -1 }))
        .getArgs(refs)
    ).toEqual(["-to", "-36000000.000001"])
    expect(
      ffmpegu.options
        .duration({ hours: 9_999, minutes: 59, seconds: 59, milliseconds: 999 })
        .getArgs(refs)
    ).toEqual(["-t", "9999:59:59.999"])
    expect(ffmpegu.options.duration({ hours: 10_000 }).getArgs(refs)).toEqual([
      "-t",
      "36000000.000"
    ])
    expect(
      ffmpegu.options.to({ hours: -10_000, milliseconds: -1 }).getArgs(refs)
    ).toEqual(["-to", "-36000000.001"])
    expect(
      ffmpegu.options
        .duration({ milliseconds: 72_057_594_037_929 })
        .getArgs(refs)
    ).toEqual(["-t", "72057594037.929"])
  })

  it("should format Temporal durations as timestamps", () => {
    expect(
      ffmpegu.options
        .duration(
          Temporal.Duration.from({ minutes: 1, seconds: 30, milliseconds: 500 })
        )
        .getArgs(refs)
    ).toEqual(["-t", "00:01:30.500"])
    // Days have no time object counterpart and are 24 hours without a date.
    expect(
      ffmpegu.options
        .startTime(Temporal.Duration.from({ days: 1, hours: 2 }))
        .getArgs(refs)
    ).toEqual(["-ss", "26:00:00.000"])
    expect(
      ffmpegu.options
        .to(
          Temporal.Duration.from({
            seconds: -2,
            microseconds: -5,
            nanoseconds: -999
          })
        )
        .getArgs(refs)
    ).toEqual(["-to", "-00:00:02.000005"])
    expect(
      ffmpegu.options
        .startTime(Temporal.Duration.from("PT1H0.000001S"))
        .getArgs(refs)
    ).toEqual(["-ss", "01:00:00.000001"])
    // Beyond 2^53 microseconds, where a number total would round.
    expect(
      ffmpegu.options
        .startTime(
          Temporal.Duration.from({
            seconds: 9_007_199_254,
            microseconds: 740_993
          })
        )
        .getArgs(refs)
    ).toEqual(["-ss", "9007199254.740993"])
    // Nanoseconds are truncated toward zero, like Effect durations.
    expect(
      ffmpegu.options
        .startTime(
          Temporal.Duration.from({ seconds: 20_000_000, nanoseconds: 999 })
        )
        .getArgs(refs)
    ).toEqual(["-ss", "5555:33:20.000"])
    expect(
      ffmpegu.options
        .to(
          Temporal.Duration.from({
            seconds: -9_007_199_254,
            microseconds: -740_993,
            nanoseconds: -999
          })
        )
        .getArgs(refs)
    ).toEqual(["-to", "-9007199254.740993"])
  })

  it("should format Temporal durations from another realm", () => {
    const foreign = vm.runInNewContext(
      "Temporal.Duration.from({ days: 1, microseconds: 1 })"
    )
    expect(foreign).not.toBeInstanceOf(Temporal.Duration)
    expect(ffmpegu.options.startTime(foreign).getArgs(refs)).toEqual([
      "-ss",
      "24:00:00.000001"
    ])
  })

  it("should not let a throwing Effect brand probe break time values", () => {
    const throwOnEffectProbe = <T extends object>(target: T): T =>
      new Proxy(target, {
        has(target, key) {
          if (key === "~effect/Duration") throw new Error("unsupported probe")
          return Reflect.has(target, key)
        }
      })
    expect(
      ffmpegu.options
        .startTime(throwOnEffectProbe({ seconds: 1 }))
        .getArgs(refs)
    ).toEqual(["-ss", "00:00:01.000"])
    // Native getters still read a genuine Duration whose prototype chain
    // throws for the probe.
    const foreign = vm.runInNewContext(
      "Temporal.Duration.from({ seconds: 1, microseconds: 1 })"
    )
    Object.setPrototypeOf(
      foreign,
      throwOnEffectProbe(Object.getPrototypeOf(foreign))
    )
    expect(ffmpegu.options.startTime(foreign).getArgs(refs)).toEqual([
      "-ss",
      "00:00:01.000001"
    ])
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

  it("should render HLS options under FFmpeg's names in key order", () => {
    expect(
      ffmpegu.options
        .hls({
          hls_time: 4,
          hls_playlist_type: "vod",
          hls_segment_filename: "out/seg_%03d.ts",
          hls_flags: ["independent_segments", "program_date_time"],
          hls_list_size: 0,
          start_number: undefined,
          strftime: true,
          hls_allow_cache: false
        })
        .getArgs(refs)
    ).toEqual([
      "-f",
      "hls",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      "out/seg_%03d.ts",
      "-hls_flags",
      "independent_segments+program_date_time",
      "-hls_list_size",
      "0",
      "-strftime",
      "1",
      "-hls_allow_cache",
      "0"
    ])

    expect(ffmpegu.options.hls().getArgs(refs)).toEqual(["-f", "hls"])
  })

  it("should render DASH options under FFmpeg's names in key order", () => {
    expect(
      ffmpegu.options
        .dash({
          use_template: true,
          use_timeline: false,
          seg_duration: 4,
          adaptation_sets: "id=0,streams=v id=1,streams=a",
          frag_type: "every_frame",
          write_prft: "auto"
        })
        .getArgs(refs)
    ).toEqual([
      "-f",
      "dash",
      "-use_template",
      "1",
      "-use_timeline",
      "0",
      "-seg_duration",
      "4",
      "-adaptation_sets",
      "id=0,streams=v id=1,streams=a",
      "-frag_type",
      "every_frame",
      "-write_prft",
      "auto"
    ])
  })

  it("should convert time values to seconds on muxer duration keys", () => {
    expect(
      ffmpegu.options
        .hls({
          hls_init_time: { seconds: 1, milliseconds: 500 },
          hls_time: Duration.millis(2_500),
          timeout: Temporal.Duration.from({ minutes: 1, microseconds: 1 })
        })
        .getArgs(refs)
    ).toEqual([
      "-f",
      "hls",
      "-hls_init_time",
      "1.5",
      "-hls_time",
      "2.5",
      "-timeout",
      "60.000001"
    ])

    expect(
      ffmpegu.options
        .dash({
          seg_duration: Duration.seconds(4),
          frag_duration: { milliseconds: 500 },
          target_latency: Temporal.Duration.from({ seconds: 3 }),
          timeout: Duration.seconds(10)
        })
        .getArgs(refs)
    ).toEqual([
      "-f",
      "dash",
      "-seg_duration",
      "4",
      "-frag_duration",
      "0.5",
      "-target_latency",
      "3",
      "-timeout",
      "10"
    ])

    // Numbers and strings are FFmpeg's own syntax and pass through unchanged.
    expect(
      ffmpegu.options.hls({ hls_time: 0.5, timeout: "00:00:05" }).getArgs(refs)
    ).toEqual(["-f", "hls", "-hls_time", "0.5", "-timeout", "00:00:05"])
  })

  it("should join arrays on muxer duration keys instead of reading them as time objects", () => {
    const raw: Record<string, ReadonlyArray<string>> = { hls_time: ["4"] }
    expect(ffmpegu.options.hls(raw).getArgs(refs)).toEqual([
      "-f",
      "hls",
      "-hls_time",
      "4"
    ])
  })

  it("should fail compilation for invalid durations on muxer keys", () => {
    const result = FFmpeguCommand.make({
      outputs: [
        FFmpeguOutput.toFile(
          "/test/out.m3u8",
          ffmpegu.options.hls({ hls_time: Duration.infinity })
        )
      ]
    }).compile()

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.reason._tag).toBe("InvalidArgument")
    }
  })

  it("should pass other muxer keys through with the same conversions", () => {
    expect(
      ffmpegu.options
        .hls({
          hls_time: 2,
          hls_enc: true,
          hls_enc_key: "0123",
          max_seg_size: 1_000_000,
          http_persistent: false,
          movflags: ["frag_keyframe", "empty_moov"],
          hls_key_info_file: undefined
        })
        .getArgs(refs)
    ).toEqual([
      "-f",
      "hls",
      "-hls_time",
      "2",
      "-hls_enc",
      "1",
      "-hls_enc_key",
      "0123",
      "-max_seg_size",
      "1000000",
      "-http_persistent",
      "0",
      "-movflags",
      "frag_keyframe+empty_moov"
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
