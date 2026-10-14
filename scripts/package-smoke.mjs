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
  const effectVersion = JSON.parse(
    readFileSync(join(root, "node_modules/effect/package.json"), "utf8")
  ).version
  execute("pnpm", [
    "add",
    "--ignore-scripts",
    "--save-exact",
    tarball,
    `effect@${effectVersion}`
  ])
  writeFileSync(
    join(temporary, "smoke.mjs"),
    `
import assert from 'node:assert/strict'
import { Effect, Result } from 'effect'
import { Command, Input, Output, Options, FFmpeg, FFprobe, run, probe } from 'ffmpegu'
const input = Input.fromFile('input.mp4')
const command = Command.make({ inputs: [input], outputs: [Output.toFile('output.mp4', Options.create({map: input.video}))] })
assert.equal(Result.isSuccess(command.compile()), true)
assert.equal(Effect.isEffect(run(command)), true)
assert.equal(Effect.isEffect(probe('input.mp4')), true)
assert.equal(typeof FFmpeg.layer, 'function')
assert.equal(typeof FFprobe.layer, 'function')
const expected = process.env.FFMPEGU_PACKAGE_RUNTIME
if (expected) assert.equal(process.versions.bun ? 'bun' : 'node', expected)
console.log('Installed package imports successfully on ' + (process.versions.bun ? 'Bun' : 'Node'))
`
  )
  writeFileSync(
    join(temporary, "smoke.ts"),
    `
import { Effect, Sink, Stream } from 'effect'
import { Command, FFmpeg, Input, Output, run } from 'ffmpegu'
const command = Command.make({ inputs: [Input.fromStream(Stream.empty)], outputs: [Output.toSink(Sink.drain)] })
const execution: Effect.Effect<unknown, unknown, FFmpeg> = run(command)
void execution
`
  )
  execute(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "nodenext",
    "--target",
    "es2024",
    "smoke.ts"
  ])
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
