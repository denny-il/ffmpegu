import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { Duration, Effect, Layer, Result, Sink, Stream } from "effect"
import {
  Command,
  FFmpeg,
  FFprobe,
  Input,
  Options,
  Output,
  options,
  probe,
  probeWith,
  run
} from "ffmpegu"

// Runs from a consumer project with the packed tarball installed, so every
// import above resolves through the published exports, not the sources.
assert.equal(
  process.versions.bun ? "bun" : "node",
  process.env.FFMPEGU_PACKAGE_RUNTIME
)

const input = Input.fromFile("input.mp4")
const command = Command.make({
  inputs: [input],
  outputs: [Output.toFile("output.mp4", Options.create({ map: input.video }))]
})
assert.equal(Result.isSuccess(command.compile()), true)
const timed = Command.make({
  global: Options.merge(
    options.startTime(Duration.millis(1500)),
    options.duration(Temporal.Duration.from({ seconds: 2, microseconds: 5 }))
  )
})
assert.deepEqual(Result.getOrThrow(timed.compile()).args, [
  "-ss",
  "00:00:01.500",
  "-t",
  "00:00:02.000005"
])
assert.equal(Effect.isEffect(run(command)), true)
assert.equal(Effect.isEffect(probe("input.mp4")), true)

const platform = process.versions.bun
  ? (await import("@effect/platform-bun")).BunServices.layer
  : (await import("@effect/platform-node")).NodeServices.layer
const media = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(
  Layer.provide(platform)
)
const payload = Uint8Array.from(
  { length: 1024 * 1024 },
  (_, i) => (i * 31 + (i >>> 8)) & 255
)
const chunks = Array.from({ length: 16 }, (_, i) =>
  payload.subarray(i * 65536, (i + 1) * 65536)
)
const hash = createHash("sha256")
let received = 0
let finalProgress
const source = Input.fromStream(
  Stream.fromIterable(chunks),
  Options.create({ f: "s16le", ar: 48000, ac: 2 })
)
const transfer = Command.make({
  global: Options.create("-y"),
  inputs: [source],
  outputs: [
    Output.toSink(
      Sink.forEach((bytes) =>
        Effect.sync(() => {
          received += bytes.length
          hash.update(bytes)
        })
      ),
      Options.create({ map: source.audio, f: "s16le", "c:a": "copy" })
    ),
    Output.toFile(
      "output.wav",
      Options.create({ map: source.audio, f: "wav", "c:a": "copy" })
    )
  ]
})
await Effect.runPromise(
  Effect.gen(function* () {
    yield* run(transfer, {
      onProgress: (p) =>
        Effect.sync(() => {
          finalProgress = p.progress
        })
    })
    const metadata = yield* probe("output.wav")
    assert.equal(metadata.streams[0]?.codec_name, "pcm_s16le")
    assert.equal(metadata.streams[0]?.channels, 2)
    const selected = yield* probeWith(
      "output.wav",
      Options.create({
        show_entries: "stream=codec_name",
        protocol_whitelist: "file",
        v: "quiet"
      })
    )
    assert.deepEqual(selected.streams, [{ codec_name: "pcm_s16le" }])
    assert.equal(selected.format, undefined)
  }).pipe(Effect.provide(media), Effect.timeout("15 seconds"))
)
assert.equal(received, payload.length)
assert.equal(
  hash.digest("hex"),
  createHash("sha256").update(payload).digest("hex")
)
assert.equal(finalProgress, "end")
