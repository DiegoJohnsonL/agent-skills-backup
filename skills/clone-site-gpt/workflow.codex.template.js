export const meta = {
  name: 'clone-site-gpt',
  description: 'Clone a live URL into a d3labs prototype using Codex subagents: explore + capture ground truth, gate the scrape, infer brand/slug/category, capture judged per-section reference frames + a real-time motion breakdown, foundation-first, then one self-verifying Codex agent per section',
  phases: [
    { title: 'Explore', detail: 'parallel: source + computed.json + asset scrape, a rough scroll storyboard, and a real-time motion recording' },
    { title: 'Gate', detail: 'a Codex gatekeeper runs the checker, inspects artifacts, and fails loud unless ground truth is verified' },
    { title: 'Classify', detail: 'infer brand/slug/category from computed.json; split shared globals from per-section work' },
    { title: 'Frames', detail: 'per section, capture a clean reference frame on the original and judge it; re-shoot higher/lower until it fully shows the section' },
    { title: 'Motion', detail: 'review the recording frame-by-frame and write a section-by-section animation breakdown' },
    { title: 'Foundation', detail: 'install fonts, tokens from computed.json, page shell, one stub per section; start the dev server' },
    { title: 'Sections', detail: 'one agent per section; each screenshots its own output and iterates until it goes green against its reference frame' },
    { title: 'Assemble', detail: 'wire imports, register gallery, typecheck + lint, render-check the live route section-by-section' },
  ],
}

const { spawn } = await import('node:child_process')
const { mkdir, readFile, writeFile } = await import('node:fs/promises')
const path = (await import('node:path')).default

// args: { url, repoPath, conventionsPath, workspace?, codexModel?, codexVisionModel?, codexProfile?, codexReasoningEffort?, codexDescriberReasoningEffort? } — workspace is derived if omitted.
// Fail loud: a missing arg must abort here, never stringify to "undefined" and run on a blank path.
const a = args || {}
let { url, repoPath, conventionsPath, workspace, codexModel, codexVisionModel, codexProfile, codexReasoningEffort, codexDescriberReasoningEffort } = a
const requiredArgs = { url, repoPath, conventionsPath }
const missingArgs = Object.entries(requiredArgs)
  .filter(([, v]) => typeof v !== 'string' || !v || v === 'undefined')
  .map(([k]) => k)
if (missingArgs.length) {
  throw new Error(`clone-site-gpt: missing/invalid args [${missingArgs.join(', ')}]. Received: ${JSON.stringify(a)}`)
}
if (!/^https?:\/\//.test(url)) throw new Error(`clone-site-gpt: url must be an http(s) URL, got: ${url}`)
if (!repoPath.startsWith('/')) throw new Error(`clone-site-gpt: repoPath must be an absolute path, got: ${repoPath}`)
const hostname = (url.replace(/^https?:\/\//, '').split('/')[0] || '').replace(/^www\./, '')
if (!workspace || workspace === 'undefined') workspace = `${repoPath}/tmp/clone-${hostname}`

const skillDir = conventionsPath.replace(/\/[^/]+$/, '')
const recordScript = `${skillDir}/record-motion.mjs`
const captureScript = `${skillDir}/capture-frame.mjs`
const gateScript = `${skillDir}/gate-check.mjs`
const prepareFoundationScript = `${skillDir}/prepare-foundation.mjs`
const verifyRouteScript = `${skillDir}/verify-route.mjs`
const protoRoot = `${repoPath}/app/[locale]/prototypes`
const galleryData = `${protoRoot}/_gallery/data.ts`
const computedPath = `${workspace}/source/computed.json`
const framesDir = `${workspace}/screenshots/frames`
const motionDir = `${workspace}/screenshots/motion`
const conventions = `Read ${conventionsPath} in full and follow it exactly — it defines the d3labs target shape, file locations, libraries (Tailwind v4 + motion/react), the fonts policy, gallery registration, and the no-comments rule.`
const groundTruth = `The captured ${computedPath} is the GROUND TRUTH for values — read exact font-family, font-size(px), font-weight, line-height, letter-spacing, color, background/gradient, border-radius and spacing from it. Use the section reference frame for layout and composition only; never measure a value by eye from a screenshot.`
const codexRunRoot = `${workspace}/codex-runs`
const codexExtraDirs = [workspace, skillDir]
const toolsDir = `${workspace}/tools`
const toolUseRule = `Use bundled helper scripts as workspace-local tools: copy the needed script from ${skillDir} into ${toolsDir}, run the copy, inspect its JSON/artifacts, and if the site needs a one-off fix, patch only the workspace copy and rerun. Do not edit the canonical skill script during a clone run.`
const allowedReasoningEfforts = new Set(['low', 'medium', 'high'])
const defaultReasoningEffort = normalizeReasoningEffort(codexReasoningEffort, 'high')
const describerReasoningEffort = normalizeReasoningEffort(codexDescriberReasoningEffort, 'medium')
const defaultOpenCodeGoVisionModel = 'opencode-go/kimi-k2.7-code'
const openCodeGoVisionModels = new Set([
  'opencode-go/kimi-k2.7-code',
  'opencode-go/kimi-k2.6',
  'opencode-go/qwen3.7-plus',
  'opencode-go/qwen3.6-plus',
  'opencode-go/minimax-m3',
  'opencode-go/mimo-v2.5',
])
const openCodeGoTextOnlyModels = new Set([
  'opencode-go/glm-5.2',
  'opencode-go/glm-5.1',
  'opencode-go/glm-5',
  'opencode-go/qwen3.7-max',
  'opencode-go/deepseek-v4-pro',
  'opencode-go/deepseek-v4-flash',
  'opencode-go/minimax-m2.7',
  'opencode-go/minimax-m2.5',
  'opencode-go/mimo-v2.5-pro',
  'opencode-go/mimo-v2-pro',
])
const defaultVisionModel = resolveDefaultVisionModel(codexVisionModel, codexModel)

function normalizeReasoningEffort(value, fallback) {
  const effort = String(value || fallback).trim().toLowerCase()
  if (allowedReasoningEfforts.has(effort)) return effort
  throw new Error(`clone-site-gpt: unsupported Codex reasoning effort "${value}". Use low, medium, or high; this workflow intentionally does not run subagents at xhigh.`)
}

function normalizeModelName(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : ''
}

function isOpenCodeGoModel(value) {
  return normalizeModelName(value).startsWith('opencode-go/')
}

function isKnownOpenCodeGoVisionModel(value) {
  return openCodeGoVisionModels.has(normalizeModelName(value))
}

function isKnownOpenCodeGoTextOnlyModel(value) {
  return openCodeGoTextOnlyModels.has(normalizeModelName(value))
}

function assertVisionModel(value, context) {
  if (value && isKnownOpenCodeGoTextOnlyModel(value)) {
    throw new Error(`clone-site-gpt: ${context} uses text-only model "${value}" for an image/video task. Use a vision-capable model such as ${defaultOpenCodeGoVisionModel}, opencode-go/qwen3.7-plus, opencode-go/minimax-m3, or opencode-go/mimo-v2.5.`)
  }
}

function resolveDefaultVisionModel(requestedModel, baseModel) {
  if (requestedModel) {
    assertVisionModel(requestedModel, 'codexVisionModel')
    return requestedModel
  }
  if (isKnownOpenCodeGoVisionModel(baseModel)) return baseModel
  if (isOpenCodeGoModel(baseModel)) return defaultOpenCodeGoVisionModel
  return baseModel
}

function resolveAgentModel(options = {}) {
  const model = options.model || (options.requiresVision ? defaultVisionModel : codexModel)
  if (options.requiresVision) assertVisionModel(model, `task "${options.label || options.phase || 'agent'}"`)
  return model
}

function safeLabel(value) {
  return String(value || 'agent')
    .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agent'
}

function tail(value, max = 6000) {
  if (!value || value.length <= max) return value || ''
  return value.slice(value.length - max)
}

async function runProcess(command, commandArgs, { input = '', cwd = repoPath } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`${command} failed with exit code ${code}\n${tail(stderr || stdout)}`))
    })
    child.stdin.end(input || '')
  })
}

async function runCodexProcess(codexArgs, input) {
  return runProcess('codex', codexArgs, { input, cwd: repoPath })
}

function parseJsonMessage(message, context) {
  const text = String(message || '').trim()
  const candidates = [
    text,
    (text.match(/```(?:json)?\s*([\s\S]*?)```/i) || [])[1],
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {}
  }
  throw new Error(`Codex task ${context} did not return parseable JSON.\n${tail(text)}`)
}

async function codexAgent(prompt, options = {}) {
  const label = safeLabel(options.label || options.phase || 'agent')
  const runDir = path.join(codexRunRoot, `${Date.now()}-${label}`)
  const lastMessagePath = path.join(runDir, 'last-message.txt')
  const schemaPath = path.join(runDir, 'schema.json')
  await mkdir(runDir, { recursive: true })
  if (options.schema) {
    await writeFile(schemaPath, JSON.stringify(options.schema, null, 2))
  }

  const finalPrompt = [
    'You are a Codex subagent executing one delegated task inside the clone-site-gpt workflow.',
    `Workflow phase: ${options.phase || 'unspecified'}`,
    `Task label: ${label}`,
    `Working repo: ${repoPath}`,
    `Scratch workspace: ${workspace}`,
    `Skill directory: ${skillDir}`,
    'Do not ask the user questions. Make the best local decision, verify your own work, and fail loud if a required artifact is impossible.',
    options.requiresVision
      ? 'This task requires image/video vision. Inspect referenced PNG/JPG/WEBP/MP4 artifacts directly; if the selected model cannot view them, fail loud instead of guessing from filenames or text.'
      : '',
    options.schema
      ? `Return a single JSON object matching this output schema. Do not wrap it in Markdown.\n${JSON.stringify(options.schema, null, 2)}`
      : 'Return a concise completion report.',
    'Task:',
    prompt,
  ].join('\n\n')

  const codexArgs = [
    'exec',
    '-C', repoPath,
    '-c', `model_reasoning_effort="${normalizeReasoningEffort(options.reasoningEffort, defaultReasoningEffort)}"`,
    '--sandbox', 'danger-full-access',
    '--skip-git-repo-check',
    '--color', 'never',
    '--output-last-message', lastMessagePath,
  ]
  const agentModel = resolveAgentModel(options)
  if (agentModel) codexArgs.push('--model', agentModel)
  if (codexProfile) codexArgs.push('--profile', codexProfile)
  for (const dir of codexExtraDirs) codexArgs.push('--add-dir', dir)
  codexArgs.push('-')

  const { stdout } = await runCodexProcess(codexArgs, finalPrompt)
  const message = await readFile(lastMessagePath, 'utf8').catch(() => stdout)
  return options.schema ? parseJsonMessage(message, label) : message
}

const SCRAPE_SCHEMA = {
  type: 'object',
  required: ['computedWritten', 'cssFiles', 'imageFiles'],
  properties: {
    brand: { type: 'string' },
    computedWritten: { type: 'boolean', description: 'source/computed.json was written with per-element getComputedStyle values' },
    computedSelectors: { type: 'number' },
    cssFiles: { type: 'number' },
    fontFiles: { type: 'number', description: 'webfont files downloaded into assets/' },
    imageFiles: { type: 'number' },
    fontFaces: {
      type: 'array',
      description: 'every @font-face the page loads, with the resolved file URL',
      items: { type: 'object', properties: { family: { type: 'string' }, weight: { type: 'string' }, style: { type: 'string' }, url: { type: 'string' } } },
    },
    wordmarkSvgs: { type: 'array', items: { type: 'string' }, description: 'bespoke logotype/wordmark SVG files captured (path data), if any' },
    notes: { type: 'string' },
  },
}

const GATE_SCHEMA = {
  type: 'object',
  required: ['ok', 'reasons', 'modelVerified', 'checkedArtifacts'],
  properties: {
    ok: { type: 'boolean', description: 'true only if the model verified computed.json, source/CSS, storyboard frames, and required assets are sufficient to continue' },
    modelVerified: { type: 'boolean', description: 'true only when the gate model independently inspected the checker output and the underlying artifacts before deciding' },
    evidencePath: { type: 'string', description: 'path to the gate-check JSON evidence written by the model' },
    checkedArtifacts: { type: 'array', items: { type: 'string' }, description: 'artifact paths or directories the model inspected before deciding' },
    computedSelectors: { type: 'number' },
    cssFiles: { type: 'number' },
    assetFiles: { type: 'number' },
    frameCount: { type: 'number' },
    motionVideo: { type: 'boolean', description: 'informational: a master motion recording exists in screenshots/motion/' },
    reasons: { type: 'array', items: { type: 'string' }, description: 'what is missing when ok=false' },
  },
}

const MANIFEST_SCHEMA = {
  type: 'object',
  required: ['brand', 'slug', 'category', 'designSystem', 'globals', 'sections'],
  properties: {
    brand: { type: 'string', description: "the site's brand / company name" },
    slug: { type: 'string', description: 'kebab-case route slug from the brand; must not collide with an existing folder under the chosen category' },
    category: {
      type: 'object',
      required: ['slug', 'title', 'description', 'isNew'],
      description: 'where this clone belongs in the gallery',
      properties: {
        slug: { type: 'string', description: 'kebab-case category slug' },
        title: { type: 'string', description: 'gallery category title' },
        description: { type: 'string', description: 'one-line gallery description for the category' },
        isNew: { type: 'boolean', description: 'true when this category is not already in _gallery/data.ts and must be created' },
      },
    },
    designSystem: {
      type: 'object',
      description: 'Shared tokens to centralize in tokens.ts — values taken from computed.json, not guessed',
      properties: {
        colors: { type: 'array', items: { type: 'string' } },
        fonts: {
          type: 'array',
          description: 'each typographic role with its REAL family from computed.json and whether it is license-blocked',
          items: { type: 'object', properties: { role: { type: 'string' }, family: { type: 'string' }, source: { type: 'string' }, licenseBlocked: { type: 'boolean' } } },
        },
        radii: { type: 'array', items: { type: 'string' } },
        spacing: { type: 'string' },
        motion: { type: 'string', description: 'global easing/timing character' },
      },
    },
    globals: {
      type: 'array',
      description: 'Cross-section concerns built in the foundation (nav, footer, scroll-progress, global reveal/parallax, cursor, etc.)',
      items: { type: 'object', required: ['id', 'description'], properties: { id: { type: 'string' }, description: { type: 'string' } } },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'order', 'intent', 'frameRefs'],
        properties: {
          id: { type: 'string', description: 'kebab-case, used as the file name sections/<id>.tsx' },
          name: { type: 'string' },
          order: { type: 'number' },
          intent: { type: 'string', description: 'what the section is and shows' },
          sourceAnchor: { type: 'string', description: 'how to locate this section on the ORIGINAL page: a CSS selector or distinctive heading text, plus an approx scrollY — the Frames phase uses it' },
          frameRefs: { type: 'array', items: { type: 'string' }, description: 'rough storyboard frames for this section (non-empty); superseded by the judged frame from the Frames phase' },
          assetRefs: { type: 'array', items: { type: 'string' }, description: 'asset files this section uses' },
          usesGlobals: { type: 'array', items: { type: 'string' }, description: 'global ids this section depends on' },
          animationNotes: { type: 'string', description: 'storyboard motion hint; the Motion phase replaces it with a concrete spec' },
        },
      },
    },
  },
}

const FRAME_SCHEMA = {
  type: 'object',
  required: ['sectionId', 'framePath'],
  properties: {
    sectionId: { type: 'string' },
    framePath: { type: 'string', description: 'path to the candidate section frame written under screenshots/frames/' },
    method: { type: 'string', description: 'element-bounded screenshot of the section root, or a viewport crop at a scroll position' },
    scrollY: { type: 'number' },
    notes: { type: 'string' },
  },
}

const FRAME_JUDGE_SCHEMA = {
  type: 'object',
  required: ['sectionId', 'score', 'pass'],
  properties: {
    sectionId: { type: 'string' },
    score: { type: 'number', description: '0-100: how completely and cleanly this frame shows the whole section as a build reference' },
    pass: { type: 'boolean', description: 'true only when the frame fully and legibly shows the section with minimal neighbor bleed (score >= 85)' },
    issues: { type: 'array', items: { type: 'string' }, description: 'e.g. clipped-top, clipped-bottom, neighbor-bleed, too-zoomed-in, too-far-out, blurry, wrong-section' },
    adjustment: { type: 'string', description: 'concrete next-shot guidance: shoot higher / shoot lower / zoom out to the section element / tighten' },
  },
}

const MOTION_SCHEMA = {
  type: 'object',
  required: ['perSection', 'motionMd'],
  properties: {
    motionMd: { type: 'string', description: 'path to screenshots/motion/motion.md written with the section-by-section animation breakdown' },
    globalMotion: { type: 'string', description: 'page-wide motion character: scroll-reveal easing/stagger, sticky/transforming nav, cursor, smooth-scroll' },
    perSection: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sectionId', 'animation'],
        properties: {
          sectionId: { type: 'string' },
          animation: { type: 'string', description: 'what animates and how: elements, from->to (opacity/translate/scale), trigger (scroll-in/hover/autoplay/click), direction, easing feel, duration(s/ms), stagger' },
          clipRef: { type: 'string', description: 'the clip (or master+timestamp) that shows this section animating' },
        },
      },
    },
  },
}

const FIDELITY_SCHEMA = {
  type: 'object',
  required: ['sectionId', 'file', 'done', 'selfScreenshot', 'remainingGaps'],
  properties: {
    sectionId: { type: 'string' },
    file: { type: 'string' },
    done: { type: 'boolean', description: 'true only after the agent screenshotted its own output and it matches the reference frame' },
    selfScreenshot: { type: 'string', description: "path to the agent's own capture of the built section (required evidence)" },
    comparedAgainst: { type: 'string', description: 'the reference frame this was compared to' },
    remainingGaps: { type: 'array', items: { type: 'string' }, description: 'gaps the agent could not close (e.g. a license-blocked font it substituted — name the substitution). Empty array = green.' },
    notes: { type: 'string' },
  },
}

phase('Explore')
await parallel([
  () => codexAgent(
    `Clone the SOURCE of ${url} into ${workspace}, capturing the GROUND TRUTH a faithful rebuild needs.
Use the agent-browser CLI (run \`agent-browser skills get core\` first) plus curl/wget. Capture into ${workspace}:
- source/: the rendered DOM (outerHTML after the page settles), all linked and inline CSS, and the page JS.
- source/computed.json (REQUIRED): with agent-browser getComputedStyle, record for every key structural element (headings, body copy, eyebrows/labels, nav links, buttons/pills, cards, footer, the wordmark) — keyed by a clear selector — fontFamily, fontSize(px), fontWeight, fontStyle, lineHeight, letterSpacing, color, backgroundColor, backgroundImage (full gradient), borderRadius, boxShadow, and margins/paddings(px). Also record the page's full @font-face list with the resolved woff2/woff URLs, and document.fonts families.
- assets/: download every image, video, and webfont file (including the @font-face files listed above; follow srcset and CSS url()). For any bespoke logotype/wordmark rendered as INLINE SVG, save its exact SVG markup (path data) as assets/<name>.svg — it is artwork, not a font.
- source/inventory.md: what you captured, the brand/company name, and each asset's original URL -> local path.
Do not write into the repo's app/ or public/ — only ${workspace}. Return the structured scrape report (computedWritten must reflect whether computed.json was actually written with >0 selectors).`,
    { label: 'scrape', phase: 'Explore', schema: SCRAPE_SCHEMA },
  ),
  () => codexAgent(
    `Build a ROUGH scroll STORYBOARD of ${url} into ${workspace}/screenshots — just enough for the next phase to split the page into sections. The CLEAN per-section reference frames are captured later (Frames phase), so do NOT polish here.
Use the agent-browser CLI (run \`agent-browser skills get core\` first). At a desktop viewport (width 1440):
- Step DOWN the page in OVERLAPPING frames (~25% overlap), cut at natural section boundaries rather than fixed viewport steps, named NN-<short-label>.png in scroll order.
- Do NOT capture a full-page screenshot — a single tall image is at a different scale and only confuses the build.
- In screenshots/storyboard.md, map every frame to a tentative section id, and for each section record a sourceAnchor (a CSS selector or distinctive heading text + approx scrollY) so the Frames phase can locate it on the original, plus a one-line motion hint (entrance reveal, parallax, sticky/transforming nav, hover, autoplay).
Cover the whole page top to bottom.`,
    { label: 'storyboard', phase: 'Explore', reasoningEffort: describerReasoningEffort, requiresVision: true },
  ),
  () => codexAgent(
    `Record the LIVE MOTION of ${url} into ${motionDir} as a real-time >=30fps video — static frames cannot convey easing/timing/parallax/carousel motion.
${toolUseRule}
Use the shipped recorder as your starting tool (it launches Chromium via CDP screencast and choreographs a slow scroll down + back up, plus a best-effort hover/carousel/accordion pass, then assembles a 30fps master.mp4 + marks.json):
  mkdir -p ${toolsDir} && (test -f ${toolsDir}/record-motion.mjs || cp ${recordScript} ${toolsDir}/record-motion.mjs)
  cd ${workspace} && npm i playwright >/dev/null 2>&1 && node ${toolsDir}/record-motion.mjs ${url} ${motionDir}
If the run misses important motion because the site needs interaction-specific handling, patch ${toolsDir}/record-motion.mjs for this site, rerun it, and mention the workspace-local patch in your report.
It reuses cached Chromium / system Chrome (no download). If it exits non-zero because no Chromium/playwright is available, FALL BACK to agent-browser: \`agent-browser record start ${motionDir}/master.webm\`, then open ${url}, scroll the full page down and back up and exercise key interactions (hover CTAs, advance any carousel/accordion), then \`agent-browser record stop\` — and note in your report that this screencast is lossy on timing.
Verify the master video exists in ${motionDir} and report which method worked, the master path, and ffprobe's fps + duration.`,
    { label: 'record', phase: 'Explore' },
  ),
])

phase('Gate')
async function runGateReview(label) {
  const evidencePath = `${workspace}/gate-check-${safeLabel(label)}.json`
  return codexAgent(
    `Run and verify the scrape gate for ${url}. You are the authority for this gate; the script output is evidence, not the final decision.

Run the deterministic checker and save its JSON:
  node ${gateScript} --workspace ${workspace} --computed ${computedPath} --source ${workspace}/source --screenshots ${workspace}/screenshots --assets ${workspace}/assets --motion ${motionDir} > ${evidencePath}

Then inspect the evidence and the underlying artifacts yourself:
- Read ${evidencePath}.
- Read ${computedPath}; confirm it is real JSON with useful per-element computed styles, not an empty shell.
- Inspect ${workspace}/source/inventory.md and list ${workspace}/source; confirm rendered source/CSS was captured.
- Inspect ${workspace}/screenshots and ${workspace}/screenshots/storyboard.md; confirm storyboard frames exist and cover the page top-to-bottom enough for classify.
- Inspect ${workspace}/assets; assetFiles may be 0 only if the source/inventory proves the page genuinely has no external images, videos, webfonts, or inline-SVG artwork to capture.
- Inspect ${motionDir}; motion video is strongly preferred but non-blocking at this gate if the rest is sound. If missing, include it in reasons without failing solely for that.

Do not blindly copy the checker's ok value. If the checker says ok but the artifacts are too thin for a faithful rebuild, return ok=false with concrete reasons. If the checker flags missing assets but your inspection proves the page has no assets to capture, you may return ok=true and explain that in reasons/notes.
Return the gate decision with modelVerified=true, evidencePath=${evidencePath}, counts, checkedArtifacts, and reasons.`,
    { label: `gate:${label}`, phase: 'Gate', schema: GATE_SCHEMA, requiresVision: true },
  )
}

let gate = await runGateReview('initial')
if (!gate.ok) {
  log(`Scrape gate failed: ${(gate.reasons || []).join('; ') || 'no ground truth'} — re-running once.`)
  const retries = [() => codexAgent(
    `The previous scrape of ${url} was incomplete: ${(gate.reasons || []).join('; ') || 'computed.json missing/empty'}. Re-scrape into ${workspace} and this time GUARANTEE source/computed.json (getComputedStyle per key element, plus the @font-face list with resolved woff2 URLs) and download all images + webfonts into assets/. Capture any inline-SVG wordmark as assets/<name>.svg. Do not touch app/ or public/.`,
    { label: 'scrape-retry', phase: 'Gate', schema: SCRAPE_SCHEMA },
  )]
  if (!gate.frameCount) retries.push(() => codexAgent(
    `The previous run produced no storyboard section frames in ${workspace}/screenshots. Re-run the rough storyboard of ${url}: at a desktop viewport (width 1440) step DOWN the page in overlapping frames named NN-<short-label>.png cut at section boundaries (NO full-page screenshot), and in storyboard.md map each frame to a tentative section id + a sourceAnchor (selector or heading + approx scrollY) + a one-line motion hint.`,
    { label: 'storyboard-retry', phase: 'Gate', reasoningEffort: describerReasoningEffort, requiresVision: true },
  ))
  await parallel(retries)
  gate = await runGateReview('retry')
  if (!gate.ok) {
    throw new Error(`clone-site-gpt: scrape produced no ground truth after one retry (${(gate.reasons || []).join('; ')}). Aborting rather than building a clone by eye from screenshots.`)
  }
}

phase('Classify')
const manifest = await codexAgent(
  `Classify the cloned page into a build manifest, and decide where it belongs in the d3labs gallery.
Read the scrape in ${workspace}/source (+ inventory.md and computed.json), the storyboard in ${workspace}/screenshots (frames + storyboard.md), and the existing categories in ${galleryData} (the EN_CATEGORIES array).
${groundTruth}

Produce:
- brand: the site's brand / company name.
- slug: a kebab-case slug from the brand. Ensure ${protoRoot}/<category-slug>/<slug> does not already exist; disambiguate if it would collide.
- category: where this clone belongs. Reuse the EXISTING category whose industry best fits the site. Only if none genuinely fits, define a NEW category (kebab-case slug, Title, one-line description) and set isNew=true. Set isNew=false when reusing an existing category.
- designSystem: the shared tokens. Take colors/fonts/radii from computed.json (exact values). For EACH typographic role record its real family, its source, and whether it is license-blocked (Adobe Typekit / Fonts.com cannot be re-hosted).
- globals: cross-section concerns that must be built ONCE before sections — sticky/transforming nav, footer, scroll-progress, any page-wide reveal/parallax animation, cursor effects.
- sections: the page split top-to-bottom into ordered sections, each with a kebab-case id (becomes sections/<id>.tsx), its rough storyboard frameRefs (non-empty), a sourceAnchor (CSS selector or distinctive heading text + approx scrollY to locate it on the ORIGINAL page), the assetRefs it uses, and which globals it depends on (usesGlobals).
Be exhaustive: every part of the page from the storyboard belongs to exactly one section, in scroll order.`,
  { label: 'classify', phase: 'Classify', schema: MANIFEST_SCHEMA, requiresVision: true },
)

const slug = manifest.slug
const cat = manifest.category
const routeDir = `${protoRoot}/${cat.slug}/${slug}`
const publicDir = `${repoPath}/public/prototypes/${cat.slug}/${slug}`
const assetPath = `/prototypes/${cat.slug}/${slug}`
const href = `/prototypes/${cat.slug}/${slug}`
const previewUrl = `http://localhost:3000/en${href}`
const orderedSections = manifest.sections.slice().sort((x, y) => x.order - y.order)
const sectionLines = orderedSections.map((s) => `- ${s.id}: ${s.name} — ${s.intent}`).join('\n')

// Frames + Motion run concurrently: both depend only on Classify and feed the build.
async function frameForSection(s, nextS) {
  const framePath = `${framesDir}/${s.id}.png`
  const nextHint = nextS
    ? `the NEXT section begins at: ${nextS.sourceAnchor || nextS.name} (${nextS.intent}) — use its first on-screen label as --toText`
    : 'this is the LAST section before the footer — bound the bottom at the footer/page end (omit --toText to run to the page bottom, then trim)'
  let result = { sectionId: s.id, framePath: null, score: 0, pass: false, issues: ['capture-failed'] }
  let guidance = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cap = await codexAgent(
      `Capture ONE clean REFERENCE FRAME of the "${s.name}" section (id ${s.id}) of the ORIGINAL site ${url}. This frame is the layout SOURCE OF TRUTH a builder matches the code to, so it must show the WHOLE section — uncropped, every element fully visible (NOT left hidden mid entrance-animation), at 2x, and NEVER a full-page screenshot.
${toolUseRule}
Use the shipped helper as your starting tool — it settles + neutralizes scroll-reveals (forces hidden content visible) and crops the exact landmark-bounded region:
  mkdir -p ${toolsDir} && (test -f ${toolsDir}/capture-frame.mjs || cp ${captureScript} ${toolsDir}/capture-frame.mjs)
  cd ${workspace} && npm i playwright >/dev/null 2>&1; node ${toolsDir}/capture-frame.mjs ${url} ${framePath} --fromText "<this section's first on-screen label/heading>" --toText "<next section's first label/heading>" --dpr 2 --pad 24
- This section starts at: ${s.sourceAnchor || s.name} (${s.intent}).
- ${nextHint}.
- Choose the exact landmark TEXT by inspecting the page. If the section has a single root container, you may pass --selector "<css>" instead of --fromText/--toText. Tune --pad for breathing room above the top.
If the helper cannot locate this site's section reliably, patch ${toolsDir}/capture-frame.mjs for this site, rerun it, and mention the workspace-local patch in your report.
${attempt > 1 ? `Previous attempt rejected: ${guidance}. Fix it — adjust the landmark text / --pad, or crop the result with \`ffmpeg -i ${framePath} -vf crop=w:h:x:y out\` — so the WHOLE section shows with nothing cut or bleeding in.` : ''}
If the helper cannot run (no Chromium/playwright), fall back to agent-browser: open ${url}, scroll the section fully into view, FIRST force every reveal done (set hidden elements' opacity to 1), then screenshot and crop to the section.
Confirm ${framePath} exists and shows the entire section. Return framePath=${framePath} and the method used.`,
      { label: `frame:${s.id}#${attempt}`, phase: 'Frames', schema: FRAME_SCHEMA, requiresVision: true },
    )
    if (!cap || !cap.framePath) { guidance = 'the capture produced no file — try different landmark text or --selector'; continue }
    const j = await codexAgent(
      `Judge whether the REFERENCE FRAME at ${framePath} fully and cleanly shows the "${s.name}" section so a builder can rebuild from it. Open and inspect the image.
Section: ${s.intent}
Score 0-100: whole section present (nothing clipped top/bottom), EVERY element visible (not faded or missing due to animation), minimal bleed from neighboring sections, framed tight, sharp at 2x. pass=true ONLY if it fully and cleanly shows the section (score >= 85).
If not pass, return issues[] (clipped-top, clipped-bottom, neighbor-bleed, hidden-content, too-zoomed-out, blurry, wrong-section) and a one-line adjustment (e.g. "fromText should be the eyebrow 'WHO WE SERVE'", "increase --pad", "crop 120px off the bottom").`,
      { label: `judge:${s.id}#${attempt}`, phase: 'Frames', schema: FRAME_JUDGE_SCHEMA, requiresVision: true },
    )
    result = { sectionId: s.id, framePath, score: (j && j.score) || 0, pass: !!(j && j.pass), issues: (j && j.issues) || [] }
    if (result.pass) break
    guidance = (j && j.adjustment) || ((j && j.issues) || []).join(', ')
  }
  return result
}

async function runFrames() {
  log('Frames: capturing + judging one clean reference frame per section')
  return (await parallel(orderedSections.map((s, i) => () => frameForSection(s, orderedSections[i + 1])))).filter(Boolean)
}

async function runMotion() {
  log('Motion: reviewing the recording into a section-by-section animation breakdown')
  return codexAgent(
    `Review the MOTION RECORDING of ${url} and write a SECTION-BY-SECTION animation breakdown — the motion SOURCE OF TRUTH a builder re-authors with motion/react. Do NOT guess motion; SEE it in the frames.
Inputs:
- the master video in ${motionDir} (master.mp4, or master.webm from the fallback recorder) + ${motionDir}/marks.json (segment timestamps for scroll-down / scroll-up / hovers / carousels-accordions). If marks.json is absent (the fallback screencast does not write one), infer segment boundaries from the extracted frames — large visual jumps mark scroll/slide changes.
- ${computedPath} for exact transition/transform/animation values where the CSS exposes them.
Sections (scroll order):
${sectionLines}
Do, in order:
1. Extract frames to inspect: ffmpeg -i <master> -vf fps=8 ${motionDir}/_frames/f%04d.png — then OPEN a representative spread, and denser frames around any hover/carousel/accordion moment, to actually see the motion.
2. Cut a short clip per animated section into ${motionDir}/clips/<sectionId>.mp4 using marks.json to find each segment; keep clips short and <=720p.
3. For EACH section describe what animates and how: which elements, from->to (opacity / translateX/Y / scale / rotate), trigger (scroll-in, hover, autoplay, click), direction, easing feel (ease-out, spring, linear), duration, and any stagger. Be concrete about timing.
4. Write the whole breakdown to ${motionDir}/motion.md.
Return perSection [{sectionId, animation, clipRef}] for every section, a globalMotion summary (scroll-reveal easing/stagger, sticky-nav behavior, smooth-scroll/cursor), and the motionMd path.`,
    { label: 'motion-analysis', phase: 'Motion', schema: MOTION_SCHEMA, reasoningEffort: describerReasoningEffort, requiresVision: true },
  )
}

const [frames, motion] = await Promise.all([runFrames(), runMotion()])

const frameById = new Map(frames.map((f) => [f.sectionId, f]))
const motionById = new Map(((motion && motion.perSection) || []).map((m) => [m.sectionId, m]))
for (const s of manifest.sections) {
  const f = frameById.get(s.id)
  if (f && f.framePath) s.frameRefs = [f.framePath]
  const m = motionById.get(s.id)
  if (m) { s.motionSpec = m.animation; s.motionRef = m.clipRef }
}
const lowFrames = frames.filter((f) => !f.framePath || !f.pass)
if (lowFrames.length) log(`Frames: ${lowFrames.length} section(s) settled below the bar (best kept): ${lowFrames.map((f) => `${f.sectionId}(${f.score})`).join(', ')}`)

phase('Foundation')
const manifestPath = `${workspace}/manifest.json`
await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
const foundationPrepPath = `${workspace}/foundation-prep.json`
const generatedTokensPath = `${routeDir}/tokens.generated.ts`
const generatedFontsPath = `${routeDir}/fonts.module.css`
const generatedAssetManifestPath = `${routeDir}/asset-manifest.json`
const globalsList = manifest.globals.map((g) => `- ${g.id}: ${g.description}`).join('\n')
const sectionStubs = orderedSections.map((s) => `- sections/${s.id}.tsx (${s.name})`).join('\n')
await codexAgent(
  `Lay the SHARED FOUNDATION for the clone of ${manifest.brand} before any section is built. ${conventions}
${groundTruth}

Target route: ${routeDir}
Public assets: ${publicDir}  (referenced as ${assetPath}/<file>)
Workspace (source, computed.json, assets, screenshots, motion): ${workspace}

Design system: ${JSON.stringify(manifest.designSystem)}
Global motion character: ${(motion && motion.globalMotion) || 'see ' + motionDir + '/motion.md'}
Globals to build once:
${globalsList}
Sections (in order) to stub:
${sectionStubs}

Do all of, in order:
1. ${toolUseRule}
2. Run the foundation prep tool from a workspace copy:
   mkdir -p ${toolsDir} && (test -f ${toolsDir}/prepare-foundation.mjs || cp ${prepareFoundationScript} ${toolsDir}/prepare-foundation.mjs)
   node ${toolsDir}/prepare-foundation.mjs --repoPath ${repoPath} --workspace ${workspace} --manifest ${manifestPath} --routeDir ${routeDir} --publicDir ${publicDir} --assetPath ${assetPath} --sourceUrl ${url}
   It should write ${foundationPrepPath}, ${generatedTokensPath}, ${generatedFontsPath}, ${generatedAssetManifestPath}, page.tsx, and one section stub per section. Inspect its JSON output. If assets/fonts/stubs are missing because this site uses unusual paths, patch only ${toolsDir}/prepare-foundation.mjs and rerun until the mechanical scaffold is complete.
3. Review the generated asset manifest, token summary, font CSS, page shell, and section stubs. Keep the useful generated parts; refine only what needs human judgment.
4. FONTS FIRST (typography is the most legible fidelity signal). Verify the generated @font-face rules against computed.json. When a font is license-blocked (Typekit/Fonts.com) or wasn't captured, pick the closest free family AND record the substitution. Reproduce any bespoke wordmark/logotype from its captured assets/<name>.svg (inline the path data, fill=currentColor) — never as a system serif.
5. Create or refine tokens.ts from ${generatedTokensPath} (palette/spacing/font/motion tokens as exported consts, values from computed.json) and shared.tsx (nav, footer, scroll-progress, shared motion variants/hooks, and the wordmark SVG). Translate the scraped CSS into Tailwind utilities + tokens (do not copy raw CSS); build global animations as motion/react variants matching the recorded global motion (see ${motionDir}/motion.md).
6. Refine page.tsx: "use client", the // PROTOTYPE banner naming the brand and ${url}, importing the globals from ./shared and every section from ./sections/<id> in order.
7. Leave one stub file per section in place so page.tsx compiles now and each section agent can fill exactly one file.
8. Start the dev server so section agents can screenshot their own output: from ${repoPath}, if nothing serves http://localhost:3000, run \`npm run dev\` in the BACKGROUND; then confirm ${previewUrl} returns HTTP 200.
Match the original's tokens and layout. Do not implement section internals yet.`,
  { label: 'foundation', phase: 'Foundation', requiresVision: true },
)

phase('Sections')
async function buildSection(s) {
  return codexAgent(
    `Implement ONE section of the ${manifest.brand} clone to high fidelity, then PROVE it by screenshotting your own output and iterating until it goes GREEN against its reference frame: ${s.name} (id ${s.id}).
You own exactly one file: ${routeDir}/sections/${s.id}.tsx — do not edit any other file. ${conventions}
${groundTruth}

Reference for THIS section (the three sources of truth):
- Computed values (type/color/spacing): ${computedPath} — find this section's elements and match their exact fontFamily, fontSize(px), fontWeight, lineHeight, letterSpacing, color, background/gradient, radius. Do NOT eyeball these.
- Reference frame (layout/composition): ${(s.frameRefs || []).join(', ') || 'see ' + framesDir}
- Motion (how it animates): ${s.motionSpec || s.animationNotes || 'match what the frame implies'}${s.motionRef ? ` — open the clip ${s.motionRef} (or its frames) to match timing & easing` : ` — see ${motionDir}/motion.md`}.
- Assets under ${assetPath}/: ${(s.assetRefs || []).join(', ') || 'none specific'}
- Globals from ../shared / ../tokens (do not re-implement): ${(s.usesGlobals || []).join(', ') || 'none'}

Build, then VERIFY in a loop — do not report done until your own screenshot matches:
1. Replace the stub. Translate CSS to Tailwind utilities; re-author motion as motion/react variants per the motion reference; import tokens/fonts/global motion from the foundation, never redefine them.
2. Ensure the dev server is up; if ${previewUrl} does not return 200, run \`npm run dev\` in the background from ${repoPath} and wait.
3. With agent-browser (unique session: --session sect-${s.id}), open ${previewUrl}, scroll your section into view (eval: document.getElementById('${s.id}').scrollIntoView({block:'center'}); wait ~800ms for reveals), and screenshot it into ${workspace}/clone-shots/${s.id}.png.
4. Compare your screenshot to the reference frame AND the computed.json values. If it misses on font, type scale, color, spacing, layout or motion, fix your file and re-screenshot. Iterate up to 3 passes.
5. Close your session and report: done, selfScreenshot (your capture path), comparedAgainst (the reference frame), and remainingGaps (anything you could not close — e.g. a license-blocked font you substituted; name the substitution). An empty remainingGaps means green.`,
    { label: `section:${s.id}`, phase: 'Sections', schema: FIDELITY_SCHEMA, requiresVision: true },
  )
}
let built = (await parallel(orderedSections.map((s) => () => buildSection(s)))).filter(Boolean)

const needFix = built.filter((b) => !b.selfScreenshot || (b.remainingGaps && b.remainingGaps.length > 0))
if (needFix.length) {
  log(`${needFix.length} section(s) not green — spawning fix agents: ${needFix.map((b) => b.sectionId).join(', ')}`)
  const fixes = (await parallel(needFix.map((b) => () => {
    const s = manifest.sections.find((x) => x.id === b.sectionId) || {}
    return codexAgent(
      `The ${manifest.brand} clone section "${b.sectionId}" is not yet green. Close its remaining gaps: ${(b.remainingGaps || ['no self-screenshot was produced']).join('; ')}.
You own exactly one file: ${routeDir}/sections/${b.sectionId}.tsx. ${conventions}
${groundTruth}
Reference frame: ${(s.frameRefs || []).join(', ') || framesDir}. Motion: ${s.motionSpec || 'see ' + motionDir + '/motion.md'}${s.motionRef ? ` (clip ${s.motionRef})` : ''}.
Re-verify: with agent-browser (--session fix-${b.sectionId}) open ${previewUrl}, scroll #${b.sectionId} into view, screenshot to ${workspace}/clone-shots/${b.sectionId}.png, and compare to its reference frame + computed.json. Iterate until it matches. Report the same fidelity fields (selfScreenshot, remainingGaps).`,
      { label: `fix:${b.sectionId}`, phase: 'Sections', schema: FIDELITY_SCHEMA, requiresVision: true },
    )
  }))).filter(Boolean)
  const byId = new Map(built.map((b) => [b.sectionId, b]))
  for (const f of fixes) byId.set(f.sectionId, f)
  built = [...byId.values()]
}

phase('Assemble')
const registration = cat.isNew
  ? `The category "${cat.slug}" is NEW. Add a new Category object to EN_CATEGORIES: { slug: "${cat.slug}", title: "${cat.title}", description: "${cat.description}", variants: [ <the one variant below> ] }. Also add matching entries to the ES_CATEGORY map (title + description in Spanish) and, if you translate the style label, the ES_STYLE map, so the Spanish gallery renders.`
  : `The category "${cat.slug}" already exists. Add one Variant to that category's variants array in EN_CATEGORIES.`
const summary = await codexAgent(
  `Finalize and verify the ${manifest.brand} clone. ${conventions}

Route: ${routeDir}   Live preview: ${previewUrl}
1. Confirm page.tsx imports and renders every section in ${routeDir}/sections in scroll order, inside the shared layout.
2. Register the prototype in ${galleryData}. ${registration}
   The Variant is { name: "${manifest.brand}", style: "<short style label>", href: "${href}", cover: "${assetPath}/<hero asset>" }. (ES_CATEGORIES derives automatically from EN_CATEGORIES.)
3. From ${repoPath}, run the typecheck and lint scripts and FIX every error you introduced until both pass clean.
4. ${toolUseRule}
5. Run the route verification tool from a workspace copy:
   mkdir -p ${toolsDir} && (test -f ${toolsDir}/verify-route.mjs || cp ${verifyRouteScript} ${toolsDir}/verify-route.mjs)
   node ${toolsDir}/verify-route.mjs --repoPath ${repoPath} --url ${previewUrl} --outDir ${workspace}/clone-shots/assembled --sections ${orderedSections.map((s) => s.id).join(',')}
   Inspect ${workspace}/clone-shots/assembled/route-check.json. If verification fails because the app has a real bug (console/page error, missing section, no scroll), fix the app and rerun. If verification fails because this site needs a route-check quirk, patch only ${toolsDir}/verify-route.mjs and rerun.
Report the route path, the gallery entry you added (and whether you created a new category), the typecheck/lint result, the route-check path, and any workspace-local tool patch you made.`,
  { label: 'assemble', phase: 'Assemble', requiresVision: true },
)

return {
  route: href,
  routeDir,
  previewUrl,
  brand: manifest.brand,
  slug,
  category: cat,
  manifest,
  gate,
  frames,
  motion,
  sections: built,
  assemble: summary,
}
