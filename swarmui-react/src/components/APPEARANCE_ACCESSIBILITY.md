# Appearance Surface Accessibility Checklist

Static audit for the consolidated React appearance surface introduced by the
React Appearance Simplification plan. Target conformance is **WCAG 2.2 AA** for
the new modal and trigger.

Surface inventory:

- [`AppearanceTrigger.tsx`](AppearanceTrigger.tsx) — single header button that
  opens the modal.
- [`AppearanceModal.tsx`](AppearanceModal.tsx) — mode segmented control,
  curated preset cards, motion & display, advanced customization.
- [`ThemeCatalogBrowser.tsx`](ThemeCatalogBrowser.tsx) — embedded full catalog
  inside the advanced section.
- [`ThemePreview.tsx`](ThemePreview.tsx) /
  [`ThemePreviewFrame.tsx`](ThemePreviewFrame.tsx) — non-interactive previews
  inside the preset cards and catalog.

This document is a static (non-runtime) review. Pair it with the
`theme:contrast-audit` script (which now covers focus indicator and selected
border non-text contrast) and manual keyboard checks before shipping.

## WCAG 2.2 AA criteria covered

### 1.4.3 Contrast Minimum (text, 4.5:1)

- [x] Modal text uses semantic surface tokens (`var(--theme-text-on-card)`,
  Mantine `c="dimmed"`) on `var(--theme-surface-card)` panels.
- [x] Curated preset cards inherit `var(--theme-surface-card)`; preset name
  text uses default Text color which routes through theme contrast guarantees.
- [x] `theme:contrast-audit` enforces text-on-card / text-on-input / dimmed
  text minimums for every built-in theme in both color schemes.

### 1.4.11 Non-text Contrast (UI components, 3:1)

- [x] Focus rings — `--theme-focus-ring` is now boosted via
  `ensureNonTextContrast()` in `themeStore.ts` so every theme produces a focus
  color that contrasts ≥3:1 against `--theme-surface-app`,
  `--theme-surface-panel`, and `--theme-surface-card`.
- [x] Selected borders — `--theme-selected-border` and
  `--theme-selection-border` use the same booster, so the selection boundary
  on preset cards / catalog rows is always perceivable.
- [x] `theme:contrast-audit` strict cases gate on focus and border contrast.
- [x] Soft (advisory) cases for `selected-surface-on-card` and
  `interactive-active-on-card` are reported but not gated, since the boundary
  carries the WCAG state signal and the fill is decorative.

### 1.4.12 Text Spacing

- [x] Modal does not lock height/width on text containers; `Stack` and `Group`
  flow naturally with user style overrides.
- [x] No `letter-spacing`, `word-spacing`, or `line-height` overrides that
  would block the user spacing minimums.

### 2.1.1 Keyboard

- [x] `AppearanceTrigger` is a `SwarmActionIcon` (rendered as `<button>`),
  fully keyboard reachable.
- [x] Mantine `Modal` traps focus when open and restores focus on close.
- [x] Mode segmented control (Light/Dark/System) uses `SwarmSegmentedControl`,
  which renders as a Mantine `SegmentedControl` and is arrow-key navigable.
- [x] Curated `Select` dropdowns use Mantine `Select` with `withinPortal:
  true` and `allowDeselect: false`, navigable with arrows + enter.
- [x] Advanced toggle is an `UnstyledButton` with `aria-expanded` /
  `aria-controls` and is reachable via Tab.
- [x] "Browse all themes" preset card link is an `UnstyledButton` (focusable)
  with `aria-label`.
- [x] All `SwarmButton` and `SwarmActionIcon` instances inherit Mantine focus
  outlines.

### 2.4.7 Focus Visible

- [x] All interactive controls inherit the project's focus rings via
  `SwarmActionIcon` / `SwarmButton` / `SwarmSegmentedControl` / `SwarmSwitch`.
- [x] `UnstyledButton` instances (advanced toggle, browse-all link) are
  reached via Mantine global focus styles (`:focus-visible` outline driven by
  `--theme-focus-ring`).

### 2.4.13 Focus Appearance (AA)

- [x] Focus indicator color is sourced from `--theme-focus-ring`, which is
  forced to ≥3:1 against the surrounding surfaces by
  `ensureNonTextContrast`.
- [x] Focus indicators encircle the entire control (Mantine default).

### 2.5.8 Target Size Minimum (24×24)

- [x] `SwarmActionIcon` size `md` → 36×36 (header trigger, catalog import /
  create buttons).
- [x] Mantine `Select` default size `sm` → 36px tall.
- [x] `SwarmSegmentedControl` default → 32px tall (mode + motion + effects +
  shape overrides), exceeds 24px.
- [x] `SwarmSwitch` size `md` → ≥24px touch box.
- [x] PresetCard "Browse all themes →" `UnstyledButton` has explicit
  `minHeight: 24` style.
- [x] Advanced customization `UnstyledButton` toggle has explicit
  `minHeight: 32` style added to satisfy this criterion.
- [x] Mantine `Modal` close button is the framework default (24×24+).
- [x] Curated `Select` items render as Mantine combobox options (>=32px each).

### 2.3.3 Animation from Interactions (AAA, but tracked)

- [x] Reduced motion switch and motion preset segmented control are exposed
  in the Motion & Display section so users can disable transitions globally.
- [x] When `reducedMotion` is on, motion preset and effects intensity controls
  are explicitly `disabled`.
- [x] Advanced section uses Mantine `Collapse`, which honours the project's
  reduced-motion handling via the existing `animationStore` integration.

### 1.4.13 Content on Hover or Focus

- [x] Header tooltip on `AppearanceTrigger` is a Mantine `Tooltip` (dismissible
  via Escape, persists on hover, no premature dismissal).
- [x] No hover-only content reveal in the modal body.

### 4.1.2 Name, Role, Value

- [x] `AppearanceTrigger` button has `aria-label="Open appearance settings"`,
  `aria-haspopup="dialog"`, and `aria-expanded`.
- [x] `Modal` has `title="Appearance"` and `aria-label="Appearance settings"`.
- [x] Mode segmented control has `aria-label="Color scheme mode"`.
- [x] Motion preset, effects intensity, button shape, and icon shape segmented
  controls each have descriptive `aria-label`s.
- [x] Reduced motion switch has `aria-label="Toggle reduced motion"`.
- [x] Color picker has `aria-label="Custom accent color"`.
- [x] Curated `Select` dropdowns have `aria-label="Select light theme"` /
  `"Select dark theme"`.
- [x] Advanced toggle exposes `aria-expanded` + `aria-controls` linking to the
  collapsed `<Stack id="appearance-advanced-panel">`.
- [x] PresetCard browse-all button has `aria-label` describing the target
  scheme.

## Out-of-scope (legacy / not part of this surface)

- The Razor / Vanilla JS theme system in `src/wwwroot/` is unchanged.
- The deeper `ThemeBuilder` and `ThemeImporter` modals are reused unchanged
  via `Suspense`. They have their own audit history; the simplification plan
  does not redesign them.
- Existing pages flagged by `theme:audit` (CanvasEditor, RegionalPromptEditor,
  etc.) carry pre-existing color literals unrelated to the appearance surface.

## How to re-run the related audits

```bash
# Theme tokenization audit
node scripts/theme-audit.mjs

# Theme contrast audit (text + non-text strict + soft advisory)
node scripts/theme-contrast-audit.mjs
```

Both must exit `0` before shipping. The contrast audit additionally reports
"Curated preset strict failures" — that count must be zero.
