import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const readPackageJson = async () =>
  JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8")
  )

describe.sequential("Package contract", () => {
  it("should expose the built dist entrypoint and types to package consumers", async () => {
    const packageJson = await readPackageJson()

    expect(packageJson).toMatchObject({
      type: "module",
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          import: "./dist/index.js",
          types: "./dist/index.d.ts"
        }
      }
    })
  })
})
