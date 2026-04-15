# Preset Library — Design Spec

## Overview

Extract the preset browser out of the Prompt Wizard modal and turn it into a standalone feature called the **Preset Library**. Presets become plain "include words" — a named bag of comma-joinable text strings — with no dependency on the tag library or the wizard's internal state. The Preset Library lives as its own trigger card next to the Prompt Wizard card in `PromptSection`, opens its own modal, maintains its own staging cart, and commits words directly to the Generate form's prompt textarea.

The current `Steps / Presets` segmented toggle inside the Prompt Wizard is removed. The wizard goes back to being a pure step-by-step tag builder.

This is **step 1** of a larger plan. The Preset Library is designed to scale — the curated roster of 172 presets is expected to grow, and the data model, store, and UI are structured to accommodate additions without schema churn.

---

## Guiding Principles

1. **Complete separation.** The Preset Library has zero runtime dependency on the Prompt Wizard, on `promptTags.json`, or on `promptWizardStore`. The only place they touch is a one-time migration of legacy user-created presets (section 5.2).
2. **Plain words, not tag IDs.** Presets store `words: string[]`. No references, no lookup tables at runtime.
3. **Staged cart with preview.** Applying a preset stages its words in a cart; the user can stack multiple presets, remove individual words, and commit the final list to the prompt via Append or Replace.
4. **Designed for growth.** Adding a new preset is a single JSON edit. Adding a new category is a one-line enum extension plus a label.

---

## Section 1 — Data Model

All new types live under `src/features/presetLibrary/`, fully separate from `src/features/promptWizard/`.

### Core entity

```typescript
// src/features/presetLibrary/types.ts

export type PresetCategory =
  | 'characters'
  | 'scenes'
  | 'styles'
  | 'perspectives'
  | 'explicit';

export const PRESET_CATEGORIES: PresetCategory[] = [
  'characters', 'scenes', 'styles', 'perspectives', 'explicit',
];

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  characters: 'Characters',
  scenes: 'Scenes',
  styles: 'Styles',
  perspectives: 'Perspectives',
  explicit: 'Explicit',
};

export interface LibraryPreset {
  id: string;                  // stable slug, e.g. "pl-characters-heroic-knight"
  name: string;                // "Heroic Knight"
  category: PresetCategory;
  words: string[];             // ["knight", "armor", "sword", "heroic", "shield"]
  description?: string;        // 1-line subtitle on the card
  thumbnail?: string;          // single emoji character
  isDefault: boolean;          // shipped vs user-created
  createdAt?: number;          // user-created only
  updatedAt?: number;          // user-created only
}
```

### Design rationale

- **`words: string[]`** is the whole point of "complete separation" — no tag IDs, no cross-feature coupling. The preset is a named bag of comma-joinable strings.
- **`category`** is a fixed enum. Five categories cover the current roster of 172 presets; extension is a one-line enum addition plus a label.
- **`isDefault`** distinguishes shipped-with-the-app presets from user-created ones. Defaults load from JSON at startup and are never written to localStorage. User presets are persisted via zustand `partialize`. The merged list the UI renders is `[...defaultPresets, ...userPresets]`.
- **`createdAt` / `updatedAt`** are optional and only set on user-created presets. They enable future sort-by-recent without schema churn.
- **No `stagedWords` / `stagedPresetIds` on the entity.** Staging lives in the store, not on the preset.

### Explicit handling

The old `PromptWizardBrowser` had a brittle ~20-entry hardcoded keyword list for detecting explicit presets. The new model replaces this with a single category check:

```typescript
export function isExplicitPreset(preset: LibraryPreset): boolean {
  return preset.category === 'explicit';
}
```

A preset is explicit iff its category is `explicit`. The "Show Explicit" UI toggle is a simple category filter.

### Scalability

- **More presets**: append entries to `presetLibrary.json`. No schema change.
- **More categories**: extend the `PresetCategory` union and add a label. The tab row auto-adapts.
- **More metadata**: optional fields (`tags?: string[]`, `author?: string`, `modelHint?: string`) can be added later — all optional, all backward-compatible.

---

## Section 2 — Store & Staging Semantics

A new dedicated Zustand store at `src/stores/presetLibraryStore.ts`. Zero dependencies on `promptWizardStore`.

### State shape

```typescript
interface PresetLibraryState {
  // === Persisted ===
  userPresets: LibraryPreset[];       // user-created only; defaults load from JSON
  activeCategory: PresetCategory;     // last-used tab (UX nicety)
  showExplicit: boolean;              // last "Show Explicit" toggle state

  // === Ephemeral (reset on modal close) ===
  stagedWords: string[];              // the cart — words queued to apply, in insertion order
                                      // values are the original human-cased strings (for display)
  stagedFromPresetIds: string[];      // which presets contributed to the cart (for card ✓ state)
  searchQuery: string;                // filters the card grid

  // === Actions: Staging cart ===
  stagePreset: (preset: LibraryPreset) => void;
  unstagePreset: (presetId: string) => void;
  unstageWord: (displayWord: string) => void;  // accepts the displayed (original-case) string
  clearStaged: () => void;            // called by commitStaged and explicit Clear button
  commitStaged: () => string;         // returns joined string, then calls clearStaged()

  // === Actions: Migration ===
  migrateFromWizardStore: () => Promise<void>;
                                      // flag-gated, idempotent, called once on first modal open
                                      // see Section 5.2

  // === Actions: CRUD for user presets ===
  addUserPreset: (preset: Omit<LibraryPreset, 'id' | 'isDefault' | 'createdAt' | 'updatedAt'>) => void;
                                      // ID generated as `pl-user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
                                      // Name collisions across default + user presets are ALLOWED
                                      // (uniqueness is by id, not name). No warning shown.
  updateUserPreset: (
    id: string,
    updates: Partial<Omit<LibraryPreset, 'id' | 'isDefault' | 'createdAt'>>,
  ) => void;
  removeUserPreset: (id: string) => void;

  // === Actions: UI state ===
  setActiveCategory: (category: PresetCategory) => void;
  setShowExplicit: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  resetEphemeral: () => void;          // clears stagedWords, stagedFromPresetIds, searchQuery
                                       // Called from modal onClose (both Cancel and the × button)
}
```

**Reset ownership**: `commitStaged` handles clearing the cart (`stagedWords`, `stagedFromPresetIds`, `wordContributors`, and `displayByKey` — all four private/public cart slices reset as one unit, since stale `displayByKey` entries would otherwise leak across commits). `resetEphemeral` handles clearing `searchQuery` plus the cart (same four slices). The modal's `onClose` always calls `resetEphemeral`; Append/Replace commit first, then close (which calls `resetEphemeral` — a no-op for the already-empty cart but still clears search).

### Reference-counted staging

The store internally maintains two private slices alongside `stagedWords` (neither is exposed via the public interface, neither is persisted):

```typescript
// private
wordContributors: Record<string /* normalized key */, string[] /* presetIds */>
displayByKey: Record<string /* normalized key */, string /* original-case display */>

// normalize is the single source of truth for key-space conversion
const normalize = (word: string): string => word.toLowerCase().trim();
```

Every public action that touches words funnels through `normalize` when computing keys:

- **`stagePreset(preset)`**: for each `word` in `preset.words`, compute `key = normalize(word)`. Push `preset.id` into `wordContributors[key]`. If `key` isn't already a tracked entry, append `word` (original case) to `stagedWords` and record `displayByKey[key] = word`. Duplicate words within the same preset dedupe naturally. Also push `preset.id` into `stagedFromPresetIds` if not already present.
- **`unstagePreset(presetId)`**: remove `presetId` from every contributor list. Any `key` whose contributor list is now empty has its display string removed from `stagedWords` and its entries cleared from both `wordContributors` and `displayByKey`. Remove `presetId` from `stagedFromPresetIds`.
- **`unstageWord(displayWord)`**: compute `key = normalize(displayWord)`, look up the display string via `displayByKey[key]` (for safety — callers should always pass the current display string from the cart), remove that display string from `stagedWords`, clear `wordContributors[key]` and `displayByKey[key]`. Any `presetId` that was the only remaining contributor via that key is dropped from `stagedFromPresetIds` if it no longer contributes to any cart word.

This lets stacking behave intuitively: if `Heroic Knight` and `Sword Master` both contribute `sword`, removing `Heroic Knight` leaves `sword` in the cart because `Sword Master` still contributes it.

### Dedup rule

Case-insensitive on `.trim()`. `"Knight"`, `"knight"`, and `"knight "` all collapse to one normalized key. The first-inserted casing wins in `stagedWords` (the cart always displays the original human text). Chip click handlers pass the display string back to `unstageWord`, which re-normalizes internally.

### Persistence via `partialize`

Persisted fields (localStorage key `swarmui:presetLibrary:v1`):

```typescript
{
  userPresets,
  activeCategory,
  showExplicit,
}
```

Everything else is ephemeral. `resetEphemeral()` is called from the modal's `onClose` handler.

Version key `v1` lets us break the schema cleanly later without a silent corrupt-state restore.

### Commit flow

1. User clicks a preset card → `stagePreset(preset)` → cart updates → preview strip animates the new words in.
2. User clicks another preset → stacks.
3. User clicks a staged word's × → `unstageWord(word)`.
4. User clicks **Append to Prompt** or **Replace Prompt** → modal calls `commitStaged()` → receives the joined string → passes it to the component's `onApplyToPrompt(text, mode)` callback → `PromptSection` writes it to the form via `prependPromptText` or direct replacement → modal closes → `resetEphemeral()` runs via the close handler.

The store knows nothing about the Generate form, the prompt textarea, or Mantine. The boundary is clean.

### Testing

`presetLibraryStore.test.ts` covers:

- `stagePreset` — cart contains expected words, no duplicates
- `stagePreset` with 0 words (corrupt entry / user-created empty preset) — no-op, no crash
- Stacking two presets with overlapping words — each word listed once, contributor map tracks both
- `unstagePreset` of one of two overlapping presets — shared words remain
- `unstageWord` — single word removed even when multiple contributors contributed it; preset removed from `stagedFromPresetIds` only when it has no remaining cart contributions
- `unstageWord` with mixed case — `"Knight"` in the cart can be removed via `unstageWord("knight")` (normalize is the single key source)
- `commitStaged` — returns joined string and empties the cart
- Persistence — only `userPresets`, `activeCategory`, `showExplicit` survive reload
- Migration (integration) — seed `localStorage['swarmui-prompt-wizard-v1']` with a fixture containing `userBrowserPresets`, seed `promptTags.json` via Vitest's module mock, call `migrateFromWizardStore()`, assert: migrated entries appear in `userPresets`, the old field is stripped from the wizard-store JSON, `localStorage.getItem('swarmui:presetLibrary:migratedFromWizard:v1')` is strictly `=== 'done'` (not just truthy — this catches a regression where a future refactor accidentally stores a boolean or an object), second call is a no-op

---

## Section 3 — UI Architecture & Layout

Applies the UI/UX design framework: consistent tokens, clear hierarchy, all interactive states defined, WCAG 2.1 AA accessible by default. All components reuse existing Swarm primitives (`SwarmButton`, `SwarmBadge`, `ElevatedCard`, `SwarmActionIcon`) so spacing / typography / color inherit the project's design system.

### 3.1 Trigger card in PromptSection

A sibling to the existing Prompt Wizard card — same visual weight, same size.

```
┌─────────────────────────────────────────────────────────────┐
│ 🪄  Prompt Wizard                              [Ready]    > │   existing
│     Build prompts step by step                              │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 📚  Preset Library                            [172]       > │   NEW
│     Quick-inject curated word clusters                      │
└─────────────────────────────────────────────────────────────┘
```

- **Icon**: `IconBooks` or `IconLibrary` from Tabler — distinct from the wizard's `IconSparkles`. Decorative only; the Tabler icon renders as SVG with `aria-hidden` by default.
- **Badge**: shows the total preset count (defaults + user), **always including explicit entries regardless of the `showExplicit` toggle** — the toggle is a visibility filter inside the modal, not a subset definition, and the count is a property of the underlying data. Neutral `SwarmBadge tone="secondary"`. Flips to `tone="primary"` when `stagedWords.length > 0` and shows e.g. `3 staged`.
- **Typography**: identical to the wizard card (`Text fw={600} size="sm"` title, `size="xs" c="dimmed"` subtitle).
- **States**: default / hover / focus-visible / pressed — all come from `ElevatedCard interactive`.
- **Compact variant**: honors the same `compact` prop the wizard card accepts.
- **Accessibility**: trigger card is a semantic `<button>` with `aria-label="Open Preset Library"`; emoji in the ASCII mockup above is purely illustrative for this doc, not rendered in the real UI (the Tabler icon replaces it).

### 3.2 Modal shell

Separate modal from the wizard's. Smaller footprint — no step rail, no profile selector, no tag library search.

- **Default size**: 1100 × 820
- **Minimum**: 780 × 600
- **Resizable**: via the same `useResizablePanel` pattern the wizard uses

```
╔═════════════════════════════════════════════════════════════════╗
║  📚 Preset Library                                           ✕  ║  Header
║  ─────────────────────────────────────────────────────────────  ║
║  [Characters] [Scenes] [Styles] [Perspectives] [Explicit]       ║  Category tabs
║  ─────────────────────────────────────────────────────────────  ║
║  🔍 Search presets…                    [Show Explicit ⬤ ] [+]  ║  Filter row
║  ─────────────────────────────────────────────────────────────  ║
║  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   ║
║  │  👑  │ │  🧝  │ │  🐺  │ │  🐉  │ │  ⚔️  │                   ║
║  │Heroic│ │Slim  │ │Anthro│ │Fierce│ │Heroic│                   ║  Card grid
║  │Knight│ │Elf   │ │Wolf  │ │Dragon│ │Knight│                   ║
║  │5 wds │ │5 wds │ │5 wds │ │5 wds │ │5 wds │                   ║
║  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                   ║
║  …                                                              ║
║  ─────────────────────────────────────────────────────────────  ║
║  Staged (3):  [knight ×] [armor ×] [sword ×]      [Clear]       ║  Staging strip
║  ─────────────────────────────────────────────────────────────  ║
║  [Cancel]                         [Append to Prompt] [Replace]  ║  Footer
╚═════════════════════════════════════════════════════════════════╝
```

Three fixed regions: **header (tabs + filters)**, **scrollable card grid (flex: 1)**, **sticky footer (staging strip + action bar)**. The staging strip is always visible when `stagedWords.length > 0`; it collapses to zero height when empty.

**Header emoji in the ASCII art**: the `📚` characters in both the trigger card and modal header diagrams are illustrative for this design doc only. In the real UI, both renders use the Tabler `IconBooks` SVG (which carries no accessible name by default — the adjacent text `"Preset Library"` provides the accessible name).

### 3.3 Preset card

The primary interactive unit. All states are defined; none are "good enough for now."

| State | Visual |
|---|---|
| **Default** | `bg-surface`, 1px `border-default`, radius 12px, emoji 32px, title `text-primary`, word count `text-secondary` |
| **Hover** | Background lifts to `bg-elevated`, border becomes `border-focus` @ 40% opacity, cursor pointer |
| **Focus-visible** | 2px solid `border-focus` outline, offset 2px |
| **Staged** (preset.id in `stagedFromPresetIds`) | 1.5px `accent-primary` ring, small ✓ badge top-right, background = subtle `accent-primary/8%` wash |
| **Pressed** | 1px inset `accent-primary`, `transform: scale(0.98)` |

Cards are never disabled — they always toggle staging on click.

**Card anatomy** (vertical stack, 12px padding, 8px gap):

1. Top row: emoji thumbnail (32px, left) + word-count badge (`SwarmBadge emphasis="ghost"`, right)
2. Title: `Text fw={600} size="sm"`, truncated to 2 lines
3. Description: `Text size="xs" c="dimmed"`, truncated to 1 line (hidden if empty)
4. Bottom row (user-created only): edit and delete `SwarmActionIcon`s, visible on hover or keyboard focus, 32×32px touch targets

**Click behavior**: clicking anywhere on the card (except edit/delete icons) toggles the preset in the staging cart. Stage if not staged, unstage if already staged.

**Keyboard**: each card is a semantic `<button>`, focusable in visual grid order, `Enter` / `Space` toggles staging.

**Accessibility**: `aria-pressed={isStaged}` so screen readers announce state. Emoji has `aria-hidden="true"`; the name carries the meaning.

### 3.4 Responsive grid

| Modal width | Columns |
|---|---|
| < 700px | 2 |
| 700–1000px | 3 |
| 1000–1300px | 4 |
| ≥ 1300px | 5 |

Mantine `SimpleGrid` with fixed `cols` breakpoints. Spacing `sm` (8px gap).

### 3.5 Category tabs

Mantine `Tabs variant="outline"` as the existing browser used. All five tabs show; the `Explicit` tab is hidden when `showExplicit === false`.

**Explicit-hidden fallback rule** (applied at every entry point that could leave `activeCategory === 'explicit'` while `showExplicit === false`):

1. **Modal open** — in `PresetLibrary.tsx` `handleOpen`, if `activeCategory === 'explicit' && !showExplicit`, immediately dispatch `setActiveCategory('characters')` before rendering the tab row.
2. **Show-Explicit toggle** — when the user flips the switch to off, if the current active category is `'explicit'`, dispatch `setActiveCategory('characters')` in the same action.
3. **Store hydration** — guarded by the rule above because `handleOpen` runs after hydration.

The fallback always targets `'characters'` (the first category). This is deterministic and matches the existing wizard-browser behavior.

**Tab order**: Characters → Scenes → Styles → Perspectives → Explicit (same order as `PRESET_CATEGORIES`).

### 3.6 Filter row

Three controls in a row with `Group justify="space-between"`:

1. **Search input** — `TextInput` with `IconSearch`, placeholder `"Search presets…"`, debounced 150ms before writing to the store. Max-width 320px, flex 1 below that. Filters on `name` and `description` case-insensitive substring.
2. **Show Explicit toggle** — Mantine `Switch` with `IconEye` / `IconEyeOff` in the label.
3. **Create Preset button** — `SwarmButton tone="primary" emphasis="soft"` with `IconPlus`, opens the creator overlay.

**Keyboard accelerators**: `/` focuses search; `Esc` clears search when it has focus; `Esc` closes the modal otherwise.

### 3.7 Staging strip

A sticky row between the grid and the footer, visible only when `stagedWords.length > 0`.

```
Staged (3):  [knight ×] [armor ×] [sword ×]      [Clear]
```

- **Label**: `Text size="xs" c="dimmed" fw={600}` on the left.
- **Chips**: `SwarmBadge` with `tone="primary" emphasis="soft"`, 28px tall. Each chip is a `<button>` with `aria-label="Remove {word}"`; the × hit target is padded to 32×32px. Click calls `unstageWord`.
- **Clear button**: `SwarmButton emphasis="ghost" size="compact-xs"`, right-aligned. No confirmation — the action is reversible (re-click the presets).
- **Overflow**: strip wraps vertically up to 96px, then becomes internally scrollable with a 2px bottom gradient hint.

**Animation**: slide down from 0 to natural height (200ms ease-out) the first time a word stages. Subsequent additions animate only the new chip (fade + 4px slide-in).

### 3.8 Footer action bar

Sticky bottom row, 1px top border, 12px vertical padding.

**Left**: `Cancel` button (`SwarmButton tone="secondary" emphasis="ghost"`) — closes the modal and runs `resetEphemeral()`.

**Right**:

- **Append to Prompt** — `SwarmButton tone="primary" emphasis="soft"` — default action, non-destructive. Commits `stagedWords`, calls `onApplyToPrompt(joined, 'append')`.
- **Replace Prompt** — `SwarmButton tone="primary" emphasis="solid"` with a warning tooltip ("This will overwrite your current prompt"). Commits via `onApplyToPrompt(joined, 'replace')`.

Both are disabled when `stagedWords.length === 0`, with tooltip `"Stage at least one preset first."`

On click → `commitStaged()` → close modal → `resetEphemeral()` → Mantine notification (`"Added N words to prompt"`).

### 3.9 Create / edit preset overlay

Replaces the card grid area when open (not a nested modal). Cancel returns to the grid.

**Fields:**

1. **Name** (required) — `TextInput`, 60-char max, validated on save (non-empty after trim).
2. **Description** (optional) — `TextInput`, 120-char max.
3. **Category** — `Select` with the five categories, defaults to the currently active tab.
4. **Thumbnail emoji** (optional) — `TextInput` capped at 2 characters, placeholder `"🐉"`.
5. **Words** — the meat:
   - **Free-text textarea** — multi-line. Parsing: split on commas or newlines, `.trim()` each piece, drop empty strings. The parsed list is shown below the textarea as live-preview chips, each with an × to remove (which also edits the textarea text accordingly).
   - **"Pull from current prompt" button** — above the textarea. Reads the current prompt text (passed in via prop from `PromptSection`), runs it through `stripManagedBlocks` (imported from `src/features/promptBuilder`) to drop any wizard-managed block, then applies the same parsing rule as the textarea (comma/newline split + trim + drop empties). Weighted syntax like `(knight:1.2)` and LoRA refs like `<lora:foo:0.8>` pass through as literal words — the user can remove them via the preview chips if they don't want them. If the textarea already has non-empty contents, shows a confirmation dialog ("Replace current words?") before overwriting.
6. **Save / Cancel** — right-aligned button pair. Save is disabled until name is non-empty after trim AND at least 1 word parses from the textarea.

**Edit mode**: when a preset is opened for editing, all fields prefill from the existing entry.

### 3.10 Empty states

| Situation | Message | CTA |
|---|---|---|
| Search active, no matches | `"No presets match '{query}'"` | Clear search |
| Category empty (only possible in future user-only categories) | `"No presets in {category} yet"` | Create your first {category} preset |
| Nothing staged (placeholder in strip area, 40% opacity) | `"Click a preset above to start staging words"` | — |

### 3.11 Tokens & visual consistency

| Role | Token |
|---|---|
| Modal background | `var(--elevation-table)` |
| Card background (default) | `var(--elevation-raised)` |
| Card background (hover) | `var(--elevation-elevated)` |
| Card background (staged) | `color-mix(in srgb, var(--accent-primary) 8%, var(--elevation-raised))` |
| Border default | `var(--mantine-color-default-border)` |
| Border focus | `var(--accent-primary)` |
| Radius — cards | 12px |
| Radius — chips | 9999px |
| Spacing scale | 4 / 8 / 12 / 16 / 24 (Mantine defaults) |

No one-off values. If a color or spacing isn't already in the token system, we stop and define it.

### 3.12 Accessibility (WCAG 2.1 AA)

- Every interactive element has a visible, keyboard-focusable state with high-contrast outline.
- Touch targets ≥ 44×44px; cursor targets ≥ 32×32px (chips get padded × hit areas).
- Form inputs use real `<label>` elements (never placeholder-as-label).
- Preset cards are semantic `<button>`s with `aria-pressed` for staged state.
- Search input has a visible Clear action once text is entered.
- Color is never the only state signal — staged cards show both ring and ✓ badge; explicit toggle pairs icon + text.
- Tab order follows visual reading order: header → tabs → search → show-explicit → create → cards (row-major) → staging chips → footer buttons.
- `Esc` closes the modal; focus returns to the trigger card on close.
- Status messages flow through Mantine `notifications` (`aria-live="polite"`).

### 3.13 Anti-patterns explicitly avoided

| Anti-pattern | Mitigation |
|---|---|
| Icon-only buttons without aria-label | Every `SwarmActionIcon` has `aria-label` |
| Placeholder-as-label | All inputs use Mantine `label` prop |
| Color-only state | Staged cards = ring + ✓ badge |
| Destructive action without confirmation | User-preset delete shows confirmation; Replace Prompt shows warning tooltip |
| Disabled button with no explanation | Apply buttons show tooltip when disabled |
| Hover-only affordances | Edit/delete icons have keyboard-focus fallback |
| Full-page spinner | Initial JSON load uses skeleton cards |

---

## Section 4 — File Structure

### New files

| File | Purpose |
|---|---|
| `src/features/presetLibrary/types.ts` | `LibraryPreset`, `PresetCategory`, `PRESET_CATEGORIES`, `PRESET_CATEGORY_LABELS`, `isExplicitPreset` |
| `src/features/presetLibrary/staging.ts` | Pure helpers — `normalizeWord`, `dedupeWords`, `parseWordsFromText`, reference-count logic (separated from the store for testability) |
| `src/features/presetLibrary/staging.test.ts` | Unit tests for the helpers |
| `src/stores/presetLibraryStore.ts` | Zustand store with CRUD + staging actions, partialize allowlist, one-time migration |
| `src/stores/presetLibraryStore.test.ts` | Store unit tests |
| `src/data/presetLibrary.json` | 172 default presets with `words: string[]`, generated once from the legacy file |
| `src/components/presetLibrary/PresetLibrary.tsx` | Top-level: trigger card + modal shell + state wiring |
| `src/components/presetLibrary/PresetLibraryHeader.tsx` | Title, category tabs, filter row |
| `src/components/presetLibrary/PresetLibraryGrid.tsx` | Responsive card grid with filter application + empty states |
| `src/components/presetLibrary/PresetCard.tsx` | Individual preset card with all states |
| `src/components/presetLibrary/PresetStagingStrip.tsx` | Sticky staging cart |
| `src/components/presetLibrary/PresetLibraryFooter.tsx` | Action bar |
| `src/components/presetLibrary/PresetCreator.tsx` | Inline create/edit form |
| `src/components/presetLibrary/presetLibrary.css` | Component-scoped styles |
| `scripts/convert-preset-library.mjs` | One-shot Node script: reads legacy `promptBrowserPresets.json` + `promptTags.json`, writes `presetLibrary.json` |

### Modified files

| File | Change |
|---|---|
| `src/pages/GeneratePage/components/ParameterPanel/PromptSection.tsx` | Add `<PresetLibrary>` sibling below `<PromptWizard>`, passing `onApplyToPrompt` + `currentPromptText={form.values.prompt}` |
| `src/components/PromptWizard.tsx` | Remove the `activeView === 'presets'` branch, browser preset loader, and all destructured browser-preset fields from the store |
| `src/components/PromptWizardHeader.tsx` | Remove `activeView` / `onViewChange` props and the Steps/Presets segmented control |
| `src/stores/promptWizardStore.ts` | Remove browser-preset state fields and actions; update `partialize` allowlist |
| `src/features/promptWizard/types.ts` | Remove `BrowserPreset`, `PresetCategory`, `PRESET_CATEGORIES`, `PRESET_CATEGORY_LABELS` exports (moved to `presetLibrary/types.ts`) |

### Deleted files

| File | Reason |
|---|---|
| `src/components/PromptWizardBrowser.tsx` | Replaced by `PresetLibraryGrid` + `PresetLibraryHeader` |
| `src/components/PromptWizardPresetCard.tsx` | Replaced by `PresetCard` (new state model) |
| `src/components/PromptWizardPresetCreator.tsx` | Replaced by `PresetCreator` (free-text + pull-from-prompt) |
| `src/data/promptBrowserPresets.json` | Replaced by `presetLibrary.json`; deleted after new file is verified |

### Untouched files

| File | Why |
|---|---|
| `src/data/promptTags.json` | Still used by Prompt Wizard steps — unchanged |
| `src/data/promptQuickPresets.json` | Step-level wizard sidebar presets — unrelated |
| `src/components/PromptWizardSidebar.tsx` | Wizard library drawer — unrelated |
| `src/components/PromptWizardSteps.tsx`, `PromptWizardStepContent.tsx`, `PromptWizardPreview.tsx` | Wizard internals, unchanged |
| `src/features/promptWizard/steps.ts`, `profiles.ts`, `assemble.ts`, etc. | Only `types.ts` is touched |
| `src/stores/promptBuilderStore.ts` | Separate store, unrelated |

### Test coverage targets

- `staging.test.ts` — dedup, parse, reference-count helpers
- `presetLibraryStore.test.ts` — stage / unstage / stacking / commit / persistence / migration
- Manual QA per the checklist in section 5.5

---

## Section 5 — Migration & Wizard Cleanup

Two migrations and a wizard cleanup. Default-preset migration happens **once on my machine** (build script). User-preset migration happens **once per user** (runtime, first store init). Wizard cleanup is a straight deletion.

### 5.1 Default-preset migration — `scripts/convert-preset-library.mjs`

One-shot Node script. Runs locally during implementation, outputs `src/data/presetLibrary.json`, and the result is committed. No runtime cost, no bundle impact.

**Working directory**: the script uses paths relative to `swarmui-react/` (the project root). Run from that directory: `cd swarmui-react && node scripts/convert-preset-library.mjs`.

**Algorithm:**

```js
import { readFileSync, writeFileSync } from 'fs';

const oldPresets = JSON.parse(readFileSync('src/data/promptBrowserPresets.json', 'utf-8'));
const tagLibrary = JSON.parse(readFileSync('src/data/promptTags.json', 'utf-8'));

const tagById = new Map(tagLibrary.map(t => [t.id, t]));
const missing = [];
const suspicious = [];

const newPresets = oldPresets.map(p => {
  const words = p.tagIds
    .map(id => {
      const tag = tagById.get(id);
      if (!tag) { missing.push({ preset: p.id, missingTag: id }); return null; }
      // Sanity check: flag tag.text values that contain weight syntax or LoRA refs
      // so a human can decide whether to pass them through literally.
      if (/[()<>]|:\d/.test(tag.text)) {
        suspicious.push({ preset: p.id, tag: tag.id, text: tag.text });
      }
      return tag.text;
    })
    .filter(Boolean);

  return {
    id: p.id.replace(/^bp-/, 'pl-'),
    name: p.name,
    category: p.category,
    words,
    description: p.description,
    thumbnail: p.thumbnail,
    isDefault: true,
  };
});

if (missing.length > 0) {
  console.warn(`⚠ ${missing.length} tag IDs could not be resolved:`);
  missing.slice(0, 20).forEach(m => console.warn(`  ${m.preset} → ${m.missingTag}`));
  if (missing.length > 20) console.warn(`  …and ${missing.length - 20} more`);
}

if (suspicious.length > 0) {
  console.warn(`⚠ ${suspicious.length} tag.text values contain weight/LoRA syntax (review manually):`);
  suspicious.slice(0, 10).forEach(s => console.warn(`  ${s.preset} → ${s.tag}: "${s.text}"`));
}

const validPresets = newPresets.filter(p => p.words.length > 0);
const skipped = newPresets.length - validPresets.length;
if (skipped > 0) console.warn(`⚠ Skipped ${skipped} presets with zero resolved words`);

writeFileSync('src/data/presetLibrary.json', JSON.stringify(validPresets, null, 2));
console.log(`✓ Wrote ${validPresets.length} presets to src/data/presetLibrary.json`);
```

**Run command**: `cd swarmui-react && node scripts/convert-preset-library.mjs`. Not added to `package.json` — it's a one-off.

**Manual review after running**: eyeball-spot-check 5–10 converted entries in `presetLibrary.json`; skim the missing-tags warning list for anything suspicious; inspect any entries flagged by the weight/LoRA sanity check. The old `promptBrowserPresets.json` file is deleted in Commit 2 after verification.

### 5.2 User-preset runtime migration

Existing users have `userBrowserPresets` in localStorage under the wizard store's key `'swarmui-prompt-wizard-v1'` (verified against `src/stores/promptWizardStore.ts:416`). Those entries have `tagIds`, not `words`. We migrate them once, on first open of the Preset Library modal.

**Why deferred to first modal open (not store construction)**: the migration needs `promptTags.json` for the tag-id → word lookup, which is a ~MB JSON file we do not want bundled into the store's import graph. Using a dynamic `import()` matches the existing wizard's pattern in `PromptWizard.tsx:54` and keeps `promptTags.json` out of the preset library entry chunk unless migration actually runs. The flag check below is synchronous and cheap; the dynamic import only executes when legacy data is actually present.

**Migration flag**: `swarmui:presetLibrary:migratedFromWizard:v1` (localStorage string marker — the value is literally the string `'done'`, not a JSON boolean). Once the stored value equals `'done'`, migration is never re-invoked. Any other value (including `null`, `undefined`, `'true'`, or an old flag from a botched run) is treated as "not yet migrated" and the action proceeds.

**Wizard store key**: `swarmui-prompt-wizard-v1` (do not change — matches the existing persist config).

**Note**: the existing wizard store has its own unrelated `migrationVersion` field that handles internal wizard schema migrations (see `promptWizardStore.ts:117,365,430`). The preset library migration is a separate one-off flag and the two systems do not interact.

**Location**: an action on the new store, called exactly once from `PresetLibrary.tsx` during first modal open (not on every open — the action is idempotent and flag-gated, but we also guard the caller with an in-flight ref to avoid double-dispatch during React strict-mode double-mount).

```typescript
// src/stores/presetLibraryStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LibraryPreset, PresetCategory } from '../features/presetLibrary/types';

const MIGRATION_FLAG_KEY = 'swarmui:presetLibrary:migratedFromWizard:v1';
const WIZARD_STORE_KEY = 'swarmui-prompt-wizard-v1';

// ... state shape from section 2 above ...

export const usePresetLibraryStore = create<PresetLibraryState>()(
  persist(
    (set, get) => ({
      userPresets: [],
      activeCategory: 'characters',
      showExplicit: false,
      stagedWords: [],
      stagedFromPresetIds: [],
      searchQuery: '',
      // ... other initial values ...

      migrateFromWizardStore: async () => {
        // Flag-gated: short-circuit for the 99% path.
        if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'done') return;

        try {
          const raw = localStorage.getItem(WIZARD_STORE_KEY);
          if (!raw) {
            localStorage.setItem(MIGRATION_FLAG_KEY, 'done');
            return;
          }

          const parsed = JSON.parse(raw);
          const oldUserPresets: Array<{
            id: string; name: string; category: PresetCategory;
            tagIds: string[]; description?: string; thumbnail?: string;
          }> = parsed?.state?.userBrowserPresets ?? [];

          if (oldUserPresets.length === 0) {
            localStorage.setItem(MIGRATION_FLAG_KEY, 'done');
            return;
          }

          // Dynamic import — the ONLY place the preset library touches promptTags.json.
          // After this runs once (and the flag flips), the tag library is never loaded again.
          const tagModule = await import('../data/promptTags.json');
          const tagJson = tagModule.default as Array<{ id: string; text: string }>;
          const tagById = new Map(tagJson.map(t => [t.id, t.text]));

          const migrated: LibraryPreset[] = oldUserPresets
            .map(p => ({
              id: p.id,
              name: p.name,
              category: p.category,
              words: p.tagIds.map(id => tagById.get(id)).filter((w): w is string => !!w),
              description: p.description,
              thumbnail: p.thumbnail,
              isDefault: false as const,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }))
            .filter(p => p.words.length > 0);

          // Strip the migrated field from the wizard store's persisted state
          // so it doesn't rehydrate on next load.
          if (parsed?.state?.userBrowserPresets) {
            delete parsed.state.userBrowserPresets;
            localStorage.setItem(WIZARD_STORE_KEY, JSON.stringify(parsed));
          }

          // Merge with any user presets that already exist in the new store
          // (shouldn't happen on first migration, but safe).
          set((state) => ({
            userPresets: [...state.userPresets, ...migrated],
          }));

          localStorage.setItem(MIGRATION_FLAG_KEY, 'done');

          if (migrated.length > 0) {
            console.info(`[presetLibrary] Migrated ${migrated.length} user presets from wizard store`);
          }
        } catch (err) {
          console.warn('[presetLibrary] Migration failed, starting with empty user presets:', err);
          localStorage.setItem(MIGRATION_FLAG_KEY, 'done'); // never retry a broken migration
        }
      },

      // ... other actions ...
    }),
    {
      name: 'swarmui:presetLibrary:v1',
      partialize: (state) => ({
        userPresets: state.userPresets,
        activeCategory: state.activeCategory,
        showExplicit: state.showExplicit,
      }),
      // No custom merge needed: since migration is deferred and runs AFTER hydration,
      // zustand's default merge hydrates persisted state first, then the migration
      // action (called on modal open) appends migrated entries via set(). Ordering is
      // deterministic because modal-open is always after hydration.
    },
  ),
);
```

**Caller wiring** (`src/components/presetLibrary/PresetLibrary.tsx`):

```typescript
const hasRunMigration = useRef(false);

const handleOpen = useCallback(() => {
  open();
  if (!hasRunMigration.current) {
    hasRunMigration.current = true;
    migrateFromWizardStore(); // fire-and-forget; the action handles its own errors
  }
  // ... rest of open logic ...
}, [open, migrateFromWizardStore]);
```

The `useRef` guards against React strict-mode double-mount in development; the flag in localStorage guards against subsequent cold-start re-runs.

**Failure handling**: any JSON-parse or lookup failure logs a warning, marks the flag `'done'` (don't retry a broken migration), and leaves `userPresets` as whatever it already was. No blocking UI.

**Edge cases**:
- **User never opened the old wizard preset view** — `userBrowserPresets` is absent or empty; action sets flag to `'done'` and returns with no state change.
- **User has both legacy wizard presets and already-created new-store presets** — shouldn't happen in production (the new store doesn't exist until this feature ships), but the `set` is a concat, so both coexist without ID collision (legacy IDs are `browser-preset-...`, new IDs are `pl-user-...`).
- **First open without internet / JSON fetch fails** — dynamic import is served from the bundle, not the network, so this is not a real failure mode in Vite's dev or production build. If the JSON chunk somehow fails to load, the catch block handles it gracefully.

### 5.3 Wizard cleanup — removals

**`src/stores/promptWizardStore.ts`** — delete state fields:

```typescript
userBrowserPresets: BrowserPreset[];
activeView: 'steps' | 'presets';
activePresetCategory: PresetCategory;
presetSearchQuery: string;
showExplicitPresets: boolean;
```

And actions:

```typescript
setActiveView, setActivePresetCategory, setPresetSearchQuery,
setShowExplicitPresets, resetPresetBrowserEphemeral,
applyBrowserPreset, addBrowserPreset, updateBrowserPreset, removeBrowserPreset
```

Update `partialize` to remove `userBrowserPresets`, `activePresetCategory`, `showExplicitPresets`.

**`src/components/PromptWizard.tsx`**:

- Remove the entire `activeView === 'presets'` branch (currently lines ~702–744), including `<PromptWizardBrowser>`, the presets-view footer, and the `Switch to Steps` button.
- Remove `loadDefaultBrowserPresets` and its `defaultBrowserPresetsPromise` cache.
- Remove `defaultBrowserPresets` state and setter.
- Remove the browser presets entry from `Promise.all([...])` in the loader.
- Remove `resetPresetBrowserEphemeral()` call from `handleClose`.
- Remove all destructured browser-preset fields from the `usePromptWizardStore()` call.
- Unwrap the `activeView === 'steps' ? …` conditional — the wizard always renders the steps body.

**`src/components/PromptWizardHeader.tsx`**:

- Remove `activeView` and `onViewChange` from the props interface.
- Remove the Steps/Presets segmented control render. The header's left cluster goes back to profile selector + library button.

**`src/features/promptWizard/types.ts`**:

- Remove `PresetCategory`, `PRESET_CATEGORIES`, `PRESET_CATEGORY_LABELS`, `BrowserPreset`. Any remaining wizard code that imported them will fail TypeScript — that's the point; fix each import at implementation time.

**Delete ordering within Commit 2** (strict — each step must keep TypeScript green):

1. Delete the three deleted components as an atomic set — they reference each other, so removing them together avoids dangling imports: `PromptWizardBrowser.tsx`, `PromptWizardPresetCard.tsx`, `PromptWizardPresetCreator.tsx`.
2. Clean `promptWizardStore.ts` (remove fields, actions, partialize entries).
3. Clean `PromptWizardHeader.tsx` (remove props, segmented control).
4. Clean `PromptWizard.tsx` — remove the `activeView === 'presets'` branch, remove the `loadDefaultBrowserPresets` function and its `defaultBrowserPresetsPromise` cache, remove `defaultBrowserPresets` state + setter, remove the browser-presets entry from the loader `Promise.all([...])`, remove the `resetPresetBrowserEphemeral()` call from `handleClose`, and remove every destructured browser-preset field from the `usePromptWizardStore()` call. Unwrap the `activeView === 'steps' ? …` conditional.
5. Remove the exports from `promptWizard/types.ts`.
6. Delete `promptBrowserPresets.json`.

Doing it in this order ensures no intermediate state has a dead import or a store destructure referencing a deleted field.

### 5.4 Implementation order

All of this lands in a **single PR**, structured as two commits for reviewability:

**Commit 1 — "feat(preset-library): add standalone Preset Library feature":**
1. Create `src/features/presetLibrary/` (types + staging helpers + helper tests).
2. Create `src/stores/presetLibraryStore.ts` (store + migration action + store tests).
3. Run `node scripts/convert-preset-library.mjs` from the `swarmui-react/` root; commit `src/data/presetLibrary.json`.
4. Create all `src/components/presetLibrary/*.tsx` components and the CSS.
5. Wire `<PresetLibrary>` into `PromptSection` as the sibling card.
6. Verify runtime migration locally against a fixture wizard-store (save a copy of real localStorage and replay it).

**Commit 2 — "refactor(prompt-wizard): remove browser preset toggle and legacy presets"** (strict delete-ordering matters — TypeScript must stay green after each step):
1. Delete `src/components/PromptWizardBrowser.tsx`, `PromptWizardPresetCard.tsx`, `PromptWizardPresetCreator.tsx` (the three form an atomic set; removing them together avoids dangling imports).
2. Remove browser-preset fields, actions, and `partialize` entries from `src/stores/promptWizardStore.ts`.
3. Remove `activeView` / `onViewChange` props and the segmented control from `src/components/PromptWizardHeader.tsx`.
4. Remove the `activeView === 'presets'` branch, the `loadDefaultBrowserPresets` loader, and all destructured browser-preset fields from `src/components/PromptWizard.tsx`.
5. Remove `PresetCategory`, `PRESET_CATEGORIES`, `PRESET_CATEGORY_LABELS`, `BrowserPreset` exports from `src/features/promptWizard/types.ts` (any remaining importer will break TypeScript — that's the desired tripwire).
6. Delete `src/data/promptBrowserPresets.json`.
7. Run `tsc --noEmit` and `rg "promptBrowserPresets|BrowserPreset"` — both must return clean.

The two-commit structure keeps the "add" and "remove" diffs separately reviewable while shipping them together — a reviewer can jump between commits without having to mentally subtract the cleanup from the feature.

**Note on duplicate `PresetCategory` type during the overlap**: between the first and last step of Commit 2, both `src/features/presetLibrary/types.ts` and `src/features/promptWizard/types.ts` export identical `PresetCategory` / `PRESET_CATEGORIES` / `PRESET_CATEGORY_LABELS` names. This is intentional and safe — the two files are different module paths, so TypeScript treats them as distinct symbols, and the migration code in `presetLibraryStore.ts` imports from `../features/presetLibrary/types` only. The wizard store's legacy `BrowserPreset` reference lives alongside for one commit until Commit 2 removes it.

### 5.5 Risk review

| Risk | Mitigation |
|---|---|
| Migration loses user presets if tag lookup fails | Conversion script and runtime migration both log missing entries; presets with zero resolved words are skipped, not silently emptied |
| `userBrowserPresets` exists but user hasn't opened new feature yet | Migration action runs on first modal open; flag survives across sessions so it only runs once |
| Stale migration flag from a botched attempt | Flag is versioned (`v1`); bump to `v2` to re-run — no in-place recovery attempted because a half-broken migration is more dangerous than starting empty |
| Someone re-adds `BrowserPreset` to wizard types by mistake | Commit 2 deletes it; if a reviewer later restores it, TypeScript catches drift because nothing in the new code imports from `promptWizard/types` anymore |
| Old `promptBrowserPresets.json` left behind | Commit 2 step 6 explicitly deletes it; step 7 verifies `rg "promptBrowserPresets"` returns nothing |
| Dynamic import of `promptTags.json` fails on first migration | Caught by the try/catch in `migrateFromWizardStore`; flag flips to `'done'` and the user sees an empty Library on first open (their legacy presets are still safe in wizard-store localStorage, just not accessible until manual re-migration) |
| Strict-mode double-mount triggers migration twice | `useRef` guard in `PresetLibrary.tsx` + localStorage flag make the action double-idempotent |

### 5.6 Manual QA checklist

- [ ] Fresh user (no localStorage) — trigger card shows, modal opens, 172 defaults render, staging works, Append/Replace writes to prompt textarea
- [ ] Returning user with legacy `userBrowserPresets` — custom presets appear in the new Library on first open, don't double-migrate on reload
- [ ] Legacy user with empty `userBrowserPresets` — no migration errors, flag flips to `'done'`
- [ ] Wizard modal still works — no browser toggle, no broken imports, step-by-step building works end-to-end
- [ ] Keyboard flow — `Tab` order follows reading order; `/` focuses search; `Esc` closes
- [ ] Screen reader — card staged state announces correctly; empty states are read
- [ ] Narrow viewport (< 700px) — grid becomes 2 columns, modal stays usable
- [ ] Dark mode — all tokens resolve correctly, no one-off colors

---

## Open questions

None at spec time. All design decisions are locked:

- Direction: complete separation from the wizard (store, data, UI)
- Entry point: sibling trigger card in `PromptSection`
- Interaction: staged cart with preview (option 2 from brainstorming)
- Preset creation: free-text textarea + "Pull from current prompt" button (options 2 + 3)
- Data shape: plain `words: string[]`, no tag IDs at runtime
- Default presets: one-shot build-time conversion from legacy file
- User presets: one-time runtime migration via versioned flag
- Wizard cleanup: browser toggle and fields removed in the same PR as the new feature ships
