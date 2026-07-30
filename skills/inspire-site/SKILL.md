---
name: inspire-site
description: Build N inspired (not copied) landing-page variants from 1–3 reference URLs, via the cost-tiered clone-site-style pipeline — sonnet extracts each reference and curates it into a trimmed ref card + one clean frame per section, plus a content brief; the build model (opus high by default) authors distinct design directions and builds one whole-page variant per direction, switchable via ?variant=.
disable-model-invocation: true
user-invocable: true
---

# inspire-site

You are the orchestrator. Given a **freeform prompt** containing 1–3 reference
URLs, you produce **N distinct landing-page variants inspired by those sites** —
same extraction shenanigans as `/clone-site` (scrape + `computed.json`,
storyboard, real-time motion recording), but the output riffs on the references
instead of copying them. **The user is the judge**: the run ends with clean,
switchable variants and screenshots; they pick a direction and polish from there.

Cost tiers (never blur them):
- **`sonnet` (the cheap tier)** does all legwork as direct agents: extraction,
  gating, per-reference **curation** (a trimmed ~100-line ref card + one clean
  full-resolution frame per section — the builders' entire view of that
  reference), the content brief, scaffolding, assembly, typecheck/lint fixing,
  and render-checks. Effort scales with judgment: `low` for mechanical passes
  (scaffold, motion recording), `medium` for browser/vision work, `high` only
  for curation — the distillation the whole build rests on.
- **The build model (`opus` by default) touches only design**: one `medium` pass authoring
  the direction specs, then **one `high` agent per variant** building its whole
  page from its spec + the ref cards + per-section frames + brief — never from
  raw scrapes, reading each briefing item exactly once, with exactly one final
  self-check screenshot.

## Parsing the invocation

`/inspire-site <prompt>` — everything arrives in the prompt; do not ask for
anything a default covers. Extract from it:

- **urls** (1–3, required): the reference sites. Missing → the only thing you stop
  and ask for.
- **constraints** (optional freeform): design directives to pass through verbatim —
  e.g. "color-agnostic", "layout like the first, cards like the second",
  "compact, no italics".
- **docPaths** (optional): any file/folder paths the user mentions as project
  docs/assets; expand folders to the relevant md/pdf files.
- **variants** (optional): a requested variant count (default 3, max 4).
- **target** (optional): where the app goes. Default **scratch**. Recognize:
  "put it in d3labs" → d3labs; "new project called X" → scratch with that name;
  "into <existing project>" / "as the main page of X" → existing.

## The three sources every variant is built from

1. **The ref cards + per-section frames** (`refs/<host>/ref-card.md` +
   `refs/<host>/frames/*.png`) — each reference curated to ~100 lines (layout
   patterns, component shapes, key spacing, motion notes) plus one clean
   full-resolution frame per section: full visual coverage of every reference
   with no overlapping duplicates and no scrape noise. There is no separate
   inspiration board — the Directions author shops across the cards itself.
2. **The content brief** (`content-brief.md`) — the user's product from their
   docs; neutral STAND-IN copy when no docs were given. Reference copy is never
   used.
3. **The direction spec** (`directions/<v>.md`) — that variant's thesis,
   borrowings (named card sections + frames), section plan, tokens, and motion
   plan. Variants must be genuinely different structural takes, not reskins.

Borrowed reference images/fonts are allowed as **stand-ins** (to see the design
with real-feeling content) and every borrowed file is logged in `STAND-INS.md`
for later replacement. That rule is what keeps "inspired" honest.

## Steps

0. **Orchestration discipline.** You dispatch and judge only; subagents do the
   work — opus for code/UI/copy, sonnet for mechanical legwork, never fable.
   Every delegated call carries an explicit `model` (an omitted model inherits
   fable); import conclusions, never transcripts or screenshots.

1. **Parse + preflight (keep it tiny).** Parse the prompt per the section above.
   Confirm each URL renders (curl → 2xx with real DOM) and that
   `agent-browser --version` responds (absent:
   `npm i -g agent-browser && agent-browser install`). Verify each docPath
   exists; a missing one → tell the user which, continue with the rest.

2. **Resolve the target.** Derive a kebab-case `slug` from the user's project
   name, docs, or the first reference host (`<host>-inspired`).
   - **scratch** (default): `appDir = ~/dev/temp/<slug>` (create empty),
     `routeDir = <appDir>/app`, preview at `http://localhost:<port>/` with a free
     port from 4310+ (check `lsof -i :<port>`).
   - **existing**: `appDir` = the named project's root; `routeDir` = its main
     page's route dir; free port likewise (or the app's own dev URL if running).
   - **d3labs**: `appDir` = the d3labs repo, `routeDir =
     <repo>/app/[locale]/prototypes/<category>/<slug>` (pick the fitting existing
     gallery category yourself; note `galleryData` path), preview
     `http://localhost:3000/en/prototypes/<category>/<slug>`, port 3000.
   Set `workspace`: scratch → `<appDir>-workspace`; others →
   `<appDir>/tmp/inspire-<slug>`. Create `workspace` with `refs/ directions/
   shots/ tools/` subdirs (plus `refs/<host>/` per URL).

3. **Run the workflow.** Invoke it directly — no editing:
   ```
   Workflow({ scriptPath: '<this skill dir>/workflow.inspire.js', args: {
     urls, constraints, docPaths, variants,
     target: { kind, appDir, routeDir, previewUrl, port, galleryData? },
     workspace,
     helpersDir: '<clone-site skill dir>',   // canonical capture scripts live there
     conventionsPath: '<this skill dir>/inspire-target.md',
   }})
   ```
   Optional: `buildModel` (`'opus'` default; `'fable'` for maximum taste) and
   `buildEffort` (`'high'` default). Pass `args` as a real JSON object (arrays as arrays, `target` as an
   object — never pre-stringified); the script also tolerates a harness that
   stringifies the whole args value, but not doubly-encoded fields. It asserts
   args on line 1 and fails loud. Done when it
   returns with every variant `built`, assemble reporting typecheck + lint clean,
   the switcher working, zero console errors, and one screenshot per variant.

4. **Report — then stop; the user judges.** Give: the preview URL and how to run
   the dev server, one line per variant (letter, direction name, summary), the
   ref-card/brief/spec paths, whether the brief came from docs or placeholders, and
   where `STAND-INS.md` lists borrowed assets. Do not start polishing a variant —
   the user picks the direction first.

## Cost rules (keep them true when editing)

- Every `agent()` call passes an explicit `model` — a model-less call inherits
  the expensive session model; that bug once burned a whole usage budget.
- All legwork runs on `sonnet` — the cheapest model the orchestration rubric
  allows (Haiku is banned there) — at the lowest effort that fits (`low`
  mechanical, `medium` browser/vision, `high` curation only). Every legwork
  prompt caps its return; long script runs go to background Bash with output on
  disk, never streamed back through an agent's context.
- The build model reads distilled files (spec, ref cards, per-section frames,
  brief) exactly once each, never raw scrapes, and takes exactly one final
  self-check screenshot. If variants come back needing values the cards lack,
  improve the Curate prompt — don't widen the builders' briefing.
- Helpers (`capture-frame.mjs`, `record-motion.mjs`, `gate-check.mjs`) are
  canonical in the `clone-site` skill dir, passed as `helpersDir` — no copies to
  drift. Agents copy into `<workspace>/tools/` for site-specific patches.

## Skill files

- **`SKILL.md`** — this file: parse → resolve target → run → report.
- **`workflow.inspire.js`** — the pipeline (Extract ∥ Scaffold → Gate →
  Curate ∥ Brief → Directions → Variants → Assemble).
- **`inspire-target.md`** — conventions every agent reads (stack, variant
  switcher shape, folder-per-variant, inspiration/stand-in rules, per-target
  shape).
