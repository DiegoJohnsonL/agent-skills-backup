# d3labs prototype target — conventions for a cloned page

This is the shape every clone must take. Read it fully before writing files.

## Where files go

- **Route:** `app/[locale]/prototypes/<category>/<slug>/page.tsx`
- **Sections:** `app/[locale]/prototypes/<category>/<slug>/sections/<section-id>.tsx`
  — one component file per section. `page.tsx` imports them in order and renders
  them inside the shared layout.
- **Shared foundation:** colocated in the route folder, e.g.
  `tokens.ts` (design tokens as exported consts), `shared.tsx` (nav, footer,
  scroll-progress, shared `motion` variants and any global animation hook).
- **Assets:** `public/prototypes/<category>/<slug>/<file>`, referenced with an
  absolute path `/prototypes/<category>/<slug>/<file>`. Copy the downloaded
  images/videos/fonts here from the workspace `assets/`. For heavy video, keep a
  poster image and lazy-load.

## The page composition pattern

`page.tsx` is a single `"use client"` component opening with a banner comment that
describes the design, then composing the sections:

```tsx
"use client"

// PROTOTYPE — <category>: "<Brand>" — cloned from <url>.
// <one or two lines on the visual character: palette, type, motion>

import { Nav, Footer, ScrollProgress } from "./shared"
import Hero from "./sections/hero"
import Features from "./sections/features"
// ...one import per section, in scroll order

export default function Page() {
  return (
    <main>
      <ScrollProgress />
      <Nav />
      <Hero />
      <Features />
      {/* ...sections in order */}
      <Footer />
    </main>
  )
}
```

Each `sections/<id>.tsx` is a `"use client"` component that imports tokens and any
global motion variants from `../tokens` / `../shared` and renders one section to
match its reference frame.

## Library + style conventions (match the neighboring prototypes)

- **Styling — translate the CSS to Tailwind, never carry it over.** The scraped
  stylesheets and inline styles are a *reference for values*, not files to copy:
  read them for color, spacing, font, radius, shadow, and layout values, then
  express every element with Tailwind v4 utility classes. No copied `.css` files,
  no `<style>` / styled-jsx blocks, no `style={{…}}` except for a value Tailwind
  genuinely can't reach (a one-off gradient, mask, or transform). Centralize the
  recurring values as exported consts in `tokens.ts` (e.g.
  `export const ACCENT = "#c8f24b"`) or as CSS variables, and reference them via
  `className` (arbitrary values like `bg-[--accent]`) so a token is defined once.
- **Fonts — self-host the real ones; fonts are assets, not CSS to translate.**
  The scrape downloads the page's actual webfonts into `assets/` and records every
  `@font-face` (family, weight, file URL) in `computed.json`. The foundation copies
  those files into `public/.../fonts` and declares them with `next/font/local` or
  `@font-face`, using the **exact** family names and weights from `computed.json` —
  do **not** silently swap in a lookalike. When a font is license-blocked (Adobe
  Typekit, Fonts.com) or wasn't captured, pick the closest free family **and record
  the substitution** in the section's `remainingGaps`; never substitute invisibly.
  A bespoke wordmark/logotype is **artwork, not a font**: reproduce it from its
  captured SVG (inline the path data, `fill="currentColor"`) — never fall back to a
  system serif.
- **Animation — replicate the *recorded* motion with `motion/react`.** `motion` is
  installed; `import { motion } from "motion/react"` and re-author the reveals,
  parallax, sticky/transforming nav, hovers, and transitions as `motion` components
  and variants. The motion source of truth is the real-time recording in
  `screenshots/motion/` — the per-section spec + clip and `motion.md` (what animates,
  trigger, easing, duration, stagger). Match that timing; do not invent motion from
  the static frames. Reproduce the *effect*, not the implementation: do not port the
  original's CSS keyframes/transitions or its JS animation libraries (GSAP, AOS,
  Lenis, ScrollMagic, etc.). Define shared reveal/parallax variants once in the
  foundation and reuse them so motion is consistent across sections.
- Icons: `lucide-react`.
- i18n: prototypes are bilingual via a `COPY` object keyed `en`/`es`, selected with
  `useLocale()` from `next-intl`. Mirror the original site's copy as the primary
  locale; provide an `es` (or `en`) counterpart if quick, otherwise duplicate the
  original text into both keys — do not block the clone on translation.
- **No comments** except the single `// PROTOTYPE — …` banner at the top of
  `page.tsx`. Write self-explanatory names instead (repo coding standard).

## Choose, or create, the category

The category comes from the site itself, not from the user. The existing
categories live in `EN_CATEGORIES` inside `app/[locale]/prototypes/_gallery/data.ts`
— read it before deciding. Reuse the category whose industry fits the site; only
when none genuinely fits do you create a new one.

**Reuse:** add one `Variant` to the matching category's `variants` array:

```ts
{ name: "<Brand>", style: "<short style label>", href: "/prototypes/<category>/<slug>", cover: "/prototypes/<category>/<slug>/<hero-asset>" }
```

**Create new:** add a new `Category` to `EN_CATEGORIES` with the variant inside it,
and add Spanish translations so the ES gallery renders:

```ts
{ slug: "<category>", title: "<Title>", description: "<one line>", variants: [ /* the variant above */ ] }
```
- `ES_CATEGORY[<category>]` — `{ title, description }` in Spanish.
- `ES_STYLE[<style label>]` — Spanish style label (optional).

`ES_CATEGORIES` derives from `EN_CATEGORIES` automatically; these maps are the only
extra edit a new category needs.

## Fidelity bar — three sources of truth

A clone is built from three captured references, never by eye:

- **`computed.json` — the ground truth for values.** Exact font-family, px sizes,
  hex, gradients, radii, and spacing. Read type/color/spacing from here; never
  measure a value off a screenshot.
- **`screenshots/frames/<id>.png` — layout.** One clean, **judged** reference frame
  per section: captured from the original at 2x, bounded by section landmarks (this
  section's first label → the next section's), with entrance animations **settled and
  reveal-hidden content forced visible** so nothing is missing, and scored/re-shot until
  it shows the whole section uncropped. This is the composition reference. There is **no
  full-page screenshot** — a single tall image is low-res, at a different scale, and
  hides content still mid-animation.
- **`screenshots/motion/` — motion.** A real-time (≥30fps) `master.mp4`, per-section
  `clips/<id>.mp4`, and `motion.md` (a section-by-section breakdown of what animates,
  its trigger, easing, duration, and stagger). Re-author motion from this, not from
  the static frames.

A section is **green** when, screenshotted at its scroll position, it matches its
reference frame on layout and motion *and* matches `computed.json` on type, color,
and spacing. A section agent reports `done` only after it has screenshotted its
**own** output and confirmed the match — `done` carries that screenshot as evidence;
it is not self-asserted.
