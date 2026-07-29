// Clean per-section reference-frame capture for clone-site-gpt. Captures ONE section as
// a single crisp image, bounded by content landmarks, with all reveal animations
// already settled so nothing is hidden mid-animation. Never a full-page screenshot.
//
//   node capture-frame.mjs <url> <outPath> [bounds] [opts]
// bounds (pick one):
//   --fromText "<text>" --toText "<text>"   region from the top of the element holding
//                                           <text> to the top of the next section's <text>
//   --selector "<css>"                      the element's own bounding box
//   --top <px> --height <px>                explicit page coordinates
// opts: --width 1440  --dpr 2  --pad 24  (--pad adds breathing room above the top)
//
// Uses Playwright + a cached/system Chromium (no download). Captures below-the-fold
// regions in one shot via clip + captureBeyondViewport (no scroll-stitching). Exits
// non-zero with a clear message when a dependency or the landmark is missing.
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function loadChromium() {
  for (const base of [path.join(process.cwd(), 'index.js'), import.meta.url]) {
    try { return createRequire(base)('playwright').chromium } catch { /* next */ }
  }
  console.error('capture-frame: `playwright` not found — run `npm i playwright` in the cwd first'); process.exit(1)
}
const chromium = loadChromium()

const argv = process.argv.slice(2)
const url = argv[0]
const outPath = argv[1]
const flag = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def }
if (!url || !outPath) { console.error('usage: node capture-frame.mjs <url> <outPath> [--fromText .. --toText ..|--selector ..|--top .. --height ..] [--width 1440 --dpr 2 --pad 24]'); process.exit(1) }
const fromText = flag('--fromText')
const toText = flag('--toText')
const selector = flag('--selector')
const topArg = flag('--top')
const heightArg = flag('--height')
const W = parseInt(flag('--width', '1440'), 10)
const DPR = parseInt(flag('--dpr', '2'), 10)
const PAD = parseInt(flag('--pad', '24'), 10)

function findCachedChromium() {
  const roots = [path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')]
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
      for (const c of [
        path.join(root, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        path.join(root, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
        path.join(root, d, 'chrome-linux/chrome'),
      ]) if (fs.existsSync(c)) return c
    }
  }
  return null
}
async function launch() {
  const tries = [() => chromium.launch({ headless: true, channel: 'chrome' }), () => chromium.launch({ headless: true })]
  const exe = findCachedChromium()
  if (exe) tries.push(() => chromium.launch({ headless: true, executablePath: exe }))
  for (const t of tries) { try { return await t() } catch { /* next */ } }
  console.error('capture-frame: no Chromium available'); process.exit(2)
}

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
const browser = await launch()
const context = await browser.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: DPR, reducedMotion: 'no-preference' })
const page = await context.newPage()
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.goto(url, { timeout: 60000 }))

// Pre-warm images so nothing is still decoding, then SETTLE: scroll the whole page
// once so every scroll-reveal animation fires and locks to its final visible state.
await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {})
await page.evaluate(() => { document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; i.setAttribute('fetchpriority', 'high') }) }).catch(() => {})
await page.evaluate(() => new Promise((res) => {
  let y = 0
  const max = () => document.body.scrollHeight - window.innerHeight
  const id = setInterval(() => { y += Math.round(window.innerHeight * 0.8); window.scrollTo(0, y); if (y >= max()) { clearInterval(id); res() } }, 120)
})).catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => (i.decode ? i.decode().catch(() => {}) : null)))).catch(() => {})
await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
await page.waitForTimeout(500)

// Neutralize scroll-reveals at rest BEFORE measuring, so bounds use final positions and
// nothing stays hidden. A stylesheet !important rule outlasts engines (Webflow IX2) that
// re-apply scroll-based opacity each frame; scoped to currently-hidden elements so
// designed transforms (rotated cards) are untouched.
await page.evaluate(() => {
  const st = document.createElement('style')
  st.textContent = '.cf-reveal{opacity:1 !important; transform:none !important; filter:none !important;}'
  document.head.appendChild(st)
  for (const e of document.querySelectorAll('body *')) {
    if (parseFloat(getComputedStyle(e).opacity) < 0.95) e.classList.add('cf-reveal')
  }
}).catch(() => {})
await page.waitForTimeout(400)

const bounds = await page.evaluate(({ fromText, toText, selector, topArg, heightArg, pad }) => {
  const pageH = document.body.scrollHeight
  const topByText = (text) => {
    if (!text) return null
    const t = text.trim().toLowerCase()
    let best = null, bestArea = Infinity
    for (const e of document.querySelectorAll('body *')) {
      const tx = (e.textContent || '').trim().toLowerCase()
      if (!tx.includes(t)) continue
      const r = e.getBoundingClientRect()
      const area = r.width * r.height
      if (area > 0 && area < bestArea) { bestArea = area; best = e }
    }
    return best ? Math.round(best.getBoundingClientRect().top + window.scrollY) : null
  }
  let top, bottom
  if (selector) {
    const el = document.querySelector(selector)
    if (!el) return { error: `selector not found: ${selector}` }
    const r = el.getBoundingClientRect()
    top = Math.round(r.top + window.scrollY); bottom = Math.round(r.bottom + window.scrollY)
  } else if (topArg != null && heightArg != null) {
    top = parseInt(topArg, 10); bottom = top + parseInt(heightArg, 10)
  } else {
    top = topByText(fromText)
    if (top == null) return { error: `fromText not found: ${fromText}` }
    bottom = toText ? topByText(toText) : pageH
    if (bottom == null) return { error: `toText not found: ${toText}` }
  }
  top = Math.max(0, top - pad)
  bottom = Math.min(pageH, bottom)
  return { top, height: Math.max(1, bottom - top), pageH }
}, { fromText, toText, selector, topArg, heightArg, pad: PAD })

if (bounds.error) { console.error('capture-frame: ' + bounds.error); await browser.close(); process.exit(3) }

// Take ONE full-resolution page grab, then crop the exact section out of it. fullPage
// captures below-the-fold content correctly (clip+captureBeyondViewport does not on this
// build) and avoids resizing the viewport (which would reflow a 100vh hero and shift the
// measured bounds). The full grab is a throwaway — the saved frame is the section crop.
await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
await page.waitForTimeout(150)
const tmp = outPath.replace(/\.png$/i, '') + '.__full.png'
await page.screenshot({ path: tmp, fullPage: true })
await browser.close()
const x = 0, y = Math.round(bounds.top * DPR), w = W * DPR, h = Math.round(bounds.height * DPR)
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-vf', `crop=${w}:${h}:${x}:${y}`, outPath], { stdio: 'inherit' })
fs.rmSync(tmp, { force: true })
if (ff.status !== 0) { console.error('capture-frame: ffmpeg crop failed (is ffmpeg installed?)'); process.exit(4) }
console.log(`CAPTURED=${outPath} top=${bounds.top} height=${bounds.height} (pageH=${bounds.pageH}) @${DPR}x`)
