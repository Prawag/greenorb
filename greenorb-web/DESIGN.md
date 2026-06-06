# Design System: GreenOrb Agent Network

## 1. Visual Theme & Atmosphere
A hyper-dense, data-rich "Cockpit Dense" (8) interface with confident "Artsy Chaotic" (8) asymmetric layouts and fluid "Cinematic Choreography" (8) spring-physics motion. The atmosphere is highly technical yet organic — like a high-end Bloomberg terminal built by climate scientists. Elements must never overlap; they sit in stark, tightly controlled spatial zones.

## 2. Color Palette & Roles
- **Canvas Charcoal** (`#09090B`) — Primary background surface (deepest zinc, NOT pure black)
- **Data Surface** (`#18181B`) — Card and container fill for depth
- **Whisper Outline** (`rgba(255, 255, 255, 0.05)`) — Card borders and structural grid lines
- **Primary Text** (`#FAFAFA`) — High-contrast text
- **Muted Metadata** (`#A1A1AA`) — Secondary text, unit labels, table headers
- **GreenOrb Emerald** (`#10B981`) — Single primary accent for CTAs, active states, and positive data points (Strictly no neon glows, saturation kept below 80%)
- **Alert Amber** (`#F59E0B`) — High-risk / Warning indicator

## 3. Typography Rules
- **Display:** `Outfit` — Track-tight, controlled scale, weight-driven hierarchy. Used for primary headlines and dashboard metric values.
- **Body:** `Outfit` — Relaxed leading, neutral secondary color.
- **Mono:** `JetBrains Mono` — Banned all serif fonts. Used exclusively for ESG scores, carbon footprint metrics, coordinates, and system timestamps.
- **Banned:** `Inter`, generic system fonts, pure black text.

## 4. Component Stylings
* **Buttons:** Flat, brutalist, no outer glow. Tactile `-1px` translate down on active click. Emerald fill for primary.
* **Cards:** Sharp or gently rounded (0.5rem), NO massive corner radii. Diffused whisper outline. Zero elevation shadows (flat design).
* **Inputs:** Minimalist. Bottom border only on focus, or flat fill. Focus ring in GreenOrb Emerald. No floating labels.
* **Loaders:** Skeletal shimmer matching exact layout dimensions.
* **Globe:** Central asymmetric anchor. High-contrast points, organic rotation.

## 5. Layout Principles
- **Grid Architecture:** Strict CSS grid. Never use generic "3 equal columns".
- **Hero/Main View:** Left-aligned 60/40 Split Screen or Asymmetric Whitespace. The Globe anchors the 60% right pane, data streams vertically in the 40% left pane.
- **Responsive:** Strict single-column collapse below `768px`.
- **Containment:** Max-width `1600px` for extreme widescreen, `min-h-[100dvh]` to avoid iOS jump.

## 6. Motion & Interaction
- **Spring Physics:** `stiffness: 100, damping: 20` applied via CSS transitions where applicable.
- **Perpetual Micro-Interactions:** The Globe constantly rotates; live data points gently pulse.
- **Hardware Acceleration:** All animations strictly use `transform` and `opacity`. No animating `width`/`height` or `top`/`left`.

## 7. Anti-Patterns (Banned)
- NO emojis.
- NO `Inter` or `Times New Roman`.
- NO pure black (`#000000`) or pure purple/blue neon glows.
- NO overlapping text or elements.
- NO generic data or fake stats. "99.98% UPTIME SLA" is banned.
- NO generic 3-column equal grid layouts.
- NO AI clichés ("Unleash", "Elevate").
- NO filler text ("Scroll to explore").
