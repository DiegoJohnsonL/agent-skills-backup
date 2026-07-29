---
name: clone-site-gpt
description: Clone a live website into the d3labs prototypes gallery as a faithful Next.js + Tailwind + motion/react prototype, via an ultracode workflow that executes Codex CLI subagents. Needs only a URL — it infers the brand, slug, and gallery category (reusing one or creating a new one) and re-authors the original CSS as Tailwind and its animations as motion/react. Use when the user wants a GPT/Codex-powered clone, replicate, or rebuild workflow for a website / landing page as a d3labs prototype, or runs /clone-site-gpt with a URL.
disable-model-invocation: true
user-invocable: true
---

# clone-site-gpt

You are the orchestrator. Given **only a URL**, you **clone** that site into the
d3labs prototypes gallery by running one ultracode **Workflow** that fans Codex subagents
across the work: parallel exploration, a single classify pass, judged per-section
reference **frames** and a real-time **motion** breakdown, then a shared
**foundation** laid before per-**section** agents fan out. Each section is judged on
**fidelity** against three sources of truth: its judged **reference frame** for
layout, the captured **ground truth** (`computed.json`) for values, and the recorded
**motion** for animation — and the agent proves it by screenshotting its own output.

`/clone-site-gpt <url>` carries everything the skill needs. Do **not** ask the user for a
category, slug, or tech choices, and do not restate tech in prompts — the target
stack (Next.js, Tailwind, `motion/react`, file layout, gallery registration) is
fixed in `d3labs-target.md`, which every agent reads.

## What the run rests on

- **Ground truth, then build.** The scrape captures `computed.json` — exact fonts,
  sizes, colors, gradients, and the page's webfonts — and the run is **model-gated**
  on it: a Gate subagent runs the deterministic checker, inspects the checker output
  plus the underlying source, screenshots, assets, and motion artifacts, then decides
  whether the run can continue. If the scrape comes back empty or too thin, the
  workflow fails loud rather than letting agents eyeball values from screenshots.
  Every value downstream is read from this one source of truth, and each section
  agent screenshots its own output and iterates until it goes **green** against its
  reference frame.
- **Frames are the layout truth; motion is recorded, not guessed.** Layout comes from
  one clean per-section reference **frame** captured from the original at 2x, bounded by
  section landmarks, with entrance animations **settled** (reveal-hidden content forced
  visible) and **judged** — re-shot until it shows the whole section uncropped with
  nothing missing (there is no confusing low-res full-page screenshot). Animation comes
  from a real-time (≥30fps) **recording** that a dedicated pass breaks down
  section-by-section (`motion.md` + per-section clips), so agents match real easing.
- **Self-configuring from the URL.** The classify pass infers the brand (→ a
  kebab-case `slug`) and the gallery **category**: it reuses the existing category
  whose industry fits, and only when none fits does it define a *new* category
  (slug, title, description) to be created in the gallery. The orchestrator passes
  no category or slug — it is discovered from the site.
- **Foundation first.** Classify splits the page into *shared* concerns (design
  tokens, fonts, sticky nav, footer, scroll-progress, any global reveal/parallax)
  and *local* sections. The shared **foundation** is built and committed to files
  _before_ any section agent starts, so every section imports one source of truth
  for tokens and global motion. Shared parts are prioritized; sections follow.
- **One file per section, so sections run in parallel without conflict.** The
  foundation agent creates `page.tsx` plus a stub file per section under
  `sections/`. Each section agent then owns exactly one file — no two agents write
  the same file, so the fan-out needs no git worktrees and the page compiles
  throughout.

## Steps

1. **Read the URL and preflight.** Take the `url` from the command and confirm it
   renders (curl/agent-browser → 2xx with real DOM); the `hostname` is its host
   minus a leading `www.`. Confirm `agent-browser` is installed
   (`agent-browser --version`; if absent, `npm i -g agent-browser && agent-browser install`).
   Resolve the repo path (default `~/dev/d3labs`). Create the scratch workspace
   `<repo>/tmp/clone-<hostname>/` (the repo's `tmp/` is gitignored) with empty
   `source/ assets/ clone-shots/ screenshots/ screenshots/frames/ screenshots/motion/`
   subdirs. Only stop to ask the user if the URL is missing or unreachable.

2. **Run the Codex workflow.** Invoke it directly — no editing:
   ```
   Workflow({ scriptPath: '<this skill dir>/workflow.codex.template.js', args: {
     url,
     repoPath: '<resolved repo path>',
     conventionsPath: '<this skill dir>/d3labs-target.md',
   }})
   ```
   (The workflow asserts these args on its first line and self-derives `workspace`
   from `repoPath` + `hostname`; it fails loud rather than running on `undefined`.
   Every delegated task is executed through `codex exec` with non-interactive
   approvals and a schema file when structured output is required. Optionally pass
   `codexModel` or `codexProfile` in `args` to override the local Codex default.
   For image/video tasks, optionally pass `codexVisionModel`; if `codexModel` is a
   known text-only OpenCode Go model such as `opencode-go/glm-5.2` or
   `opencode-go/qwen3.7-max`, the workflow automatically routes visual tasks to
   `opencode-go/kimi-k2.7-code` unless `codexVisionModel` is set. It rejects known
   text-only OpenCode Go models for visual tasks. Subagents pin
   `model_reasoning_effort` to `high` by default so they do not inherit a global
   `xhigh` setting; description-only passes use `medium`. You may pass
   `codexReasoningEffort` or `codexDescriberReasoningEffort` as `low`, `medium`, or
   `high`, but not `xhigh`.)
   The workflow captures ground truth and uses helper scripts as agent-operated
   tools, not as a blind replacement for agents. Gate is always model-mediated: a
   Gate subagent runs `gate-check.mjs`, reads the emitted JSON, verifies the
   underlying `computed.json`, source/CSS, storyboard frames, assets, and motion
   artifacts, and returns the gate decision. For adaptable work, agents copy the
   bundled scripts into `<workspace>/tools/`, run those workspace-local copies,
   inspect the JSON/artifacts, and patch/rerun the local copy when a site has unusual
   assets, lazy media, section landmarks, or route behavior. It then infers
   brand/slug/category, captures a judged reference **frame** per section and a
   section-by-section **motion** breakdown, refines the foundation, fans out one
   self-verifying agent per section, then registers and verifies the prototype
   (creating a new gallery category if needed).
   It returns the manifest and per-section fidelity reports (each with the agent's own
   screenshot and any `remainingGaps`). Done when the run returns without throwing,
   every section reports a `selfScreenshot` with empty `remainingGaps`, and assemble
   reports typecheck + lint clean, the route rendered with no console errors, and the
   gallery entry registered.

   Visual phases must run on a model with image/video input support: storyboard,
   Gate review, classify, frame capture/judge, motion analysis, foundation, section
   build/fix self-verification, and assemble. For OpenCode Go, current vision-capable
   options include `opencode-go/kimi-k2.7-code`, `opencode-go/kimi-k2.6`,
   `opencode-go/qwen3.7-plus`, `opencode-go/qwen3.6-plus`,
   `opencode-go/minimax-m3`, and `opencode-go/mimo-v2.5`; do not use text-only
   models like `opencode-go/glm-5.2`, `opencode-go/qwen3.7-max`, or DeepSeek for
   image/frame/video judgment.

3. **Final spot-check.** The workflow already screenshot-diffed each section to
   **green** and render-checked the assembled page, so this is a human spot-check,
   not the primary gate. Start the normal dev server (`npm run dev` in the repo →
   `http://localhost:3000`) and open `/prototypes/<category>/<slug>` (read from the
   result). Skim top-to-bottom against the per-section reference frames in
   `screenshots/frames/`, and check motion against `screenshots/motion/`; if the
   result surfaced any `remainingGaps`, address those first by spawning one fix agent
   per gap against its section file.

4. **Report.** Give the user the route URL, the gallery entry (and whether a new
   category was created), and a per-section fidelity summary. Leave the workspace
   in `tmp/` for reference; mention it can be deleted.

## Adapting the workflow

For a normal clone, run `workflow.codex.template.js` as-is. Only when a site needs a
different shape (e.g. it is a single non-scrolling app, or has many routes) copy
the template into the workspace, edit the phases there, and run that copy via
`scriptPath`. Keep the foundation-first ordering, the one-file-per-section rule,
the scrape **gate**, the judged per-section reference **frames**, the **motion**
recording + breakdown, and the per-section **green** loop — they are what make the
fan-out safe and faithful.

## Skill files

The skill ships eight files; the orchestrator only invokes the Codex workflow, which drives
the rest (helper paths are derived from the skill dir, so nothing is hardcoded):

- **`SKILL.md`** — this file: the orchestrator's steps.
- **`workflow.codex.template.js`** — the multi-agent Workflow (the operational core:
  phases Explore → Gate → Classify → Frames ∥ Motion → Foundation → Sections →
  Assemble), with helper scripts used as agent-operated workspace tools plus
  delegated tasks executed through `codex exec`.
- **`d3labs-target.md`** — conventions every agent reads (file layout, libraries, fonts
  policy, gallery registration, the three sources of truth, no-comments rule).
- **`gate-check.mjs`** — deterministic **Gate** evidence collector. Reads `computed.json`,
  source CSS, storyboard screenshots, assets, and motion presence; the Gate subagent runs
  it, verifies the emitted JSON against the artifacts, and returns the authoritative
  gate decision.
- **`prepare-foundation.mjs`** — **Foundation** prep tool. The foundation agent copies
  it into `<workspace>/tools/`, runs it, inspects the generated asset manifest/token
  summary/font CSS/page shell/section stubs, and patches only the workspace copy if the
  site's asset layout needs special handling.
- **`verify-route.mjs`** — **Assemble** render-check tool. The assemble agent copies it
  into `<workspace>/tools/`, runs the live route check, fixes real app bugs, and patches
  only the workspace copy if the verifier needs a site-specific quirk.
- **`record-motion.mjs`** — the **Motion** phase's real-time recorder (Playwright + CDP
  `Page.startScreencast`, acks every frame → a 30fps `master.mp4`). Run by an agent that
  `npm i playwright` into the workspace; falls back to `agent-browser record` if no
  Chromium/Playwright.
- **`capture-frame.mjs`** — the **Frames** phase's per-section capture (Playwright):
  settles + neutralizes scroll-reveals, then crops a landmark-bounded section at 2x from
  one full-resolution grab (never saved as a full-page artifact). Same playwright/agent-
  browser fallback.

During a clone run, edit only copies under `<workspace>/tools/` when a helper needs a
site-specific tweak. Edit the canonical scripts in the skill folder only when improving
the reusable workflow itself.
