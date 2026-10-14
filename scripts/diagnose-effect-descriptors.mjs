import { spawn } from "node:child_process"
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { constants } from "node:os"
import { parseArgs } from "node:util"

// Diagnostic only: test a proposed upstream adapter change against the real
// integration suite. This does not change the installed package's support.
const { values } = parseArgs({
  options: {
    trials: { type: "string", default: "3" },
    "timeout-ms": { type: "string", default: "60000" }
  }
})
const positive = (name) => {
  const value = Number(values[name])
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`)
  }
  return value
}
const trials = positive("trials")
const timeoutMs = positive("timeout-ms")
// CI runners escalate a cancelled step to SIGKILL within seconds, so the
// SIGTERM grace must leave time to kill the suite and restore the adapter.
const graceMs = 3000

const require = createRequire(import.meta.resolve("@effect/platform-node"))
const adapter =
  require.resolve("@effect/platform-node-shared/NodeChildProcessSpawner")
const original = readFileSync(adapter, "utf8")
const anchor = "nodeStream.pipe(passThrough);"
if (original.split(anchor).length !== 2) {
  throw new Error("Adapter changed: expected exactly one output pipe setup")
}
// A SIGKILLed earlier run can leave the experiment installed; the baseline
// would then silently measure the patched adapter.
if (original.includes("nodeStream.end()")) {
  throw new Error(
    "Adapter already half-closes output streams; reinstall dependencies first"
  )
}
const halfclose = original.replace(
  anchor,
  `${anchor}\n              if ("end" in nodeStream) nodeStream.end();`
)
const replace = (text) => {
  // pnpm hard-links node_modules files to its global content store. Renaming
  // a new inode over the path patches only this checkout; writing in place
  // would corrupt the shared store copy for every other project.
  const temporary = `${adapter}.diagnostic-${process.pid}`
  writeFileSync(temporary, text)
  renameSync(temporary, adapter)
}

let interrupted = null
let current = null
const signals = ["SIGINT", "SIGTERM", "SIGHUP"]
const onSignal = (signal) => {
  // A repeated signal means the caller is out of patience: skip the grace.
  if (interrupted) return current?.kill()
  interrupted = signal
  console.error(`${signal}: stopping the suite and restoring the adapter`)
  current?.stop()
}

const runTrial = (mode, trial) =>
  new Promise((resolve, reject) => {
    // Own process group so termination also reaches vitest workers. A
    // background group must not read the terminal, so no stdin.
    const child = spawn(
      "bun",
      ["--bun", "node_modules/vitest/vitest.mjs", "run", "--coverage"],
      {
        detached: true,
        stdio: ["ignore", "inherit", "inherit"],
        env: { ...process.env, FFMPEGU_TEST_RUNTIME: "bun" }
      }
    )
    const group = (signal) => {
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        // Throwing from a timer or exit listener would skip the restore.
        if (error.code !== "ESRCH") console.error(error)
      }
    }
    let timedOut = false
    let escalation
    const stop = () => {
      if (escalation) return
      group("SIGTERM")
      escalation = setTimeout(() => group("SIGKILL"), graceMs)
    }
    const deadline = setTimeout(() => {
      timedOut = true
      console.error(`Trial exceeded ${timeoutMs}ms; terminating`)
      stop()
    }, timeoutMs)
    const settle = () => {
      clearTimeout(deadline)
      clearTimeout(escalation)
      current = null
    }
    child.once("error", (error) => {
      settle()
      reject(error)
    })
    child.once("exit", (status, signal) => {
      settle()
      // Workers may outlive a terminated leader and keep writing output.
      if (timedOut || interrupted) group("SIGKILL")
      resolve({ mode, trial, status, signal, timedOut })
    })
    // A failed spawn has no PID or group; its error event rejects instead.
    if (child.pid) current = { stop, kill: () => group("SIGKILL") }
  })

const results = []
const run = async (mode) => {
  for (let trial = 1; trial <= trials && !interrupted; trial++) {
    console.log(`Full-suite trial ${trial}/${trials} with ${mode} adapter`)
    results.push(await runTrial(mode, trial))
  }
}
for (const signal of signals) process.on(signal, onSignal)
let patched = false
try {
  await run("original")
  if (!interrupted) {
    replace(halfclose)
    patched = true
    console.log(
      "EXPERIMENT: half-close output descriptors in the Effect adapter"
    )
    await run("halfclose")
  }
} finally {
  if (patched) replace(original)
  for (const signal of signals) process.off(signal, onSignal)
}
console.log(
  JSON.stringify({
    experiment: "Effect output descriptor",
    interrupted,
    results
  })
)
process.exitCode = interrupted
  ? 128 + constants.signals[interrupted]
  : results.some((result) => result.timedOut || result.status !== 0)
    ? 1
    : 0
