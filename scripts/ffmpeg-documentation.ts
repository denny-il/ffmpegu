import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateText } from "ai"
import { DomUtils, parseDocument } from "htmlparser2"

const documentations = [
  {
    name: "FFmpeg Documentation",
    namespace: "ffmpeg",
    pages: [
      {
        name: "FFmpeg Documentation",
        namespace: "ffmpeg",
        url: "https://ffmpeg.org/ffmpeg.html",
        instructions: ""
      },
      {
        name: "Utilities",
        namespace: "utilities",
        url: "https://ffmpeg.org/ffmpeg-utils.html",
        instructions: ""
      },
      {
        name: "Input and Output Devices",
        namespace: "devices",
        url: "https://ffmpeg.org/ffmpeg-devices.html",
        instructions: ""
      },
      {
        name: "Codecs",
        namespace: "codecs",
        url: "https://ffmpeg.org/ffmpeg-codecs.html",
        instructions: ""
      },
      {
        name: "Filters",
        namespace: "filters",
        url: "https://ffmpeg.org/ffmpeg-filters.html",
        instructions: ""
      },
      {
        name: "Formats",
        namespace: "formats",
        url: "https://ffmpeg.org/ffmpeg-formats.html",
        instructions: ""
      },
      {
        name: "Protocols",
        namespace: "protocols",
        url: "https://ffmpeg.org/ffmpeg-protocols.html",
        instructions: ""
      },
      {
        name: "Bitstream Filters",
        namespace: "bitstream-filters",
        url: "https://ffmpeg.org/ffmpeg-bitstream-filters.html",
        instructions: ""
      },
      {
        name: "Video Scaling and Pixel Format Converter",
        namespace: "scaler-pixel-format",
        url: "https://ffmpeg.org/ffmpeg-scaler.html",
        instructions: ""
      },
      {
        name: "Audio Resampler",
        namespace: "audio-resampler",
        url: "https://ffmpeg.org/ffmpeg-resampler.html",
        instructions: ""
      }
    ]
  },
  {
    name: "FFprobe Documentation",
    namespace: "ffprobe",
    pages: [
      {
        name: "FFprobe Documentation",
        namespace: "ffprobe",
        url: "https://ffmpeg.org/ffprobe.html",
        instructions: ""
      }
    ]
  },
  {
    name: "FFplay Documentation",
    namespace: "ffplay",
    pages: [
      {
        name: "FFplay Documentation",
        namespace: "ffplay",
        url: "https://ffmpeg.org/ffplay.html",
        instructions: ""
      }
    ]
  }
]

const docsRoot = path.resolve(process.cwd(), "docs")

const extractMainContent = (html: string) => {
  const doc = parseDocument(html)
  const node = DomUtils.findOne(
    (element) =>
      element.type === "tag" &&
      element.name === "div" &&
      "attribs" in element &&
      typeof element.attribs?.class === "string" &&
      element.attribs.class.split(/\s+/).includes("page-content"),
    doc.children,
    true
  )
  if (!node) throw new Error("Main content div not found.")
  return DomUtils.getOuterHTML(node)
}

const fetchHtml = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ffmpegu-docs-generator/1.0"
    }
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`)
  }
  return response.text()
}

const buildPrompt = (page: {
  name: string
  url: string
  instructions: string
}) => {
  const baseInstructions = [
    "Generate clean Markdown documentation for developers.",
    "Start with a single H1 heading that matches the page title.",
    "Preserve section hierarchy with H2/H3 headings.",
    "Include a short table of contents after the H1 if the content has multiple sections.",
    "Convert HTML tables to Markdown tables when present.",
    "Keep lists and code blocks intact; avoid excessive prose.",
    "Do not include raw HTML in the output.",
    "Preserve ALL content, except Authors and See Also sections."
  ]

  const instructionText = page.instructions?.trim()
  if (instructionText) {
    baseInstructions.push(`Additional instructions: ${instructionText}`)
  }

  return baseInstructions.map((v) => `- ${v}`).join("\n")
}

const writeMarkdown = async (
  documentation: (typeof documentations)[number],
  page: (typeof documentation.pages)[number],
  content: string
) => {
  const outputDir = path.join(docsRoot, documentation.namespace)
  await mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `${page.namespace}.md`)
  const header = [
    "---",
    `All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]`,
    `Title: ${page.name}`,
    `Source: ${page.url}`,
    "---"
  ].join("\n")
  await writeFile(outputPath, `${header}\n\n${content}`, "utf8")
  return outputPath
}

const generateMarkdown = async (page: {
  name: string
  url: string
  instructions: string
}) => {
  const html = await fetchHtml(page.url)
  const content = extractMainContent(html)
  if (content.length > 2_000_000) {
    throw new Error(
      `Content for ${page.url} is too large (${content.length} characters).`
    )
  }

  const { text } = await generateText({
    model,
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content: buildPrompt(page)
      },
      {
        role: "user",
        content: `Use the following HTML content as the source of truth.\n\n${content}`
      }
    ]
  })

  return text
}

if (!process.env.GOOGLE_API_KEY) {
  throw new Error("Missing GOOGLE_API_KEY environment variable.")
}

const provider = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY || ""
})

const model = provider("gemini-3-flash-preview")

const label = "ffmpegu-documentation-generator"

console.time(label)

try {
  console.log("Starting documentation generation...")
  for (const documentation of documentations) {
    const { namespace, pages } = documentation
    for (const page of pages) {
      const label = `Generating documentation for ${namespace}/${page.namespace}`
      console.time(label)
      const markdown = await generateMarkdown(page)
      const outputPath = await writeMarkdown(documentation, page, markdown)
      console.log(`Generated ${outputPath}`)
      console.timeEnd(label)
    }
  }
} catch (e) {
  console.error("Error during documentation generation:", e)
} finally {
  console.timeEnd(label)
}
