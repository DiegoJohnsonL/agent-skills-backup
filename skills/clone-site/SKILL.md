---
name: clone-site
description: Clone a live website into the d3labs prototypes gallery as a faithful Next.js + Tailwind + motion/react prototype, via a cost-tiered pipeline — sonnet does all capture, analysis, judging and verification; the build model (opus by default) only implements sections from tiny per-section context packs. Needs only a URL — it infers the brand, slug, and gallery category.
disable-model-invocation: true
user-invocable: true
---

# clone-site

You are the orchestrator. Given **only a URL**, you clone that site into the d3labs
prototypes gallery by running one **Workflow** shaped as a cost-tiered pipeline:

- **`sonnet` (the cheap tier)** does everything that is legwork or judgment over
  artifacts: scraping ground truth, storyboarding, motion recording + breakdown,
  classify, per-section reference frames, writing the per-section **context
  packs**, foundation prep, screenshot **verification** of every built section,
  and final assembly/registration — as direct agents, effort scaled to the task
  (`low` mechanical, `medium` browser/vision, `high` only for the pack-writing
  distillation that briefs the build model).
- **The build model (`opus` by default, effort `medium`) touches ONLY implementation**:
  one agent per section plus one shared-layer agent, each briefed by a **context
  pack** of at most ~120 lines plus one reference-frame image — never the full
  `computed.json`, never the storyboard, never motion.md. Builders don't run the
  dev server and don't screenshot; verification is the cheap tier's job. This is
  where the money goes, on purpose, and nowhere else.

`/clone-site <url>` carries everything the skill needs. Do **not** ask the user for
a category, slug, or tech choices — the target stack is fixed in `d3labs-target.md`,
which agents read via the workflow's prompts.

## The fidelity contract (unchanged from v1 — do not weaken it)

- **Ground truth, then build.** The scrape captures `computed.json` and the run is
  **gated** on it (deterministic `gate-check.mjs`); if the scrape is empty the
  workflow fails loud rather than letting agents eyeball values from screenshots.
- **Frames are the layout truth; motion is recorded, not guessed.** One judged,
  landmark-bounded 2x reference **frame** per section (reveal-hidden content forced
  visible; full-page screenshots banned); a real-time ≥30fps **recording** broken
  down section-by-section into `motion.md` + clips.
- **Packs are the values truth for builders.** The Slice phase compiles each
  section's exact type/surface/layout/motion values out of `computed.json` +
  `motion.md` into `ctx/<id>.md`. A value missing from a pack is reported
  (`missingFromPack`), never hunted down by the expensive model.
- **Foundation first, one file per section.** Shared tokens/fonts/nav/footer/motion
  variants are built before sections; each section agent owns exactly
  `sections/<id>.tsx`, so the fan-out needs no worktrees and the page compiles
  throughout.
- **Green loop, now independent.** v1 let each builder self-attest by screenshotting
  its own work; here an independent sonnet verifier screenshots the live section,
  compares against frame + pack + motion spec, and returns bounded gaps; the build
  model fixes exactly those gaps (≤2 rounds). Independent judging is stronger than
  self-attestation and moves all image tokens off the expensive model.

## Steps

0. **Orchestration discipline.** You are the orchestrator and dispatch/judge
   only; subagents do the work — opus for code/UI/copy, sonnet for mechanical
   legwork, never fable. Every delegated call carries an explicit `model` (an
   omitted model inherits fable), and you import conclusions, never transcripts,
   screenshots, or diffs.

1. **Preflight (keep it tiny).** Take the `url` and confirm it renders (curl → 2xx
   with real DOM); `hostname` is its host minus a leading `www.`. Confirm
   `agent-browser --version` responds (if absent:
   `npm i -g agent-browser && agent-browser install`). Resolve the repo path
   (default `~/dev/d3labs`). Create `<repo>/tmp/clone-<hostname>/` with empty
   `source/ assets/ clone-shots/ ctx/ screenshots/ screenshots/frames/ screenshots/motion/`
   subdirs. Only stop to ask the user if the URL is missing or unreachable.

2. **Run the workflow.** Invoke it directly — no editing:
   ```
   Workflow({ scriptPath: '<this skill dir>/workflow.pipeline.js', args: {
     url,
     repoPath: '<resolved repo path>',
     conventionsPath: '<this skill dir>/d3labs-target.md',
   }})
   ```
   Optional args: `buildModel` (`'opus'` default; `'fable'` when the user asks
   for maximum taste, `'sonnet'` for a budget run) and `buildEffort` (`'medium'`
   default; `'high'` when the user asks for maximum fidelity). The workflow asserts its args on line 1 and self-derives
   `workspace`; it fails loud rather than running on `undefined`.
   Done when the run returns without throwing, every section reports `pass` with
   empty `remainingGaps`, and assemble reports gallery registered, typecheck + lint
   clean, and a clean render-check.

3. **Judge the result without importing bulk.** Read only the workflow's returned
   summary. If sections ended not-green, spawn one build-model fix agent per
   section with just its `remainingGaps` + pack + frame (same shape as the
   workflow's fix prompts) and one sonnet re-verify — do not read diffs or
   screenshots into your own context.

4. **Final spot-check + report.** Start the dev server (`npx portless` in the repo →
   `https://d3.localhost`) and open `/prototypes/<category>/<slug>`. Skim against
   `screenshots/frames/` and `screenshots/motion/`. Report to the user: the route
   URL, the gallery entry (and whether a new category was created), the per-section
   fidelity summary, and any `missingFromPack` notes (they mark pack-quality bugs
   worth fixing in the Slice prompt). Leave the workspace in `tmp/`; mention it can
   be deleted.

## Cost rules (why this stays cheap — keep them true when editing)

- Every `agent()` call in the workflow passes an explicit `model`. A model-less
  call silently inherits the session model (fable) — that single bug made v1 runs
  burn a full usage budget.
- All legwork runs on `sonnet` — the cheapest model the orchestration rubric
  allows (Haiku is banned there) — at the lowest effort that fits: `low` for
  mechanical script-running, `medium` for browser/vision judgment, `high` only
  for Classify and Slice, whose output quality is what keeps the build model's
  context tiny.
- All screenshot/video/image inspection happens on the cheap tier. The build
  model sees exactly one image (its reference frame).
- Legwork is cheap, not free: every agent prompt caps its return (bounded gaps,
  short reports), and phases retry at most once — the gate aborts rather than
  looping a thin scrape.
- Builders read packs, not sources. If clones come back with `missingFromPack`,
  improve the Slice prompt — do not widen the builders' briefing.

## Adapting the workflow

For a normal clone, run `workflow.pipeline.js` as-is. Only when a site needs a
different shape (single non-scrolling app, many routes) copy the template into the
workspace, edit the phases there, and run that copy via `scriptPath`. Keep the
scrape **gate**, judged **frames**, **motion** recording, **packs**, foundation-first
ordering, one-file-per-section, the independent **verify** loop — and the cost rules
above.

## Skill files

- **`SKILL.md`** — this file: the orchestrator's steps.
- **`workflow.pipeline.js`** — the cost-tiered pipeline (Explore → Gate → Classify →
  Frames ∥ Motion → Slice ∥ Foundation → Sections(build→verify→fix) → Assemble).
- **`d3labs-target.md`** — conventions every agent reads (file layout, libraries,
  fonts policy, gallery registration, no-comments rule).
- **`gate-check.mjs`** — deterministic scrape-gate evidence collector.
- **`capture-frame.mjs`** — per-section reference-frame capture (Playwright; settles
  + neutralizes scroll-reveals, landmark-bounded 2x crop).
- **`record-motion.mjs`** — real-time ≥30fps motion recorder (CDP screencast).
- **`prepare-foundation.mjs`** — mechanical foundation prep (assets, token draft,
  font CSS, page shell, section stubs).
- **`verify-route.mjs`** — assemble-phase live-route render check.

Helper scripts are canonical: during a run agents copy them into
`<workspace>/tools/` and patch only the copy for site-specific quirks.
