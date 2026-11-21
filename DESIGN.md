# GreenOrb design

Map-first, dark glass. The Earth sits behind everything and panels float over it as frosted glass.
Every figure stays traceable to the page it came from.

## Brand
- Logo files are in `docs/brand/`. In the app, use `<Logo />` (wordmark; its text takes `currentColor`) and `<Orb />` from
  `src/components/Logo.jsx`. Never redraw, recolour or stretch the orb. Its gradient is #00FF19 to #14A022.
- Favicon and app icon: `public/favicon.svg` (the orb on #0C130E).

## Colour (tokens in `src/styles/global.css`)
| Token | Value | Use |
|---|---|---|
| `--bg` | #0C130E | Page ground |
| `--glass` | rgba(17,25,19,.68) + blur 22px | Panels, top bar, rail |
| `--card` | rgba(255,255,255,.045) | Cards inside panels |
| `--ink` / `--text` / `--muted` | #F1F5EE / #C9D2C9 / #8F9B91 | Headings / body / secondary |
| `--lime` | #C6F36B | Selection, primary action, source chips. Use it once per view for emphasis. |
| `--good` | #47D764 | "Good" states and decreases in emissions |
| `--amber` / `--red` | #F2B54D / #F27466 | Flag severity and increases in emissions |

## Type
Manrope (400–700) only, with tabular figures everywhere. Sentence case. No all-caps labels, no monospace labels.

## Shape
Panels have a 24px radius, inner cards 16px, and controls are pills (999px). Panels get one soft shadow.

## Layout
- **Overview (`/`):** a full-screen interactive globe.
  - Right column: portfolio overview, review queue, recently read.
  - Bottom: scope mix and emissions by sector.
  - The layer switch (Flags / Disclosure / Emissions) colours the markers.
  - Clicking a marker flies to it and opens a place card listing the companies there.
- **Other pages:** glass panels over `public/backdrop.webp`, a dimmed still of the same globe.
- **Navigation:** a floating icon rail that shows its labels on hover. On phones it becomes a bottom tab bar.

## Honesty rules
- Companies with only a country are drawn at the country, grouped into one marker, never scattered to fake positions.
- Each extracted figure shows its source page (`p. 47` chip) and how it was read, with a confidence value.
- Charts say what they aggregate ("latest year per company").

## Motion
- A single staggered rise for the overview panels on load.
- The globe flies to a place when it is selected.
- Hover states on bars and markers.
- Everything respects `prefers-reduced-motion`.
