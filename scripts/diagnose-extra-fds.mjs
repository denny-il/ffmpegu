import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { PassThrough } from "node:stream"
import { mkdtempSync, openSync, writeSync, closeSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// No Effect or ffmpegu imports: compare the same real subprocess with only its
// output socket's unused writable half changed. Errors never become EOF.
// Usage: node|bun this.mjs --ffmpeg /path/to/ffmpeg [--trials 20]
// Defaults match streaming.test.ts's delayed producer / delayed consumer.
// Controls: --mode both|plain|halfclose --input stream|file
//           --collector pull|flow --progress drain|off --producer-ms 2
//           --delay-ms 1 --hold-ms 0 --bytes 4194304 --deadline-ms 15000
// Without --ffmpeg, a real child writes deterministic bytes directly to fd4.
const config = {
  mode: "both",
  trials: 6,
  bytes: 4 * 1024 * 1024,
  input: "stream",
  collector: "pull",
  progress: "drain",
  "producer-ms": 2,
  "delay-ms": 1,
  "hold-ms": 0,
  "deadline-ms": 15000,
  ffmpeg: undefined
}
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace(/^--/, "")
  if (!Object.hasOwn(config, key) || args[i + 1] === undefined)
    throw new Error(`Unknown/missing argument: ${args[i]}`)
  config[key] =
    typeof config[key] === "number" ? Number(args[i + 1]) : args[i + 1]
}
for (const [key, choices] of Object.entries({
  mode: ["both", "plain", "halfclose"],
  input: ["stream", "file"],
  collector: ["pull", "flow"],
  progress: ["drain", "off"]
}))
  if (!choices.includes(config[key])) throw new Error(`Invalid ${key}`)
for (const key of [
  "trials",
  "bytes",
  "producer-ms",
  "hold-ms",
  "delay-ms",
  "deadline-ms"
]) {
  if (
    !Number.isSafeInteger(config[key]) ||
    config[key] < (["trials", "bytes", "deadline-ms"].includes(key) ? 1 : 0)
  )
    throw new Error(`Invalid ${key}`)
}
if (config.ffmpeg && config.bytes % 4 !== 0)
  throw new Error("FFmpeg PCM payload must have a multiple of 4 bytes")

const CHUNK_SIZES = [1, 3, 4093, 65536, 17, 131072, 999, 32768, 7, 250000]
function byteAt(p) {
  let x = Math.imul(p ^ (p >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return (x ^ (x >>> 16)) & 255
}
function bytesAt(offset, length) {
  const chunk = Buffer.alloc(length)
  for (let i = 0; i < length; i++) chunk[i] = byteAt(offset + i)
  return chunk
}
// Hash the expected payload incrementally; the streamed path retains no full payload.
const expectedDigest = createHash("sha256")
for (let pos = 0; pos < config.bytes; pos += 65536)
  expectedDigest.update(bytesAt(pos, Math.min(65536, config.bytes - pos)))
const expectedSha256 = expectedDigest.digest("hex")
const modes = config.mode === "both" ? ["plain", "halfclose"] : [config.mode]
let scratch, file
if (config.ffmpeg && config.input === "file") {
  scratch = mkdtempSync(join(tmpdir(), "ffmpegu-fd-diagnostic-"))
  file = join(scratch, "input.s16le")
  const fd = openSync(file, "w")
  try {
    for (let pos = 0; pos < config.bytes; pos += 65536) {
      const chunk = bytesAt(pos, Math.min(65536, config.bytes - pos))
      for (let written = 0; written < chunk.length;)
        written += writeSync(fd, chunk, written, chunk.length - written)
    }
  } finally {
    closeSync(fd)
  }
}
const writer = `
const { writeSync } = require('node:fs');
const total = Number(process.argv[1]);
${byteAt.toString()}
for (let pos = 0; pos < total;) {
  const chunk = Buffer.alloc(Math.min(65536, total - pos));
  for (let i = 0; i < chunk.length; i++) chunk[i] = byteAt(pos + i);
  for (let written = 0; written < chunk.length;)
    written += writeSync(4, chunk, written, chunk.length - written);
  pos += chunk.length;
}
process.exit(0);
`

async function run(mode, trial) {
  const started = Date.now()
  const controller = new AbortController()
  const { signal: cancellation } = controller
  const errors = [],
    events = [],
    descriptors = []
  const identities = new Map()
  const counts = {
    pauses: 0,
    resumes: 0,
    chunks: 0,
    batches: 0,
    maxBatchBytes: 0,
    produced: 0,
    written: 0,
    producerChunks: 0,
    drainWaits: 0,
    progressBytes: 0
  }
  const digest = createHash("sha256")
  let received = 0,
    firstMismatch = -1,
    exitCode = null,
    signal = null
  let timedOut = false,
    childExited = false,
    stderr = "",
    progressTail = ""
  const event = (name) =>
    events.push({ event: name, ms: Date.now() - started, received })
  function recordError(source, err) {
    if (!identities.has(err)) identities.set(err, identities.size + 1)
    errors.push({
      source,
      id: identities.get(err),
      message: err.message,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      stack: err.stack
    })
    event(`${source}:error`)
  }
  function stop(reason) {
    if (!cancellation.aborted) controller.abort(reason)
    for (const { socket, through } of descriptors) {
      socket?.destroy()
      through.destroy()
    }
    child.stdin?.destroy()
    child.stdio[4]?.destroy()
    if (!childExited && child.pid) child.kill("SIGKILL")
  }
  function sleep(ms) {
    if (cancellation.aborted) return Promise.reject(cancellation.reason)
    if (ms === 0) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cancellation.removeEventListener("abort", abort)
        resolve()
      }, ms)
      function abort() {
        clearTimeout(timer)
        reject(cancellation.reason)
      }
      cancellation.addEventListener("abort", abort, { once: true })
    })
  }
  function waitFor(stream, name) {
    if (cancellation.aborted) return Promise.reject(cancellation.reason)
    return new Promise((resolve, reject) => {
      function clean() {
        stream.off(name, success)
        stream.off("error", failure)
        stream.off("close", closed)
        cancellation.removeEventListener("abort", abort)
      }
      function success() {
        clean()
        resolve()
      }
      function failure(err) {
        clean()
        reject(err)
      }
      function closed() {
        failure(stream.errored ?? new Error(`Stream closed before ${name}`))
      }
      function abort() {
        failure(cancellation.reason)
      }
      stream.once(name, success)
      stream.once("error", failure)
      stream.once("close", closed)
      cancellation.addEventListener("abort", abort, { once: true })
    })
  }

  const streamed = Boolean(config.ffmpeg) && config.input === "stream"
  const progress = Boolean(config.ffmpeg) && config.progress === "drain"
  const outputFd = config.ffmpeg ? 5 : 4
  const command = config.ffmpeg ?? process.execPath
  const commandArgs = config.ffmpeg
    ? [
        "-nostdin",
        ...(progress ? ["-progress", "pipe:3", "-nostats"] : []),
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-i",
        streamed ? "pipe:4" : file,
        "-c:a",
        "copy",
        "-f",
        "s16le",
        "pipe:5"
      ]
    : ["-e", writer, String(config.bytes)]
  const stdio = [
    "ignore",
    "ignore",
    "pipe",
    progress ? "pipe" : "ignore",
    streamed ? "pipe" : "ignore"
  ]
  stdio[outputFd] = "pipe"
  const child = spawn(command, commandArgs, { stdio })
  let resolveSpawn
  const spawned = new Promise((resolve) => {
    resolveSpawn = resolve
  })
  child.once("spawn", () => {
    event("child:spawn")
    resolveSpawn(true)
  })
  const childDone = new Promise((resolve) => {
    child.once("error", (err) => {
      recordError("child", err)
      resolveSpawn(false)
      // ENOENT/EACCES spawn failures never emit exit and have no PID to reap.
      if (!child.pid) {
        childExited = true
        resolve()
      }
      stop(err)
    })
    child.once("exit", (code, sig) => {
      childExited = true
      exitCode = code
      signal = sig
      event("child:exit")
      resolve()
    })
  })
  child.once("close", () => event("child:close"))
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-8192)
  })
  child.stderr?.on("error", (err) => recordError("stderr", err))
  const deadline = setTimeout(() => {
    timedOut = true
    event("deadline")
    const err = Object.assign(new Error("Diagnostic deadline exceeded"), {
      code: "DIAGNOSTIC_DEADLINE"
    })
    recordError("deadline", err)
    stop(err)
  }, config["deadline-ms"])

  // The Effect adapter acquires the child on its spawn event before setting
  // up descriptor streams. Bun also returns null stdio on an ENOENT spawn.
  if (!(await spawned)) {
    clearTimeout(deadline)
    await childDone
    child.stderr?.destroy()
    return result()
  }

  function output(fd, consume, collector, halfclose) {
    const socket = child.stdio[fd]
    const through = new PassThrough()
    const descriptor = { socket, through, ended: false }
    descriptors.push(descriptor)
    let failure,
      readableEnded = false,
      wake
    const notify = () => {
      const ready = wake
      wake = undefined
      ready?.()
    }
    through.on("error", (err) => {
      failure = err
      recordError(`fd${fd}:passThrough`, err)
      notify()
    })
    through.once("end", () => {
      readableEnded = true
      event(`fd${fd}:passThrough:end`)
      notify()
    })
    through.once("close", () => {
      if (!readableEnded && !failure)
        failure =
          cancellation.reason ??
          Object.assign(new Error("Readable closed before end"), {
            code: "ERR_STREAM_PREMATURE_CLOSE"
          })
      event(`fd${fd}:passThrough:close`)
      notify()
    })
    if (socket) {
      socket.on("error", (err) => {
        recordError(`fd${fd}:socket`, err)
        through.destroy(err)
      })
      socket.once("end", () => {
        descriptor.ended = true
        event(`fd${fd}:socket:end`)
      })
      socket.once("close", (hadError) => {
        event(`fd${fd}:socket:close:${hadError}`)
        if (!descriptor.ended && !through.destroyed)
          through.destroy(
            socket.errored ??
              Object.assign(new Error("Socket closed before readable end"), {
                code: "ERR_STREAM_PREMATURE_CLOSE"
              })
          )
      })
      socket.once("finish", () => event(`fd${fd}:socket:finish`))
      if (fd === outputFd) {
        socket.on("pause", () => counts.pauses++)
        socket.on("resume", () => counts.resumes++)
      }
      // Match setupAdditionalFds: preserve default buffer sizes and error forwarding.
      socket.pipe(through)
      if (halfclose) socket.end()
    } else through.destroy(new Error(`Missing fd${fd} socket`))

    if (collector === "flow") {
      return new Promise((resolve, reject) => {
        let chain = Promise.resolve()
        through.on("data", (chunk) => {
          through.pause()
          chain = chain.then(() => consume(chunk)).then(() => through.resume())
          chain.catch(reject)
        })
        through.once("end", () => chain.then(resolve, reject))
        through.once("error", reject)
        through.once("close", () => {
          if (!readableEnded) reject(failure)
        })
      })
    }
    // Match NodeStream.readableToPullUnsafe: readable wakes a latch, each pull
    // read()s until null, then the sink processes every buffer in that batch.
    // No further pull runs during sink delays; no batches are queued in parallel.
    through.on("readable", notify)
    return (async () => {
      for (;;) {
        if (cancellation.aborted) throw cancellation.reason
        const item = through.read()
        if (item === null) {
          if (failure) throw failure
          if (readableEnded || through.readableEnded) return
          await new Promise((resolve) => {
            wake = resolve
          })
          continue
        }
        const batch = [item]
        for (let next; (next = through.read()) !== null;) batch.push(next)
        if (fd === outputFd) {
          counts.batches++
          counts.maxBatchBytes = Math.max(
            counts.maxBatchBytes,
            batch.reduce((sum, chunk) => sum + chunk.length, 0)
          )
        }
        for (const chunk of batch) await consume(chunk)
      }
    })()
  }
  function guarded(source, work) {
    return work.catch((err) => {
      recordError(source, err)
      stop(err)
    })
  }
  const mediaDone = guarded(
    "consumer",
    output(
      outputFd,
      async (chunk) => {
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
        if (counts.chunks === 1) await sleep(config["hold-ms"])
        await sleep(config["delay-ms"])
      },
      config.collector,
      mode === "halfclose"
    )
  )
  const progressDone = progress
    ? guarded(
        "progress",
        output(
          3,
          async (chunk) => {
            counts.progressBytes += chunk.length
            progressTail = (progressTail + chunk.toString()).slice(-4096)
          },
          "pull",
          false
        )
      )
    : Promise.resolve()
  const producerDone = streamed
    ? guarded(
        "producer",
        (async () => {
          const input = child.stdio[4]
          input.on("error", (err) => {
            recordError("fd4:input", err)
            stop(err)
          })
          input.once("finish", () => event("fd4:input:finish"))
          let offset = 0,
            index = 0
          async function next() {
            if (offset === config.bytes) return undefined
            await sleep(config["producer-ms"])
            const length = Math.min(
              CHUNK_SIZES[index++ % CHUNK_SIZES.length],
              config.bytes - offset
            )
            const chunk = bytesAt(offset, length)
            offset += length
            counts.produced += length
            counts.producerChunks++
            return chunk
          }
          // One chunk can be prefetched while a previous write waits for drain;
          // producer data is bounded rather than accumulated into a payload queue.
          let pending = next()
          for (;;) {
            const chunk = await pending
            if (!chunk) break
            pending = next()
            // Observe a cancelled prefetch even if the current write fails first.
            pending.catch(() => {})
            if (!input.write(chunk)) {
              counts.drainWaits++
              await waitFor(input, "drain")
            }
            counts.written += chunk.length
          }
          const finished = waitFor(input, "finish")
          input.end()
          await finished
        })()
      )
    : Promise.resolve()

  try {
    // Child exit alone is insufficient: buffers already pulled into a batch
    // still belong to the sink, and their delays must finish before hashing.
    await Promise.all([childDone, producerDone, mediaDone, progressDone])
  } finally {
    clearTimeout(deadline)
    for (const { socket, through } of descriptors) {
      socket?.destroy()
      through.destroy()
    }
    if (streamed) child.stdio[4]?.destroy()
    child.stderr?.destroy()
  }
  return result()

  function result() {
    const sha256 = digest.digest("hex")
    const exactBytes =
      received === config.bytes &&
      firstMismatch === -1 &&
      sha256 === expectedSha256
    return {
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
      progressEnded: progress
        ? /(?:^|\n)progress=end(?:\r?\n|$)/.test(progressTail)
        : null,
      ok:
        exactBytes &&
        exitCode === 0 &&
        errors.length === 0 &&
        !timedOut &&
        descriptors.every((descriptor) => descriptor.ended) &&
        (!progress || /(?:^|\n)progress=end(?:\r?\n|$)/.test(progressTail))
    }
  }
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
