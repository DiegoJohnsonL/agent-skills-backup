# inspire-site target conventions

Every agent building or touching the output app follows this file exactly.

## Stack (all targets)

- Next.js (App Router) + TypeScript + Tailwind v4 + `motion/react`. No other UI or
  animation libraries.
- Do not add comments; write self-explanatory code with clear names instead.
- Self-host any fonts used (files under the public dir, declared with
  `next/font/local` or `@font-face`). Never link Google Fonts at runtime.

## The variants page

- ONE route renders all variants. The variant is chosen by the `?variant=` search
  param (`a`, `b`, `c`, ...; default `a`).
- Each variant owns its folder `variants/<letter>/` next to the route file:
  `variants/a/index.tsx` (the whole page for that variant) plus any local
  components/assets modules it needs. A variant NEVER imports from another
  variant's folder — variants must be independently deletable.
- A small floating `VariantBar` (bottom-center, fixed, minimal chrome) switches
  variants via links that set `?variant=`. It lives in its own file beside the
  route so it is trivially removable once a direction wins.
- Shared between variants: only the switcher, the route shell, and the content
  brief data (a `content.ts` exporting the copy/product facts every variant
  renders in its own way). Design tokens are NOT shared — each variant defines its
  own look inside its folder.

## Inspiration rules (what "inspired, not copied" means)

- Take from references: layout grids, section structures and ordering, component
  shapes, spacing rhythm, motion character (trigger/direction/easing feel).
- Colors and typography from references are direction, not truth — each variant's
  direction spec says how far to lean.
- Copy is NEVER lifted from a reference site. Render the run's content brief; when
  the brief lacks a section's copy, write plausible neutral copy for the user's
  product.
- Reference images/fonts/logos MAY be used as visual STAND-INS so the design reads
  with real-feeling content — but every borrowed file must be listed in
  `STAND-INS.md` at the route root: file, which reference site it came from, what
  must eventually replace it. Never use a reference site's brand name or logo as
  the product's own identity.

## Per-target shape

- **scratch** (default): a fresh standalone app; the variants page is `/` (the app
  home). Dev server on the port given in the run args.
- **existing**: the variants page becomes the target project's main page route as
  directed by the run args; touch nothing else in the project.
- **d3labs**: the variants page lives under
  `app/[locale]/prototypes/<category>/<slug>/` with `"use client"` and the
  `// PROTOTYPE` banner, assets under `public/prototypes/<category>/<slug>/`, and
  the prototype registered in `_gallery/data.ts` (one Variant entry; create the
  category only if none fits). Follow the gallery's existing patterns.
