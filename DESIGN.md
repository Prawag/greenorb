# Design System: GreenOrb Intelligence

## 1. Visual Theme & Atmosphere
A restrained, data-dense interface with confident asymmetric layouts and fluid spring-physics motion. The atmosphere is clinical, authoritative, yet approachable — like a modern Bloomberg terminal meets an architecture studio. Density is high (8), variance is offset (7), and motion is subtle but perpetual.

## 2. Color Palette & Roles
- **Canvas White** (#F9FAFB) — Primary background surface
- **Pure Surface** (#FFFFFF) — Card and container fill
- **Charcoal Ink** (#18181B) — Primary text, Zinc-950 depth
- **Muted Steel** (#71717A) — Secondary text, descriptions, metadata
- **Whisper Border** (rgba(226,232,240,0.5)) — Card borders, 1px structural lines
- **Jade Accent** (#059669) — Single accent for CTAs, active states, focus rings. Saturation kept low and authoritative.

## 3. Typography Rules
- **Display:** `Cabinet Grotesk` — Track-tight, controlled scale, weight-driven hierarchy
- **Body:** `Satoshi` — Relaxed leading, 65ch max-width, neutral secondary color
- **Mono:** `JetBrains Mono` — For code, telemetry, ESG metrics, high-density numbers
- **Banned:** `Inter`, `Times New Roman`, generic system fonts. No serifs used in this dashboard context.

## 4. Component Stylings
* **Buttons:** Flat, no outer glow. Tactile -1px translate on active via spring physics. Jade fill for primary, ghost/outline for secondary.
* **Cards:** Generously rounded corners (1rem). Diffused whisper shadow `0 1px 3px rgba(0,0,0,0.05)`. High-density metric rows replace cards with border-top dividers.
* **Inputs:** Label above, error below. Focus ring in Jade. No floating labels.
* **Loaders:** Skeletal shimmer matching exact layout dimensions. No circular spinners.
* **Empty States:** Composed, muted structural outlines.

## 5. Layout Principles
Grid-first responsive architecture. Asymmetric splits (e.g. `[3, 1]` or `[2, 1]`) for metric sections. Strict single-column collapse below 768px. Max-width containment (1200px centered). No flexbox percentage math. Generous internal padding. No overlapping elements — clean spatial separation.

## 6. Motion & Interaction
Spring physics for all interactive elements (`stiffness: 100, damping: 20`). Staggered cascade reveals for lists. Perpetual micro-loops (slow pulse) on active live-data components like the IoT telemetry stream. Hardware-accelerated transforms only.

## 7. Anti-Patterns (Banned)
- NO emojis anywhere in the UI.
- NO `Inter` font.
- NO pure black (`#000000`).
- NO neon glows or purple accents.
- NO 3-column equal grids.
- NO AI copywriting clichés ("Elevate", "Seamless", "Unleash").
- NO fabricated data or fake statistics. Use `--` if data is missing.
- NO centered Hero sections.
- NO generic names or placeholder avatars.
