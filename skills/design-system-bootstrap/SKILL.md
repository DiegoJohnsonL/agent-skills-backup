---
name: design-system-bootstrap
description: Bootstrap a project's design system from a design reference — derive theme tokens, apply a personality pass to shadcn components, and stand up a stock-vs-themed comparison gallery for approval.
disable-model-invocation: true
---

Stand up a project's design system before any product UI exists, always working from a **design reference**. The deliverables: theme tokens, themed components, and a `/design-system` gallery where the user compares stock vs themed and approves.

## 1. Capture the reference

A design reference is mandatory — with none provided, ask for one before touching code. It arrives in one of three forms:

- **Image(s)** — a mockup or moodboard the user attaches.
- **A page in this project** — an already-implemented design; screenshot it yourself in both light and dark.
- **A deployed site** — screenshot it with agent-browser, full page, at desktop and mobile widths.

From the reference, write a **token mapping**: every shadcn semantic token (`background`, `foreground`, `primary`, `secondary`, `accent`, `muted`, `destructive`, `border`, `ring`, chart colors, `--radius`) assigned a role from the reference — mapped **by role, not by hue**. Interrogate the reference: what color do CTAs wear? → that's `primary`. What does the active nav pill / chip / filter state wear? → `secondary` — and if the reference makes it strong and saturated, keep it strong; the conventional subtle gray is a default, not a rule. What's the canvas, the ink, the wash behind muted panels? Capture the shape language too: radius scale, pill vs square, shadow softness, type weight.

Done when: the mapping is written out with a one-line rationale per non-obvious token and shown to the user before any implementation.

## 2. Ground in the project

Load the shadcn skill. Run `npx shadcn@latest info` — note the `base` field (radix vs base-ui), tailwind version, and global CSS path; later steps depend on all three. Then:

1. `npx shadcn@latest add --all` — install the full component set into the project's ui directory.
2. Freeze a stock snapshot: `cp -R components/ui components/ui-base`, then rewrite cross-imports inside the snapshot so base components reference each other: `sed -i '' 's|@/components/ui/|@/components/ui-base/|g' components/ui-base/*.tsx`.

`ui-base/` is generated, never hand-edited — it exists so the step-5 comparison is honest.

## 3. Theme pass

Rewrite the semantic tokens in the project's global CSS (`:root` and `.dark`, oklch) from the token mapping, plus `--radius` and chart colors. Dark mode is a designed second palette in the same world (cream day → deep-ink night), not a mechanical inversion of the light values.

Done when: the app renders in **both** themes and both have been looked at — a token pass verified in one theme only is not done.

## 4. Personality pass

Customize the components in `components/ui/` so they carry the reference's shape language. Start where the signal is highest — button, card, input, tabs, badge — and let the reference dictate the treatment (the register this means: pill buttons, rounded-2xl cards with soft shadows, chip-style tabs whose active state wears the strong secondary). Change variants and base classes only; the semantic tokens do all the color work.

## 5. Comparison gallery

Build a `/design-system` route: page + showcase shell + demo registry (`demos/index.ts`) + one demo file per category (actions, forms, overlays, display, media-nav).

Write the five demo files with parallel subagents (`model: 'opus'` set explicitly on every Agent call — demo UI is taste work, never sonnet, never model-less) under a strict per-agent contract:

- Export names are pre-assigned in the dispatch prompt (named function components, no props, no default export), so the registry and showcase can be written before the agents finish.
- Each agent reads the installed component source and the primitive library's `.d.ts` before writing markup — never assume Radix APIs when `base` is base-ui (`render={<Button/>}`, not `asChild`; verify props like `items`, `orientation`, and readonly value arrays against the types).
- Sample copy lives in the project's domain (real-sounding product names, prices, flows), not lorem ipsum.
- Each agent returns a bounded summary: exports created + API surprises, nothing else.

Then generate the stock column mechanically, so both columns run identical markup — the **fair A/B**:

```bash
cd app/…/design-system && rm -rf demos-base && cp -R demos demos-base && \
  sed -i '' 's|@/components/ui/|@/components/ui-base/|g' demos-base/*.tsx
```

Render each demo as a stock | themed pair with per-component anchors. Both columns share the theme tokens, so the stock column picks up the palette too — that is correct: it isolates component-level differences, which is exactly what the user is judging. Regenerate `demos-base/` whenever a demo changes; never edit it by hand.

## 6. Verify and present

Typecheck and lint clean; dev server up; screenshot the gallery full-page in both themes and show the user. The user's verdict on the comparison is the gate — iterate the personality pass on whichever components they call off-brand until they approve.

## 7. Collapse on approval

Once the themed set is approved:

1. Delete `components/ui-base/` and `demos-base/`; make the gallery single-column (themed only, ~2 components per row, labeled panels).
2. Upstream comparison from now on is `npx shadcn@latest add <component> --diff` — the snapshot's job is over.
3. Save the token rationale to persistent memory (why each non-obvious mapping is intentional — e.g. "secondary is deliberately strong, per the reference's nav pill") so future sessions extend the system instead of "fixing" it.

Commit at each boundary (theme / components + snapshot / gallery / collapse), following the project's commit conventions.

## Pitfalls

- Theme-toggle icon swap: CSS-only (`hidden dark:block`), not setState-in-effect — avoids `react-hooks/set-state-in-effect`.
- Sidebar and chat-style components need full-page layouts; skip them in the gallery rather than shoehorn them in.
- agent-browser full-page screenshots take `--full`; if scrolling doesn't stick, fall back to a JS eval.
