import * as Duration from "effect/Duration"
import type { Progress } from "../types/index.ts"

/**
 * Keeps the last `limit` bytes written to it, so diagnostics of long or
 * chatty runs stay bounded.
 *
 * The bytes live in a ring buffer: a push copies the chunk in (the producer
 * may reuse its buffer after emitting it) and overwrites the oldest bytes,
 * whatever the number or size of chunks. The buffer grows on demand up to
 * `limit`, so a large limit costs nothing while little is written.
 */
export class ByteTail {
  #buffer = new Uint8Array(0)
  /** Offset of the oldest byte in `#buffer`. */
  #start = 0
  #size = 0
  #truncated = false

  constructor(readonly limit: number) {}

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return
    if (chunk.length >= this.limit) {
      this.#truncated ||= chunk.length > this.limit || this.#size > 0
      this.#reserve(this.limit)
      this.#buffer.set(chunk.subarray(chunk.length - this.limit))
      this.#start = 0
      this.#size = this.limit
      return
    }
    this.#reserve(Math.min(this.#size + chunk.length, this.limit))
    // Shorter than the buffer: wraps at most once.
    const capacity = this.#buffer.length
    const end = (this.#start + this.#size) % capacity
    const head = Math.min(chunk.length, capacity - end)
    this.#buffer.set(chunk.subarray(0, head), end)
    this.#buffer.set(chunk.subarray(head), 0)
    const excess = this.#size + chunk.length - capacity
    if (excess > 0) {
      // Only once the buffer reached `limit`: the oldest bytes were overwritten.
      this.#truncated = true
      this.#start = (this.#start + excess) % capacity
      this.#size = capacity
    } else {
      this.#size += chunk.length
    }
  }

  get size(): number {
    return this.#size
  }

  bytes(): Uint8Array {
    const bytes = new Uint8Array(this.#size)
    const head = Math.min(this.#size, this.#buffer.length - this.#start)
    bytes.set(this.#buffer.subarray(this.#start, this.#start + head))
    bytes.set(this.#buffer.subarray(0, this.#size - head), head)
    return bytes
  }

  /**
   * Grows the buffer to hold at least `capacity` bytes (at most `limit`),
   * doubling so that growth stays amortized O(1) per byte. The contents are
   * moved to the start of the new buffer.
   */
  #reserve(capacity: number) {
    if (capacity <= this.#buffer.length) return
    const buffer = new Uint8Array(
      Math.min(this.limit, Math.max(capacity, this.#buffer.length * 2))
    )
    buffer.set(this.bytes())
    this.#buffer = buffer
    this.#start = 0
  }

  text(): string {
    let bytes = this.bytes()
    if (this.#truncated) {
      // Truncation may cut a UTF-8 sequence: skip leading continuation bytes.
      let start = 0
      while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++
      bytes = bytes.subarray(start)
    }
    return new TextDecoder().decode(bytes).trim()
  }
}

/** Longest progress line kept; longer lines are discarded. */
const MAX_LINE_BYTES = 4096
/** Most distinct keys kept per progress block. */
const MAX_FIELDS = 256
const NEWLINE = 0x0a

/**
 * Incremental parser for ffmpeg `-progress` output (`key=value` lines, one
 * block per `progress=` line). Memory stays bounded for arbitrary input:
 * overlong lines and excess keys are dropped, other unknown data is ignored.
 */
export class ProgressParser {
  readonly #line = new Uint8Array(MAX_LINE_BYTES)
  #length = 0
  #overflow = false
  #fields = new Map<string, string>()
  readonly #decoder = new TextDecoder()

  push(chunk: Uint8Array): Progress[] {
    const blocks: Progress[] = []
    let start = 0
    while (start < chunk.length) {
      const newline = chunk.indexOf(NEWLINE, start)
      const end = newline === -1 ? chunk.length : newline
      this.#append(chunk.subarray(start, end))
      if (newline === -1) break
      const block = this.#completeLine()
      if (block) blocks.push(block)
      start = newline + 1
    }
    return blocks
  }

  /** Parse a trailing line without newline; incomplete blocks are dropped. */
  end(): Progress[] {
    const block = this.#completeLine()
    this.#fields = new Map()
    return block ? [block] : []
  }

  #append(bytes: Uint8Array) {
    if (this.#overflow || bytes.length === 0) return
    if (this.#length + bytes.length > MAX_LINE_BYTES) {
      this.#overflow = true
      return
    }
    this.#line.set(bytes, this.#length)
    this.#length += bytes.length
  }

  #completeLine(): Progress | undefined {
    const overflow = this.#overflow
    const line = overflow
      ? ""
      : this.#decoder.decode(this.#line.subarray(0, this.#length)).trim()
    this.#length = 0
    this.#overflow = false

    const separator = line.indexOf("=")
    if (separator <= 0) return undefined
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (key !== "progress") {
      if (this.#fields.has(key) || this.#fields.size < MAX_FIELDS) {
        this.#fields.set(key, value)
      }
      return undefined
    }
    // The block marker is always kept, even when other keys hit the cap.
    this.#fields.set(key, value)

    const fields = this.#fields
    this.#fields = new Map()
    return toProgress(fields)
  }
}

/**
 * Hand-parsed rather than a Schema: every field is optional and lenient, so
 * a malformed value is dropped instead of failing the block. A Schema would
 * wrap this same per-field logic in getters at about 1.5x the per-block cost.
 */
function toProgress(fields: ReadonlyMap<string, string>): Progress {
  const progress: { -readonly [K in keyof Progress]: Progress[K] } = {
    progress: fields.get("progress") === "end" ? "end" : "continue",
    raw: Object.fromEntries(fields)
  }
  const assign = <K extends keyof Progress>(key: K, value: Progress[K]) => {
    if (value !== undefined) progress[key] = value
  }
  assign("frame", number(fields.get("frame")))
  assign("fps", number(fields.get("fps")))
  assign("bitrate", text(fields.get("bitrate")))
  assign("totalSize", number(fields.get("total_size")))
  assign("outTime", microseconds(fields.get("out_time_us")))
  assign("dupFrames", number(fields.get("dup_frames")))
  assign("dropFrames", number(fields.get("drop_frames")))
  const speed = fields.get("speed")
  assign("speed", number(speed?.endsWith("x") ? speed.slice(0, -1) : speed))
  return progress
}

function text(value: string | undefined): string | undefined {
  return value === undefined || value === "" || value === "N/A"
    ? undefined
    : value
}

function number(value: string | undefined): number | undefined {
  if (text(value) === undefined) return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

const INTEGER = /^[+-]?\d+$/

/**
 * Parsed straight from the text with `BigInt`: ffmpeg reports an int64 that
 * can exceed `Number.MAX_SAFE_INTEGER`, and a `Number` round-trip would round
 * it. The regex also rejects inputs `BigInt` would accept (`""`, `0x10`).
 */
function microseconds(
  value: string | undefined
): Duration.Duration | undefined {
  return value !== undefined && INTEGER.test(value)
    ? Duration.micros(BigInt(value))
    : undefined
}
