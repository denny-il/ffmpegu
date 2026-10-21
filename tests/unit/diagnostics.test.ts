import { Duration } from "effect"
import { describe, expect, it } from "vitest"
import { ByteTail, ProgressParser } from "../../src/core/diagnostics.ts"

const bytes = (text: string) => new TextEncoder().encode(text)

describe("ProgressParser", () => {
  it("should parse blocks split across chunks with CRLF and N/A values", () => {
    const parser = new ProgressParser()

    expect(
      parser.push(bytes("frame=12\r\nfps=29.97\nbitrate=N/A\nout_ti"))
    ).toEqual([])
    expect(
      parser.push(
        bytes(
          "me=00:00:00.400000\nout_time_us=400000\nspeed=1.5x\ntotal_size=N/A\nstream_0_0_q=-1.0\nprogress=continue\nframe=13\n"
        )
      )
    ).toEqual([
      {
        progress: "continue",
        frame: 12,
        fps: 29.97,
        outTime: Duration.micros(400_000n),
        speed: 1.5,
        raw: {
          frame: "12",
          fps: "29.97",
          bitrate: "N/A",
          out_time: "00:00:00.400000",
          out_time_us: "400000",
          speed: "1.5x",
          total_size: "N/A",
          stream_0_0_q: "-1.0",
          progress: "continue"
        }
      }
    ])
    expect(parser.push(bytes("progress=end"))).toEqual([])
    expect(parser.end()).toEqual([
      { progress: "end", frame: 13, raw: { frame: "13", progress: "end" } }
    ])
  })

  it("should emit every block of a batched chunk and ignore unknown data", () => {
    const parser = new ProgressParser()

    const blocks = parser.push(
      bytes("garbage\n=nokey\nspeed=fast\nprogress=continue\nprogress=end\n")
    )

    expect(blocks.map((block) => block.progress)).toEqual(["continue", "end"])
    expect(blocks[0]!.speed).toBeUndefined()
    expect(blocks[0]!.raw).toEqual({ speed: "fast", progress: "continue" })
  })

  it("should decode ffmpeg's snake_case keys into camelCase fields", () => {
    const parser = new ProgressParser()

    const [block] = parser.push(
      bytes(
        "frame=48\nbitrate=128.0kbits/s\ntotal_size=32768\nout_time_us=2000250\nout_time_ms=2000250\nout_time=00:00:02.000250\ndup_frames=2\ndrop_frames=1\nprogress=continue\n"
      )
    )

    expect(block).toEqual({
      progress: "continue",
      frame: 48,
      bitrate: "128.0kbits/s",
      totalSize: 32768,
      outTime: Duration.micros(2_000_250n),
      dupFrames: 2,
      dropFrames: 1,
      raw: {
        frame: "48",
        bitrate: "128.0kbits/s",
        total_size: "32768",
        out_time_us: "2000250",
        out_time_ms: "2000250",
        out_time: "00:00:02.000250",
        dup_frames: "2",
        drop_frames: "1",
        progress: "continue"
      }
    })
  })

  it("should keep negative output times and drop unavailable ones", () => {
    const parser = new ProgressParser()

    const [early, unknown] = parser.push(
      bytes(
        "out_time_us=-23220\nprogress=continue\nout_time_us=N/A\nprogress=continue\n"
      )
    )

    expect(Duration.toNanosUnsafe(early!.outTime!)).toBe(-23_220_000n)
    expect(unknown!.outTime).toBeUndefined()
  })

  it("should treat an unrecognized marker as continue and keep it in raw", () => {
    const parser = new ProgressParser()

    const [block] = parser.push(bytes("frame=3\nprogress=paused\n"))

    expect(block!.progress).toBe("continue")
    expect(block!.raw.progress).toBe("paused")
  })

  it("should not fabricate a block from an unterminated block", () => {
    const parser = new ProgressParser()

    expect(parser.push(bytes("frame=1\nfps=2\n"))).toEqual([])
    expect(parser.end()).toEqual([])
  })

  it("should drop overlong lines without buffering them", () => {
    const parser = new ProgressParser()
    const huge = new Uint8Array(1024 * 1024).fill(0x61)

    expect(parser.push(bytes("frame=1\nkey="))).toEqual([])
    for (let i = 0; i < 8; i++) expect(parser.push(huge)).toEqual([])
    const [block] = parser.push(bytes("\nprogress=continue\n"))

    expect(block!.raw).toEqual({ frame: "1", progress: "continue" })
  })

  it("should cap the number of keys but always keep the block marker", () => {
    const parser = new ProgressParser()
    const keys = Array.from({ length: 1000 }, (_, i) => `k${i}=${i}\n`).join("")

    const [block] = parser.push(bytes(`${keys}progress=continue\n`))

    expect(block!.progress).toBe("continue")
    expect(block!.raw.progress).toBe("continue")
    expect(Object.keys(block!.raw).length).toBe(257)
  })
})

describe("ByteTail", () => {
  it("should keep only the last bytes across chunks", () => {
    const tail = new ByteTail(5)
    tail.push(bytes("abc"))
    tail.push(bytes("defg"))
    tail.push(bytes("h"))

    expect(tail.size).toBe(5)
    expect(tail.text()).toBe("defgh")

    tail.push(bytes("0123456789"))
    expect(tail.text()).toBe("56789")
  })

  it("should not be affected by producers reusing their buffer", () => {
    const tail = new ByteTail(16)
    const buffer = bytes("one")
    tail.push(buffer)
    buffer.set(bytes("two"))

    expect(tail.text()).toBe("one")
  })

  it("should not start the text with a partial UTF-8 sequence", () => {
    const tail = new ByteTail(4)
    tail.push(bytes("éé"))
    tail.push(bytes("x"))

    // "éé" + "x" is 5 bytes; the cut lands inside the first "é".
    expect(tail.text()).toBe("éx")
  })

  it("should keep nothing with a zero limit", () => {
    const tail = new ByteTail(0)
    tail.push(bytes("abc"))

    expect(tail.size).toBe(0)
    expect(tail.text()).toBe("")
  })
})
