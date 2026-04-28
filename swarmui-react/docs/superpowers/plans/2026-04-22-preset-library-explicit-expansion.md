# Preset Library Explicit Expansion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 95 new default presets to `src/data/presetLibrary.json` — 30 ungated adult characters, 40 explicit-gated characters, and 25 explicit in-the-act scene presets.

**Architecture:** Pure data addition — append new JSON objects to `src/data/presetLibrary.json`. No schema changes, no code changes, no UI changes. Validation test guards schema integrity. Quality-pass script deduplicates word arrays after insertion.

**Tech Stack:** JSON, Node.js (quality-pass script), Vitest (validation test)

**Spec:** `docs/superpowers/specs/2026-04-22-preset-library-explicit-expansion-design.md`

---

## Word Array Rules (read before implementing)

| Preset Type | Include | Exclude |
|---|---|---|
| Ungated characters (Part 1) | character/appearance/occupation/costume tags | explicit acts, nude body-state tags |
| Explicit archetype (Part 2a) | nude body-state, explicit visual cues, bondage/collar state | act-in-progress tags, location tags |
| Explicit act-framed (Part 2b) | act/position/action tags | location tags |
| In-the-act scenes (Part 3) | action/act/state tags | location tags |

---

## Chunk 1: Validation Test + Ungated Characters

### Task 1: Validation test

**Files:**
- Create: `swarmui-react/src/data/presetLibrary.validation.test.ts`

- [ ] **Step 1: Create validation test**

```typescript
// swarmui-react/src/data/presetLibrary.validation.test.ts
import { describe, expect, it } from 'vitest';
import type { LibraryPreset } from '../features/presetLibrary/types';
import { PRESET_CATEGORIES } from '../features/presetLibrary/types';
import presets from './presetLibrary.json';

const library = presets as LibraryPreset[];

describe('presetLibrary.json', () => {
  it('every preset has required fields', () => {
    for (const p of library) {
      expect(p.id, `${p.name} missing id`).toBeTruthy();
      expect(p.name, `${p.id} missing name`).toBeTruthy();
      expect(PRESET_CATEGORIES, `${p.id} bad category`).toContain(p.category);
      expect(Array.isArray(p.words), `${p.id} words not array`).toBe(true);
      expect(p.words.length, `${p.id} has no words`).toBeGreaterThan(0);
      expect(p.isDefault, `${p.id} isDefault not true`).toBe(true);
    }
  });

  it('all ids are unique', () => {
    const ids = library.map(p => p.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `Duplicate IDs: ${dupes.join(', ')}`).toHaveLength(0);
  });

  it('all names are unique', () => {
    const names = library.map(p => p.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `Duplicate names: ${dupes.join(', ')}`).toHaveLength(0);
  });

  it('ids follow pl-<category>-<slug> convention', () => {
    for (const p of library) {
      expect(p.id, `${p.name} id wrong format`).toMatch(
        /^pl-(characters|scenes|styles|perspectives|explicit)-[a-z0-9-]+$/
      );
    }
  });

  it('each preset has 6-20 words', () => {
    for (const p of library) {
      expect(p.words.length, `${p.id} has ${p.words.length} words`).toBeGreaterThanOrEqual(6);
      expect(p.words.length, `${p.id} has ${p.words.length} words`).toBeLessThanOrEqual(20);
    }
  });

  it('all thumbnails are unique within category', () => {
    const byCategory: Record<string, string[]> = {};
    for (const p of library) {
      if (!byCategory[p.category]) byCategory[p.category] = [];
      byCategory[p.category].push(p.thumbnail);
    }
    for (const [category, thumbs] of Object.entries(byCategory)) {
      const dupes = thumbs.filter((t, i) => thumbs.indexOf(t) !== i);
      expect(dupes, `Duplicate thumbnails in ${category}: ${dupes.join(', ')}`).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 2: Run test against current library**

```bash
cd swarmui-react && npx vitest run src/data/presetLibrary.validation.test.ts
```

Expected: All 6 tests PASS (existing 210 presets are valid).

- [ ] **Step 3: Commit**

```bash
git add swarmui-react/src/data/presetLibrary.validation.test.ts
git commit -m "test: add presetLibrary schema and uniqueness validation"
```

---

### Task 2: Add Part 1 — Ungated Adult Characters, Standard (20)

**Files:**
- Modify: `swarmui-react/src/data/presetLibrary.json`

- [ ] **Step 1: Append the 20 standard adult character presets**

Open `swarmui-react/src/data/presetLibrary.json`. Find the closing `]` at the end of the file. Add a comma after the last `}` and append:

```json
  {
    "id": "pl-characters-dominatrix-pro-domme",
    "name": "Dominatrix / Pro Domme",
    "category": "characters",
    "words": [
      "dominatrix",
      "latex",
      "whip",
      "corset",
      "high heels",
      "leather",
      "commanding expression",
      "professional",
      "mistress",
      "dom"
    ],
    "description": "A professional dominatrix in polished latex and leather — distinct from BDSM Mistress",
    "thumbnail": "👢",
    "isDefault": true
  },
  {
    "id": "pl-characters-pinup-model-cheesecake",
    "name": "Pinup Model / Cheesecake",
    "category": "characters",
    "words": [
      "pinup",
      "cheesecake",
      "1950s style",
      "retro",
      "playful pose",
      "red lips",
      "victory rolls hair",
      "classic beauty",
      "pin-up girl",
      "polka dot"
    ],
    "description": "Classic 1950s cheesecake pin-up pose with retro styling",
    "thumbnail": "📌",
    "isDefault": true
  },
  {
    "id": "pl-characters-burlesque-performer",
    "name": "Burlesque Performer",
    "category": "characters",
    "words": [
      "burlesque",
      "corset",
      "feather boa",
      "fishnet stockings",
      "top hat",
      "theatrical",
      "showgirl",
      "glamorous",
      "cabaret",
      "stage performer"
    ],
    "description": "A theatrical burlesque showgirl with feathers, corset, and glamour",
    "thumbnail": "🪶",
    "isDefault": true
  },
  {
    "id": "pl-characters-belly-dancer",
    "name": "Belly Dancer",
    "category": "characters",
    "words": [
      "belly dancer",
      "coin belt",
      "veil",
      "harem pants",
      "exposed midriff",
      "sensual dance",
      "middle eastern costume",
      "jewels",
      "dancer",
      "flowing fabric"
    ],
    "description": "A sensual belly dancer with coin belt, veil, and exposed midriff",
    "thumbnail": "🪙",
    "isDefault": true
  },
  {
    "id": "pl-characters-camgirl-content-creator",
    "name": "Camgirl / Content Creator",
    "category": "characters",
    "words": [
      "camgirl",
      "ring light",
      "webcam",
      "lingerie",
      "content creator",
      "online",
      "seductive",
      "streamer",
      "social media",
      "bedroom setup"
    ],
    "description": "A modern adult content creator with ring light and streaming setup",
    "thumbnail": "📱",
    "isDefault": true
  },
  {
    "id": "pl-characters-harem-concubine-odalisque",
    "name": "Harem Concubine / Odalisque",
    "category": "characters",
    "words": [
      "harem",
      "concubine",
      "odalisque",
      "silk clothing",
      "jewels",
      "bare midriff",
      "reclining",
      "ornate cushions",
      "fantasy",
      "seductive"
    ],
    "description": "A fantasy harem concubine reclining on ornate cushions in silks and jewels",
    "thumbnail": "🏺",
    "isDefault": true
  },
  {
    "id": "pl-characters-oiran-courtesan",
    "name": "Oiran / Courtesan",
    "category": "characters",
    "words": [
      "oiran",
      "courtesan",
      "japanese",
      "elaborate kimono",
      "elaborate hair",
      "hair ornaments",
      "white face makeup",
      "edo period",
      "high class",
      "traditional"
    ],
    "description": "A high-class Japanese Edo-period oiran with elaborate kimono and hair ornaments",
    "thumbnail": "🌸",
    "isDefault": true
  },
  {
    "id": "pl-characters-sugar-baby-kept-woman",
    "name": "Sugar Baby / Kept Woman",
    "category": "characters",
    "words": [
      "sugar baby",
      "luxury",
      "expensive clothing",
      "designer",
      "pampered",
      "kept woman",
      "wealthy lifestyle",
      "fashionable",
      "spoiled",
      "glamorous"
    ],
    "description": "A pampered kept woman with designer clothing and luxury aesthetic",
    "thumbnail": "💎",
    "isDefault": true
  },
  {
    "id": "pl-characters-nude-life-drawing-model",
    "name": "Nude Life Drawing Model",
    "category": "characters",
    "words": [
      "life drawing model",
      "life drawing",
      "figure model",
      "classical pose",
      "studio",
      "tasteful",
      "posed",
      "art model",
      "figure drawing",
      "natural light"
    ],
    "description": "An artistic life drawing model in a tasteful classical studio pose",
    "thumbnail": "🎨",
    "isDefault": true
  },
  {
    "id": "pl-characters-sexy-librarian",
    "name": "Sexy Librarian",
    "category": "characters",
    "words": [
      "librarian",
      "glasses",
      "hair bun",
      "button up shirt",
      "pencil skirt",
      "books",
      "sensual",
      "intellectual",
      "reading glasses",
      "prim outfit"
    ],
    "description": "Classic sexy librarian — glasses, hair up, prim outfit hiding allure",
    "thumbnail": "📚",
    "isDefault": true
  },
  {
    "id": "pl-characters-cougar-older-seductress",
    "name": "Cougar / Older Seductress",
    "category": "characters",
    "words": [
      "mature woman",
      "seductive",
      "older woman",
      "predatory expression",
      "elegant",
      "confident",
      "cougar",
      "experienced",
      "alluring",
      "sophisticated"
    ],
    "description": "A mature, predatory seductress — confident and experienced (distinct from MILF)",
    "thumbnail": "🐆",
    "isDefault": true
  },
  {
    "id": "pl-characters-bath-attendant-masseuse",
    "name": "Bath Attendant / Masseuse",
    "category": "characters",
    "words": [
      "bath attendant",
      "masseuse",
      "towel",
      "minimal clothing",
      "spa",
      "intimate service",
      "soft lighting",
      "wellness",
      "attendant",
      "serving"
    ],
    "description": "An intimate bath attendant or masseuse in minimal towel clothing",
    "thumbnail": "🛁",
    "isDefault": true
  },
  {
    "id": "pl-characters-bimbo-dumb-blonde",
    "name": "Bimbo / Dumb Blonde",
    "category": "characters",
    "words": [
      "bimbo",
      "dumb blonde",
      "exaggerated proportions",
      "large breasts",
      "pink clothing",
      "heavy makeup",
      "vacant expression",
      "blonde hair",
      "tight outfit",
      "curvaceous"
    ],
    "description": "Exaggerated bimbo archetype — big proportions, pink, vapid expression",
    "thumbnail": "💅",
    "isDefault": true
  },
  {
    "id": "pl-characters-sex-worker-call-girl",
    "name": "Sex Worker / Call Girl",
    "category": "characters",
    "words": [
      "sex worker",
      "call girl",
      "provocative clothing",
      "seductive",
      "escort",
      "adult entertainment",
      "fishnet",
      "revealing outfit",
      "working girl",
      "street fashion"
    ],
    "description": "A sex worker or call girl in provocative revealing clothing",
    "thumbnail": "👠",
    "isDefault": true
  },
  {
    "id": "pl-characters-lingerie-model",
    "name": "Lingerie Model",
    "category": "characters",
    "words": [
      "lingerie model",
      "lingerie",
      "professional model",
      "underwear shoot",
      "studio lighting",
      "posed",
      "bra and panties",
      "fashion",
      "model",
      "editorial"
    ],
    "description": "A professional lingerie model in an underwear fashion shoot",
    "thumbnail": "🩱",
    "isDefault": true
  },
  {
    "id": "pl-characters-femme-fatale-noir-seductress",
    "name": "Femme Fatale / Noir Seductress",
    "category": "characters",
    "words": [
      "femme fatale",
      "film noir",
      "dangerous woman",
      "red lips",
      "dark clothing",
      "mysterious",
      "seductive",
      "1940s style",
      "silk dress",
      "cigarette holder"
    ],
    "description": "A dangerous film noir femme fatale — distinct from Detective Noir Heroine",
    "thumbnail": "🕸️",
    "isDefault": true
  },
  {
    "id": "pl-characters-fantasy-concubine",
    "name": "Fantasy Concubine",
    "category": "characters",
    "words": [
      "fantasy concubine",
      "royal concubine",
      "jewels",
      "minimal drapery",
      "silk",
      "gold jewelry",
      "seductive",
      "exotic",
      "fantasy world",
      "palace"
    ],
    "description": "A fantasy world royal concubine adorned in jewels and minimal silk drapery",
    "thumbnail": "💍",
    "isDefault": true
  },
  {
    "id": "pl-characters-seductive-villainess",
    "name": "Seductive Villainess",
    "category": "characters",
    "words": [
      "villainess",
      "evil woman",
      "seductive",
      "antagonist",
      "dark clothing",
      "manipulative expression",
      "powerful",
      "dangerous",
      "alluring",
      "evil smile"
    ],
    "description": "A seductive evil antagonist with dangerous allure",
    "thumbnail": "🦹",
    "isDefault": true
  },
  {
    "id": "pl-characters-stripper-pole-dancer",
    "name": "Stripper / Pole Dancer",
    "category": "characters",
    "words": [
      "stripper",
      "pole dancer",
      "platform heels",
      "thong",
      "club",
      "dancer",
      "tassels",
      "adult entertainer",
      "stage",
      "sexy dance"
    ],
    "description": "A club stripper or pole dancer — more specific setting than Exotic Dancer",
    "thumbnail": "🪩",
    "isDefault": true
  },
  {
    "id": "pl-characters-gyaru-escort",
    "name": "Gyaru Escort",
    "category": "characters",
    "words": [
      "gyaru",
      "escort",
      "tanned skin",
      "bleached hair",
      "thick makeup",
      "fashionable",
      "japanese street fashion",
      "nails",
      "accessorized",
      "companion"
    ],
    "description": "A tanned gyaru in escort/companion fashion",
    "thumbnail": "🌟",
    "isDefault": true
  }
```

- [ ] **Step 2: Run validation test**

```bash
cd swarmui-react && npx vitest run src/data/presetLibrary.validation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add swarmui-react/src/data/presetLibrary.json
git commit -m "feat(presets): add 20 standard adult character presets"
```

---

### Task 3: Add Part 1 — Ungated Fantasy Adult Characters (10)

**Files:**
- Modify: `swarmui-react/src/data/presetLibrary.json`

- [ ] **Step 1: Append the 10 fantasy adult character presets**

```json
  {
    "id": "pl-characters-dark-elf-seductress",
    "name": "Dark Elf Seductress",
    "category": "characters",
    "words": [
      "dark elf",
      "drow",
      "purple skin",
      "white hair",
      "seductive",
      "fantasy",
      "elf ears",
      "dark magic",
      "alluring",
      "underground"
    ],
    "description": "A drow dark elf seductress with purple skin and white hair — distinct from Slim Elf Girl",
    "thumbnail": "🌑",
    "isDefault": true
  },
  {
    "id": "pl-characters-nymph-dryad",
    "name": "Nymph / Dryad",
    "category": "characters",
    "words": [
      "nymph",
      "dryad",
      "nature spirit",
      "leaves",
      "semi-clothed",
      "ethereal",
      "forest",
      "flowers in hair",
      "natural beauty",
      "spirit"
    ],
    "description": "A semi-clothed forest nymph or dryad nature spirit",
    "thumbnail": "🌿",
    "isDefault": true
  },
  {
    "id": "pl-characters-harpy-winged-temptress",
    "name": "Harpy / Winged Temptress",
    "category": "characters",
    "words": [
      "harpy",
      "wings",
      "bird woman",
      "feathers",
      "talons",
      "barely clothed",
      "flying",
      "fantasy creature",
      "winged",
      "temptress"
    ],
    "description": "A barely-clothed bird-woman harpy with feathers and talons",
    "thumbnail": "🦅",
    "isDefault": true
  },
  {
    "id": "pl-characters-lamia-snake-woman",
    "name": "Lamia / Snake Woman",
    "category": "characters",
    "words": [
      "lamia",
      "snake lower body",
      "serpent",
      "scales",
      "female upper body",
      "monster girl",
      "coiled",
      "snake tail",
      "fantasy",
      "seductive"
    ],
    "description": "A lamia with serpent lower body and seductive female upper body",
    "thumbnail": "🐲",
    "isDefault": true
  },
  {
    "id": "pl-characters-kitsune-courtesan",
    "name": "Kitsune Courtesan",
    "category": "characters",
    "words": [
      "kitsune",
      "fox spirit",
      "courtesan",
      "multiple tails",
      "fox ears",
      "japanese",
      "kimono",
      "seductive",
      "supernatural",
      "fox woman"
    ],
    "description": "A fox spirit kitsune in courtesan role — distinct from Foxgirl/Kitsune",
    "thumbnail": "🍵",
    "isDefault": true
  },
  {
    "id": "pl-characters-demon-queen-lilith",
    "name": "Demon Queen / Lilith",
    "category": "characters",
    "words": [
      "demon queen",
      "lilith",
      "horns",
      "wings",
      "regal",
      "powerful",
      "dark magic",
      "crown",
      "throne",
      "demonic royalty"
    ],
    "description": "A powerful regal demon queen — distinct from Demon Girl and Succubus",
    "thumbnail": "👹",
    "isDefault": true
  },
  {
    "id": "pl-characters-dark-fairy-fae-temptress",
    "name": "Dark Fairy / Fae Temptress",
    "category": "characters",
    "words": [
      "dark fairy",
      "fae",
      "fairy wings",
      "malevolent",
      "seductive magic",
      "dark glamour",
      "small wings",
      "otherworldly beauty",
      "forest spirit",
      "dangerous"
    ],
    "description": "A malevolent dark fairy with seductive fae magic",
    "thumbnail": "🧚",
    "isDefault": true
  },
  {
    "id": "pl-characters-lich-undead-seductress",
    "name": "Lich / Undead Seductress",
    "category": "characters",
    "words": [
      "lich",
      "undead",
      "pale skin",
      "hollow eyes",
      "sorceress",
      "dark magic",
      "skeletal features",
      "robes",
      "necromancer",
      "beautiful undead"
    ],
    "description": "A beautiful undead lich sorceress with hollow eyes and dark magic",
    "thumbnail": "💀",
    "isDefault": true
  },
  {
    "id": "pl-characters-centaur-girl",
    "name": "Centaur Girl",
    "category": "characters",
    "words": [
      "centaur",
      "horse lower body",
      "female upper body",
      "hooves",
      "fantasy",
      "monster girl",
      "tribal",
      "half horse",
      "warrior",
      "galloping"
    ],
    "description": "A centaur girl with horse lower body and female upper body",
    "thumbnail": "🐴",
    "isDefault": true
  },
  {
    "id": "pl-characters-arachne-spider-girl",
    "name": "Arachne / Spider Girl",
    "category": "characters",
    "words": [
      "arachne",
      "spider lower body",
      "spider legs",
      "web",
      "female upper body",
      "monster girl",
      "fantasy",
      "eight legs",
      "spider silk",
      "predatory"
    ],
    "description": "An arachne spider-girl with spider lower body and web",
    "thumbnail": "🕷️",
    "isDefault": true
  }
```

- [ ] **Step 2: Run validation test**

```bash
cd swarmui-react && npx vitest run src/data/presetLibrary.validation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add swarmui-react/src/data/presetLibrary.json
git commit -m "feat(presets): add 10 fantasy adult character presets"
```

---

## Chunk 2: Explicit Archetype Characters

### Task 4: Add Part 2a — Explicit Archetype Characters (22)

**Files:**
- Modify: `swarmui-react/src/data/presetLibrary.json`

> Word arrays: nude body-state and explicit visual cues. NO act-in-progress tags.

- [ ] **Step 1: Append the 22 explicit archetype presets**

```json
  {
    "id": "pl-explicit-nude-maid",
    "name": "Nude Maid",
    "category": "explicit",
    "words": [
      "nude",
      "maid",
      "apron only",
      "naked maid",
      "submissive",
      "collar",
      "exposed",
      "domestic service",
      "nude apron",
      "serving"
    ],
    "description": "A naked maid wearing only an apron — exposed and submissive in service",
    "thumbnail": "🪣",
    "isDefault": true
  },
  {
    "id": "pl-explicit-sex-slave-naked-captive",
    "name": "Sex Slave / Naked Captive",
    "category": "explicit",
    "words": [
      "nude",
      "collar",
      "bound",
      "restrained",
      "slave",
      "captive",
      "exposed",
      "submissive",
      "on knees",
      "chains"
    ],
    "description": "A nude collared slave — bound, restrained, fully exposed",
    "thumbnail": "⛓️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-willing-fucktoy",
    "name": "Willing Fucktoy",
    "category": "explicit",
    "words": [
      "nude",
      "eager",
      "submissive",
      "spread legs",
      "invitation",
      "explicit",
      "ahegao expression",
      "wanting",
      "exposed",
      "ready"
    ],
    "description": "An eager submissive fully exposed and inviting explicit attention",
    "thumbnail": "🎁",
    "isDefault": true
  },
  {
    "id": "pl-explicit-nude-idol-used-idol",
    "name": "Nude Idol / Used Idol",
    "category": "explicit",
    "words": [
      "nude",
      "idol",
      "stage costume torn",
      "exposed",
      "used",
      "disheveled",
      "pop idol",
      "nude body",
      "explicit idol",
      "stripped"
    ],
    "description": "A K/J-pop idol stripped and exposed — post-use, disheveled",
    "thumbnail": "🎤",
    "isDefault": true
  },
  {
    "id": "pl-explicit-naked-pet-human-pet",
    "name": "Naked Pet / Human Pet",
    "category": "explicit",
    "words": [
      "nude",
      "collar",
      "leash",
      "on all fours",
      "pet play",
      "animal ears",
      "naked",
      "submissive",
      "human pet",
      "collared nude"
    ],
    "description": "A nude human pet — collared, leashed, on all fours",
    "thumbnail": "🐾",
    "isDefault": true
  },
  {
    "id": "pl-explicit-broodmother-bred-girl",
    "name": "Broodmother / Bred Girl",
    "category": "explicit",
    "words": [
      "pregnant",
      "bred",
      "pregnant belly",
      "satisfied expression",
      "nude",
      "post-breeding",
      "fertile",
      "large belly",
      "content",
      "breeding result"
    ],
    "description": "Post-breeding girl with pregnant belly — satisfied and bred",
    "thumbnail": "🤰",
    "isDefault": true
  },
  {
    "id": "pl-explicit-cum-dumpster-used-hole",
    "name": "Cum Dumpster / Used Hole",
    "category": "explicit",
    "words": [
      "nude",
      "cum dripping",
      "used",
      "multiple creampies",
      "well used",
      "exposed",
      "cum all over",
      "thoroughly used",
      "leaking",
      "degraded"
    ],
    "description": "Thoroughly used with multiple creampies — leaking and degraded",
    "thumbnail": "🫙",
    "isDefault": true
  },
  {
    "id": "pl-explicit-naked-elf-prisoner",
    "name": "Naked Elf Prisoner",
    "category": "explicit",
    "words": [
      "nude",
      "elf",
      "prisoner",
      "bound",
      "elf ears",
      "captive",
      "stripped",
      "fantasy",
      "chains",
      "helpless"
    ],
    "description": "A nude elf captive — stripped, bound in chains, helpless",
    "thumbnail": "🧝",
    "isDefault": true
  },
  {
    "id": "pl-explicit-exposed-shrine-maiden",
    "name": "Exposed Shrine Maiden",
    "category": "explicit",
    "words": [
      "nude",
      "shrine maiden",
      "miko",
      "undressed",
      "hakama removed",
      "exposed",
      "embarrassed",
      "explicit",
      "sacred",
      "naked shrine maiden"
    ],
    "description": "A miko shrine maiden undressed and exposed — sacred garments removed",
    "thumbnail": "⛩️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-nude-warrior-post-battle",
    "name": "Nude Warrior (Post-Battle)",
    "category": "explicit",
    "words": [
      "nude",
      "warrior",
      "armor torn",
      "battle damaged",
      "exhausted",
      "defeated",
      "stripped",
      "weapons gone",
      "exposed",
      "post battle"
    ],
    "description": "A warrior stripped after defeat — armor torn away, weapons gone",
    "thumbnail": "⚔️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-ahegao-doll",
    "name": "Ahegao Doll",
    "category": "explicit",
    "words": [
      "ahegao",
      "doll",
      "blank expression",
      "mind broken",
      "rolled back eyes",
      "tongue out",
      "nude",
      "vacant",
      "doll-like",
      "dissociated"
    ],
    "description": "Mind-broken ahegao doll — vacant eyes, tongue out, doll-like state",
    "thumbnail": "🪆",
    "isDefault": true
  },
  {
    "id": "pl-explicit-creampied-mess",
    "name": "Creampied Mess",
    "category": "explicit",
    "words": [
      "creampie",
      "cum dripping",
      "aftermath",
      "internal",
      "leaking",
      "nude",
      "satisfied",
      "messy",
      "cum inside",
      "post sex"
    ],
    "description": "Heavy creampie aftermath — cum dripping, satisfied, messy",
    "thumbnail": "🥄",
    "isDefault": true
  },
  {
    "id": "pl-explicit-demon-concubine-hell-consort",
    "name": "Demon Concubine / Hell Consort",
    "category": "explicit",
    "words": [
      "demon",
      "concubine",
      "nude",
      "horns",
      "tail",
      "collared",
      "kept",
      "enslaved",
      "demonic",
      "explicit demon"
    ],
    "description": "A demon explicitly kept as a sexual companion — collared, nude, devoted",
    "thumbnail": "🌋",
    "isDefault": true
  },
  {
    "id": "pl-explicit-enslaved-succubus",
    "name": "Enslaved Succubus",
    "category": "explicit",
    "words": [
      "succubus",
      "enslaved",
      "collar",
      "bound",
      "captive succubus",
      "restrained",
      "nude",
      "wings clipped",
      "slave",
      "used"
    ],
    "description": "A succubus captured and used — collar, bound, wings clipped",
    "thumbnail": "🔗",
    "isDefault": true
  },
  {
    "id": "pl-explicit-dark-elf-sex-slave",
    "name": "Dark Elf Sex Slave",
    "category": "explicit",
    "words": [
      "dark elf",
      "drow",
      "nude",
      "collar",
      "slave",
      "captive",
      "explicit",
      "bound",
      "elf ears",
      "enslaved"
    ],
    "description": "A drow dark elf in explicit captive/collared slave state",
    "thumbnail": "🌑",
    "isDefault": true
  },
  {
    "id": "pl-explicit-dragons-hoard-concubine",
    "name": "Dragon's Hoard Concubine",
    "category": "explicit",
    "words": [
      "dragon",
      "concubine",
      "nude",
      "treasure",
      "gold",
      "jewels",
      "kept",
      "dragon possession",
      "hoard",
      "claimed"
    ],
    "description": "Kept and claimed by a dragon — nude among the treasure hoard",
    "thumbnail": "🐉",
    "isDefault": true
  },
  {
    "id": "pl-explicit-goblin-claimed-heroine",
    "name": "Goblin-Claimed Heroine",
    "category": "explicit",
    "words": [
      "goblin",
      "heroine",
      "captured",
      "nude",
      "defeated",
      "claimed",
      "fantasy",
      "multiple goblins",
      "adventurer",
      "ravaged"
    ],
    "description": "An adventurer heroine captured and claimed by goblins",
    "thumbnail": "👺",
    "isDefault": true
  },
  {
    "id": "pl-explicit-tentacle-monsters-bride",
    "name": "Tentacle Monster's Bride",
    "category": "explicit",
    "words": [
      "tentacle",
      "claimed",
      "bride",
      "bonded",
      "tentacles wrapped",
      "nude",
      "marked",
      "possessed",
      "monster bride",
      "explicit tentacle"
    ],
    "description": "Explicitly claimed and bonded to a tentacle creature — marked and possessed",
    "thumbnail": "🐙",
    "isDefault": true
  },
  {
    "id": "pl-explicit-corrupted-paladin",
    "name": "Corrupted Paladin",
    "category": "explicit",
    "words": [
      "paladin",
      "armor torn",
      "body exposed",
      "fallen",
      "lust",
      "eyes glowing",
      "corruption",
      "explicit corruption",
      "holy warrior fallen",
      "partially nude"
    ],
    "description": "Holy warrior fully fallen to lust — armor physically torn open, body exposed, eyes glowing",
    "thumbnail": "✝️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-elven-breeding-mare",
    "name": "Elven Breeding Mare",
    "category": "explicit",
    "words": [
      "elf",
      "breeding",
      "nude",
      "restrained",
      "fertile",
      "elf ears",
      "breeding slave",
      "explicit",
      "impregnation",
      "elvish captive"
    ],
    "description": "An elf explicitly kept for breeding — nude, restrained, fertile",
    "thumbnail": "🌿",
    "isDefault": true
  },
  {
    "id": "pl-explicit-fairy-sex-pet",
    "name": "Fairy Sex Pet",
    "category": "explicit",
    "words": [
      "fairy",
      "tiny",
      "nude",
      "pet",
      "wings",
      "intimate companion",
      "small",
      "captured fairy",
      "explicit tiny",
      "fairy nude"
    ],
    "description": "A tiny nude fairy kept as an intimate sex pet",
    "thumbnail": "🧚",
    "isDefault": true
  },
  {
    "id": "pl-explicit-divine-vessel-gods-toy",
    "name": "Divine Vessel / God's Toy",
    "category": "explicit",
    "words": [
      "divine",
      "nude",
      "marked",
      "devoted",
      "godly symbol",
      "god chosen",
      "religious marking",
      "exposed",
      "worshipful",
      "sacred nude"
    ],
    "description": "A deity's chosen consort — nude, marked with divine symbols, devoted",
    "thumbnail": "⭐",
    "isDefault": true
  }
```

- [ ] **Step 2: Run validation test**

```bash
cd swarmui-react && npx vitest run src/data/presetLibrary.validation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add swarmui-react/src/data/presetLibrary.json
git commit -m "feat(presets): add 22 explicit archetype character presets"
```

---

## Chunk 3: Explicit Act-Framed + In-The-Act Scenes

### Task 5: Add Part 2b — Explicit Act-Framed Characters (18)

**Files:**
- Modify: `swarmui-react/src/data/presetLibrary.json`

> Word arrays: act/position/action tags. NO location tags.

- [ ] **Step 1: Append the 18 explicit act-framed presets**

```json
  {
    "id": "pl-explicit-girl-being-fucked-missionary",
    "name": "Girl Being Fucked (Missionary)",
    "category": "explicit",
    "words": [
      "missionary position",
      "sex",
      "intercourse",
      "lying down",
      "penetration",
      "explicit",
      "being fucked",
      "sexual intercourse"
    ],
    "description": "Active missionary sex framing — in-progress penetration",
    "thumbnail": "🔒",
    "isDefault": true
  },
  {
    "id": "pl-explicit-girl-being-eaten-out",
    "name": "Girl Being Eaten Out",
    "category": "explicit",
    "words": [
      "cunnilingus",
      "oral sex receiving",
      "being eaten out",
      "moaning",
      "explicit",
      "legs spread",
      "receiving oral",
      "sexual pleasure",
      "orgasm"
    ],
    "description": "Receiving oral sex — legs spread, moaning in pleasure",
    "thumbnail": "🩷",
    "isDefault": true
  },
  {
    "id": "pl-explicit-girl-giving-blowjob",
    "name": "Girl Giving Blowjob",
    "category": "explicit",
    "words": [
      "fellatio",
      "blowjob",
      "oral sex",
      "on knees",
      "sucking",
      "cock in mouth",
      "explicit",
      "performing oral",
      "eye contact"
    ],
    "description": "Performing oral sex — on knees, cock in mouth, eye contact",
    "thumbnail": "😮",
    "isDefault": true
  },
  {
    "id": "pl-explicit-girl-riding-cowgirl",
    "name": "Girl Riding Cowgirl",
    "category": "explicit",
    "words": [
      "cowgirl position",
      "riding",
      "on top",
      "bouncing",
      "straddling",
      "sex",
      "explicit",
      "cowgirl sex",
      "riding cock"
    ],
    "description": "Active cowgirl position — on top, bouncing, straddling",
    "thumbnail": "🪑",
    "isDefault": true
  },
  {
    "id": "pl-explicit-girl-getting-anal",
    "name": "Girl Getting Anal",
    "category": "explicit",
    "words": [
      "anal sex",
      "anal",
      "rear entry",
      "anal intercourse",
      "explicit",
      "from behind",
      "ass up",
      "anal penetration"
    ],
    "description": "Active anal sex framing — rear entry, ass up",
    "thumbnail": "🔴",
    "isDefault": true
  },
  {
    "id": "pl-explicit-gangbang-participant",
    "name": "Gangbang Participant",
    "category": "explicit",
    "words": [
      "gangbang",
      "multiple partners",
      "group sex",
      "multiple men",
      "explicit",
      "orgy",
      "gang bang",
      "used by many"
    ],
    "description": "Active gangbang — multiple partners simultaneously engaged",
    "thumbnail": "🔢",
    "isDefault": true
  },
  {
    "id": "pl-explicit-spitroast-subject",
    "name": "Spitroast Subject",
    "category": "explicit",
    "words": [
      "spitroast",
      "spit roast",
      "oral and vaginal",
      "two men",
      "front and back",
      "simultaneous",
      "double ended",
      "explicit spitroast"
    ],
    "description": "Spitroast subject — oral and penetration simultaneously from both ends",
    "thumbnail": "🍡",
    "isDefault": true
  },
  {
    "id": "pl-explicit-double-penetration-subject",
    "name": "Double Penetration Subject",
    "category": "explicit",
    "words": [
      "double penetration",
      "dp",
      "two insertions",
      "both holes",
      "vaginal and anal",
      "simultaneous",
      "explicit dp",
      "filled"
    ],
    "description": "Active double penetration — both openings filled simultaneously",
    "thumbnail": "🤜",
    "isDefault": true
  },
  {
    "id": "pl-explicit-futa-fucking-girl",
    "name": "Futa Fucking Girl",
    "category": "explicit",
    "words": [
      "futanari",
      "futa on female",
      "futa sex",
      "hermaphrodite",
      "penetration",
      "futa fucking",
      "explicit futa",
      "futa top"
    ],
    "description": "Futa-on-female active sex framing",
    "thumbnail": "⚧️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-girl-being-pegged",
    "name": "Girl Being Pegged",
    "category": "explicit",
    "words": [
      "pegging",
      "strap-on",
      "anal",
      "femdom",
      "receiving",
      "pegged",
      "strap on sex",
      "anal pegging",
      "explicit pegging"
    ],
    "description": "Receiving strap-on pegging — femdom anal act",
    "thumbnail": "🎯",
    "isDefault": true
  },
  {
    "id": "pl-explicit-squirting-mid-orgasm",
    "name": "Squirting / Mid-Orgasm",
    "category": "explicit",
    "words": [
      "squirting",
      "orgasm",
      "female ejaculation",
      "climax",
      "intense pleasure",
      "explicit",
      "gushing",
      "ahegao",
      "arching back"
    ],
    "description": "Active squirting orgasm — arching back, ahegao, female ejaculation",
    "thumbnail": "🌊",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mind-broken-ahegao-mid-act",
    "name": "Mind-Broken / Ahegao Mid-Act",
    "category": "explicit",
    "words": [
      "ahegao",
      "mind broken",
      "eyes rolled back",
      "tongue out",
      "during sex",
      "dissociated",
      "explicit",
      "orgasm face",
      "mind break"
    ],
    "description": "Mid-sex dissociated mind-break state — ahegao, eyes rolled, tongue out",
    "thumbnail": "💫",
    "isDefault": true
  },
  {
    "id": "pl-explicit-tentacle-violation-subject",
    "name": "Tentacle Violation Subject",
    "category": "explicit",
    "words": [
      "tentacle",
      "tentacle sex",
      "penetration",
      "tentacles inside",
      "explicit tentacle",
      "violated",
      "tentacle violation",
      "multiple tentacles"
    ],
    "description": "Active tentacle violation — multiple tentacles penetrating simultaneously",
    "thumbnail": "🌪️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-hypno-sex-slave",
    "name": "Hypno Sex Slave",
    "category": "explicit",
    "words": [
      "hypnosis",
      "hypnotized",
      "mind controlled",
      "sex slave",
      "obedient",
      "glazed eyes",
      "hypno",
      "controlled",
      "explicit hypnosis"
    ],
    "description": "Mid-hypnosis sex slave — glazed eyes, mind controlled, obedient",
    "thumbnail": "🔮",
    "isDefault": true
  },
  {
    "id": "pl-explicit-gloryhole-participant",
    "name": "Gloryhole Participant",
    "category": "explicit",
    "words": [
      "gloryhole",
      "glory hole",
      "through wall",
      "anonymous",
      "oral gloryhole",
      "explicit",
      "gloryhole use",
      "on knees"
    ],
    "description": "Active gloryhole participant — on knees, anonymous oral",
    "thumbnail": "🟣",
    "isDefault": true
  },
  {
    "id": "pl-explicit-cum-inflation-mid-act",
    "name": "Cum Inflation Mid-Act",
    "category": "explicit",
    "words": [
      "cum inflation",
      "belly inflation",
      "inflating",
      "belly bulge",
      "cum filling",
      "explicit",
      "inflation in progress",
      "womb expanding"
    ],
    "description": "Active cum inflation in progress — belly expanding, womb filling",
    "thumbnail": "🎈",
    "isDefault": true
  },
  {
    "id": "pl-explicit-lactation-mid-extraction",
    "name": "Lactation Mid-Extraction",
    "category": "explicit",
    "words": [
      "lactation",
      "milking",
      "breast milk",
      "extraction",
      "milk flowing",
      "explicit lactation",
      "milk spray",
      "active milking"
    ],
    "description": "Active milking/lactation extraction — milk flowing, in progress",
    "thumbnail": "🍼",
    "isDefault": true
  },
  {
    "id": "pl-explicit-oviposition-subject",
    "name": "Oviposition Subject",
    "category": "explicit",
    "words": [
      "oviposition",
      "egg laying",
      "eggs inside",
      "ovipositor",
      "explicit",
      "egg insertion",
      "egg filling",
      "tentacle eggs",
      "active oviposition"
    ],
    "description": "Active oviposition — eggs being laid inside, belly expanding",
    "thumbnail": "🥚",
    "isDefault": true
  }
```

- [ ] **Step 2: Run validation test**

```bash
cd swarmui-react && npx vitest run src/data/presetLibrary.validation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add swarmui-react/src/data/presetLibrary.json
git commit -m "feat(presets): add 18 explicit act-framed character presets"
```

---

### Task 6: Add Part 3 — Explicit In-The-Act Scenes (25)

**Files:**
- Modify: `swarmui-react/src/data/presetLibrary.json`

> Word arrays: action/act/state tags ONLY. No location tags.

- [ ] **Step 1: Append the 25 in-the-act scene presets**

```json
  {
    "id": "pl-explicit-mid-missionary-scene",
    "name": "Mid-Missionary Scene",
    "category": "explicit",
    "words": [
      "missionary position",
      "sex",
      "intercourse",
      "penetration",
      "explicit",
      "active sex",
      "in progress",
      "couple sex"
    ],
    "description": "Active in-progress missionary sex scene",
    "thumbnail": "🛏️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-doggy-style-scene",
    "name": "Mid-Doggy Style Scene",
    "category": "explicit",
    "words": [
      "doggy style",
      "from behind",
      "rear entry",
      "sex",
      "penetration",
      "explicit",
      "active",
      "doggy position",
      "rough sex"
    ],
    "description": "Active rear-entry doggy style sex in progress",
    "thumbnail": "🔙",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-cowgirl-ride",
    "name": "Active Cowgirl Ride",
    "category": "explicit",
    "words": [
      "cowgirl",
      "riding",
      "bouncing",
      "on top",
      "active sex",
      "explicit",
      "straddling",
      "riding cock",
      "cowgirl position"
    ],
    "description": "Active cowgirl ride in progress — bouncing, straddling",
    "thumbnail": "🏇",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-blowjob-scene",
    "name": "Mid-Blowjob Scene",
    "category": "explicit",
    "words": [
      "blowjob",
      "fellatio",
      "oral sex",
      "cock in mouth",
      "active oral",
      "explicit",
      "sucking",
      "blowjob in progress"
    ],
    "description": "Active blowjob oral sex in progress",
    "thumbnail": "👄",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-cunnilingus-scene",
    "name": "Mid-Cunnilingus Scene",
    "category": "explicit",
    "words": [
      "cunnilingus",
      "oral sex",
      "eating out",
      "explicit",
      "active oral",
      "licking",
      "receiving pleasure",
      "oral stimulation"
    ],
    "description": "Active cunnilingus oral sex in progress",
    "thumbnail": "🌼",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-spitroast-scene",
    "name": "Active Spitroast Scene",
    "category": "explicit",
    "words": [
      "spitroast",
      "both ends",
      "oral and penetration",
      "simultaneous",
      "two partners",
      "explicit",
      "spit roast active",
      "double team"
    ],
    "description": "Active spitroast — both ends simultaneously occupied",
    "thumbnail": "🍢",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-threesome-ffm",
    "name": "Mid-Threesome (FFM)",
    "category": "explicit",
    "words": [
      "threesome",
      "ffm",
      "two women one man",
      "group sex",
      "explicit",
      "three people",
      "ffm threesome",
      "triangle sex"
    ],
    "description": "Active FFM threesome — two women, one man, all engaged",
    "thumbnail": "🔺",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-threesome-mmf",
    "name": "Mid-Threesome (MMF)",
    "category": "explicit",
    "words": [
      "threesome",
      "mmf",
      "two men one woman",
      "group sex",
      "explicit",
      "three people",
      "mmf threesome",
      "double team"
    ],
    "description": "Active MMF threesome — two men, one woman, all engaged",
    "thumbnail": "🔵",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-gangbang-scene",
    "name": "Active Gangbang Scene",
    "category": "explicit",
    "words": [
      "gangbang",
      "multiple men",
      "group sex",
      "explicit",
      "orgy",
      "multiple partners",
      "gang bang active",
      "overwhelmed"
    ],
    "description": "Active gangbang scene — multiple partners all simultaneously engaged",
    "thumbnail": "🫂",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-anal-scene",
    "name": "Mid-Anal Scene",
    "category": "explicit",
    "words": [
      "anal sex",
      "anal",
      "explicit anal",
      "rear penetration",
      "anal intercourse",
      "active",
      "anal in progress",
      "explicit"
    ],
    "description": "Active anal sex in progress",
    "thumbnail": "🫣",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-69-scene",
    "name": "Mid-69 Scene",
    "category": "explicit",
    "words": [
      "69",
      "mutual oral",
      "sixty nine",
      "simultaneous oral",
      "explicit",
      "mutual pleasure",
      "69 position",
      "oral both"
    ],
    "description": "Active 69 position — simultaneous mutual oral sex",
    "thumbnail": "🔀",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-double-penetration",
    "name": "Active Double Penetration",
    "category": "explicit",
    "words": [
      "double penetration",
      "dp",
      "both holes",
      "vaginal and anal",
      "explicit",
      "dp in progress",
      "two insertions",
      "filled both"
    ],
    "description": "Active double penetration — both openings simultaneously filled",
    "thumbnail": "🤞",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-bondage-play-scene",
    "name": "Active Bondage Play Scene",
    "category": "explicit",
    "words": [
      "bondage",
      "tied up",
      "restrained",
      "rope",
      "bound",
      "explicit bdsm",
      "partner present",
      "bondage active",
      "helpless"
    ],
    "description": "Active bondage play session — tied, restrained, partner present and engaged",
    "thumbnail": "🧲",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-pet-play-scene",
    "name": "Active Pet Play Scene",
    "category": "explicit",
    "words": [
      "pet play",
      "collar",
      "leash",
      "on all fours",
      "handler",
      "pet roleplay",
      "explicit pet play",
      "active",
      "good girl"
    ],
    "description": "Active pet play — handler and pet mid-interaction",
    "thumbnail": "🦴",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-cnc-ravishment-scene",
    "name": "Mid-CNC / Ravishment Scene",
    "category": "explicit",
    "words": [
      "cnc",
      "ravishment",
      "resistance",
      "forced fantasy",
      "consensual non-consent",
      "roleplay",
      "held down",
      "explicit cnc",
      "rough"
    ],
    "description": "Consensual non-consent ravishment fantasy in progress",
    "thumbnail": "⚠️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-tentacle-scene",
    "name": "Active Tentacle Scene",
    "category": "explicit",
    "words": [
      "tentacle",
      "tentacles active",
      "penetration",
      "multiple tentacles",
      "explicit",
      "tentacle sex active",
      "tentacles wrapping",
      "violated"
    ],
    "description": "Active tentacle scene — multiple tentacles wrapping and penetrating",
    "thumbnail": "🐚",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-pegging-scene",
    "name": "Active Pegging Scene",
    "category": "explicit",
    "words": [
      "pegging",
      "strap-on",
      "femdom",
      "strap on active",
      "explicit pegging",
      "anal pegging",
      "dominant female",
      "in progress"
    ],
    "description": "Active strap-on pegging in progress",
    "thumbnail": "🔁",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-wax-play-scene",
    "name": "Mid-Wax Play Scene",
    "category": "explicit",
    "words": [
      "wax play",
      "candle wax dripping",
      "hot wax",
      "sensation",
      "bdsm",
      "explicit wax",
      "melting wax",
      "body wax"
    ],
    "description": "Active wax play — hot candle wax dripping onto skin",
    "thumbnail": "🕯️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-hypno-scene",
    "name": "Active Hypno Scene",
    "category": "explicit",
    "words": [
      "hypnosis",
      "mind control",
      "glazed eyes",
      "trance",
      "explicit hypno",
      "obedient",
      "hypnotized active",
      "blank expression"
    ],
    "description": "Active hypnosis scene — subject in trance, responding to commands",
    "thumbnail": "🌠",
    "isDefault": true
  },
  {
    "id": "pl-explicit-gloryhole-in-use-scene",
    "name": "Gloryhole In-Use Scene",
    "category": "explicit",
    "words": [
      "gloryhole",
      "anonymous",
      "through wall",
      "explicit",
      "gloryhole active",
      "glory hole use",
      "oral anonymous",
      "in use"
    ],
    "description": "Active gloryhole in use — anonymous encounter through the wall",
    "thumbnail": "🪤",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-orgasm-climax-scene",
    "name": "Mid-Orgasm / Climax Scene",
    "category": "explicit",
    "words": [
      "orgasm",
      "climax",
      "ahegao",
      "arching back",
      "intense pleasure",
      "explicit orgasm",
      "mid climax",
      "cumming",
      "peak pleasure"
    ],
    "description": "Active climax moment — arching back, ahegao, peak pleasure",
    "thumbnail": "💥",
    "isDefault": true
  },
  {
    "id": "pl-explicit-active-squirting-scene",
    "name": "Active Squirting Scene",
    "category": "explicit",
    "words": [
      "squirting",
      "female ejaculation",
      "gushing",
      "explicit squirt",
      "fluid release",
      "orgasm squirt",
      "wet orgasm",
      "squirting active"
    ],
    "description": "Active squirting / female ejaculation in progress",
    "thumbnail": "🫧",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mid-creampie-scene",
    "name": "Mid-Creampie Scene",
    "category": "explicit",
    "words": [
      "creampie",
      "internal",
      "filling",
      "explicit",
      "finishing inside",
      "creampie in progress",
      "cum inside",
      "internal cumshot"
    ],
    "description": "Active creampie — internal cumshot happening, filling in progress",
    "thumbnail": "💧",
    "isDefault": true
  },
  {
    "id": "pl-explicit-cum-shower-scene",
    "name": "Cum Shower Scene",
    "category": "explicit",
    "words": [
      "cum shower",
      "multiple cumshots",
      "cum all over",
      "covered",
      "explicit",
      "gangbang finish",
      "cum shower active",
      "splattered"
    ],
    "description": "Multiple sources covering subject simultaneously — cum shower in progress",
    "thumbnail": "🚿",
    "isDefault": true
  },
  {
    "id": "pl-explicit-exhausted-aftermath-scene",
    "name": "Exhausted Aftermath Scene",
    "category": "explicit",
    "words": [
      "exhausted",
      "used",
      "aftermath",
      "post sex",
      "leaking",
      "disheveled",
      "thoroughly used",
      "satisfied",
      "multiple rounds",
      "worn out"
    ],
    "description": "Post-multiple-rounds exhausted aftermath — used, leaking, satisfied",
    "thumbnail": "😵",
    "isDefault": true
  }
```

- [ ] **Step 2: Run validation test**

```bash
cd swarmui-react && npx vitest run src/data/presetLibrary.validation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add swarmui-react/src/data/presetLibrary.json
git commit -m "feat(presets): add 25 explicit in-the-act scene presets"
```

---

## Chunk 4: Quality Pass + Final Validation

### Task 7: Run quality-pass script and verify final count

**Files:**
- Read: `swarmui-react/scripts/quality-pass-preset-library.mjs`

- [ ] **Step 1: Run the quality-pass deduplication script**

```bash
cd swarmui-react && node scripts/quality-pass-preset-library.mjs
```

Expected: Script runs without errors. Reports any deduplicated word arrays.

- [ ] **Step 2: Run the full validation test suite**

```bash
cd swarmui-react && npx vitest run src/data/presetLibrary.validation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Verify total count**

```bash
cd swarmui-react && node -e "
const data = require('./src/data/presetLibrary.json');
const byCategory = {};
data.forEach(p => {
  if (!byCategory[p.category]) byCategory[p.category] = 0;
  byCategory[p.category]++;
});
console.log('Total:', data.length);
Object.entries(byCategory).forEach(([c, n]) => console.log(c + ':', n));
"
```

Expected:
- Total: 305
- characters: 83 (53 existing + 30 new)
- explicit: 100 (35 existing + 65 new)
- scenes: 43 (unchanged)
- styles: 40 (unchanged)
- perspectives: 39 (unchanged)

- [ ] **Step 4: Commit final state**

```bash
git add swarmui-react/src/data/presetLibrary.json
git commit -m "feat(presets): run quality-pass on explicit expansion library"
```
