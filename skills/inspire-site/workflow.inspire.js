export const meta = {
  name: 'inspire-site',
  description: 'Design-inspiration pipeline: sonnet extracts 1–3 reference sites in full and distills them into ref cards + a content brief; the build model authors N distinct direction specs and builds one whole inspired page per variant; the user judges',
  phases: [
    { title: 'Extract', detail: 'sonnet per reference: full scrape + computed.json, storyboard, real-time motion recording; scaffold/verify the target app in parallel', model: 'sonnet' },
    { title: 'Gate', detail: 'gate-check.mjs per reference — incremental retry of thin refs once; abort only if ALL refs lack ground truth', model: 'sonnet' },
    { title: 'Curate', detail: 'sonnet per reference: one trimmed ~100-line ref card + one clean full-res frame per section — the builders\' entire view of that reference', model: 'sonnet' },
    { title: 'Brief', detail: 'sonnet writes the content brief from the user docs (runs alongside Curate)', model: 'sonnet' },
    { title: 'Directions', detail: 'the build model authors one small design-direction spec per variant' },
    { title: 'Variants', detail: 'one build-model agent per variant builds its whole page in its own folder' },
    { title: 'Assemble', detail: 'sonnet wires the switcher, aggregates STAND-INS.md, fixes typecheck/lint, screenshots each variant', model: 'sonnet' },
  ],
}

// args: {
//   urls: string[] (1–3),
//   constraints: string (freeform direction from the user's prompt; may be ''),
//   docPaths: string[] (project docs for the content brief; may be []),
//   target: { kind: 'scratch'|'existing'|'d3labs', appDir, routeDir, publicDir, assetBase, previewUrl, port, galleryData? , categorySlug?, slug? },
//   workspace: string (absolute; created by the orchestrator),
//   helpersDir: string (clone-site skill dir holding the canonical capture scripts),
//   conventionsPath: string,
//   variants?: number (default 3, max 4),
//   buildModel?: 'fable'|'opus'|'sonnet' (default 'opus'; 'fable' for max taste),
//   buildEffort?: 'medium'|'high' (default 'high'),
// }
// The harness sometimes delivers args as a JSON-encoded string; parse before validating.
let a = args
if (typeof a === 'string') {
  try { a = JSON.parse(a) } catch {
    throw new Error(`inspire-site: args arrived as a non-JSON string (${a.slice(0, 120)}…). Pass args as a JSON object, or as its JSON.stringify'd form.`)
  }
}
a = a || {}
let { urls, constraints, docPaths, target, workspace, helpersDir, conventionsPath, variants, buildModel, buildEffort } = a
if (typeof urls === 'string') urls = urls.split(/[\s,]+/).filter(Boolean)
if (typeof docPaths === 'string') docPaths = docPaths.split(/[\s,]+/).filter(Boolean)
if (typeof target === 'string') { try { target = JSON.parse(target) } catch {} }
const requiredArgs = { workspace, helpersDir, conventionsPath }
const missingArgs = Object.entries(requiredArgs)
  .filter(([, v]) => typeof v !== 'string' || !v || v === 'undefined')
  .map(([k]) => k)
if (!Array.isArray(urls) || urls.length < 1 || urls.length > 3 || urls.some((u) => !/^https?:\/\//.test(String(u)))) {
  throw new Error(`inspire-site: urls must be 1–3 http(s) URLs, got: ${JSON.stringify(urls)}`)
}
if (!target || typeof target !== 'object' || !target.appDir || !target.routeDir || !target.previewUrl || !target.kind) {
  throw new Error(`inspire-site: target must carry kind/appDir/routeDir/previewUrl, got: ${JSON.stringify(target)}`)
}
if (missingArgs.length) throw new Error(`inspire-site: missing/invalid args [${missingArgs.join(', ')}]. Received keys: ${Object.keys(a).join(', ')}`)
constraints = typeof constraints === 'string' ? constraints : ''
docPaths = Array.isArray(docPaths) ? docPaths.filter(Boolean) : []
const variantCount = Math.min(Math.max(Number(variants) || 3, 1), 4)
buildModel = ['fable', 'opus', 'sonnet'].includes(buildModel) ? buildModel : 'opus'
buildEffort = ['medium', 'high'].includes(buildEffort) ? buildEffort : 'high'

const recordScript = `${helpersDir}/record-motion.mjs`
const captureScript = `${helpersDir}/capture-frame.mjs`
const gateScript = `${helpersDir}/gate-check.mjs`
const briefPath = `${workspace}/content-brief.md`
const refs = urls.map((u) => {
  const host = (String(u).replace(/^https?:\/\//, '').split('/')[0] || '').replace(/^www\./, '')
  return { url: u, host, dir: `${workspace}/refs/${host}` }
})
const variantIds = ['a', 'b', 'c', 'd'].slice(0, variantCount)
const conventions = `Read ${conventionsPath} in full and follow it exactly — it defines the stack (Next.js + Tailwind v4 + motion/react), the one-route ?variant= switcher shape, the folder-per-variant ownership rule, the inspiration rules (structure/motion yes; copy never; borrowed assets are STAND-INS logged in STAND-INS.md), and the per-target shape. This run's target kind: ${target.kind}.`
const constraintsBlock = constraints ? `USER CONSTRAINTS for this run (they override defaults — honor them in every decision):\n${constraints}` : 'No extra user constraints for this run.'

// ---------------------------------------------------------------------------
// legwork(): all legwork runs on sonnet — the cheap tier — as a direct agent.
// Effort scales with judgment: 'low' for mechanical script-running, 'medium'
// for browser/vision work, 'high' only for curation (the distillation that
// briefs the expensive build model).
// ---------------------------------------------------------------------------
function legwork(task, { label, phase: ph, schema, vision = false, effort = 'medium' } = {}) {
  const preamble = [
    'You are a subagent executing one delegated task inside the inspire-site pipeline.',
    `Target app: ${target.appDir} (kind: ${target.kind})`,
    `Scratch workspace: ${workspace}`,
    `Canonical helper scripts (never edit them; copy into ${workspace}/tools/ if a site-specific patch is needed): ${helpersDir}`,
    'Do not ask the user questions. Make the best local decision, verify your own work, and fail loud if a required artifact is impossible.',
    'Never commit, push, or edit global config. Write only inside the workspace and the paths the task explicitly names.',
    'Helper scripts and page captures can outlive the default Bash timeout — pass an explicit timeout (up to 600000ms) or run them in the background and wait.',
    vision ? 'This task requires viewing images: Read the referenced PNG artifacts directly (for video, extract frames with ffmpeg first) — never judge from filenames or text.' : '',
    schema ? '' : 'End with a concise completion report (max 20 lines).',
  ].filter(Boolean).join('\n')
  return agent(`${preamble}\n\n${task}`, { model: 'sonnet', effort, label, phase: ph, schema })
}

const SCRAPE_SCHEMA = {
  type: 'object',
  required: ['host', 'computedWritten', 'cssFiles', 'imageFiles'],
  properties: {
    host: { type: 'string' },
    brand: { type: 'string' },
    computedWritten: { type: 'boolean' },
    computedSelectors: { type: 'number' },
    cssFiles: { type: 'number' },
    fontFiles: { type: 'number' },
    imageFiles: { type: 'number' },
    notes: { type: 'string' },
  },
}

const GATE_SCHEMA = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['host', 'ok', 'reasons'],
        properties: {
          host: { type: 'string' },
          ok: { type: 'boolean', description: 'true only if this ref\'s computed.json has >0 selectors AND storyboard frames exist' },
          computedSelectors: { type: 'number' },
          frameCount: { type: 'number' },
          assetFiles: { type: 'number' },
          motionVideo: { type: 'boolean' },
          reasons: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const CARD_SCHEMA = {
  type: 'object',
  required: ['host', 'cardPath', 'sections'],
  properties: {
    host: { type: 'string' },
    cardPath: { type: 'string', description: 'refs/<host>/ref-card.md — the trimmed ~100-line curated card' },
    brand: { type: 'string' },
    cardLines: { type: 'number' },
    sections: {
      type: 'array',
      description: 'the reference page top-to-bottom; EVERY section must carry its clean frame',
      items: {
        type: 'object',
        required: ['id', 'pattern', 'framePath'],
        properties: {
          id: { type: 'string' },
          pattern: { type: 'string', description: 'the reusable layout/component pattern this section embodies, one line' },
          framePath: { type: 'string', description: 'refs/<host>/frames/<id>.png — full-resolution, whole section, no neighbor overlap' },
          motion: { type: 'string', description: 'one-line motion character' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const BRIEF_SCHEMA = {
  type: 'object',
  required: ['briefPath', 'briefSource'],
  properties: {
    briefPath: { type: 'string' },
    briefSource: { type: 'string', description: 'docs | neutral-placeholder' },
    notes: { type: 'string' },
  },
}

const DIRECTIONS_SCHEMA = {
  type: 'object',
  required: ['directions'],
  properties: {
    directions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['variantId', 'name', 'specPath'],
        properties: {
          variantId: { type: 'string' },
          name: { type: 'string', description: 'short evocative direction name' },
          specPath: { type: 'string', description: 'workspace/directions/<variantId>.md' },
          summary: { type: 'string', description: 'one line: what this direction takes from which reference and how it differs from the others' },
        },
      },
    },
  },
}

const VARIANT_SCHEMA = {
  type: 'object',
  required: ['variantId', 'built', 'folder'],
  properties: {
    variantId: { type: 'string' },
    built: { type: 'boolean' },
    folder: { type: 'string' },
    standIns: { type: 'array', items: { type: 'string' }, description: 'borrowed reference assets/fonts used as stand-ins (file — origin — replace-with)' },
    selfScreenshot: { type: 'string', description: 'path of the ONE final self-check capture' },
    selfCheckFixes: { type: 'array', items: { type: 'string' }, description: 'what the single fix pass changed after the self-check, max 5 items' },
    notes: { type: 'string', description: 'max 5 lines' },
  },
}

const ASSEMBLE_SCHEMA = {
  type: 'object',
  required: ['ok', 'typecheck', 'lint', 'screenshots'],
  properties: {
    ok: { type: 'boolean' },
    typecheck: { type: 'string' },
    lint: { type: 'string' },
    switcherWorks: { type: 'boolean' },
    consoleErrors: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'one full-page capture per variant' },
    standInsFile: { type: 'string' },
    galleryRegistered: { type: 'boolean', description: 'd3labs targets only' },
    notes: { type: 'string' },
  },
}

phase('Extract')
const scaffoldTask = target.kind === 'scratch'
  ? `Scaffold the fresh target app at ${target.appDir} (the directory exists but is empty except tmp/workspace dirs — keep those).
1. Scaffold Next.js there: npx create-next-app@latest with TypeScript + Tailwind + App Router (no src dir unless the generator insists), then npm i motion.
2. ${conventions}
3. Create the variants shell per the conventions: the route at ${target.routeDir} reading ?variant= (default 'a'), a VariantBar file with links for [${variantIds.join(', ')}], an empty variants/<id>/index.tsx placeholder per variant rendering just the variant letter, and content.ts exporting an empty placeholder brief object (the Board phase's brief will be wired in later by builders reading ${briefPath}).
4. Start the dev server in the background on port ${target.port}: npm run dev -- -p ${target.port}. Confirm ${target.previewUrl} returns HTTP 200 and switching ?variant= renders each placeholder.`
  : `Verify and prepare the existing target app at ${target.appDir} (kind: ${target.kind}).
1. ${conventions}
2. Confirm the app installs/builds (npm i if node_modules is missing) and that 'motion' is a dependency (add it if not).
3. Create the variants shell per the conventions at ${target.routeDir}: the route reading ?variant= (default 'a'), a VariantBar file with links for [${variantIds.join(', ')}], an empty variants/<id>/index.tsx placeholder per variant, and content.ts exporting an empty placeholder brief object. Touch nothing else in the project.
4. Ensure a dev server serves it: if ${target.previewUrl} is not already responding, start the dev server in the background${target.port ? ` on port ${target.port}` : ''}. Confirm ${target.previewUrl} returns HTTP 200 and switching ?variant= renders each placeholder.`

await parallel([
  () => legwork(scaffoldTask, { label: 'scaffold', phase: 'Extract', effort: 'low' }),
  ...refs.flatMap((r) => [
    () => legwork(
      `Clone the SOURCE of ${r.url} into ${r.dir}, capturing the ground truth an inspired rebuild needs to SEE the real thing.
Use the agent-browser CLI (run \`agent-browser skills get core\` first) plus curl/wget. Capture into ${r.dir}:
- source/: the rendered DOM (outerHTML after the page settles), all linked and inline CSS.
- source/computed.json (REQUIRED): with agent-browser getComputedStyle, record for every key structural element (headings, body copy, eyebrows/labels, nav links, buttons/pills, cards, footer) — keyed by a clear selector — fontFamily, fontSize(px), fontWeight, lineHeight, letterSpacing, color, backgroundColor, backgroundImage (full gradient), borderRadius, boxShadow, and margins/paddings(px). Also record the page's @font-face list with resolved woff2 URLs.
- assets/: download every image, video, and webfont file (follow srcset and CSS url()); save any inline-SVG logotype as assets/<name>.svg.
- source/inventory.md: what you captured, the brand name, each asset's original URL -> local path.
ROBUSTNESS PLAYBOOK (JS-heavy/lazy sites fail naive scrapes — a thin scrape here causes expensive retries downstream, so verify BEFORE returning):
- Wait for network-idle plus an extra settle, and scroll the FULL page down and back up first so lazy sections, images, and fonts actually load before you capture.
- If getComputedStyle capture yields few elements, switch strategy: evaluate in page context over a landmark list (h1-h3, nav a, [class*=button], [class*=card], p) and record each match.
- Before returning, verify yourself: computed.json parses with >0 selectors, at least one CSS file exists, assets/ is non-empty. If any check fails, re-attempt with the alternate strategy WITHIN THIS SAME RUN.
Write nowhere else. computedWritten must reflect whether computed.json truly has >0 selectors. host=${r.host}.`,
      { label: `scrape:${r.host}`, phase: 'Extract', schema: SCRAPE_SCHEMA },
    ),
    () => legwork(
      `Build a ROUGH scroll STORYBOARD of ${r.url} into ${r.dir}/screenshots — enough for a designer to see every section. Use the agent-browser CLI (run \`agent-browser skills get core\` first). At width 1440, step DOWN the page in overlapping frames (~25% overlap) cut at natural section boundaries, named NN-<short-label>.png in scroll order (NO full-page screenshot). In screenshots/storyboard.md map every frame to a tentative section id + a sourceAnchor (selector or distinctive heading + approx scrollY) + a one-line motion hint. Cover the whole page.`,
      { label: `storyboard:${r.host}`, phase: 'Extract', vision: true, effort: 'medium' },
    ),
    () => legwork(
      `Record the LIVE MOTION of ${r.url} into ${r.dir}/motion as a real-time >=30fps video. Run the shipped recorder:
  cd ${workspace} && npm i playwright >/dev/null 2>&1 && node ${recordScript} ${r.url} ${r.dir}/motion
If it exits non-zero because no Chromium/playwright is available, FALL BACK to agent-browser record start/stop while scrolling the full page down and back up and exercising hovers/carousels, noting the fallback is lossy on timing. Verify a master video exists and report the method, path, and ffprobe fps + duration.`,
      { label: `record:${r.host}`, phase: 'Extract', effort: 'low' },
    ),
  ]),
])

phase('Gate')
const gatePrompt = `Run the deterministic scrape gate for EACH reference and relay the verdicts — do not rebuild anything yourself.
For each ref: ${refs.map((r) => `${r.host} -> node ${gateScript} --workspace ${r.dir} --motion ${r.dir}/motion`).join(' ; ')}
Sanity-check each JSON against reality (head -c 300 of the computed.json, ls of the screenshots dir). Return one result per host, ok=true only if computed.json has >0 selectors AND storyboard frames exist; list what's missing in reasons[].`
let gateRes = await agent(gatePrompt, { model: 'sonnet', effort: 'low', label: 'gate', phase: 'Gate', schema: GATE_SCHEMA })
let failing = (gateRes.results || []).filter((x) => !x.ok)
if (failing.length) {
  log(`Gate: ${failing.map((x) => x.host).join(', ')} came back thin — retrying those refs once.`)
  await parallel(failing.map((x) => {
    const r = refs.find((rr) => rr.host === x.host)
    return () => legwork(
      `The previous extraction of ${r.url} was incomplete — ONLY these pieces are missing: ${(x.reasons || []).join('; ')}.
This retry is INCREMENTAL: inspect ${r.dir} first and KEEP everything already captured (source, computed.json, screenshots, assets, motion) — redo nothing that exists and passes a sanity check. Produce only the missing pieces: computed.json needs getComputedStyle per key element + the @font-face list (use the alternate landmark-list strategy if the naive capture stays thin: scroll the full page first, wait for network-idle plus settle); storyboard needs overlapping frames + storyboard.md; assets/ needs the image/font downloads. Verify each repaired piece yourself before returning.`,
      { label: `retry:${r.host}`, phase: 'Gate', schema: SCRAPE_SCHEMA },
    )
  }))
  gateRes = await agent(gatePrompt, { model: 'sonnet', effort: 'low', label: 'gate-retry', phase: 'Gate', schema: GATE_SCHEMA })
  failing = (gateRes.results || []).filter((x) => !x.ok)
  if (failing.length === refs.length) {
    throw new Error(`inspire-site: no reference produced ground truth after one retry (${failing.map((x) => `${x.host}: ${(x.reasons || []).join('; ')}`).join(' | ')}). Aborting rather than inspiring from thin air.`)
  }
  if (failing.length) log(`Gate: proceeding WITHOUT ${failing.map((x) => x.host).join(', ')} (still thin after retry); remaining refs carry the run.`)
}
const liveRefs = refs.filter((r) => !failing.some((x) => x.host === r.host))

phase('Curate')
const docsBlock = docPaths.length
  ? `PROJECT DOCS (the product this page is FOR — read them all): ${docPaths.join(', ')}`
  : 'No project docs were provided: write the brief for a deliberately generic product placeholder, clearly marked as STAND-IN copy the user will replace.'
const [cards, brief] = await Promise.all([
  parallel(liveRefs.map((r) => () => legwork(
    `Curate the captured reference ${r.host} (${r.url}) into the ONLY two artifacts an expensive builder model will ever see of it: a trimmed REF CARD and one clean frame per section. Everything a builder needs to feel this site must fit here — but nothing else; every extra line and duplicate image is re-billed dozens of times downstream, so trim ruthlessly.
Inputs: ${r.dir}/source (computed.json + inventory.md), ${r.dir}/screenshots (open the frames + storyboard.md), ${r.dir}/motion (master video + marks.json; extract frames with ffmpeg -vf fps=8 into ${r.dir}/motion/_frames and OPEN a spread to actually see the motion). If any input is partially missing, work with what exists, capture what you can yourself, and note the gap — do not fail the whole task.
1. FRAMES — one per section, full resolution, mandatory: for EVERY section of the page top-to-bottom capture ONE clean frame into ${r.dir}/frames/<section-id>.png with the shipped helper (whole section visible, no neighbor overlap, never downscale — sizes and detail must survive):
  cd ${workspace} && node ${captureScript} ${r.url} ${r.dir}/frames/<id>.png --fromText "<section's first label>" --toText "<next section's first label>" --dpr 2 --pad 24
Open each frame to confirm it shows the whole section; re-shoot once if clipped. These frames REPLACE the overlapping storyboard for builders — the set must cover the entire page with no section missing.
2. REF CARD — write ${r.dir}/ref-card.md, HARD CAP ~100 lines, per section top-to-bottom: id; its frame path; the LAYOUT PATTERN (grid, columns, split, overlap, sticky, marquee — one line, rebuildable without the site); COMPONENT SHAPES (card anatomy, button style, nav behavior — terse); 2-3 key SPACING numbers from computed.json; MOTION (what animates, trigger, easing feel, duration — from the video, not guessed; one line). Close with: palette + typography direction (exact families/weights/sizes, flagged direction-not-truth, 3 lines), global motion character (2 lines), what makes this design distinctive (3 bullets). NO scrape inventories, NO selector dumps, NO prose padding.
Return the section list (id, pattern, framePath, motion) and cardPath. host=${r.host}.`,
    { label: `curate:${r.host}`, phase: 'Curate', vision: true, effort: 'high', schema: CARD_SCHEMA },
  ))),
  legwork(
    `Write the CONTENT BRIEF for the inspired-variants run at ${briefPath}.
${docsBlock}
${constraintsBlock}
Contents: product name, audience, tone, value props, and a per-section copy outline (headline + supporting line for the sections a landing page of this product plausibly needs — hero, social proof, features, how-it-works, pricing/CTA, footer, adjusted to the docs). Copy comes from the project docs${docPaths.length ? '' : ' (generic placeholder, marked STAND-IN)'} — NEVER from any reference site. Hard cap ~120 lines. Report briefSource=docs or neutral-placeholder.`,
    { label: 'brief', phase: 'Brief', schema: BRIEF_SCHEMA, effort: 'medium' },
  ),
])
const liveCards = (cards || []).filter(Boolean)
const cardPaths = liveCards.map((c) => c.cardPath || `${liveRefs.find((r) => r.host === c.host)?.dir}/ref-card.md`)
const frameDirs = liveRefs.map((r) => `${r.dir}/frames/`)

phase('Directions')
const dirList = await agent(
  `Author ${variantCount} DISTINCT design directions for one landing page, as small specs a builder will follow. ${conventions}
Your briefing is ONLY: the ref cards (${cardPaths.join(', ')}), the content brief (${briefPath}), and the per-section frames those cards reference (${frameDirs.join(', ')}). Read each exactly once — never re-open anything you have already read (it stays in your context). Do NOT open the raw scrapes (computed.json, source/, storyboard, motion videos) — the cards are the distilled truth.
${constraintsBlock}
You do the cross-reference pattern-shopping: compare the cards, decide which reference structures each direction borrows.
For each variant [${variantIds.join(', ')}] write ${workspace}/directions/<variantId>.md (under 80 lines each):
- name: a short evocative direction name.
- thesis: 2 lines on what this direction is and why it fits the brief.
- borrowings: which card sections it takes, each as "<host>/<section-id> (frame: <path>)" — different variants must lean on genuinely different combinations, not reskins of one skeleton.
- section plan: the page top-to-bottom (section id, pattern used, which brief copy block it renders).
- tokens: palette + type + spacing direction for THIS variant (respecting the user constraints).
- motion plan: which motion notes from the cards it uses, where.
- stand-ins: which reference assets/fonts it may borrow as stand-ins, if any.
The ${variantCount} directions together must cover meaningfully different structural takes. Return the list with one-line summaries.`,
  { model: buildModel, effort: 'medium', label: `directions:${buildModel}`, phase: 'Directions', schema: DIRECTIONS_SCHEMA },
)
const directions = (dirList && dirList.directions) || variantIds.map((v) => ({ variantId: v, name: v, specPath: `${workspace}/directions/${v}.md` }))

phase('Variants')
const builds = (await parallel(directions.map((d) => () => agent(
  `Build ONE complete inspired landing-page variant: "${d.name}" (variant ${d.variantId}). ${conventions}
You own exactly one folder: ${target.routeDir}/variants/${d.variantId}/ — everything for this variant lives there (index.tsx as the whole page plus any local component files). Do not touch the route shell, the VariantBar, content.ts, or any other variant's folder.

BRIEFING — read each of these exactly ONCE, at the start, then never again:
1. Your direction spec: ${d.specPath}
2. The ref cards: ${cardPaths.join(', ')}
3. The per-section reference frames: every image under ${frameDirs.join(' and ')} (this is your full visual view of the reference sites)
4. The content brief: ${briefPath} — render ITS copy/product, never a reference site's.
5. The conventions file above.
CONTEXT RULES (each re-read is re-billed on every later turn — these are hard rules, not suggestions):
- Everything you read stays in your context: NEVER re-open any briefing file or image, and never read back a file you wrote.
- Nothing else is permitted: no computed.json, no source/, no storyboard, no motion videos, no digest files — the cards and frames are the distilled truth on purpose. If something you need is missing from them, note it in your report and make your best design call; do not go hunting.
- After the briefing, PLAN the entire page in one pass, then write your files start to finish. Aim for under ~25 tool calls total.

Build the whole page for this variant: every section in your spec's plan, its tokens defined locally in your folder, motion authored with motion/react per your motion plan. Where your spec allows borrowed stand-in images/fonts, copy them from ${workspace}/refs/<host>/assets into the app's public dir under a variants/${d.variantId}/ subfolder and list every borrowed file in your standIns return (file — origin host — what should replace it). Plausible neutral copy where the brief is silent, marked with a [STAND-IN] suffix.

SELF-CHECK — exactly one, at the end: the dev server already serves ${target.previewUrl} (do not start or restart it). With agent-browser (--session variant-${d.variantId}), open ${target.previewUrl}?variant=${d.variantId}, scroll the full page, take ONE screenshot set into ${workspace}/shots/self-${d.variantId}.png, and close the session. Do at most ONE fix pass from what you saw, then STOP — no second screenshot, no further iteration; assembly and the user verify from here. Report built, folder, standIns, selfScreenshot, selfCheckFixes, and max 5 lines of notes.`,
  { model: buildModel, effort: buildEffort, label: `variant:${d.variantId}`, phase: 'Variants', schema: VARIANT_SCHEMA },
)))).filter(Boolean)

phase('Assemble')
const registration = target.kind === 'd3labs'
  ? `This is a d3labs target: register the prototype in ${target.galleryData || 'the gallery data file'} per the conventions (one Variant entry; create a new category only if none fits) and set galleryRegistered accordingly.`
  : 'Not a d3labs target: skip gallery registration (galleryRegistered=false).'
const assemble = await legwork(
  `Finalize and render-check the inspired variants app. ${conventions}
Route: ${target.routeDir}   Preview: ${target.previewUrl}
1. Confirm the route renders variants [${variantIds.join(', ')}] via ?variant= and the VariantBar switches them; wire anything the builders left unimported.
2. Aggregate every variant's borrowed assets into ${target.routeDir}/STAND-INS.md (file — origin — replace-with), merging these reports: ${JSON.stringify(builds.map((b) => ({ variantId: b.variantId, standIns: b.standIns || [] })))}
3. From ${target.appDir}, run typecheck and lint (or the nearest scripts) and FIX every error this run introduced until both pass clean. Touch only this run's files.
4. ${registration}
5. Render-check: ensure the dev server serves ${target.previewUrl}; for each variant open ${target.previewUrl}?variant=<id> with agent-browser, assert zero console errors, scroll the full page, and save a full-scroll capture to ${workspace}/shots/<id>.png.
Report typecheck/lint state, switcher status, console errors, and the screenshot paths.`,
  { label: 'assemble', phase: 'Assemble', vision: true, schema: ASSEMBLE_SCHEMA },
)

return {
  previewUrl: target.previewUrl,
  target,
  refs: refs.map((r) => ({ host: r.host, live: liveRefs.includes(r) })),
  refCards: cardPaths,
  brief: briefPath,
  briefSource: brief && brief.briefSource,
  directions: directions.map((d) => ({ variantId: d.variantId, name: d.name, summary: d.summary || '' })),
  variants: builds,
  assemble,
}
