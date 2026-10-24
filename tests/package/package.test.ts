import { spawnSync } from "node:child_process"
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// Exercises the packed tarball from a separate consumer project, so it needs
// a fresh `pnpm run build` and runs only through `pnpm run test:package`.
const root = resolve(import.meta.dirname, "../..")
let consumer: string

const execute = (
  binary: string,
  args: ReadonlyArray<string>,
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
) => {
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? consumer,
    env: options.env,
    encoding: "utf8"
  })
  if (result.error) throw result.error
  expect(
    result.status,
    `${binary} ${args.join(" ")}\n${result.stdout}${result.stderr}`
  ).toBe(0)
}

beforeAll(() => {
  consumer = mkdtempSync(join(tmpdir(), "ffmpegu-package-"))
  const tarball = join(consumer, "ffmpegu.tgz")
  execute("pnpm", ["pack", "--silent", "--out", tarball], { cwd: root })
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" })
  )
  const installedVersion = (name: string) =>
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
  cpSync(join(import.meta.dirname, "fixtures"), consumer, { recursive: true })
})

afterAll(() => {
  if (consumer) rmSync(consumer, { recursive: true, force: true })
})

describe("published declarations", () => {
  const typecheck = (file: string, flags: ReadonlyArray<string>) =>
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
  // Effect's declarations need the DOM and disposable libs.
  const lib = "es2024,dom,esnext.disposable"

  it("type-check the public API", () => {
    typecheck("consumer.ts", ["--skipLibCheck"])
  })

  // Duration values must type-check whether or not the consumer's lib
  // declares Temporal. These checks include the package declarations: with
  // skipLibCheck, an unresolved Temporal reference would pass silently.
  it("accept Effect durations without the Temporal lib", () => {
    typecheck("duration.ts", ["--lib", lib])
  })

  it("accept Temporal durations with the Temporal lib", () => {
    typecheck("temporal.ts", ["--lib", `${lib},esnext.temporal`])
  })
})

// CI's runtime matrix narrows this to the job's runtime.
const selected = process.env.FFMPEGU_PACKAGE_RUNTIME
const runtimes = (["node", "bun"] as const).filter(
  (runtime) => !selected || runtime === selected
)
if (runtimes.length === 0) {
  throw new Error(`Unsupported package test runtime: ${selected}`)
}

describe.each(runtimes)("installed package on %s", (runtime) => {
  it("transfers bytes, writes and probes a WAV, and completes progress", () => {
    execute(
      runtime === "node" ? process.execPath : "bun",
      runtime === "bun" ? ["--bun", "consumer.mjs"] : ["consumer.mjs"],
      { env: { ...process.env, FFMPEGU_PACKAGE_RUNTIME: runtime } }
    )
  })
})
