# New Themes Design — 2026-04-19

## Overview

Add 24 new themes to the existing SwarmUI React frontend theme system across three existing categories: **app**, **game**, and **color-scheme**. All themes are implemented as `ThemePalette` objects appended directly to the `THEME_PALETTES` array in `src/store/themeStore.ts`.

## Scope & Constraints

- **File:** `src/store/themeStore.ts` — append to existing `THEME_PALETTES` array (Option A)
- **Count:** 24 themes total (~8 per category)
- **No structural changes** to themeStore, no file splitting, no new categories
- **No UI changes** — existing ThemeCatalogBrowser, AppearanceModal, etc. handle new themes automatically
- Each theme must conform to the existing `ThemePalette` interface

## ThemePalette Interface (required fields)

```typescript
{
  id: string             // unique kebab-case
  name: string           // display name
  category: string       // 'app' | 'game' | 'color-scheme'
  colors: {
    brand: string        // primary brand hex
    accent: string       // secondary accent hex
    // 10-step gray scale:
    //   Dark mode:  gray9 = darkest bg, gray0 = lightest text
    //   Light mode: gray9 = lightest bg, gray0 = darkest text (inverted)
    gray0–gray9: string
    success: string
    warning: string
    error: string
    // optional extras: secondaryAccent, tertiaryAccent, highlightAccent,
    // shadowDepth, glowStrength, blurStrength, strokeStyle, radiusScale,
    // motionProfile, fontFamily, etc.
  }
  style?: ThemeStyle     // family, motif, surfaceMode, controlMode, iconMode
}
```

### Default semantic colors

Unless a theme specifies overrides (noted per-theme below), use these defaults:

| Token | Default | Notes |
|-------|---------|-------|
| `success` | `#40C057` | Mantine green-6 |
| `warning` | `#FAB005` | Mantine yellow-6 |
| `error` | `#FA5252` | Mantine red-6 |

### Per-theme semantic overrides

| Theme | success | warning | error | Rationale |
|-------|---------|---------|-------|-----------|
| Bloodborne | `#D4A017` (amber) | `#C17F24` (dark amber) | `#8B0000` (blood red) | Horror palette — amber replaces green, blood red replaces alert red |
| Cyberpunk 2077 | `#00D4FF` (cyan) | `#FCE300` (yellow) | `#FF2D55` (hot red) | Night City neon palette |
| Stardew Valley | `#6AB04C` (leaf green) | `#F0A500` (harvest gold) | `#C0392B` (red) | Matches brand/accent for cohesion |
| Solarized Dark | `#859900` (sol. green) | `#B58900` (sol. yellow) | `#DC322F` (sol. red) | Exact Solarized palette values |
| Solarized Light | `#859900` (sol. green) | `#B58900` (sol. yellow) | `#DC322F` (sol. red) | Same as Solarized Dark |
| Oxocarbon | `#42BE65` (IBM green-40) | `#F1C21B` (IBM yellow-30) | `#FA4D56` (IBM red-40) | Full IBM Carbon semantic tokens |
| All others | default | default | default | Standard values |

### Gray scale interpolation

Interpolate the 10 steps (gray0–gray9) in **OKLCH color space** for perceptually even gradients. Straight sRGB interpolation produces muddy mid-tones on warm/cool tinted palettes.

---

## Category: App (8 themes)

### 1. Claude
- **id:** `claude`
- **name:** Claude
- **Palette:** brand `#D97757` (copper), accent `#8B7355` (warm brown)
- **Gray scale:** gray9 `#0F0D0C` warm near-black → gray0 `#FAF7F5` warm cream
- **Style:** family `classic`, surfaceMode `gradient`, motionProfile `calm`
- **Rationale:** Reflects Anthropic's warm copper/terracotta brand identity with cream tones

### 2. Arc Browser
- **id:** `arc`
- **name:** Arc Browser
- **Palette:** brand `#5B5BD6` (indigo), accent `#E54D2E` (red-orange)
- **Gray scale:** gray9 `#0C0C12` dark navy → gray0 `#F0F0FF` light blue-white
- **Style:** family `classic`, surfaceMode `gradient`, motionProfile `energetic`
- **Rationale:** Arc's deep navy sidebar with vibrant gradient-inspired accents

### 3. Vercel
- **id:** `vercel`
- **name:** Vercel
- **Palette:** brand `#0070F3` (electric blue), accent `#7928CA` (purple)
- **Gray scale:** gray9 `#000000` true black → gray0 `#FFFFFF` pure white
- **Style:** family `classic`, surfaceMode `gradient`, motionProfile `calm`
- **Rationale:** Vercel's stark black/white minimal aesthetic with signature electric blue

### 4. Raycast
- **id:** `raycast`
- **name:** Raycast
- **Palette:** brand `#E55A2B` (orange-red), accent `#FF9F0A` (amber)
- **Gray scale:** gray9 `#080808` near-black → gray0 `#F5F5F5` near-white
- **Style:** family `classic`, surfaceMode `gradient`, motionProfile `energetic`
- **Rationale:** Raycast's dark launcher aesthetic with warm gradient brand

### 5. Warp Terminal
- **id:** `warp`
- **name:** Warp Terminal
- **Palette:** brand `#7B4DFF` (vivid purple), accent `#00E5CC` (cyan)
- **Gray scale:** gray9 `#0A0A12` dark blue-black → gray0 `#E8E8F0` blue-tinted white
- **Style:** family `glyph`, motionProfile `standard`
- **Rationale:** Warp's deep purple/blue terminal environment; glyph family suits terminal aesthetic

### 6. Supabase
- **id:** `supabase`
- **name:** Supabase
- **Palette:** brand `#3ECF8E` (emerald), accent `#24B47E` (dark green)
- **Gray scale:** gray9 `#0F0F0F` near-black → gray0 `#F8F8F8` near-white
- **Style:** family `classic`, motionProfile `standard`
- **Rationale:** Supabase's dark UI with signature emerald green brand

### 7. Tailwind CSS
- **id:** `tailwind`
- **name:** Tailwind CSS
- **Palette:** brand `#06B6D4` (cyan-500), accent `#3B82F6` (blue-500)
- **Gray scale:** gray9 `#0F172A` slate-900 → gray0 `#F8FAFC` slate-50
- **Style:** family `classic`, motionProfile `standard`
- **Rationale:** Tailwind's slate-based dark with signature cyan/sky brand

### 8. Cursor
- **id:** `cursor`
- **name:** Cursor
- **Palette:** brand `#6366F1` (indigo), accent `#8B5CF6` (violet)
- **Gray scale:** gray9 `#0C0C10` near-black → gray0 `#F0F0F5` blue-tinted white
- **Style:** family `classic`, motionProfile `calm`
- **Rationale:** Cursor editor's dark indigo/violet palette, calm and focused

---

## Category: Game (8 themes)

### 9. Bloodborne
- **id:** `bloodborne`
- **name:** Bloodborne
- **Palette:** brand `#8B0000` (dark blood red), accent `#D4A017` (amber/gold)
- **Gray scale:** gray9 `#0A0505` red-tinted near-black → gray0 `#D4C5B0` aged parchment
- **Style:** family `classic`, surfaceMode `gradient`, motionProfile `calm`
- **Rationale:** Gothic horror atmosphere — oppressive darkness, dried blood, candlelight amber

### 10. Cyberpunk 2077
- **id:** `cyberpunk-2077`
- **name:** Cyberpunk 2077
- **Palette:** brand `#FCE300` (Night City yellow), accent `#00D4FF` (cyan)
- **Gray scale:** gray9 `#020204` true black → gray0 `#E8E8F8` blue-white
- **Style:** family `glyph`, motionProfile `energetic`
- **Rationale:** Night City neon aesthetic — distinct from existing "Cyberpunk" aesthetic theme which is more generic; this uses the game's specific yellow/cyan palette with glyph motifs

### 11. Skyrim
- **id:** `skyrim`
- **name:** Skyrim
- **Palette:** brand `#C0392B` (dragon red), accent `#4A90D9` (tundra blue)
- **Gray scale:** gray9 `#0D0D0F` stone black → gray0 `#E8E6E0` parchment/stone
- **secondaryAccent:** `#D4C5A9` parchment gold
- **Style:** family `classic`, motionProfile `standard`
- **Rationale:** Nordic stone grey with The Elder Scrolls' iconic dragon red logo and cold tundra blue sky

### 12. Stardew Valley
- **id:** `stardew`
- **name:** Stardew Valley
- **Palette:** brand `#6AB04C` (leaf green), accent `#F0A500` (golden harvest)
- **Gray scale:** gray9 `#1A1209` dark soil → gray0 `#F5EDD8` warm cream
- **Style:** family `classic`, radiusScale `rounded`, motionProfile `calm`
- **Rationale:** Pastoral warmth — earthy greens and harvest gold with rounded shapes for cozy pixel feel

### 13. Baldur's Gate 3
- **id:** `baldursgate3`
- **name:** Baldur's Gate 3
- **Palette:** brand `#7B3FB5` (arcane purple), accent `#C9A84C` (parchment gold)
- **Gray scale:** gray9 `#0A070F` deep magic dark → gray0 `#D8D0C8` aged parchment
- **Style:** family `classic`, surfaceMode `gradient`, motionProfile `standard`
- **Rationale:** Dark fantasy arcane atmosphere — deep purple magic with Faerûn's parchment and gold

### 14. Mass Effect
- **id:** `masseffect`
- **name:** Mass Effect
- **Palette:** brand `#CC0000` (N7 red), accent `#00B4D8` (biotic blue)
- **Gray scale:** gray9 `#050810` space black → gray0 `#D0D8E8` cold blue-white
- **secondaryAccent:** `#FF6B35` heat-sink orange
- **Style:** family `classic`, motionProfile `standard`
- **Rationale:** N7 dark charcoal with iconic red stripe and biotics' electric blue

### 15. Celeste
- **id:** `celeste`
- **name:** Celeste
- **Palette:** brand `#E040FB` (vivid pink-purple), accent `#40C4FF` (ice blue)
- **Gray scale:** gray9 `#0A0A14` mountain night → gray0 `#EEE8FF` lavender mist
- **Style:** family `classic`, motionProfile `energetic`
- **Rationale:** Madeline's vibrant pink-purple against icy mountain blues — energetic and hopeful

### 16. Portal
- **id:** `portal`
- **name:** Portal
- **Palette:** brand `#FF6B00` (orange portal), accent `#0090FF` (blue portal)
- **Gray scale:** gray9 `#0A0C0E` chamber black → gray0 `#D8DCE0` concrete grey
- **Style:** family `classic`, motionProfile `standard`
- **Rationale:** Aperture Science test chamber — clean concrete grey with the iconic orange/blue portal duality

---

## Category: Color Scheme (8 themes)

### 17. Oxocarbon
- **id:** `oxocarbon`
- **name:** Oxocarbon
- **Palette:** brand `#0F62FE` (IBM Blue 60), accent `#42BE65` (IBM Green 40)
- **Gray scale:** gray9 `#161616` Carbon gray-100 → gray0 `#F4F4F4` Carbon gray-10
- **Style:** family `classic`, motionProfile `standard`
- **Rationale:** IBM Carbon Design System dark palette — neutral cool slates with IBM's vivid utility colors

### 18. Nightfox
- **id:** `nightfox`
- **name:** Nightfox
- **Palette:** brand `#C94F6D` (dusty rose), accent `#719CD6` (soft blue)
- **Gray scale:** gray9 `#192330` dark blue-grey → gray0 `#CDCECF` cool light grey
- **Style:** family `classic`, motionProfile `standard`
- **Rationale:** Warm dark purples and dusty rose on a cool blue-grey base; popular Neovim colorscheme

### 19. Gruvbox Light
- **id:** `gruvbox-light`
- **name:** Gruvbox Light
- **Palette:** brand `#D65D0E` (orange), accent `#458588` (teal)
- **Gray scale:** gray9 `#FBF1C7` cream parchment (light bg) → gray0 `#1D2021` hard dark (text)
- **Light mode:** yes (`resolvedColorScheme: 'light'`)
- **Style:** family `classic`, motionProfile `calm`
- **Rationale:** Light counterpart to the existing Gruvbox Dark — warm retro parchment background

### 20. Solarized Dark
- **id:** `solarized-dark`
- **name:** Solarized Dark
- **Palette:** brand `#B58900` (yellow), accent `#268BD2` (blue)
- **Gray scale:** gray9 `#002B36` base03 (teal-dark) → gray0 `#FDF6E3` base3 (cream)
- **Style:** family `classic`, motionProfile `calm`
- **Rationale:** Ethan Schoonover's classic Solarized — precise CIELAB-balanced palette, dark variant
- **Note:** gray9 `#002B36` is teal-tinted and gray0 `#FDF6E3` is cream; OKLCH interpolation will produce teal→yellow midtones. This is the authentic Solarized palette character, not an error.

### 21. Solarized Light
- **id:** `solarized-light`
- **name:** Solarized Light
- **Palette:** brand `#B58900` (yellow), accent `#268BD2` (blue)
- **Gray scale:** gray9 `#FDF6E3` base3 (cream bg) → gray0 `#002B36` base03 (dark text)
- **Light mode:** yes
- **Style:** family `classic`, motionProfile `calm`
- **Rationale:** Light counterpart to Solarized Dark — same precise palette inverted for light mode

### 22. Melange
- **id:** `melange`
- **name:** Melange
- **Palette:** brand `#E49B5D` (warm amber), accent `#85AD82` (muted sage)
- **Gray scale:** gray9 `#1B1611` dark warm brown → gray0 `#F5ECD7` warm parchment
- **Style:** family `classic`, motionProfile `calm`
- **Rationale:** Earthy warm-toned colorscheme inspired by natural materials — amber, sage, brown, parchment

### 23. Flexoki
- **id:** `flexoki`
- **name:** Flexoki
- **Palette:** brand `#D14D41` (ink red), accent `#879A39` (ink green)
- **Gray scale:** gray9 `#100F0F` near-black ink → gray0 `#FFFCF0` paper white
- **Style:** family `classic`, motionProfile `calm`
- **Rationale:** Steph Ango's Ink & Paper colorscheme — designed around paper tones for calm, readable UIs

### 24. Ayu Dark
- **id:** `ayu-dark`
- **name:** Ayu Dark
- **Palette:** brand `#FF8F40` (orange), accent `#59C2FF` (blue)
- **Gray scale:** gray9 `#0A0E14` very dark → gray0 `#BFBDB6` warm grey
- **Style:** family `classic`, motionProfile `standard`
- **Rationale:** Full dark variant of the Ayu family — darker than existing Ayu Mirage (mid-dark), completing the trilogy

---

## Implementation Notes

- All 24 themes appended to `THEME_PALETTES` in `src/store/themeStore.ts`
- Light mode themes (Gruvbox Light, Solarized Light) set `resolvedColorScheme: 'light'` via appropriate gray scale inversion (gray9 = lightest bg, gray0 = darkest text)
- Cyberpunk 2077 uses `id: 'cyberpunk-2077'` to avoid collision with existing `cyberpunk` in the aesthetic category
- success/warning/error values: use the default table in the interface section; per-theme overrides are listed there
- Gray scale: interpolate gray0–gray9 in OKLCH color space between the documented endpoints
- No changes to UI components, routing, persistence, or validation logic — all handled by existing infrastructure

## Files Changed

| File | Change |
|------|--------|
| `src/store/themeStore.ts` | Append 24 `ThemePalette` objects to `THEME_PALETTES` array |

No other files need to change.
