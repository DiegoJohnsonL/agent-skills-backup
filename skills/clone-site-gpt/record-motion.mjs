// Real-time motion recorder for clone-site-gpt. Captures the LIVE animation of a page
// (scroll reveals, sticky nav, parallax, hovers, carousels, accordions) as a
// real-time video — the faithful source of motion that static frames cannot convey.
//
//   node record-motion.mjs <url> <outDir>
//
// Drives Chromium via CDP Page.startScreencast and acks every frame immediately, so
// Chromium delivers at the compositor rate (30-60fps during motion) — higher than
// Playwright recordVideo's ~25fps cap. Frames are tagged with their real timestamps
// and assembled by ffmpeg into a real-time 30fps master.mp4 (the choreography's true
// wall-clock duration is preserved). Requires `playwright` resolvable from the cwd
// and `ffmpeg` on PATH. Reuses cached Chromium / system Chrome — no browser download.
// Exits 2 if no Chromium is available so the caller can fall back to
// `agent-browser record` (a lossy screencast).
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Resolve `playwright` from the cwd first (where the agent ran `npm i playwright`),
// since an .mjs in the skill dir would otherwise only look beside itself.
function loadChromium() {
  for (const base of [path.join(process.cwd(), 'index.js'), import.meta.url]) {
    try { return createRequire(base)('playwright').chromium } catch { /* next */ }
  }
  console.error('record-motion: `playwright` not found — run `npm i playwright` in the cwd first'); process.exit(1)
}
const chromium = loadChromium()

const url = process.argv[2]
const outDir = process.argv[3] || './motion'
const FPS = 30
if (!url) { console.error('usage: node record-motion.mjs <url> <outDir>'); process.exit(1) }
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.error('record-motion: ffmpeg not found on PATH'); process.exit(1) }
const framesDir = path.join(outDir, 'frames')
fs.rmSync(framesDir, { recursive: true, force: true })
fs.mkdirSync(framesDir, { recursive: true })

const W = 1440, H = 900
const t0 = Date.now()
const marks = []
const mark = (label) => { const t = (Date.now() - t0) / 1000; marks.push({ t: +t.toFixed(2), label }); console.log(`  [${t.toFixed(2)}s] ${label}`) }

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
  console.error('record-motion: no Chromium available (channel/bundled/cached all failed)'); process.exit(2)
}

const browser = await launch()
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
const page = await context.newPage()
const client = await context.newCDPSession(page)

const frames = []
let n = 0
client.on('Page.screencastFrame', async (f) => {
  const file = path.join(framesDir, String(n++).padStart(6, '0') + '.jpg')
  fs.writeFileSync(file, Buffer.from(f.data, 'base64'))
  frames.push({ file, t: f.metadata.timestamp })
  try { await client.send('Page.screencastFrameAck', { sessionId: f.sessionId }) } catch { /* stopped */ }
})

mark('goto')
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.goto(url, { timeout: 60000 }))
// Pre-warm so the recorded scroll is smooth, not janky: load fonts and force every
// image (including lazy/offscreen ones) to fetch + decode up front. Done WITHOUT
// scrolling, so one-time scroll-reveal animations stay armed for the capture.
await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {})
await page.evaluate(() => { document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; i.setAttribute('fetchpriority', 'high') }) }).catch(() => {})
await page.waitForTimeout(400)
await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => (i.complete ? null : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 4000) }))))).catch(() => {})
await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => (i.decode ? i.decode().catch(() => {}) : null)))).catch(() => {})
await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
await page.waitForTimeout(900)

await client.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
await page.waitForTimeout(600)

// requestAnimationFrame scroll (time-based, off the busy setInterval queue) with a
// per-frame delta clamp so a momentary stall can't translate into a big visible jump.
mark('scroll-down (sticky nav, scroll reveals, parallax)')
await page.evaluate((speed) => new Promise((res) => {
  const maxY = () => document.body.scrollHeight - window.innerHeight
  let last = null
  const step = (ts) => {
    if (last === null) last = ts
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts
    const y = Math.min(maxY(), window.scrollY + speed * dt)
    window.scrollTo(0, y)
    if (y < maxY() - 1) requestAnimationFrame(step); else res()
  }
  window.scrollTo(0, 0); requestAnimationFrame(step)
}), 360).catch(() => {})
await page.waitForTimeout(700)

mark('scroll-up (reveal-on-up nav)')
await page.evaluate((speed) => new Promise((res) => {
  let last = null
  const step = (ts) => {
    if (last === null) last = ts
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts
    const y = Math.max(0, window.scrollY - speed * dt)
    window.scrollTo(0, y)
    if (y > 1) requestAnimationFrame(step); else res()
  }
  requestAnimationFrame(step)
}), 560).catch(() => {})
await page.waitForTimeout(700)

mark('hovers (CTAs / glide-over buttons)')
await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
const hoverTargets = await page.evaluate(() => Array.from(document.querySelectorAll('a,button'))
  .filter((e) => e.offsetParent && e.getBoundingClientRect().width > 60 && (e.textContent || '').trim().length > 1)
  .slice(0, 5).map((e, i) => { e.setAttribute('data-rec-hover', String(i)); return i })).catch(() => [])
for (const i of hoverTargets) {
  try { await page.locator(`[data-rec-hover="${i}"]`).hover({ timeout: 2000 }); await page.waitForTimeout(650); await page.mouse.move(W / 2, H / 2); await page.waitForTimeout(250) } catch { /* skip */ }
}

mark('carousels / accordions (best-effort)')
const hasSwiper = await page.evaluate(() => { const s = document.querySelector('.swiper'); return !!(s && s.swiper) }).catch(() => false)
if (hasSwiper) {
  await page.evaluate(() => document.querySelector('.swiper').scrollIntoView({ block: 'center' })).catch(() => {})
  await page.waitForTimeout(1000)
  for (let k = 0; k < 2; k++) { await page.evaluate(() => document.querySelector('.swiper').swiper.slideNext()).catch(() => {}); await page.waitForTimeout(1700) }
}
const accordions = await page.evaluate(() => Array.from(document.querySelectorAll('details>summary, [class*=accordion] [class*=trigger], [class*=accordion] [class*=header]'))
  .filter((e) => e.offsetParent).slice(0, 3).map((e, i) => { e.setAttribute('data-rec-acc', String(i)); return i })).catch(() => [])
for (const i of accordions) {
  try { await page.locator(`[data-rec-acc="${i}"]`).scrollIntoViewIfNeeded({ timeout: 1500 }); await page.locator(`[data-rec-acc="${i}"]`).click({ timeout: 1500 }); await page.waitForTimeout(900) } catch { /* skip */ }
}

mark('done')
await client.send('Page.stopScreencast').catch(() => {})
await page.waitForTimeout(300)
await context.close()
await browser.close()

if (frames.length < 2) { console.error('record-motion: too few frames captured'); process.exit(3) }
// Build a real-time concat list using each frame's true timestamp, then resample to CFR FPS.
const lines = []
for (let i = 0; i < frames.length; i++) {
  lines.push(`file '${path.resolve(frames[i].file)}'`)
  const dur = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].t - frames[i].t) : 1 / FPS
  lines.push(`duration ${dur.toFixed(4)}`)
}
lines.push(`file '${path.resolve(frames[frames.length - 1].file)}'`)
const listPath = path.join(outDir, 'frames.txt')
fs.writeFileSync(listPath, lines.join('\n'))
const master = path.join(outDir, 'master.mp4')
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listPath,
  '-vf', `fps=${FPS}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', master], { stdio: 'inherit' })
if (ff.status !== 0) { console.error('record-motion: ffmpeg assembly failed'); process.exit(4) }
const realSeconds = frames[frames.length - 1].t - frames[0].t
fs.writeFileSync(path.join(outDir, 'marks.json'), JSON.stringify({ realSeconds: +realSeconds.toFixed(2), fps: FPS, frameCount: frames.length, width: W, height: H, marks, master }, null, 2))
fs.rmSync(framesDir, { recursive: true, force: true })
fs.rmSync(listPath, { force: true })
console.log(`MASTER=${master} (${frames.length} frames -> ${FPS}fps, ${realSeconds.toFixed(1)}s real-time)`)
