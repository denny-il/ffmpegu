import { readFile, writeFile } from "node:fs/promises"
import { Resvg } from "@resvg/resvg-js"

const directory = new URL("../assets/brand/", import.meta.url)
const light = await readFile(new URL("logo-light.svg", directory), "utf8")
const dark = light
  .replaceAll("#2B2124", "#F5EFE9")
  .replace("an ink u", "a cream u")

// Background versions fill the negative space too; transparent masters keep
// the separation between ff and u open on whichever surface displays them.
const withBackground = (svg, color) =>
  svg.replace(
    "</desc>",
    `</desc>\n  <rect width="1254" height="1254" fill="${color}"/>`
  )

const variants = [
  ["logo-light", light],
  ["logo-dark", dark],
  ["logo-light-square", withBackground(light, "#FBF8F4")],
  ["logo-dark-square", withBackground(dark, "#1D1719")]
]

for (const [name, svg] of variants) {
  // logo-light.svg is the editable master; all other assets are derived.
  if (name !== "logo-light") {
    await writeFile(new URL(`${name}.svg`, directory), svg)
  }
  for (const size of [1024, 512]) {
    const suffix = size === 1024 ? "" : `-${size}`
    const renderer = new Resvg(svg, { fitTo: { mode: "width", value: size } })
    await writeFile(
      new URL(`${name}${suffix}.png`, directory),
      renderer.render().asPng()
    )
  }
}

console.log("Rendered four logo variants as SVG and 1024px/512px PNGs.")
