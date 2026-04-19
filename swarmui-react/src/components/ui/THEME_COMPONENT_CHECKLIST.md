# Theme Component Checklist

## Core Runtime
- [x] `src/pages/GeneratePage/components/ParameterPanel/GenerateButton.tsx`
- [x] `src/components/QueueStatusBadge.tsx`
- [x] `src/pages/QueuePage.tsx`
- [x] `src/pages/GalleryPage.tsx`
- [x] `src/pages/HistoryPage.tsx`
- [x] `src/components/ImageLightbox.tsx`
- [x] `src/components/LoRABrowser.tsx`
- [x] `src/components/ModelBrowser.tsx`

## Shared UI Layer
- [x] `src/components/ui/SwarmButton.tsx`
- [x] `src/components/ui/SwarmActionIcon.tsx`
- [x] `src/components/ui/SwarmBadge.tsx`
- [x] `src/components/ui/SwarmStatusPill.tsx`
- [x] `src/components/ui/QuickActionRail.tsx`
- [x] `src/components/ui/SectionHero.tsx`

## Theme Preview Standard
- [x] `src/components/ThemePreviewFrame.tsx`
- [x] `src/components/ThemePreview.tsx` (uses shared frame)
- [x] `src/components/AppearanceModal.tsx` (uses `ThemePreview` for curated cards)
- [x] `src/components/ThemeCatalogBrowser.tsx` (uses `ThemePreview` for advanced catalog)
- [x] `src/components/ThemeBuilder.tsx` (uses `ThemePreview`)
- [x] `src/components/ThemeImporter.tsx` (shape-aware validation and import flow)

## Personality Complete Checklist
- [x] Typography chosen for heading, UI, and mono stacks
- [x] Surface language chosen (`gradient`, `tonal`, or `ornamented`)
- [x] Control language chosen (`default`, `filled`, or `outlined`)
- [x] Button and icon shape language chosen (`rounded`, `pill`, `square`, `circle`)
- [x] Theme family defaults define control and icon shapes
- [x] Runtime shape overrides persist and apply ahead of theme defaults
- [x] Accent hierarchy defined (`brand`, secondary, tertiary, highlight)
- [x] Motion profile chosen (`calm`, `standard`, or `energetic`)
- [x] Contrast checked for dark mode and light-mode overrides where available
- [x] Text-bearing surfaces grounded on semantic surface tokens
- [x] Selected and active states use shared readable tokens
- [x] High-visibility image/card/table selections use scrims or selected-surface tokens
- [x] Contrast audit added for built-in themes across both color schemes

## Button And Action Icon Coverage
- [x] Generate and queue controls
- [x] Model download and model/workflow browsing controls
- [x] Comfy workflow and wizard workflow controls
- [x] Image detail, history, and gallery action controls
- [x] Roleplay editor, sidebar, chat, and control actions
- [x] Theme selector, builder, importer, and preview controls
- [x] Utility prompts, diagnostics, install, and scheduling controls

## Legacy CSS Tokenization
- [x] `src/components/context-menu.css`
- [x] `src/components/floating-window.css`
- [x] `src/components/headless/headless-combobox.css`
- [x] `src/components/headless/headless-dialog.css`
