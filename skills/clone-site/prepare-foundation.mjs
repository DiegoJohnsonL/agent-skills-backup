#!/usr/bin/env node

import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const args = parseArgs(process.argv.slice(2))
const repoPath = required("repoPath")
const workspace = required("workspace")
const manifestPath = required("manifest")
const routeDir = required("routeDir")
const publicDir = required("publicDir")
const assetPath = required("assetPath")
const sourceUrl = args.sourceUrl || ""
const assetsRoot = path.join(workspace, "assets")
const computedPath = path.join(workspace, "source", "computed.json")

const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
const computed = await readJson(computedPath)
const sections = [...(manifest.sections || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))

await mkdir(publicDir, { recursive: true })
await mkdir(path.join(routeDir, "sections"), { recursive: true })

const assetFiles = await listFiles(assetsRoot)
const copiedAssets = []
for (const source of assetFiles) {
  const relative = path.relative(assetsRoot, source)
  const destination = path.join(publicDir, relative)
  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(source, destination)
  copiedAssets.push({
    source,
    publicFile: destination,
    publicUrl: `${assetPath}/${toPosix(relative)}`,
    kind: classifyAsset(source),
  })
}

const fontAssets = copiedAssets.filter((asset) => asset.kind === "font")
const imageAssets = copiedAssets.filter((asset) => asset.kind === "image" || asset.kind === "svg" || asset.kind === "video")
const fontFaces = inferFontFaces(computed, fontAssets, assetPath)
const tokenSummary = summarizeComputed(computed)
const namedAssets = buildNamedAssets(copiedAssets, assetPath)
const prepReport = {
  routeDir,
  publicDir,
  assetPath,
  copiedAssets: copiedAssets.length,
  fontFiles: fontAssets.length,
  mediaFiles: imageAssets.length,
  pagePath: path.join(routeDir, "page.tsx"),
  tokensPath: path.join(routeDir, "tokens.generated.ts"),
  fontsPath: path.join(routeDir, "fonts.module.css"),
  assetManifestPath: path.join(routeDir, "asset-manifest.json"),
  sections: sections.map((section) => ({ id: section.id, file: path.join(routeDir, "sections", `${section.id}.tsx`) })),
}

await writeFile(path.join(routeDir, "asset-manifest.json"), `${JSON.stringify({ copiedAssets, namedAssets }, null, 2)}\n`)
await writeFile(path.join(routeDir, "tokens.generated.ts"), renderTokens({ assetPath, namedAssets, manifest, tokenSummary, fontFaces }))
await writeFile(path.join(routeDir, "fonts.module.css"), renderFontsCss(fontFaces, tokenSummary))
await writeFile(path.join(routeDir, "page.tsx"), renderPage({ manifest, sections, sourceUrl }))
for (const section of sections) {
  await writeFile(path.join(routeDir, "sections", `${section.id}.tsx`), renderSectionStub(section))
}
await writeFile(path.join(workspace, "foundation-prep.json"), `${JSON.stringify(prepReport, null, 2)}\n`)

process.stdout.write(`${JSON.stringify(prepReport, null, 2)}\n`)

function parseArgs(argv) {
  const parsed = {}
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (!item.startsWith("--")) continue
    const key = item.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) {
      parsed[key] = true
      continue
    }
    parsed[key] = next
    i++
  }
  return parsed
}

function required(name) {
  const value = args[name]
  if (!value || value === true) throw new Error(`Missing required --${name}`)
  return value
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch {
    return null
  }
}

async function listFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async (entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listFiles(full)
      if (entry.isFile()) return [full]
      return []
    }))
    return nested.flat()
  } catch {
    return []
  }
}

function classifyAsset(file) {
  if (/\.(woff2?|otf|ttf|eot)$/i.test(file)) return "font"
  if (/\.svg$/i.test(file)) return "svg"
  if (/\.(png|jpe?g|webp|gif|avif)$/i.test(file)) return "image"
  if (/\.(mp4|webm|mov)$/i.test(file)) return "video"
  return "other"
}

function inferFontFaces(computed, fontAssets, basePath) {
  const captured = Array.isArray(computed?.fontFaces) ? computed.fontFaces : []
  const byBaseName = new Map()
  for (const face of captured) {
    const src = String(face.src || face.cssText || "")
    const match = src.match(/url\(["']?([^"')]+)["']?\)/i)
    if (!match || match[1].startsWith("data:")) continue
    byBaseName.set(path.basename(match[1].split("?")[0]), face)
  }
  return fontAssets.map((asset) => {
    const fileName = path.basename(asset.publicFile)
    const face = byBaseName.get(fileName)
    return {
      family: cssString(face?.family || familyFromFileName(fileName)),
      weight: String(face?.weight || weightFromFileName(fileName)),
      style: String(face?.style || styleFromFileName(fileName)),
      url: `${basePath}/${toPosix(path.relative(publicDir, asset.publicFile))}`,
      file: asset.publicFile,
    }
  })
}

function summarizeComputed(computed) {
  const elements = computedElements(computed)
  const colors = topValues(elements.flatMap((item) => [item.color, item.backgroundColor]).filter(isMeaningfulColor), 12)
  const backgrounds = topValues(elements.map((item) => item.backgroundImage).filter((value) => value && value !== "none"), 8)
  const fontFamilies = topValues(elements.map((item) => item.fontFamily).filter(Boolean), 12)
  const fontSizes = topValues(elements.map((item) => item.fontSize).filter(Boolean), 16)
  const lineHeights = topValues(elements.map((item) => item.lineHeight).filter(Boolean), 16)
  const radii = topValues(elements.flatMap((item) => [item.borderRadius, item.borderTopLeftRadius, item.borderTopRightRadius, item.borderBottomLeftRadius, item.borderBottomRightRadius]).filter(Boolean), 12)
  return {
    brand: computed?.brand || manifest.brand,
    viewport: computed?.viewport || null,
    scrollHeight: computed?.scrollHeight || null,
    colors,
    backgrounds,
    fontFamilies,
    fontSizes,
    lineHeights,
    radii,
    bodyFont: semanticFont("body") || fontFamilies[0] || "Arial, sans-serif",
    displayFont: semanticFont("display|heading|serif|italic") || fontFamilies.find((font) => !/arial|sans-serif|times/i.test(font)) || fontFamilies[0] || "Georgia, serif",
  }
}

function semanticFont(rolePattern) {
  const matcher = new RegExp(rolePattern, "i")
  const fonts = Array.isArray(manifest.designSystem?.fonts) ? manifest.designSystem.fonts : []
  const match = fonts.find((font) => matcher.test(font.role || ""))
  return match?.family || null
}

function computedElements(computed) {
  if (Array.isArray(computed?.elements)) return computed.elements
  if (computed?.elements && typeof computed.elements === "object") {
    return Object.entries(computed.elements).map(([key, value]) => ({ key, ...value }))
  }
  return []
}

function topValues(values, limit) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value)
}

function isMeaningfulColor(value) {
  return value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent"
}

function buildNamedAssets(assets, basePath) {
  const used = new Set()
  const named = {}
  for (const asset of assets) {
    if (!["image", "svg", "video"].includes(asset.kind)) continue
    const relative = toPosix(path.relative(publicDir, asset.publicFile))
    const base = path.basename(relative).replace(/\.[^.]+$/, "")
    let key = toCamel(base.replace(/^\d+-/, ""))
    if (!key || /^\d/.test(key)) key = `asset${Object.keys(named).length + 1}`
    while (used.has(key)) key = `${key}${used.size + 1}`
    used.add(key)
    named[key] = `${basePath}/${relative}`
  }
  return named
}

function renderTokens({ assetPath, namedAssets, manifest, tokenSummary, fontFaces }) {
  return [
    `export const assetBase = ${JSON.stringify(assetPath)} as const`,
    "",
    `export const assets = ${JSON.stringify(namedAssets, null, 2)} as const`,
    "",
    `export const computedTokens = ${JSON.stringify(tokenSummary, null, 2)} as const`,
    "",
    `export const manifestDesignSystem = ${JSON.stringify(manifest.designSystem || {}, null, 2)} as const`,
    "",
    `export const sectionPlan = ${JSON.stringify((manifest.sections || []).map((section) => ({ id: section.id, name: section.name, intent: section.intent, assetRefs: section.assetRefs || [] })), null, 2)} as const`,
    "",
    `export const fontFaces = ${JSON.stringify(fontFaces, null, 2)} as const`,
    "",
  ].join("\n")
}

function renderFontsCss(fontFaces, tokenSummary) {
  const faces = fontFaces.map((font) => [
    "@font-face {",
    `  font-family: ${font.family};`,
    `  src: url("${font.url}") format("${fontFormat(font.url)}");`,
    `  font-weight: ${font.weight};`,
    `  font-style: ${font.style};`,
    "  font-display: swap;",
    "}",
  ].join("\n"))
  return [
    ...faces,
    "",
    ".fontScope {",
    `  --clone-body-font: ${cssString(tokenSummary.bodyFont)};`,
    `  --clone-display-font: ${cssString(tokenSummary.displayFont)};`,
    "}",
    "",
  ].join("\n")
}

function renderPage({ manifest, sections, sourceUrl }) {
  const imports = sections.map((section) => `import ${componentName(section.id)} from "./sections/${section.id}"`)
  const renderedSections = sections.map((section) => `      <${componentName(section.id)} />`)
  return [
    `"use client"`,
    "",
    `// PROTOTYPE - ${manifest.category?.slug || "prototype"}: "${manifest.brand}" - cloned from ${sourceUrl}.`,
    "",
    `import fontStyles from "./fonts.module.css"`,
    ...imports,
    "",
    "export default function Page() {",
    "  return (",
    "    <main className={`${fontStyles.fontScope} min-h-screen overflow-x-hidden bg-[rgb(253,255,247)] text-[rgb(44,44,44)] antialiased`}>",
    ...renderedSections,
    "    </main>",
    "  )",
    "}",
    "",
  ].join("\n")
}

function renderSectionStub(section) {
  return [
    "export default function " + componentName(section.id) + "() {",
    "  return (",
    `    <section id=${JSON.stringify(section.id)} aria-label=${JSON.stringify(section.name || section.id)} className="min-h-[40vh] border-b border-black/10 px-6 py-20">`,
    "      <div className=\"mx-auto flex max-w-6xl flex-col gap-4\">",
    `        <p className="text-xs uppercase tracking-[0.2em]">${escapeText(section.name || section.id)}</p>`,
    `        <p className="max-w-2xl text-sm opacity-70">${escapeText(section.intent || "Section implementation pending.")}</p>`,
    "      </div>",
    "    </section>",
    "  )",
    "}",
    "",
  ].join("\n")
}

function componentName(value) {
  const name = String(value || "Section")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("")
  return /^[A-Z]/.test(name) ? name : `Section${name}`
}

function toCamel(value) {
  const parts = String(value || "").split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return parts.map((part, index) => {
    const lower = part.toLowerCase()
    if (index === 0) return lower
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
  }).join("")
}

function toPosix(value) {
  return value.split(path.sep).join("/")
}

function cssString(value) {
  return JSON.stringify(String(value || "Arial, sans-serif"))
}

function familyFromFileName(fileName) {
  if (/matter/i.test(fileName)) return "Matter"
  if (/^0?\d*-?JTU/i.test(fileName)) return "Montserrat"
  return fileName.replace(/\.[^.]+$/, "").replace(/^\d+-/, "").replace(/[_-]+/g, " ")
}

function weightFromFileName(fileName) {
  if (/bold/i.test(fileName)) return "700"
  if (/semibold|semi-bold/i.test(fileName)) return "600"
  if (/medium/i.test(fileName)) return "500"
  if (/light/i.test(fileName)) return "300"
  return "400"
}

function styleFromFileName(fileName) {
  return /italic/i.test(fileName) ? "italic" : "normal"
}

function fontFormat(url) {
  if (/\.woff2(?:$|\?)/i.test(url)) return "woff2"
  if (/\.woff(?:$|\?)/i.test(url)) return "woff"
  if (/\.otf(?:$|\?)/i.test(url)) return "opentype"
  if (/\.ttf(?:$|\?)/i.test(url)) return "truetype"
  return "woff2"
}

function escapeText(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
