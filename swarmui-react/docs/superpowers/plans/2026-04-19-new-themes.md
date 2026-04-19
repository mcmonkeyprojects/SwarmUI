# New Themes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 24 new themes (8 app, 8 game, 8 color-scheme) to the SwarmUI React frontend theme catalog.

**Architecture:** All 24 themes are appended as `ThemePalette` objects to the `BASE_THEME_PALETTES` array in `src/store/themeStore.ts`. The existing `applyBuiltInThemePersonality` transform runs over the array and fills in personality defaults, so each theme only needs to specify the fields that differ from defaults. No other files change.

**Tech Stack:** TypeScript, Zustand, CSS custom properties — no new dependencies.

---

## Key Facts Before You Start

- **File:** `src/store/themeStore.ts`
- **Insert point:** Append inside `BASE_THEME_PALETTES`, before the closing `];` on line 3047.
  - The last existing theme (`nothing-signal`) ends with `},` at line 3046.
  - Your new themes go after line 3046, before line 3047.
- **NOT** `THEME_PALETTES` (line 3410) — that is the processed export. Always append to `BASE_THEME_PALETTES`.
- `applyBuiltInThemePersonality` auto-fills: surfaceTint, panelGradient, brandGradient, scrollbar/input/dropdown colors, motionProfile defaults, shadow, etc. You only need to specify fields you want to override from the auto-computed values.
- **Gray scale convention:**
  - Dark themes: `gray0` = lightest (text), `gray9` = darkest (background)
  - Light themes: `gray0` = darkest (text), `gray9` = lightest (background) — inverted
- **Light mode themes** (Gruvbox Light, Solarized Light): the `applyBuiltInThemePersonality` function reads the category/colors to determine behavior. Set `motionProfile: 'calm'` in colors to signal a calm light theme.
- **Gruvbox Light semantic colors:** The plan uses authentic Gruvbox light-mode semantic values (`#79740E`/`#B57614`/`#9D0006`) rather than the spec's generic defaults. These are intentional — dark-mode defaults (`#40C057` green, `#FA5252` red) have poor contrast on a cream parchment background.
- **Verification:** `npm run dev` inside `swarmui-react/`, then open the app → click the appearance button in the header → "Browse all themes" → confirm all 24 appear and render.

## Spec Reference

Full palette details: `docs/superpowers/specs/2026-04-19-new-themes-design.md`

---

## Chunk 1: App Themes

### Task 1: Add 8 App Themes

**Files:**
- Modify: `src/store/themeStore.ts` after line 3046

- [ ] **Step 1: Open the file and locate the insertion point**

  Read `src/store/themeStore.ts` lines 3040–3050 to confirm `nothing-signal` ends at line 3046 and `];` is at line 3047. You will insert new theme objects between these two lines.

- [ ] **Step 2: Insert the 8 app theme objects**

  Add the following block after line 3046 (after the `},` that closes `nothing-signal`), before the `];`:

  ```typescript
  // ── App Themes ──────────────────────────────────────────────────────────────
  {
    id: 'claude',
    name: 'Claude',
    category: 'app',
    colors: {
      brand: '#D97757',
      gray0: '#FAF7F5',
      gray1: '#E8E0D8',
      gray2: '#CEC4BA',
      gray3: '#A89E94',
      gray4: '#7E766C',
      gray5: '#5A534A',
      gray6: '#3E3830',
      gray7: '#2C2520',
      gray8: '#1C1916',
      gray9: '#0F0D0C',
      accent: '#8B7355',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'calm',
    },
    style: {
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'arc',
    name: 'Arc Browser',
    category: 'app',
    colors: {
      brand: '#5B5BD6',
      gray0: '#F0F0FF',
      gray1: '#D4D4F0',
      gray2: '#B4B4D8',
      gray3: '#8E8EB4',
      gray4: '#686890',
      gray5: '#484870',
      gray6: '#30304E',
      gray7: '#1E1E38',
      gray8: '#141426',
      gray9: '#0C0C12',
      accent: '#E54D2E',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'energetic',
    },
    style: {
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    category: 'app',
    colors: {
      brand: '#0070F3',
      gray0: '#FFFFFF',
      gray1: '#D4D4D4',
      gray2: '#AAAAAA',
      gray3: '#808080',
      gray4: '#595959',
      gray5: '#3A3A3A',
      gray6: '#282828',
      gray7: '#1C1C1C',
      gray8: '#111111',
      gray9: '#000000',
      accent: '#7928CA',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'calm',
      radiusScale: 'comfortable',
      strokeStyle: 'standard',
    },
    style: {
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'raycast',
    name: 'Raycast',
    category: 'app',
    colors: {
      brand: '#E55A2B',
      gray0: '#F5F5F5',
      gray1: '#D0D0D0',
      gray2: '#AAAAAA',
      gray3: '#808080',
      gray4: '#5A5A5A',
      gray5: '#3C3C3C',
      gray6: '#2C2C2C',
      gray7: '#1E1E1E',
      gray8: '#121212',
      gray9: '#080808',
      accent: '#FF9F0A',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'energetic',
    },
    style: {
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'warp',
    name: 'Warp Terminal',
    category: 'app',
    colors: {
      brand: '#7B4DFF',
      gray0: '#E8E8F0',
      gray1: '#C4C4D4',
      gray2: '#9898B0',
      gray3: '#70708C',
      gray4: '#52526C',
      gray5: '#3C3C50',
      gray6: '#28283A',
      gray7: '#1C1C2A',
      gray8: '#12121E',
      gray9: '#0A0A12',
      accent: '#00E5CC',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
    style: {
      family: 'glyph',
    },
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'app',
    colors: {
      brand: '#3ECF8E',
      gray0: '#F8F8F8',
      gray1: '#D4D4D4',
      gray2: '#AEAEAE',
      gray3: '#888888',
      gray4: '#606060',
      gray5: '#404040',
      gray6: '#2C2C2C',
      gray7: '#222222',
      gray8: '#191919',
      gray9: '#0F0F0F',
      accent: '#24B47E',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    category: 'app',
    colors: {
      brand: '#06B6D4',
      gray0: '#F8FAFC',
      gray1: '#F1F5F9',
      gray2: '#E2E8F0',
      gray3: '#CBD5E1',
      gray4: '#94A3B8',
      gray5: '#64748B',
      gray6: '#475569',
      gray7: '#334155',
      gray8: '#1E293B',
      gray9: '#0F172A',
      accent: '#3B82F6',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    category: 'app',
    colors: {
      brand: '#6366F1',
      gray0: '#F0F0F5',
      gray1: '#C8C8D4',
      gray2: '#A0A0B0',
      gray3: '#787888',
      gray4: '#585868',
      gray5: '#3C3C4E',
      gray6: '#2A2A3A',
      gray7: '#1E1E2C',
      gray8: '#14141E',
      gray9: '#0C0C10',
      accent: '#8B5CF6',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'calm',
    },
  },
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run from `swarmui-react/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors. If errors appear, check for missing commas or mismatched braces.

- [ ] **Step 4: Commit**

  ```bash
  git add src/store/themeStore.ts
  git commit -m "feat: add 8 app themes (Claude, Arc, Vercel, Raycast, Warp, Supabase, Tailwind, Cursor)"
  ```

---

## Chunk 2: Game Themes

### Task 2: Add 8 Game Themes

**Files:**
- Modify: `src/store/themeStore.ts` — after the last app theme you added in Task 1

- [ ] **Step 1: Insert the 8 game theme objects**

  Append the following after the last app theme (`cursor`), still before the `];`:

  ```typescript
  // ── Game Themes ──────────────────────────────────────────────────────────────
  {
    id: 'bloodborne',
    name: 'Bloodborne',
    category: 'game',
    colors: {
      brand: '#8B0000',
      gray0: '#D4C5B0',
      gray1: '#B8A890',
      gray2: '#9A8C74',
      gray3: '#7A6E5A',
      gray4: '#5C5044',
      gray5: '#3E3430',
      gray6: '#2A1E1C',
      gray7: '#1E1410',
      gray8: '#140C0A',
      gray9: '#0A0505',
      accent: '#D4A017',
      success: '#D4A017',
      warning: '#C17F24',
      error: '#8B0000',
      motionProfile: 'calm',
      shadowDepth: 'deep',
      glowStrength: 0.4,
    },
    style: {
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'cyberpunk-2077',
    name: 'Cyberpunk 2077',
    category: 'game',
    colors: {
      brand: '#FCE300',
      gray0: '#E8E8F8',
      gray1: '#B4B4CC',
      gray2: '#8484A0',
      gray3: '#606078',
      gray4: '#424260',
      gray5: '#2C2C48',
      gray6: '#1C1C32',
      gray7: '#101020',
      gray8: '#060610',
      gray9: '#020204',
      accent: '#00D4FF',
      success: '#00D4FF',
      warning: '#FCE300',
      error: '#FF2D55',
      motionProfile: 'energetic',
      glowStrength: 0.9,
    },
    style: {
      family: 'glyph',
    },
  },
  {
    id: 'skyrim',
    name: 'Skyrim',
    category: 'game',
    colors: {
      brand: '#C0392B',
      gray0: '#E8E6E0',
      gray1: '#C8C4BC',
      gray2: '#A8A49C',
      gray3: '#88847C',
      gray4: '#686460',
      gray5: '#4C4844',
      gray6: '#343230',
      gray7: '#252320',
      gray8: '#181614',
      gray9: '#0D0D0F',
      accent: '#4A90D9',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      secondaryAccent: '#D4C5A9',
    },
  },
  {
    id: 'stardew',
    name: 'Stardew Valley',
    category: 'game',
    colors: {
      brand: '#6AB04C',
      gray0: '#F5EDD8',
      gray1: '#E0D4B8',
      gray2: '#C4B898',
      gray3: '#A09878',
      gray4: '#80785C',
      gray5: '#5C5640',
      gray6: '#403C2C',
      gray7: '#302C20',
      gray8: '#221A14',
      gray9: '#1A1209',
      accent: '#F0A500',
      success: '#6AB04C',
      warning: '#F0A500',
      error: '#C0392B',
      motionProfile: 'calm',
      radiusScale: 'rounded',
    },
  },
  {
    id: 'baldursgate3',
    name: "Baldur's Gate 3",
    category: 'game',
    colors: {
      brand: '#7B3FB5',
      gray0: '#D8D0C8',
      gray1: '#B8B0A8',
      gray2: '#948C84',
      gray3: '#726A64',
      gray4: '#524C48',
      gray5: '#38342C',
      gray6: '#28241E',
      gray7: '#1C1818',
      gray8: '#120E14',
      gray9: '#0A070F',
      accent: '#C9A84C',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      secondaryAccent: '#C9A84C',
    },
    style: {
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'masseffect',
    name: 'Mass Effect',
    category: 'game',
    colors: {
      brand: '#CC0000',
      gray0: '#D0D8E8',
      gray1: '#A8B4CC',
      gray2: '#8090B0',
      gray3: '#5C6C90',
      gray4: '#3C506C',
      gray5: '#253448',
      gray6: '#182430',
      gray7: '#10182A',
      gray8: '#090E1C',
      gray9: '#050810',
      accent: '#00B4D8',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      secondaryAccent: '#FF6B35',
    },
  },
  {
    id: 'celeste',
    name: 'Celeste',
    category: 'game',
    colors: {
      brand: '#E040FB',
      gray0: '#EEE8FF',
      gray1: '#C8C0E8',
      gray2: '#A098C8',
      gray3: '#78709C',
      gray4: '#565078',
      gray5: '#3C3858',
      gray6: '#282440',
      gray7: '#1C1A30',
      gray8: '#121020',
      gray9: '#0A0A14',
      accent: '#40C4FF',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'energetic',
    },
  },
  {
    id: 'portal',
    name: 'Portal',
    category: 'game',
    colors: {
      brand: '#FF6B00',
      gray0: '#D8DCE0',
      gray1: '#B4B8BC',
      gray2: '#909498',
      gray3: '#6C7074',
      gray4: '#4E5255',
      gray5: '#363A3D',
      gray6: '#262A2C',
      gray7: '#1C1E20',
      gray8: '#12141A',
      gray9: '#0A0C0E',
      accent: '#0090FF',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
  },
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/store/themeStore.ts
  git commit -m "feat: add 8 game themes (Bloodborne, Cyberpunk 2077, Skyrim, Stardew, BG3, Mass Effect, Celeste, Portal)"
  ```

---

## Chunk 3: Color-Scheme Themes

### Task 3: Add 8 Color-Scheme Themes

**Files:**
- Modify: `src/store/themeStore.ts` — after the last game theme you added in Task 2

**Important notes for this batch:**
- **Gruvbox Light** and **Solarized Light** are light mode themes. Their gray scales are inverted: `gray9` is the lightest background color, `gray0` is the darkest text color.
- **Solarized Dark/Light**: the gray mid-tones have a deliberate teal→yellow tint due to the authentic Solarized palette character. This is expected.
- **Oxocarbon**: Uses IBM Carbon Design System's exact gray values.

- [ ] **Step 1: Insert the 8 color-scheme theme objects**

  Append the following after the last game theme (`portal`), still before the `];`:

  ```typescript
  // ── Color-Scheme Themes ──────────────────────────────────────────────────────
  {
    id: 'oxocarbon',
    name: 'Oxocarbon',
    category: 'color-scheme',
    colors: {
      brand: '#0F62FE',
      gray0: '#F4F4F4',
      gray1: '#E0E0E0',
      gray2: '#C6C6C6',
      gray3: '#A8A8A8',
      gray4: '#8D8D8D',
      gray5: '#6F6F6F',
      gray6: '#525252',
      gray7: '#393939',
      gray8: '#262626',
      gray9: '#161616',
      accent: '#42BE65',
      success: '#42BE65',
      warning: '#F1C21B',
      error: '#FA4D56',
    },
  },
  {
    id: 'nightfox',
    name: 'Nightfox',
    category: 'color-scheme',
    colors: {
      brand: '#C94F6D',
      gray0: '#CDCECF',
      gray1: '#AEAFB0',
      gray2: '#9098A4',
      gray3: '#738291',
      gray4: '#607080',
      gray5: '#50606E',
      gray6: '#3D4F5C',
      gray7: '#2E3E4E',
      gray8: '#212F3C',
      gray9: '#192330',
      accent: '#719CD6',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'standard',
    },
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    category: 'color-scheme',
    colors: {
      // Light mode: gray9 = lightest bg, gray0 = darkest text
      brand: '#D65D0E',
      gray0: '#1D2021',
      gray1: '#3C3836',
      gray2: '#665C54',
      gray3: '#7C6F64',
      gray4: '#928374',
      gray5: '#BDAE93',
      gray6: '#D5C4A1',
      gray7: '#EBDBB2',
      gray8: '#F2E5BC',
      gray9: '#FBF1C7',
      accent: '#458588',
      success: '#79740E',
      warning: '#B57614',
      error: '#9D0006',
      motionProfile: 'calm',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    category: 'color-scheme',
    colors: {
      brand: '#B58900',
      gray0: '#FDF6E3',
      gray1: '#EEE8D5',
      gray2: '#C5CABC',
      gray3: '#93A1A1',
      gray4: '#839496',
      gray5: '#657B83',
      gray6: '#586E75',
      gray7: '#2A4A54',
      gray8: '#073642',
      gray9: '#002B36',
      accent: '#268BD2',
      success: '#859900',
      warning: '#B58900',
      error: '#DC322F',
      motionProfile: 'calm',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    category: 'color-scheme',
    colors: {
      // Light mode: gray9 = lightest bg, gray0 = darkest text
      brand: '#B58900',
      gray0: '#002B36',
      gray1: '#073642',
      gray2: '#2A4A54',
      gray3: '#586E75',
      gray4: '#657B83',
      gray5: '#839496',
      gray6: '#93A1A1',
      gray7: '#C5CABC',
      gray8: '#EEE8D5',
      gray9: '#FDF6E3',
      accent: '#268BD2',
      success: '#859900',
      warning: '#B58900',
      error: '#DC322F',
      motionProfile: 'calm',
    },
  },
  {
    id: 'melange',
    name: 'Melange',
    category: 'color-scheme',
    colors: {
      brand: '#E49B5D',
      gray0: '#F5ECD7',
      gray1: '#E0D4BC',
      gray2: '#C8BA9E',
      gray3: '#A89E84',
      gray4: '#887E68',
      gray5: '#685E4C',
      gray6: '#4C4438',
      gray7: '#352E28',
      gray8: '#251E18',
      gray9: '#1B1611',
      accent: '#85AD82',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'calm',
    },
  },
  {
    id: 'flexoki',
    name: 'Flexoki',
    category: 'color-scheme',
    colors: {
      brand: '#D14D41',
      gray0: '#FFFCF0',
      gray1: '#F2F0E4',
      gray2: '#E6E4D9',
      gray3: '#CECDC3',
      gray4: '#B7B5AC',
      gray5: '#878580',
      gray6: '#6F6E69',
      gray7: '#575653',
      gray8: '#343331',
      gray9: '#100F0F',
      accent: '#879A39',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'calm',
    },
  },
  {
    id: 'ayu-dark',
    name: 'Ayu Dark',
    category: 'color-scheme',
    colors: {
      brand: '#FF8F40',
      gray0: '#BFBDB6',
      gray1: '#9A9896',
      gray2: '#7A7870',
      gray3: '#5C5A56',
      gray4: '#444240',
      gray5: '#30302E',
      gray6: '#212020',
      gray7: '#181818',
      gray8: '#121018',
      gray9: '#0A0E14',
      accent: '#59C2FF',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
  },
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/store/themeStore.ts
  git commit -m "feat: add 8 color-scheme themes (Oxocarbon, Nightfox, Gruvbox Light, Solarized Dark/Light, Melange, Flexoki, Ayu Dark)"
  ```

---

## Chunk 4: Verification

### Task 4: Visual Verification in Dev Server

- [ ] **Step 1: Start the dev server**

  From `swarmui-react/`:
  ```bash
  npm run dev
  ```
  Open the app in a browser (default: `http://localhost:5173`).

- [ ] **Step 2: Open ThemeCatalogBrowser and verify all 24 themes appear**

  - Click the appearance button (sun/moon icon) in the app header
  - Click "Browse all themes"
  - Filter by category "app" → confirm 8 new app themes are present: Claude, Arc Browser, Vercel, Raycast, Warp Terminal, Supabase, Tailwind CSS, Cursor
  - Filter by "game" → confirm 8 new game themes: Bloodborne, Cyberpunk 2077, Skyrim, Stardew Valley, Baldur's Gate 3, Mass Effect, Celeste, Portal
  - Filter by "color-scheme" → confirm 8 new color-scheme themes: Oxocarbon, Nightfox, Gruvbox Light, Solarized Dark, Solarized Light, Melange, Flexoki, Ayu Dark

- [ ] **Step 3: Spot-check theme rendering**

  Apply each of the following and confirm the UI renders correctly (no white-on-white, no invisible text, no missing colors):

  **App themes:**
  - Claude (warm copper/cream)
  - Cyberpunk 2077 (neon yellow/cyan on black — glyph family)
  - Warp Terminal (purple/cyan — glyph family)

  **Game themes:**
  - Bloodborne (very dark, red-tinted bg, amber accents)
  - Stardew Valley (earthy green/harvest gold, rounded shapes)
  - Portal (concrete grey, orange + blue accents)

  **Color-scheme themes:**
  - Oxocarbon (cool IBM Carbon neutral slate)
  - Nightfox (dark blue-grey with dusty rose)
  - Gruvbox Light (light mode — warm parchment bg, verify text is readable)
  - Solarized Dark (teal-dark bg — teal→cream mid-tones are expected)
  - Solarized Light (light mode — cream bg, verify text is readable)
  - Melange (warm amber/brown)
  - Flexoki (near-black ink bg, paper white text)
  - Ayu Dark (darker than existing Ayu Mirage — verify distinct from it)

- [ ] **Step 4: Final commit if any touch-ups were needed**

  If any palette values needed adjusting during visual review, commit fixes:
  ```bash
  git add src/store/themeStore.ts
  git commit -m "fix: adjust palette values after visual verification"
  ```
