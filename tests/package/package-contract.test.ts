import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

describe.sequential("Package contract", { timeout: 120_000 }, () => {
  it("should import and typecheck from the packed consumer entrypoint", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ffmpegu-package-"))
    const consumerDir = join(tempDir, "consumer")
    const packageDir = join(consumerDir, "node_modules", "ffmpegu")

    try {
      await execFileAsync("pnpm", ["pack", "--pack-destination", tempDir], {
        cwd: repoRoot
      })

      const tarball = (await readdir(tempDir)).find((file) =>
        file.endsWith(".tgz")
      )

      expect(tarball).toBeDefined()

      await mkdir(packageDir, { recursive: true })
      await execFileAsync(
        "tar",
        [
          "-xzf",
          join(tempDir, tarball!),
          "-C",
          packageDir,
          "--strip-components=1"
        ],
        { cwd: repoRoot }
      )

      await expectRuntimeImport(consumerDir)
      await expectConsumerTypecheck(consumerDir)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

async function expectRuntimeImport(consumerDir: string) {
  const runtimeScript = `
    import ffmpegu, { ffmpegu as named, FFmpeguOptions } from "ffmpegu"

    if (ffmpegu !== named) throw new Error("default export mismatch")
    if (typeof FFmpeguOptions.create !== "function") throw new Error("missing options export")

    const command = ffmpegu.command({
      global: ffmpegu.options.overwrite(),
      inputs: [ffmpegu.input.fromFile("input.mp4")],
      outputs: [ffmpegu.output.toFile("output.mp4")]
    })
    const compiled = await command.compile()

    if (compiled.args.join(" ") !== "-y -i input.mp4 output.mp4") {
      throw new Error(\`unexpected compiled args: \${compiled.args.join(" ")}\`)
    }
  `

  await execFileAsync(
    process.execPath,
    ["--input-type=module", "-e", runtimeScript],
    {
      cwd: consumerDir
    }
  )
}

async function expectConsumerTypecheck(consumerDir: string) {
  const sourcePath = join(consumerDir, "index.ts")
  const tsconfigPath = join(consumerDir, "tsconfig.json")

  await writeFile(
    sourcePath,
    [
      'import ffmpegu, { FFmpeguOptions, type FFmpeguFFprobeJson } from "ffmpegu"',
      "const options = FFmpeguOptions.create('-y')",
      "const command = ffmpegu.command({ global: options, inputs: [], outputs: [] })",
      "const json: FFmpeguFFprobeJson = {}",
      "void command",
      "void json"
    ].join("\n")
  )

  await writeFile(
    tsconfigPath,
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2024",
          lib: ["ESNext"],
          strict: true,
          skipLibCheck: false,
          types: ["node"],
          typeRoots: [join(repoRoot, "node_modules", "@types")]
        },
        include: ["index.ts"]
      },
      null,
      2
    )}\n`
  )

  await execFileAsync(
    "pnpm",
    ["exec", "tsgo", "-p", tsconfigPath, "--pretty", "false"],
    {
      cwd: repoRoot
    }
  )
}
