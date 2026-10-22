import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

// rewriteRelativeImportExtensions only rewrites emitted JavaScript, so tsc
// leaves the source `.ts` specifiers in declarations. Point them at the `.js`
// files that ship, matching the emitted JavaScript.
const dist = resolve(import.meta.dirname, "../dist")
const specifier = /(\bfrom\s+|\bimport\s*\(\s*)(["'])(\.\.?\/[^"']+)\.ts\2/g

for (const entry of readdirSync(dist, { recursive: true })) {
  if (!entry.endsWith(".d.ts")) continue
  const file = join(dist, entry)
  const source = readFileSync(file, "utf8")
  const rewritten = source.replace(specifier, (_, prefix, quote, path) => {
    // Fail the build rather than publish a specifier that resolves to nothing.
    if (!existsSync(join(dirname(file), `${path}.d.ts`)))
      throw new Error(`${entry}: no declaration for ${path}.ts`)
    return `${prefix}${quote}${path}.js${quote}`
  })
  if (rewritten !== source) writeFileSync(file, rewritten)
}
