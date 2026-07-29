#!/usr/bin/env node

import { mkdir, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

const args = parseArgs(process.argv.slice(2))
const repoPath = required("repoPath")
const url = required("url")
const outDir = required("outDir")
const sections = String(args.sections || "").split(",").map((value) => value.trim()).filter(Boolean)
const viewportWidth = Number(args.width || 1440)
const viewportHeight = Number(args.height || 1100)

await mkdir(outDir, { recursive: true })

const playwright = await loadPlaywright(repoPath)
if (!playwright) {
  writeJson({ ok: false, reason: "playwright-not-available", outDir, messages: [], pageErrors: [], sections: [] })
  process.exit(0)
}

const launchOptions = { headless: true }
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if (await exists(chromePath)) launchOptions.executablePath = chromePath

const messages = []
const pageErrors = []
const browser = await playwright.chromium.launch(launchOptions)
const context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
const page = await context.newPage()
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) messages.push({ type: message.type(), text: message.text() })
})
page.on("pageerror", (error) => pageErrors.push(error.message))

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 })
await page.waitForSelector("main", { timeout: 60000 })
await page.waitForTimeout(1800)

const discoveredSections = sections.length ? sections : await page.$$eval("main section[id]", (nodes) => nodes.map((node) => node.id))
const scrollProbe = await runScrollProbe(page)
await page.screenshot({ path: path.join(outDir, "assembled-full.png"), fullPage: true })

const sectionReports = []
for (const id of discoveredSections) {
  const locator = page.locator(`#${cssEscape(id)}`).first()
  const count = await locator.count()
  if (!count) {
    sectionReports.push({ id, exists: false })
    continue
  }
  await locator.scrollIntoViewIfNeeded({ timeout: 30000 })
  await page.waitForTimeout(450)
  const screenshot = path.join(outDir, `${id}.png`)
  await locator.screenshot({ path: screenshot })
  const box = await locator.boundingBox()
  sectionReports.push({ id, exists: true, screenshot, box })
}

const summary = await page.evaluate((ids) => ({
  title: document.title,
  scrollHeight: document.documentElement.scrollHeight,
  clientHeight: document.documentElement.clientHeight,
  bodyTextStart: document.body.innerText.slice(0, 500),
  sectionIds: ids.map((id) => {
    const el = document.getElementById(id)
    if (!el) return { id, exists: false }
    const rect = el.getBoundingClientRect()
    return { id, exists: true, width: Math.round(rect.width), height: Math.round(rect.height) }
  }),
}), discoveredSections)

await browser.close()

const ok = messages.length === 0 && pageErrors.length === 0 && sectionReports.every((section) => section.exists) && scrollProbe.ok
const report = { ok, url, outDir, messages, pageErrors, scrollProbe, sections: sectionReports, summary }
await writeFile(path.join(outDir, "route-check.json"), `${JSON.stringify(report, null, 2)}\n`)
writeJson(report)

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

async function loadPlaywright(root) {
  try {
    const requireFromRepo = createRequire(path.join(root, "package.json"))
    return requireFromRepo("playwright")
  } catch {
    try {
      return await import("playwright")
    } catch {
      return null
    }
  }
}

async function runScrollProbe(page) {
  const before = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }))
  await page.mouse.move(viewportWidth / 2, Math.min(500, viewportHeight / 2))
  await page.mouse.wheel(0, 1400)
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => ({ scrollY: window.scrollY }))
  return {
    before,
    after,
    ok: before.scrollHeight <= before.clientHeight || after.scrollY > before.scrollY + 50,
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

function cssEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}
