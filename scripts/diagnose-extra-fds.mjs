import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { PassThrough } from "node:stream"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Real subprocess/socket diagnostic. Never converts errors to EOF.
// Usage: node|bun this.mjs [--mode both|plain|halfclose] [--trials 6]
//        [--bytes 4194304] [--hold-ms 100] [--delay-ms 2]
//        [--deadline-ms 15000] [--ffmpeg /path/to/ffmpeg]
const args = process.argv.slice(2)
const config = {
  mode: "both",
  trials: 6,
  bytes: 4 * 1024 * 1024,
  "hold-ms": 100,
  "delay-ms": 2,
  "deadline-ms": 15000,
  ffmpeg: undefined
}
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace(/^--/, "")
  if (!(key in config) || args[i + 1] === undefined)
    throw new Error(`Unknown/missing argument: ${args[i]}`)
  config[key] =
    typeof config[key] === "number" ? Number(args[i + 1]) : args[i + 1]
}
if (!["both", "plain", "halfclose"].includes(config.mode))
  throw new Error("Invalid mode")
for (const key of ["trials", "bytes", "hold-ms", "delay-ms", "deadline-ms"]) {
  if (
    !Number.isSafeInteger(config[key]) ||
    config[key] < (["trials", "bytes", "deadline-ms"].includes(key) ? 1 : 0)
  ) {
    throw new Error(`Invalid ${key}`)
  }
}
if (config.ffmpeg && config.bytes % 4 !== 0)
  throw new Error("FFmpeg PCM payload must have a multiple of 4 bytes")
function byteAt(p) {
  let x = Math.imul(p ^ (p >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return (x ^ (x >>> 16)) & 255
}
const expected = Buffer.alloc(config.bytes)
for (let i = 0; i < expected.length; i++) expected[i] = byteAt(i)
const expectedSha256 = createHash("sha256").update(expected).digest("hex")
const modes = config.mode === "both" ? ["plain", "halfclose"] : [config.mode]
let scratch
let file
if (config.ffmpeg) {
  scratch = mkdtempSync(join(tmpdir(), "ffmpegu-fd-diagnostic-"))
  file = join(scratch, "input.s16le")
  writeFileSync(file, expected)
}
const writer = `
const { writeSync } = require('node:fs');
const total = Number(process.argv[1]);
function byteAt(p) {
  let x = Math.imul(p ^ (p >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) & 255;
}
for (let pos = 0; pos < total;) {
  const chunk = Buffer.alloc(Math.min(65536, total - pos));
  for (let i = 0; i < chunk.length; i++) chunk[i] = byteAt(pos + i);
  let written = 0;
  while (written < chunk.length) written += writeSync(4, chunk, written, chunk.length - written);
  pos += chunk.length;
}
process.exit(0);
`
function run(mode, trial) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = config.ffmpeg
      ? spawn(
          config.ffmpeg,
          [
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-f",
            "s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-i",
            file,
            "-c:a",
            "copy",
            "-f",
            "s16le",
            "pipe:4"
          ],
          { stdio: ["ignore", "ignore", "pipe", "ignore", "pipe"] }
        )
      : spawn(process.execPath, ["-e", writer, String(config.bytes)], {
          stdio: ["ignore", "ignore", "pipe", "ignore", "pipe"]
        })
    const socket = child.stdio[4]
    const through = new PassThrough()
    const digest = createHash("sha256")
    const errors = []
    const events = []
    const counts = { pauses: 0, resumes: 0, chunks: 0 }
    let received = 0,
      firstMismatch = -1,
      exitCode = null,
      signal = null
    let childExited = false,
      readClosed = false,
      socketEnded = false
    let timedOut = false,
      done = false,
      resumeTimer,
      deadline,
      stderr = ""
    function event(name) {
      events.push({ event: name, ms: Date.now() - started, received })
    }
    function error(source, err) {
      errors.push({
        source,
        message: err.message,
        code: err.code,
        errno: err.errno,
        syscall: err.syscall,
        stack: err.stack
      })
      event(`${source}:error`)
    }
    function finish() {
      if (done || !childExited || !readClosed) return
      done = true
      clearTimeout(deadline)
      clearTimeout(resumeTimer)
      // Extra fd sockets have no reason to retain either endpoint after inspection.
      socket?.destroy()
      through.destroy()
      child.stderr?.destroy()
      const sha256 = digest.digest("hex")
      const exactBytes =
        received === config.bytes &&
        firstMismatch === -1 &&
        sha256 === expectedSha256
      resolve({
        mode,
        trial,
        pid: child.pid,
        received,
        expectedBytes: config.bytes,
        firstMismatch,
        sha256,
        expectedSha256,
        exactBytes,
        exitCode,
        signal,
        timedOut,
        errors,
        stderr,
        counts,
        events,
        ok:
          exactBytes &&
          exitCode === 0 &&
          errors.length === 0 &&
          socketEnded &&
          !timedOut
      })
    }
    child.once("error", (err) => {
      error("child", err)
      childExited = true
      through.destroy()
      finish()
    })
    child.once("exit", (code, sig) => {
      childExited = true
      exitCode = code
      signal = sig
      event("child:exit")
      finish()
    })
    child.once("close", () => event("child:close"))
    child.stderr?.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-8192)
    })
    child.stderr?.on("error", (err) => error("stderr", err))
    through.on("error", (err) => error("passThrough", err))
    through.once("end", () => {
      event("passThrough:end")
      readClosed = true
      finish()
    })
    through.once("close", () => {
      event("passThrough:close")
      readClosed = true
      finish()
    })
    through.on("data", (chunk) => {
      digest.update(chunk)
      if (firstMismatch === -1) {
        for (let i = 0; i < chunk.length; i++) {
          if (
            received + i >= config.bytes ||
            chunk[i] !== byteAt(received + i)
          ) {
            firstMismatch = received + i
            break
          }
        }
      }
      received += chunk.length
      counts.chunks++
      through.pause()
      resumeTimer = setTimeout(
        () => through.resume(),
        counts.chunks === 1 ? config["hold-ms"] : config["delay-ms"]
      )
    })
    if (socket) {
      socket.on("error", (err) => {
        error("socket", err)
        through.destroy(err)
      })
      socket.once("end", () => {
        socketEnded = true
        event("socket:end")
      })
      socket.once("close", (hadError) => {
        event(`socket:close:${hadError}`)
        // A close without end is not EOF; avoid hanging the diagnostic when pipe() cannot forward it.
        if (!socketEnded && !through.destroyed)
          through.destroy(new Error("Socket closed before readable end"))
      })
      socket.once("finish", () => event("socket:finish"))
      socket.on("pause", () => counts.pauses++)
      socket.on("resume", () => counts.resumes++)
      socket.pipe(through)
      // Half-close only the unused parent-to-child direction, after error handlers and pipe exist.
      if (mode === "halfclose") socket.end()
    } else {
      error("setup", new Error("No extra fd socket"))
      through.destroy()
    }
    deadline = setTimeout(() => {
      timedOut = true
      event("deadline")
      child.kill("SIGKILL")
      socket?.destroy()
      through.destroy()
      // Child exit is still awaited after SIGKILL, so no subprocess is abandoned.
      finish()
    }, config["deadline-ms"])
  })
}
console.log(
  JSON.stringify({
    runtime: process.versions.bun
      ? `bun ${process.versions.bun}`
      : `node ${process.versions.node}`,
    platform: process.platform,
    arch: process.arch,
    config,
    expectedSha256
  })
)
let failed = 0
try {
  for (let trial = 1; trial <= config.trials; trial++) {
    for (const mode of modes) {
      const result = await run(mode, trial)
      console.log(JSON.stringify(result))
      if (!result.ok) failed++
    }
  }
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true })
}
console.log(
  JSON.stringify({ summary: true, runs: config.trials * modes.length, failed })
)
process.exitCode = failed ? 1 : 0
