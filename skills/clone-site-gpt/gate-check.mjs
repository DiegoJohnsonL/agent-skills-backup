#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const args = parseArgs(process.argv.slice(2))
const workspace = required("workspace")
const computedPath = args.computed || path.join(workspace, "source", "computed.json")
const sourceDir = args.source || path.join(workspace, "source")
const screenshotsDir = args.screenshots || path.join(workspace, "screenshots")
const assetsDir = args.assets || path.join(workspace, "assets")
const motionDir = args.motion || path.join(workspace, "screenshots", "motion")

const computed = await readJson(computedPath)
const computedSelectors = countComputedSelectors(computed)
const fontFaceCount = Array.isArray(computed?.fontFaces) ? computed.fontFaces.length : 0
const cssFiles = (await listFiles(sourceDir)).filter((file) => file.endsWith(".css")).length
const assetFiles = (await listFiles(assetsDir)).length
const frameFiles = (await listFiles(screenshotsDir)).filter(isStoryboardFrame)
const motionVideo = await exists(path.join(motionDir, "master.mp4")) || await exists(path.join(motionDir, "master.webm"))

const reasons = []
if (!computed) reasons.push(`missing or invalid computed.json at ${computedPath}`)
if (computedSelectors <= 0) reasons.push("computed.json has no captured selectors")
if (cssFiles <= 0) reasons.push(`no CSS files found under ${sourceDir}`)
if (frameFiles.length <= 0) reasons.push(`no storyboard frames found under ${screenshotsDir}`)
if (assetFiles <= 0) reasons.push(`no assets found under ${assetsDir}`)

writeJson({
  ok: computedSelectors > 0 && frameFiles.length > 0,
  computedSelectors,
  fontFaceCount,
  cssFiles,
  assetFiles,
  frameCount: frameFiles.length,
  motionVideo,
  reasons,
})

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
  if (!value || value === true) {
    throw new Error(`Missing required --${name}`)
  }
  return value
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch {
    return null
  }
}

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
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

function countComputedSelectors(computed) {
  if (!computed || typeof computed !== "object") return 0
  if (Array.isArray(computed.elements)) return computed.elements.length
  if (computed.elements && typeof computed.elements === "object") return Object.keys(computed.elements).length
  return Object.keys(computed).filter((key) => !["capturedAt", "url", "brand", "viewport", "scrollHeight", "fontFaces", "documentFonts"].includes(key)).length
}

function isStoryboardFrame(file) {
  const relative = path.relative(screenshotsDir, file)
  if (relative.startsWith(`frames${path.sep}`) || relative.startsWith(`motion${path.sep}`)) return false
  if (!/\.(png|jpe?g|webp)$/i.test(file)) return false
  if (/full[-_]?page|assembled|clone-shot/i.test(path.basename(file))) return false
  return true
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}
