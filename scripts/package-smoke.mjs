import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const temporary = mkdtempSync(join(tmpdir(), "ffmpegu-package-"))
function execute(binary, args, cwd = temporary) {
  const result = spawnSync(binary, args, { cwd, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${binary} exited with ${result.status}`)
}
try {
  const tarball = join(temporary, "ffmpegu.tgz")
  execute("pnpm", ["pack", "--silent", "--out", tarball], root)
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({ private: true, type: "module" })
  )
  const installedVersion = (name) =>
    JSON.parse(
      readFileSync(join(root, "node_modules", name, "package.json"), "utf8")
    ).version
  execute("pnpm", [
    "add",
    "--ignore-scripts",
    "--save-exact",
    tarball,
    ...["effect", "@effect/platform-node", "@effect/platform-bun"].map(
      (name) => `${name}@${installedVersion(name)}`
    )
  ])
  writeFileSync(
    join(temporary, "smoke.mjs"),
    `
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Duration, Effect, Layer, Result, Sink, Stream } from 'effect'
import { Command, Input, Output, Options, FFmpeg, FFprobe, run, probe, probeWith, options } from 'ffmpegu'
const input = Input.fromFile('input.mp4')
const command = Command.make({ inputs: [input], outputs: [Output.toFile('output.mp4', Options.create({map: input.video}))] })
assert.equal(Result.isSuccess(command.compile()), true)
const timed = Command.make({ global: Options.merge(options.startTime(Duration.millis(1500)), options.duration(Temporal.Duration.from({ seconds: 2, microseconds: 5 }))) })
assert.deepEqual(Result.getOrThrow(timed.compile()).args, ['-ss', '00:00:01.500', '-t', '00:00:02.000005'])
assert.equal(Effect.isEffect(run(command)), true)
assert.equal(Effect.isEffect(probe('input.mp4')), true)
assert.equal(typeof FFmpeg.layer, 'function')
assert.equal(typeof FFprobe.layer, 'function')
const expected = process.env.FFMPEGU_PACKAGE_RUNTIME
if (expected) assert.equal(process.versions.bun ? 'bun' : 'node', expected)
const platform = process.versions.bun
  ? (await import('@effect/platform-bun')).BunServices.layer
  : (await import('@effect/platform-node')).NodeServices.layer
const media = Layer.mergeAll(FFmpeg.layer(), FFprobe.layer()).pipe(Layer.provide(platform))
const payload = Uint8Array.from({ length: 1024 * 1024 }, (_, i) => (i * 31 + (i >>> 8)) & 255)
const chunks = Array.from({ length: 16 }, (_, i) => payload.subarray(i * 65536, (i + 1) * 65536))
const hash = createHash('sha256')
let received = 0
let finalProgress
const source = Input.fromStream(Stream.fromIterable(chunks), Options.create({ f: 's16le', ar: 48000, ac: 2 }))
const transfer = Command.make({
  global: Options.create('-y'),
  inputs: [source],
  outputs: [
    Output.toSink(Sink.forEach(bytes => Effect.sync(() => { received += bytes.length; hash.update(bytes) })),
      Options.create({ map: source.audio, f: 's16le', 'c:a': 'copy' })),
    Output.toFile('output.wav', Options.create({ map: source.audio, f: 'wav', 'c:a': 'copy' }))
  ]
})
await Effect.runPromise(Effect.gen(function* () {
  yield* run(transfer, { onProgress: p => Effect.sync(() => { finalProgress = p.progress }) })
  const metadata = yield* probe('output.wav')
  assert.equal(metadata.streams[0]?.codec_name, 'pcm_s16le')
  assert.equal(metadata.streams[0]?.channels, 2)
  const selected = yield* probeWith('output.wav', Options.create({ show_entries: 'stream=codec_name', protocol_whitelist: 'file', v: 'quiet' }))
  assert.deepEqual(selected.streams, [{ codec_name: 'pcm_s16le' }])
  assert.equal(selected.format, undefined)
}).pipe(Effect.provide(media), Effect.timeout('15 seconds')))
assert.equal(received, payload.length)
assert.equal(hash.digest('hex'), createHash('sha256').update(payload).digest('hex'))
assert.equal(finalProgress, 'end')
console.log('Installed package transferred 1 MiB byte-for-byte, wrote and probed WAV, and completed progress on ' + (process.versions.bun ? 'Bun' : 'Node'))
`
  )
  writeFileSync(
    join(temporary, "smoke.ts"),
    `
import { Effect, Sink, Stream } from 'effect'
import { Command, FFmpeg, FFprobe, Input, Options, Output, ProjectedProbeResult, probeWith, run } from 'ffmpegu'
const command = Command.make({ inputs: [Input.fromStream(Stream.empty)], outputs: [Output.toSink(Sink.drain)] })
const execution: Effect.Effect<unknown, unknown, FFmpeg> = run(command)
void execution
const selected: Effect.Effect<ProjectedProbeResult, unknown, FFprobe> = probeWith('input.mp4', Options.create({ show_entries: 'stream=codec_name' }))
void selected
`
  )
  // Duration values must type-check whether or not the consumer's lib
  // declares Temporal. These checks include the package declarations: with
  // skipLibCheck, an unresolved Temporal reference would pass silently.
  writeFileSync(
    join(temporary, "smoke-duration.ts"),
    `
import { Duration } from 'effect'
import { filters, options } from 'ffmpegu'
options.startTime(Duration.seconds(1))
filters.atrim({ duration: Duration.millis(500) })
`
  )
  writeFileSync(
    join(temporary, "smoke-temporal.ts"),
    `
import { filters, options } from 'ffmpegu'
options.startTime(Temporal.Duration.from({ seconds: 1 }))
filters.atrim({ duration: Temporal.Duration.from({ milliseconds: 500 }) })
`
  )
  const typecheck = (file, flags) =>
    execute(process.execPath, [
      join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--module",
      "nodenext",
      "--target",
      "es2024",
      "--types",
      "",
      ...flags,
      file
    ])
  typecheck("smoke.ts", ["--skipLibCheck"])
  // Effect's declarations need the DOM and disposable libs.
  const lib = "es2024,dom,esnext.disposable"
  typecheck("smoke-duration.ts", ["--lib", lib])
  typecheck("smoke-temporal.ts", ["--lib", `${lib},esnext.temporal`])
  const runtimes = process.env.FFMPEGU_PACKAGE_RUNTIME
    ? [process.env.FFMPEGU_PACKAGE_RUNTIME]
    : ["node", "bun"]
  for (const runtime of runtimes) {
    if (runtime !== "node" && runtime !== "bun")
      throw new Error(`Unsupported package test runtime: ${runtime}`)
    execute(
      runtime === "node" ? process.execPath : "bun",
      runtime === "bun" ? ["--bun", "smoke.mjs"] : ["smoke.mjs"]
    )
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
