export const meta = {
  name: 'clone-site-pipeline',
  description: 'Cost-tiered clone pipeline: sonnet does all capture, analysis, judging and verification; the build model (opus by default) only implements sections from tiny per-section context packs',
  phases: [
    { title: 'Explore', detail: 'sonnet ×3 in parallel: source + computed.json + asset scrape, rough scroll storyboard, real-time motion recording', model: 'sonnet' },
    { title: 'Gate', detail: 'deterministic gate-check.mjs — fail loud unless the scrape captured ground truth', model: 'sonnet' },
    { title: 'Classify', detail: 'sonnet infers brand/slug/category and splits shared globals from per-section work', model: 'sonnet' },
    { title: 'Frames', detail: 'sonnet captures + judges one clean reference frame per section (≤3 shots)', model: 'sonnet' },
    { title: 'Motion', detail: 'sonnet reviews the recording frame-by-frame into a per-section animation breakdown', model: 'sonnet' },
    { title: 'Slice', detail: 'sonnet writes one small context pack per section so builders never open the full ground truth', model: 'sonnet' },
    { title: 'Foundation', detail: 'sonnet preps fonts/tokens/stubs/dev-server; the build model authors shared.tsx once' },
    { title: 'Sections', detail: 'build model implements each section from its pack; sonnet verifies with screenshots; targeted fixes only on reported gaps' },
    { title: 'Assemble', detail: 'sonnet wires imports, registers the gallery, fixes typecheck/lint, render-checks the live route', model: 'sonnet' },
  ],
}

// args: { url, repoPath, conventionsPath, workspace?, buildModel?, buildEffort? }
// buildModel: 'opus' (default) | 'fable' (max taste) | 'sonnet' (budget) — the ONLY expensive model in the run; it touches nothing but section/shared implementation.
// buildEffort: 'medium' (default) | 'high' — reasoning effort for section builds.
// Fail loud: a missing arg must abort here, never stringify to "undefined" and run on a blank path.
// The harness sometimes delivers args as a JSON-encoded string; parse before validating.
let a = args
if (typeof a === 'string') {
  try { a = JSON.parse(a) } catch {
    throw new Error(`clone-site: args arrived as a non-JSON string (${a.slice(0, 120)}…). Pass args as a JSON object, or as its JSON.stringify'd form.`)
  }
}
a = a || {}
let { url, repoPath, conventionsPath, workspace, buildModel, buildEffort } = a
const requiredArgs = { url, repoPath, conventionsPath }
const missingArgs = Object.entries(requiredArgs)
  .filter(([, v]) => typeof v !== 'string' || !v || v === 'undefined')
  .map(([k]) => k)
if (missingArgs.length) {
  throw new Error(`clone-site: missing/invalid args [${missingArgs.join(', ')}]. Received: ${JSON.stringify(a)}`)
}
if (!/^https?:\/\//.test(url)) throw new Error(`clone-site: url must be an http(s) URL, got: ${url}`)
if (!repoPath.startsWith('/')) throw new Error(`clone-site: repoPath must be an absolute path, got: ${repoPath}`)
const hostname = (url.replace(/^https?:\/\//, '').split('/')[0] || '').replace(/^www\./, '')
if (!workspace || workspace === 'undefined') workspace = `${repoPath}/tmp/clone-${hostname}`
buildModel = ['fable', 'opus', 'sonnet'].includes(buildModel) ? buildModel : 'opus'
buildEffort = ['medium', 'high'].includes(buildEffort) ? buildEffort : 'medium'

const skillDir = conventionsPath.replace(/\/[^/]+$/, '')
const recordScript = `${skillDir}/record-motion.mjs`
const captureScript = `${skillDir}/capture-frame.mjs`
const gateScript = `${skillDir}/gate-check.mjs`
const prepScript = `${skillDir}/prepare-foundation.mjs`
const verifyRouteScript = `${skillDir}/verify-route.mjs`
const protoRoot = `${repoPath}/app/[locale]/prototypes`
const galleryData = `${protoRoot}/_gallery/data.ts`
const computedPath = `${workspace}/source/computed.json`
const framesDir = `${workspace}/screenshots/frames`
const motionDir = `${workspace}/screenshots/motion`
const ctxDir = `${workspace}/ctx`
const conventions = `Read ${conventionsPath} in full and follow it exactly — it defines the d3labs target shape, file locations, libraries (Tailwind v4 + motion/react), the fonts policy, gallery registration, and the no-comments rule.`

// ---------------------------------------------------------------------------
// legwork(): every capture/analysis/judging/verification task runs on sonnet —
// the cheap tier — as a direct agent. Effort scales with judgment: 'low' for
// mechanical script-running, 'medium' for browser/vision work, 'high' only for
// the distillation that briefs the expensive build model.
// ---------------------------------------------------------------------------
function legwork(task, { label, phase: ph, schema, vision = false, effort = 'medium' } = {}) {
  const preamble = [
    'You are a subagent executing one delegated task inside the clone-site pipeline.',
    `Working repo: ${repoPath}`,
    `Scratch workspace: ${workspace}`,
    `Skill directory (canonical helper scripts — never edit them; copy into ${workspace}/tools/ if a site-specific patch is needed): ${skillDir}`,
    'Do not ask the user questions. Make the best local decision, verify your own work, and fail loud if a required artifact is impossible.',
    'Never commit, push, or edit global config. Write only inside the workspace unless the task explicitly names repo paths.',
    'Helper scripts and page captures can outlive the default Bash timeout — pass an explicit timeout (up to 600000ms) or run them in the background and wait.',
    vision ? 'This task requires viewing images: Read the referenced PNG artifacts directly (for video, extract frames with ffmpeg first) — never judge from filenames or text.' : '',
    schema ? '' : 'End with a concise completion report (max 20 lines).',
  ].filter(Boolean).join('\n')
  return agent(`${preamble}\n\n${task}`, { model: 'sonnet', effort, label, phase: ph, schema })
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
  required: ['ok', 'reasons'],
  properties: {
    ok: { type: 'boolean', description: 'true only if computed.json is non-empty JSON with >0 selectors AND storyboard section frames exist' },
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
  required: ['sectionId', 'framePath', 'pass', 'score'],
  properties: {
    sectionId: { type: 'string' },
    framePath: { type: 'string', description: 'path to the final judged frame under screenshots/frames/' },
    pass: { type: 'boolean', description: 'true only when the final frame fully and legibly shows the whole section (judge score >= 85)' },
    score: { type: 'number', description: 'judge score 0-100 of the FINAL kept frame' },
    attempts: { type: 'number' },
    issues: { type: 'array', items: { type: 'string' }, description: 'unresolved issues on the kept frame, if any' },
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

const SLICE_SCHEMA = {
  type: 'object',
  required: ['packs'],
  properties: {
    packs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sectionId', 'path'],
        properties: { sectionId: { type: 'string' }, path: { type: 'string' }, lines: { type: 'number' } },
      },
    },
    notes: { type: 'string' },
  },
}

const SHARED_SCHEMA = {
  type: 'object',
  required: ['done', 'sharedCtxPath'],
  properties: {
    done: { type: 'boolean' },
    sharedCtxPath: { type: 'string', description: 'path to ctx/_shared.md listing every export of tokens.ts and shared.tsx with a one-line signature each' },
    substitutions: { type: 'array', items: { type: 'string' }, description: 'any font or asset substitutions made, named explicitly' },
    notes: { type: 'string' },
  },
}

const BUILD_SCHEMA = {
  type: 'object',
  required: ['sectionId', 'file', 'built'],
  properties: {
    sectionId: { type: 'string' },
    file: { type: 'string' },
    built: { type: 'boolean' },
    missingFromPack: { type: 'array', items: { type: 'string' }, description: 'values the pack should have contained but did not — never hunted down elsewhere' },
    notes: { type: 'string', description: 'max 5 lines' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['sectionId', 'pass', 'gaps'],
  properties: {
    sectionId: { type: 'string' },
    pass: { type: 'boolean', description: 'true only if the live section matches the reference frame in layout/composition AND the pack values in type, color, spacing, radius, and its motion spec' },
    screenshot: { type: 'string', description: 'path of the live-section capture compared' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'max 8, each concrete and actionable: <element> — expected <value + which source> vs actual <value>' },
  },
}

const ASSEMBLE_SCHEMA = {
  type: 'object',
  required: ['ok', 'galleryRegistered', 'typecheck', 'lint', 'renderCheck'],
  properties: {
    ok: { type: 'boolean' },
    galleryRegistered: { type: 'boolean' },
    newCategoryCreated: { type: 'boolean' },
    typecheck: { type: 'string', description: 'pass | the remaining error summary' },
    lint: { type: 'string', description: 'pass | the remaining error summary' },
    renderCheck: { type: 'string', description: 'zero-console-errors + per-section compare result, max 6 lines' },
    assembledScreenshot: { type: 'string' },
    divergences: { type: 'array', items: { type: 'string' }, description: 'material divergences from the original still visible on the live route' },
  },
}

phase('Explore')
await parallel([
  () => legwork(
    `Clone the SOURCE of ${url} into ${workspace}, capturing the GROUND TRUTH a faithful rebuild needs.
Use the agent-browser CLI (run \`agent-browser skills get core\` first) plus curl/wget. Capture into ${workspace}:
- source/: the rendered DOM (outerHTML after the page settles), all linked and inline CSS, and the page JS.
- source/computed.json (REQUIRED): with agent-browser getComputedStyle, record for every key structural element (headings, body copy, eyebrows/labels, nav links, buttons/pills, cards, footer, the wordmark) — keyed by a clear selector — fontFamily, fontSize(px), fontWeight, fontStyle, lineHeight, letterSpacing, color, backgroundColor, backgroundImage (full gradient), borderRadius, boxShadow, and margins/paddings(px). Also record the page's full @font-face list with the resolved woff2/woff URLs, and document.fonts families.
- assets/: download every image, video, and webfont file (including the @font-face files listed above; follow srcset and CSS url()). For any bespoke logotype/wordmark rendered as INLINE SVG, save its exact SVG markup (path data) as assets/<name>.svg — it is artwork, not a font.
- source/inventory.md: what you captured, the brand/company name, and each asset's original URL -> local path.
Do not write into the repo's app/ or public/ — only ${workspace}. computedWritten must reflect whether computed.json was actually written with >0 selectors.`,
    { label: 'scrape', phase: 'Explore', schema: SCRAPE_SCHEMA },
  ),
  () => legwork(
    `Build a ROUGH scroll STORYBOARD of ${url} into ${workspace}/screenshots — just enough for the classify pass to split the page into sections. The CLEAN per-section reference frames are captured later, so do NOT polish here.
Use the agent-browser CLI (run \`agent-browser skills get core\` first). At a desktop viewport (width 1440):
- Step DOWN the page in OVERLAPPING frames (~25% overlap), cut at natural section boundaries rather than fixed viewport steps, named NN-<short-label>.png in scroll order.
- Do NOT capture a full-page screenshot — a single tall image is at a different scale and only confuses the build.
- In screenshots/storyboard.md, map every frame to a tentative section id, and for each section record a sourceAnchor (a CSS selector or distinctive heading text + approx scrollY) so the Frames phase can locate it on the original, plus a one-line motion hint (entrance reveal, parallax, sticky/transforming nav, hover, autoplay).
Cover the whole page top to bottom.`,
    { label: 'storyboard', phase: 'Explore', vision: true },
  ),
  () => legwork(
    `Record the LIVE MOTION of ${url} into ${motionDir} as a real-time >=30fps video — static frames cannot convey easing/timing/parallax/carousel motion.
Run the shipped recorder (it launches Chromium via CDP screencast and choreographs a slow scroll down + back up, plus a best-effort hover/carousel/accordion pass, then assembles a 30fps master.mp4 + marks.json):
  cd ${workspace} && npm i playwright >/dev/null 2>&1 && node ${recordScript} ${url} ${motionDir}
It reuses cached Chromium / system Chrome (no download). If it exits non-zero because no Chromium/playwright is available, FALL BACK to agent-browser: \`agent-browser record start ${motionDir}/master.webm\`, then open ${url}, scroll the full page down and back up and exercise key interactions (hover CTAs, advance any carousel/accordion), then \`agent-browser record stop\` — and note in your report that this screencast is lossy on timing.
Verify the master video exists in ${motionDir} and report which method worked, the master path, and ffprobe's fps + duration.`,
    { label: 'record', phase: 'Explore', effort: 'low' },
  ),
])

phase('Gate')
const gatePrompt = `Run the deterministic scrape gate and relay its verdict — do NOT rebuild or eyeball anything yourself.
1. Run: node ${gateScript} --workspace ${workspace}
2. Sanity-check its JSON against reality: \`head -c 300 ${computedPath}\` is valid JSON, \`ls ${workspace}/screenshots | head\` shows numbered storyboard frames (and NO 00-full.png).
3. Return the script's fields mapped into the schema. ok=true ONLY if computed.json has >0 selectors AND storyboard frames exist. Put every missing/empty piece in reasons[]. motionVideo is informational — never fail the gate on it.`
let gate = await agent(gatePrompt, { model: 'sonnet', effort: 'low', label: 'gate', phase: 'Gate', schema: GATE_SCHEMA })
if (!gate.ok) {
  log(`Scrape gate failed: ${(gate.reasons || []).join('; ') || 'no ground truth'} — re-running once.`)
  const retries = [() => legwork(
    `The previous scrape of ${url} was incomplete: ${(gate.reasons || []).join('; ') || 'computed.json missing/empty'}. Re-scrape into ${workspace} and this time GUARANTEE source/computed.json (getComputedStyle per key element, plus the @font-face list with resolved woff2 URLs) and download all images + webfonts into assets/. Capture any inline-SVG wordmark as assets/<name>.svg. Do not touch app/ or public/.`,
    { label: 'scrape-retry', phase: 'Gate', schema: SCRAPE_SCHEMA },
  )]
  if (!gate.frameCount) retries.push(() => legwork(
    `The previous run produced no storyboard section frames in ${workspace}/screenshots. Re-run the rough storyboard of ${url}: at a desktop viewport (width 1440) step DOWN the page in overlapping frames named NN-<short-label>.png cut at section boundaries (NO full-page screenshot), and in storyboard.md map each frame to a tentative section id + a sourceAnchor (selector or heading + approx scrollY) + a one-line motion hint.`,
    { label: 'storyboard-retry', phase: 'Gate', vision: true },
  ))
  await parallel(retries)
  gate = await agent(gatePrompt, { model: 'sonnet', effort: 'low', label: 'gate-retry', phase: 'Gate', schema: GATE_SCHEMA })
  if (!gate.ok) {
    throw new Error(`clone-site: scrape produced no ground truth after one retry (${(gate.reasons || []).join('; ')}). Aborting rather than building a clone by eye from screenshots.`)
  }
}

phase('Classify')
const manifest = await legwork(
  `Classify the cloned page into a build manifest, and decide where it belongs in the d3labs gallery.
Read the scrape in ${workspace}/source (+ inventory.md and computed.json), the storyboard in ${workspace}/screenshots (open the frames + storyboard.md), and the existing categories in ${galleryData} (the EN_CATEGORIES array).
The captured ${computedPath} is the GROUND TRUTH for values — take every design-system value from it, never by eye from a screenshot.

Produce:
- brand: the site's brand / company name.
- slug: a kebab-case slug from the brand. Ensure ${protoRoot}/<category-slug>/<slug> does not already exist; disambiguate if it would collide.
- category: where this clone belongs. Reuse the EXISTING category whose industry best fits the site. Only if none genuinely fits, define a NEW category (kebab-case slug, Title, one-line description) and set isNew=true. Set isNew=false when reusing an existing category.
- designSystem: the shared tokens. Take colors/fonts/radii from computed.json (exact values). For EACH typographic role record its real family, its source, and whether it is license-blocked (Adobe Typekit / Fonts.com cannot be re-hosted).
- globals: cross-section concerns that must be built ONCE before sections — sticky/transforming nav, footer, scroll-progress, any page-wide reveal/parallax animation, cursor effects.
- sections: the page split top-to-bottom into ordered sections, each with a kebab-case id (becomes sections/<id>.tsx), its rough storyboard frameRefs (non-empty), a sourceAnchor (CSS selector or distinctive heading text + approx scrollY to locate it on the ORIGINAL page), the assetRefs it uses, and which globals it depends on (usesGlobals).
Be exhaustive: every part of the page from the storyboard belongs to exactly one section, in scroll order.
Also write the full manifest JSON to ${workspace}/manifest.json (same object as your fenced JSON block).`,
  { label: 'classify', phase: 'Classify', vision: true, effort: 'high', schema: MANIFEST_SCHEMA },
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

// Frames + Motion run concurrently: both depend only on Classify and feed the packs.
async function frameForSection(s, nextS) {
  const framePath = `${framesDir}/${s.id}.png`
  const nextHint = nextS
    ? `the NEXT section begins at: ${nextS.sourceAnchor || nextS.name} (${nextS.intent}) — use its first on-screen label as --toText`
    : 'this is the LAST section before the footer — bound the bottom at the footer/page end (omit --toText to run to the page bottom, then trim)'
  return legwork(
    `Capture ONE clean REFERENCE FRAME of the "${s.name}" section (id ${s.id}) of the ORIGINAL site ${url}, then JUDGE it yourself and re-shoot until it passes (max 3 attempts). This frame is the layout SOURCE OF TRUTH a builder matches the code to, so it must show the WHOLE section — uncropped, every element fully visible (NOT left hidden mid entrance-animation), at 2x, and NEVER a full-page screenshot.
Capture with the shipped helper — it settles + neutralizes scroll-reveals (forces hidden content visible) and crops the exact landmark-bounded region:
  cd ${workspace} && npm i playwright >/dev/null 2>&1; node ${captureScript} ${url} ${framePath} --fromText "<this section's first on-screen label/heading>" --toText "<next section's first label/heading>" --dpr 2 --pad 24
- This section starts at: ${s.sourceAnchor || s.name} (${s.intent}).
- ${nextHint}.
- Choose the exact landmark TEXT by inspecting the page. If the section has a single root container, you may pass --selector "<css>" instead of --fromText/--toText. Tune --pad for breathing room above the top.
After each shot OPEN ${framePath} and judge it 0-100: whole section present (nothing clipped top/bottom), EVERY element visible (not faded or missing due to animation), minimal bleed from neighboring sections, framed tight, sharp at 2x. pass requires score >= 85. If it fails, fix the landmark text / --pad, or crop with \`ffmpeg -i ${framePath} -vf crop=w:h:x:y out\`, and re-shoot.
If the helper cannot run (no Chromium/playwright), fall back to agent-browser: open ${url}, scroll the section fully into view, FIRST force every reveal done (set hidden elements' opacity to 1), then screenshot and crop to the section.
Keep the BEST frame at ${framePath} and report its final score, pass, attempts, and unresolved issues.`,
    { label: `frame:${s.id}`, phase: 'Frames', vision: true, schema: FRAME_SCHEMA },
  )
}

async function runFrames() {
  log('Frames: sonnet capturing + judging one clean reference frame per section')
  return (await parallel(orderedSections.map((s, i) => () => frameForSection(s, orderedSections[i + 1])))).filter(Boolean)
}

async function runMotion() {
  log('Motion: sonnet reviewing the recording into a section-by-section animation breakdown')
  return legwork(
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
    { label: 'motion-analysis', phase: 'Motion', vision: true, schema: MOTION_SCHEMA },
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

// Slice + Foundation run concurrently: packs are what keep the expensive build
// model's context tiny — a builder reads its pack, never the raw ground truth.
phase('Slice')
const sliceSpec = orderedSections.map((s) => ({
  id: s.id, name: s.name, intent: s.intent, sourceAnchor: s.sourceAnchor || '',
  frame: (s.frameRefs || [])[0] || '', motionSpec: s.motionSpec || s.animationNotes || '',
  motionRef: s.motionRef || '', assetRefs: s.assetRefs || [], usesGlobals: s.usesGlobals || [],
}))

async function runSlice() {
  return legwork(
    `Write ONE CONTEXT PACK per section into ${ctxDir}/<sectionId>.md. Each pack is the ONLY briefing an expensive builder model will receive for that section — it will NOT open computed.json, motion.md, the storyboard, or source/. A value missing from the pack is a value missing from the clone, so packs must be complete; but keep each pack under ~120 lines — literal values, no prose padding.
Sections (JSON): ${JSON.stringify(sliceSpec)}
Sources: ${computedPath} (values), ${motionDir}/motion.md (+ each section's motionSpec above), ${workspace}/source/inventory.md, ${publicDir} will serve assets at ${assetPath}/<file>.
Each pack MUST contain, as literal values (never "see computed.json"):
1. TYPE — every text role in the section: exact fontFamily, fontSize(px), fontWeight, lineHeight, letterSpacing, color, and text-transform if any.
2. SURFACES — background colors/gradients (full CSS gradient strings), borders, borderRadius, boxShadow per element.
3. LAYOUT NUMBERS — key paddings/margins/gaps/max-widths(px) from computed.json for the section's containers.
4. MOTION — the section's motionSpec verbatim + its clip path, plus exact CSS transition/animation values where computed.json exposes them.
5. ASSETS — each asset file the section uses, copied-name under ${assetPath}/ (list the intended public filename even if the copy happens in the foundation phase; keep names identical to ${workspace}/assets/ names).
6. GLOBALS — the usesGlobals ids, with the note that their implementations come from ../shared and ../tokens (interfaces listed in ${ctxDir}/_shared.md).
7. REFERENCE FRAME — the frame path.
Cross-check EACH pack against its reference frame image: every visible text block and surface in the frame must have its values present. Report each pack path.`,
    { label: 'slice', phase: 'Slice', vision: true, effort: 'high', schema: SLICE_SCHEMA },
  )
}

phase('Foundation')
const globalsList = manifest.globals.map((g) => `- ${g.id}: ${g.description}`).join('\n')
const sectionStubs = orderedSections.map((s) => `- sections/${s.id}.tsx (${s.name})`).join('\n')

async function runFoundation() {
  await legwork(
    `Prepare the mechanical FOUNDATION for the clone of ${manifest.brand}. ${conventions}
Target route: ${routeDir}   Public assets: ${publicDir} (served as ${assetPath}/<file>)   Workspace: ${workspace}
The manifest is at ${workspace}/manifest.json (written by the classify pass; if missing, fail loud).
Do, in order:
1. Run the shipped prep tool (copy it to ${workspace}/tools/ first, patch only that copy if this site needs it):
   node ${workspace}/tools/prepare-foundation.mjs --repoPath ${repoPath} --workspace ${workspace} --manifest ${workspace}/manifest.json --routeDir ${routeDir} --publicDir ${publicDir} --assetPath ${assetPath} --sourceUrl ${url}
   (copy from ${prepScript}). Inspect what it generated: asset manifest, token summary, font CSS, page shell, section stubs.
2. FONTS FIRST: self-host the real webfonts — copy captured font files from ${workspace}/assets into ${publicDir}/fonts and declare them with next/font/local or @font-face using the EXACT family names + weights from computed.json. When a font is license-blocked (Typekit/Fonts.com) or wasn't captured, pick the closest free family AND record the substitution in your report. Copy the bespoke wordmark SVG (if captured) so the shared build can inline it.
3. Copy every other asset the sections/globals need from ${workspace}/assets into ${publicDir}, KEEPING the original filenames (the context packs reference them by name).
4. Create a draft tokens.ts (palette/spacing/font/motion tokens as exported consts, values from computed.json) and a STUB sections/<id>.tsx for every section so page.tsx compiles now:
${sectionStubs}
5. Create page.tsx: "use client", the // PROTOTYPE banner naming ${manifest.brand} and ${url}, importing globals from ./shared (stub it too) and every section from ./sections/<id> in order.
6. Start the dev server so verifiers can screenshot: from ${repoPath}, if nothing serves http://localhost:3000, run \`npm run dev\` in the background; confirm ${previewUrl} returns HTTP 200 (a stubbed page is fine).
Do not implement section internals or polish shared components — a design-strong model does that next.`,
    { label: 'foundation-prep', phase: 'Foundation', effort: 'low' },
  )
  return agent(
    `Author the SHARED LAYER of the ${manifest.brand} clone — the one place globals live so no section re-implements them. ${conventions}
Your briefing is ONLY: this prompt, ${routeDir}/tokens.ts (draft — finalize it), the reference frames ${(orderedSections[0].frameRefs || [])[0] || framesDir + '/'} (nav is visible at its top) and ${(orderedSections[orderedSections.length - 1].frameRefs || [])[0] || framesDir + '/'} (footer), and the conventions file. Do NOT open computed.json, motion.md, source/, or the storyboard — the draft tokens + frames carry the values; if something you need is missing, note it in your report rather than hunting.
Build in ${routeDir}:
- shared.tsx: nav, footer, scroll-progress, and shared motion/react variants/hooks for the global motion character: ${(motion && motion.globalMotion) || 'standard scroll-reveals'}. Inline the wordmark SVG from ${publicDir} if present (fill=currentColor) — never render a logotype in a system font.
- finalize tokens.ts (exported consts; keep the draft's captured values, organize, remove dead entries).
Globals to cover:
${globalsList}
Then write ${ctxDir}/_shared.md: every export of tokens.ts and shared.tsx with a one-line signature + usage note each (section builders import ONLY through these). Keep it under 60 lines.
Do not edit page.tsx imports beyond what the stubs already wire, and do not touch sections/.`,
    { model: buildModel, effort: buildEffort, label: `shared:${buildModel}`, phase: 'Foundation', schema: SHARED_SCHEMA },
  )
}

const [packs] = await Promise.all([runSlice(), runFoundation()])
const packById = new Map(((packs && packs.packs) || []).map((p) => [p.sectionId, p.path]))

phase('Sections')
async function buildVerifyFix(s) {
  const pack = packById.get(s.id) || `${ctxDir}/${s.id}.md`
  const frame = (s.frameRefs || [])[0] || `${framesDir}/${s.id}.png`
  const buildPrompt = (gaps) => `Implement ONE section of the ${manifest.brand} clone to high visual fidelity: ${s.name} (id ${s.id}).
You own exactly one file: ${routeDir}/sections/${s.id}.tsx — edit nothing else. ${conventions}
Your ENTIRE briefing — read these and NOTHING else (no computed.json, no motion.md, no storyboard, no source/; the pack contains every value on purpose, and hunting beyond it wastes the budget):
1. Context pack (values ground truth): ${pack}
2. Reference frame image (layout/composition ground truth): ${frame}
3. Shared interfaces: ${ctxDir}/_shared.md — import tokens/fonts/global motion from ../tokens and ../shared, never redefine them.
4. The conventions file above, and your current stub file.
Translate the pack's CSS values into Tailwind utilities; re-author the pack's MOTION spec as motion/react variants (match trigger, direction, easing feel, duration, stagger). Give your section root id="${s.id}". Use the listed assets from ${assetPath}/.
${gaps ? `A verifier compared the live render against the references and found these gaps — close exactly these:\n${gaps.map((g) => `- ${g}`).join('\n')}` : ''}
Do NOT run the dev server or screenshot — an independent verifier does that. If the pack lacks a value you need, use the frame for layout judgment only, and list the miss in missingFromPack. Report in max 5 lines of notes.`

  let built = await agent(buildPrompt(null), { model: buildModel, effort: buildEffort, label: `build:${s.id}`, phase: 'Sections', schema: BUILD_SCHEMA })
  let verdict = null
  for (let round = 0; round <= 2; round++) {
    verdict = await legwork(
      `VERIFY one built section of the ${manifest.brand} clone against its references: ${s.name} (id ${s.id}).
1. Ensure ${previewUrl} returns 200 (if not, run \`npm run dev\` in the background from ${repoPath} and wait).
2. With agent-browser (unique session: --session verify-${s.id}), open ${previewUrl}, scroll the section into view (eval: document.getElementById('${s.id}').scrollIntoView({block:'center'}); wait ~800ms for reveals), screenshot it to ${workspace}/clone-shots/${s.id}.png. Check the browser console for errors involving this section.
3. OPEN and compare your screenshot against the reference frame ${frame} AND the values in the context pack ${pack}: typography (family/size/weight/spacing), colors/gradients, radii/shadows, layout numbers, assets present, and — by re-scrolling with a fresh reload — whether the pack's motion spec plays (trigger, direction, easing feel).
pass=true ONLY when layout, values, and motion all match. Otherwise return up to 8 concrete gaps, each "<element> — expected <value + source (pack/frame)> vs actual <what you saw>". Do NOT edit any file.`,
      { label: `verify:${s.id}#${round}`, phase: 'Sections', vision: true, schema: VERIFY_SCHEMA },
    )
    if (!verdict || verdict.pass || round === 2) break
    log(`section ${s.id}: ${verdict.gaps.length} gap(s) → fix round ${round + 1}`)
    built = await agent(buildPrompt(verdict.gaps.slice(0, 8)), { model: buildModel, effort: 'medium', label: `fix:${s.id}#${round + 1}`, phase: 'Sections', schema: BUILD_SCHEMA })
  }
  return {
    sectionId: s.id,
    file: `${routeDir}/sections/${s.id}.tsx`,
    pass: !!(verdict && verdict.pass),
    selfScreenshot: (verdict && verdict.screenshot) || '',
    remainingGaps: verdict && !verdict.pass ? verdict.gaps || ['verifier returned nothing'] : [],
    missingFromPack: (built && built.missingFromPack) || [],
  }
}
const sections = (await parallel(orderedSections.map((s) => () => buildVerifyFix(s)))).filter(Boolean)
const notGreen = sections.filter((x) => !x.pass)
if (notGreen.length) log(`${notGreen.length} section(s) ended not green: ${notGreen.map((x) => `${x.sectionId}(${x.remainingGaps.length} gaps)`).join(', ')}`)

phase('Assemble')
const registration = cat.isNew
  ? `The category "${cat.slug}" is NEW. Add a new Category object to EN_CATEGORIES: { slug: "${cat.slug}", title: "${cat.title}", description: "${cat.description}", variants: [ <the one variant below> ] }. Also add matching entries to the ES_CATEGORY map (title + description in Spanish) and, if you translate the style label, the ES_STYLE map, so the Spanish gallery renders.`
  : `The category "${cat.slug}" already exists. Add one Variant to that category's variants array in EN_CATEGORIES.`
const assemble = await legwork(
  `Finalize and verify the ${manifest.brand} clone. ${conventions}
Route: ${routeDir}   Live preview: ${previewUrl}
1. Confirm page.tsx imports and renders every section in ${routeDir}/sections in scroll order, inside the shared layout.
2. Register the prototype in ${galleryData}. ${registration}
   The Variant is { name: "${manifest.brand}", style: "<short style label>", href: "${href}", cover: "${assetPath}/<hero asset>" }. (ES_CATEGORIES derives automatically from EN_CATEGORIES.)
3. From ${repoPath}, run the typecheck and lint scripts and FIX every error this clone introduced until both pass clean. Fix only files under ${routeDir}, ${publicDir}, and the gallery data entry you added.
4. RENDER-CHECK the live route SECTION-BY-SECTION (a green build is not a faithful clone). Copy ${verifyRouteScript} to ${workspace}/tools/ and run:
   node ${workspace}/tools/verify-route.mjs --repoPath ${repoPath} --url ${previewUrl} --outDir ${workspace}/clone-shots/assemble --sections ${orderedSections.map((s) => s.id).join(',')}
   Then inspect its JSON + captures: assert zero console errors, and compare each section capture to its reference frame in ${framesDir}. Screenshot the assembled page to ${workspace}/clone-shots/assembled-full.png for the human spot-check.
Report registration, typecheck/lint state, the render-check result, and any material divergence (placeholder content, missing fonts, wrong layout, missing motion).`,
  { label: 'assemble', phase: 'Assemble', vision: true, schema: ASSEMBLE_SCHEMA },
)

return {
  route: href,
  routeDir,
  previewUrl,
  brand: manifest.brand,
  slug,
  category: cat,
  buildModel,
  buildEffort,
  gate,
  frames: frames.map((f) => ({ sectionId: f.sectionId, score: f.score, pass: f.pass })),
  sections,
  assemble,
}
