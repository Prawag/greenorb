# Design System: GreenOrb Intelligence Platform

## 1. Visual Theme & Atmosphere
A restrained, data-dense interface with confident asymmetric layouts and a clinical yet warm atmosphere — like a high-end financial terminal meets a modern architecture studio. The density is 7 (Cockpit Dense) to support heavy ESG data analysis, but balanced by generous negative space around macro components.

## 2. Color Palette & Roles
- **Canvas White** (#F9FAFB) — Primary background surface for the app
- **Pure Surface** (#FFFFFF) — Card, sidebar, and container fill
- **Charcoal Ink** (#18181B) — Primary text, high contrast headers
- **Muted Steel** (#71717A) — Secondary text, table headers, descriptions, metadata
- **Whisper Border** (rgba(226,232,240,0.5)) — Card borders, structural lines, dividers
- **Emerald Accent** (#10B981) — Single accent for positive ESG metrics, CTAs, active states
- **Alert Crimson** (#EF4444) — Semantic warning for high emissions or severe risk flags
- **Pending Amber** (#F59E0B) — Semantic warning for data pending extraction or average scores

*(No pure black, no neon glows. Muted, calibrated colors only.)*

## 3. Typography Rules
- **Display:** `Outfit` — Track-tight, controlled scale, weight-driven hierarchy for headers and titles.
- **Body:** `Outfit` — Relaxed leading, neutral secondary color for data labels.
- **Mono:** `JetBrains Mono` — For metrics, raw emissions data, UUIDs, and timestamps.
- **Banned:** Inter, generic system fonts, serif fonts in dashboards.

## 4. Component Stylings
* **Buttons:** Flat, tactile borders. Accent fill for primary, ghost/outline for secondary.
* **Cards:** Generously rounded corners (`12px` / `0.75rem`). Diffused whisper shadow (`box-shadow: 0 1px 3px rgba(0,0,0,0.05)`).
* **Inputs/Filters:** Clean structural borders, focus ring in accent color. No floating labels.
* **Metrics:** Large Mono font for numbers, with clear labels and semantic color highlights.

## 5. Layout Principles
- **Grid Architecture:** Multi-column layout for dashboard metrics.
- **Navigation:** Left-aligned sidebar with clear icon hierarchy.
- **Data Tables:** Clean rows with Muted Steel headers. No heavy alternating row colors.
- **Spacing:** Generous padding (`24px`) around major sections.

## 6. Anti-Patterns (Banned)
- No emojis anywhere in the main UI (aside from standard navigation symbols if SVG is unavailable).
- No `Inter` font.
- No pure black (`#000000`).
- No heavy gradient text.
- No neon/outer glow shadows.
- No 3-column equal grid cliché without purpose.
- No fake AI data/filler metrics.
