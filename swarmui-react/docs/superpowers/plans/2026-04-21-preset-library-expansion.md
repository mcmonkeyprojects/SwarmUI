# Preset Library Expansion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 111 new default presets to `src/data/presetLibrary.json` across all five categories (characters, scenes, styles, perspectives, explicit).

**Architecture:** Pure data addition — append new JSON objects to the existing array in `presetLibrary.json`. No schema changes, no code changes, no UI changes. After insertion, run the existing quality-pass script to deduplicate word arrays.

**Tech Stack:** JSON, Node.js (for quality-pass script), Vitest (for validation test)

**Spec:** `docs/superpowers/specs/2026-04-21-preset-library-expansion-design.md`

---

## Key Rules for Word Arrays

**Perspectives presets** — use camera/framing/composition tags only. Do NOT include act/anatomy tags. Examples: `pov, from below, first-person view, looking up at viewer, overhead shot`

**Explicit presets** — use act/anatomy/position tags. Do NOT duplicate scene location tags from the scenes category.

**"Exhibitionism / Public Flashing" (explicit)** — act-focused tags (`exhibitionism, flashing, public nudity, thrill`) — no location tags that duplicate the "Public / Exhibitionist" scene preset.

**"Succubus Nun" vs "Corrupted Nun"** — Succubus Nun retains demonic anatomy (horns, tail, wings, markings). Corrupted Nun is gothic/fallen-angel. Keep word arrays distinct.

**"Male Barbarian" vs "Amazonian / Barbarian"** — Male Barbarian uses `1boy, muscular male, loincloth, greatsword`. Amazonian is female-coded.

---

## Files

- **Modify:** `src/data/presetLibrary.json` — append 111 new preset objects
- **Create:** `src/data/presetLibrary.validation.test.ts` — schema + duplicate validation

---

## Chunk 1: Validation Test + Characters

### Task 1: Write validation test

**Files:**
- Create: `src/data/presetLibrary.validation.test.ts`

- [ ] **Step 1: Create the validation test file**

```typescript
// src/data/presetLibrary.validation.test.ts
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
      expect(PRESET_CATEGORIES).toContain(p.category);
      expect(Array.isArray(p.words), `${p.id} words not array`).toBe(true);
      expect(p.words.length, `${p.id} has no words`).toBeGreaterThan(0);
      expect(p.isDefault, `${p.id} isDefault not true`).toBe(true);
    }
  });

  it('all ids are unique', () => {
    const ids = library.map(p => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all names are unique', () => {
    const names = library.map(p => p.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('ids follow pl-<category>-<slug> convention', () => {
    for (const p of library) {
      expect(p.id, `${p.name} id wrong format`).toMatch(/^pl-(characters|scenes|styles|perspectives|explicit)-[a-z0-9-]+$/);
    }
  });

  it('each preset has 6-20 words', () => {
    for (const p of library) {
      expect(p.words.length, `${p.id} has ${p.words.length} words`).toBeGreaterThanOrEqual(6);
      expect(p.words.length, `${p.id} has ${p.words.length} words`).toBeLessThanOrEqual(20);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes against existing library**

```bash
cd swarmui-react && npx vitest run src/data/presetLibrary.validation.test.ts
```

Expected: All tests PASS (the existing library is valid).

- [ ] **Step 3: Commit**

```bash
git add swarmui-react/src/data/presetLibrary.validation.test.ts
git commit -m "test: add presetLibrary schema and uniqueness validation"
```

---

### Task 2: Add Characters presets (17 new)

**Files:**
- Modify: `src/data/presetLibrary.json`

- [ ] **Step 1: Append the 17 character presets to presetLibrary.json**

Find the last `}` before the closing `]` in the file and append a `,` then these entries:

```json
  {
    "id": "pl-characters-shrine-maiden-miko",
    "name": "Shrine Maiden / Miko",
    "category": "characters",
    "words": [
      "miko",
      "shrine maiden",
      "hakama",
      "white kimono top",
      "red hakama",
      "torii gate",
      "japanese shrine",
      "black hair",
      "sacred",
      "spiritual"
    ],
    "description": "A Japanese shrine maiden in traditional miko robes",
    "thumbnail": "⛩️",
    "isDefault": true
  },
  {
    "id": "pl-characters-kunoichi-female-ninja",
    "name": "Kunoichi / Female Ninja",
    "category": "characters",
    "words": [
      "kunoichi",
      "female ninja",
      "ninja outfit",
      "black bodysuit",
      "kunai",
      "stealth",
      "shadow",
      "dark clothing",
      "shinobi",
      "katana"
    ],
    "description": "A stealthy female ninja in dark shinobi gear",
    "thumbnail": "🥷",
    "isDefault": true
  },
  {
    "id": "pl-characters-idol-pop-star",
    "name": "Idol / Pop Star",
    "category": "characters",
    "words": [
      "idol",
      "pop star",
      "stage costume",
      "microphone",
      "colorful outfit",
      "sparkles",
      "stage lights",
      "j-pop",
      "concert",
      "cute",
      "energetic"
    ],
    "description": "A J/K-pop idol performer on stage",
    "thumbnail": "🎤",
    "isDefault": true
  },
  {
    "id": "pl-characters-delinquent-yankee-girl",
    "name": "Delinquent / Yankee Girl",
    "category": "characters",
    "words": [
      "yankee girl",
      "delinquent",
      "modified school uniform",
      "long skirt",
      "bleached hair",
      "sukeban",
      "rebellious",
      "tough expression",
      "cigarette"
    ],
    "description": "A tough Japanese delinquent girl with sukeban style",
    "thumbnail": "🚬",
    "isDefault": true
  },
  {
    "id": "pl-characters-ojou-sama-heiress",
    "name": "Ojou-sama / Heiress",
    "category": "characters",
    "words": [
      "ojou-sama",
      "rich girl",
      "elegant dress",
      "curly blonde hair",
      "pearl necklace",
      "high society",
      "refined",
      "proud expression",
      "white gloves",
      "luxury"
    ],
    "description": "A refined wealthy heiress with aristocratic elegance",
    "thumbnail": "👑",
    "isDefault": true
  },
  {
    "id": "pl-characters-succubus-nun",
    "name": "Succubus Nun",
    "category": "characters",
    "words": [
      "succubus",
      "nun habit",
      "demon horns",
      "demon tail",
      "demon wings",
      "glowing eyes",
      "demonic markings",
      "black habit",
      "seductive expression",
      "unholy"
    ],
    "description": "A demon inhabiting a nun's habit, retaining horns, tail, and wings",
    "thumbnail": "😈",
    "isDefault": true
  },
  {
    "id": "pl-characters-male-rogue-assassin",
    "name": "Male Rogue / Assassin",
    "category": "characters",
    "words": [
      "1boy",
      "solo male",
      "rogue",
      "assassin",
      "dark hood",
      "daggers",
      "leather armor",
      "masked",
      "shadow",
      "agile build"
    ],
    "description": "A hooded male rogue with daggers and leather armor",
    "thumbnail": "🗡️",
    "isDefault": true
  },
  {
    "id": "pl-characters-male-hunter-ranger",
    "name": "Male Hunter / Ranger",
    "category": "characters",
    "words": [
      "1boy",
      "solo male",
      "hunter",
      "ranger",
      "bow and arrow",
      "leather armor",
      "quiver",
      "cloak",
      "rugged",
      "outdoorsman"
    ],
    "description": "A rugged male hunter with bow and forest gear",
    "thumbnail": "🏹",
    "isDefault": true
  },
  {
    "id": "pl-characters-male-priest-cleric",
    "name": "Male Priest / Cleric",
    "category": "characters",
    "words": [
      "1boy",
      "solo male",
      "priest",
      "cleric",
      "holy robes",
      "holy symbol",
      "divine magic",
      "staff",
      "religious",
      "white robes"
    ],
    "description": "A holy male cleric in divine robes",
    "thumbnail": "✝️",
    "isDefault": true
  },
  {
    "id": "pl-characters-male-barbarian",
    "name": "Male Barbarian",
    "category": "characters",
    "words": [
      "1boy",
      "solo male",
      "barbarian",
      "muscular male",
      "loincloth",
      "fur pelt",
      "greatsword",
      "battle-scarred",
      "rugged",
      "shirtless"
    ],
    "description": "A Conan-style male barbarian warrior, male-coded with loincloth and greatsword",
    "thumbnail": "⚔️",
    "isDefault": true
  },
  {
    "id": "pl-characters-orc-half-orc",
    "name": "Orc / Half-Orc",
    "category": "characters",
    "words": [
      "orc",
      "green skin",
      "tusks",
      "muscular",
      "tribal armor",
      "fierce expression",
      "fantasy creature",
      "warrior",
      "intimidating"
    ],
    "description": "A green-skinned orc or half-orc fantasy warrior",
    "thumbnail": "🟢",
    "isDefault": true
  },
  {
    "id": "pl-characters-alien-girl",
    "name": "Alien Girl",
    "category": "characters",
    "words": [
      "alien girl",
      "1girl",
      "extraterrestrial",
      "blue skin",
      "large eyes",
      "sci-fi",
      "otherworldly",
      "exotic features",
      "space",
      "non-human"
    ],
    "description": "A sci-fi alien girl with exotic non-human features",
    "thumbnail": "👽",
    "isDefault": true
  },
  {
    "id": "pl-characters-witch-occultist",
    "name": "Witch / Occultist",
    "category": "characters",
    "words": [
      "witch",
      "1girl",
      "occultist",
      "pointed hat",
      "spell book",
      "candles",
      "potion",
      "mystical",
      "herbs",
      "magic circle"
    ],
    "description": "A folk witch or occultist with candles and spell books",
    "thumbnail": "🔮",
    "isDefault": true
  },
  {
    "id": "pl-characters-cheerleader-athlete",
    "name": "Cheerleader / Athlete",
    "category": "characters",
    "words": [
      "cheerleader",
      "1girl",
      "pom poms",
      "short skirt",
      "school uniform",
      "energetic",
      "sporty",
      "ponytail",
      "athletic",
      "team colors"
    ],
    "description": "A sporty cheerleader in team colors with pom poms",
    "thumbnail": "📣",
    "isDefault": true
  },
  {
    "id": "pl-characters-egyptian-pharaoh-girl",
    "name": "Egyptian / Pharaoh Girl",
    "category": "characters",
    "words": [
      "egyptian",
      "1girl",
      "gold headdress",
      "nemes headcloth",
      "gold jewelry",
      "kohl eyes",
      "white linen dress",
      "ankh",
      "ancient egypt",
      "collar necklace"
    ],
    "description": "An ancient Egyptian pharaoh girl adorned in gold jewelry and headdress",
    "thumbnail": "🐍",
    "isDefault": true
  },
  {
    "id": "pl-characters-viking-shield-maiden",
    "name": "Viking Shield-Maiden",
    "category": "characters",
    "words": [
      "shield maiden",
      "1girl",
      "viking",
      "norse",
      "braided hair",
      "fur cloak",
      "shield",
      "axe",
      "battle armor",
      "warrior woman"
    ],
    "description": "A Norse viking shield-maiden warrior woman",
    "thumbnail": "🛡️",
    "isDefault": true
  },
  {
    "id": "pl-characters-gangster-yakuza-girl",
    "name": "Gangster / Yakuza Girl",
    "category": "characters",
    "words": [
      "yakuza",
      "1girl",
      "tattoos",
      "pinstripe suit",
      "sharp fashion",
      "sunglasses",
      "criminal",
      "japanese mafia",
      "tattoo sleeves",
      "intimidating expression"
    ],
    "description": "A tattooed yakuza or gangster girl in sharp criminal fashion",
    "thumbnail": "🔱",
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
git commit -m "feat(presets): add 17 new character presets"
```

---

### Task 3: Add Scenes presets (15 new)

**Files:**
- Modify: `src/data/presetLibrary.json`

- [ ] **Step 1: Append the 15 scene presets**

```json
  {
    "id": "pl-scenes-classroom-school",
    "name": "Classroom / School",
    "category": "scenes",
    "words": [
      "classroom",
      "school interior",
      "blackboard",
      "school desks",
      "chalk",
      "windows",
      "after school",
      "fluorescent lighting",
      "school chairs"
    ],
    "description": "A classic school classroom with desks and blackboard",
    "thumbnail": "🏫",
    "isDefault": true
  },
  {
    "id": "pl-scenes-dressing-room-backstage",
    "name": "Dressing Room / Backstage",
    "category": "scenes",
    "words": [
      "dressing room",
      "backstage",
      "mirror",
      "vanity lights",
      "makeup table",
      "costumes hanging",
      "changing room",
      "intimate setting"
    ],
    "description": "A backstage dressing room with vanity mirror and lights",
    "thumbnail": "🪞",
    "isDefault": true
  },
  {
    "id": "pl-scenes-hospital-nurses-office",
    "name": "Hospital / Nurse's Office",
    "category": "scenes",
    "words": [
      "hospital room",
      "nurse office",
      "medical bed",
      "white walls",
      "medical equipment",
      "clinical setting",
      "curtains",
      "sterile environment"
    ],
    "description": "A clinical hospital room or nurse's office",
    "thumbnail": "🏥",
    "isDefault": true
  },
  {
    "id": "pl-scenes-greenhouse-conservatory",
    "name": "Greenhouse / Conservatory",
    "category": "scenes",
    "words": [
      "greenhouse",
      "conservatory",
      "glass ceiling",
      "tropical plants",
      "lush greenery",
      "sunlight through glass",
      "botanical garden",
      "plant pots",
      "humid atmosphere"
    ],
    "description": "A lush greenhouse with glass ceiling and tropical plants",
    "thumbnail": "🌿",
    "isDefault": true
  },
  {
    "id": "pl-scenes-tropical-jungle-rainforest",
    "name": "Tropical Jungle / Rainforest",
    "category": "scenes",
    "words": [
      "tropical jungle",
      "rainforest",
      "dense foliage",
      "tropical trees",
      "dappled sunlight",
      "exotic plants",
      "vines",
      "lush vegetation",
      "waterfall"
    ],
    "description": "A dense tropical jungle with dappled light and exotic foliage",
    "thumbnail": "🌴",
    "isDefault": true
  },
  {
    "id": "pl-scenes-ancient-ruins-temple-exterior",
    "name": "Ancient Ruins / Temple Exterior",
    "category": "scenes",
    "words": [
      "ancient ruins",
      "stone temple",
      "overgrown",
      "vines on stone",
      "crumbling pillars",
      "jungle ruins",
      "moss covered stone",
      "archaeological site",
      "atmospheric"
    ],
    "description": "Overgrown ancient stone ruins with crumbling pillars",
    "thumbnail": "🏛️",
    "isDefault": true
  },
  {
    "id": "pl-scenes-crystal-cave-gem-grotto",
    "name": "Crystal Cave / Gem Grotto",
    "category": "scenes",
    "words": [
      "crystal cave",
      "gem grotto",
      "glowing crystals",
      "stalactites",
      "blue light",
      "magical underground",
      "sparkling gems",
      "cave interior",
      "bioluminescent"
    ],
    "description": "A magical underground crystal cave with glowing gems",
    "thumbnail": "💎",
    "isDefault": true
  },
  {
    "id": "pl-scenes-spaceship-interior-cockpit",
    "name": "Spaceship Interior / Cockpit",
    "category": "scenes",
    "words": [
      "spaceship interior",
      "cockpit",
      "control panels",
      "holographic displays",
      "space view through window",
      "sci-fi interior",
      "futuristic technology",
      "starship"
    ],
    "description": "A sci-fi spaceship cockpit with holograms and star views",
    "thumbnail": "🚀",
    "isDefault": true
  },
  {
    "id": "pl-scenes-research-laboratory",
    "name": "Research Laboratory",
    "category": "scenes",
    "words": [
      "laboratory",
      "research lab",
      "scientific equipment",
      "test tubes",
      "computer screens",
      "white lab",
      "neon lighting",
      "microscopes",
      "scientific setting"
    ],
    "description": "A sterile or chaotic research laboratory",
    "thumbnail": "🧪",
    "isDefault": true
  },
  {
    "id": "pl-scenes-swimming-pool-poolside-night",
    "name": "Swimming Pool / Poolside Night",
    "category": "scenes",
    "words": [
      "swimming pool",
      "poolside",
      "night",
      "pool water",
      "reflected lights",
      "underwater pool lights",
      "luxury pool",
      "night sky",
      "deck chairs"
    ],
    "description": "A luxury swimming pool at night with underwater lights",
    "thumbnail": "🏊",
    "isDefault": true
  },
  {
    "id": "pl-scenes-strip-club-stage",
    "name": "Strip Club Stage",
    "category": "scenes",
    "words": [
      "strip club",
      "stage",
      "stripper pole",
      "neon lights",
      "audience in shadow",
      "red lighting",
      "adult club",
      "spotlight",
      "stage performance"
    ],
    "description": "A dimly lit strip club stage with pole and red neon",
    "thumbnail": "💃",
    "isDefault": true
  },
  {
    "id": "pl-scenes-rooftop-garden-urban-terrace",
    "name": "Rooftop Garden / Urban Terrace",
    "category": "scenes",
    "words": [
      "rooftop garden",
      "urban terrace",
      "city skyline",
      "potted plants",
      "city view",
      "outdoor furniture",
      "night city",
      "rooftop",
      "evening"
    ],
    "description": "A lush rooftop garden terrace with city skyline backdrop",
    "thumbnail": "🪴",
    "isDefault": true
  },
  {
    "id": "pl-scenes-autumn-forest-fall-foliage",
    "name": "Autumn Forest / Fall Foliage",
    "category": "scenes",
    "words": [
      "autumn forest",
      "fall foliage",
      "orange leaves",
      "red leaves",
      "falling leaves",
      "forest path",
      "golden light",
      "seasonal",
      "maple trees"
    ],
    "description": "A vibrant autumn forest with orange and red fall foliage",
    "thumbnail": "🍂",
    "isDefault": true
  },
  {
    "id": "pl-scenes-viking-hall-mead-hall",
    "name": "Viking Hall / Mead Hall",
    "category": "scenes",
    "words": [
      "viking hall",
      "mead hall",
      "longhouse interior",
      "fireplace",
      "wooden beams",
      "torchlight",
      "feast table",
      "norse interior",
      "animal pelts"
    ],
    "description": "A Norse mead hall with torchlight and feast tables",
    "thumbnail": "🍺",
    "isDefault": true
  },
  {
    "id": "pl-scenes-private-jet-interior",
    "name": "Private Jet Interior",
    "category": "scenes",
    "words": [
      "private jet",
      "luxury interior",
      "leather seats",
      "aircraft interior",
      "clouds outside window",
      "luxury travel",
      "gold accents",
      "champagne",
      "private aircraft"
    ],
    "description": "A luxurious private jet interior with leather seats and gold accents",
    "thumbnail": "✈️",
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
git commit -m "feat(presets): add 15 new scene presets"
```

---

## Chunk 2: Styles + Perspectives

### Task 4: Add Styles presets (15 new)

**Files:**
- Modify: `src/data/presetLibrary.json`

- [ ] **Step 1: Append the 15 style presets**

```json
  {
    "id": "pl-styles-ukiyo-e-woodblock-print",
    "name": "Ukiyo-e / Woodblock Print",
    "category": "styles",
    "words": [
      "ukiyo-e",
      "woodblock print",
      "japanese art",
      "flat colors",
      "bold outlines",
      "traditional japanese",
      "edo period style",
      "decorative patterns",
      "floating world art"
    ],
    "description": "Traditional Japanese ukiyo-e woodblock print aesthetic",
    "thumbnail": "🎴",
    "isDefault": true
  },
  {
    "id": "pl-styles-cel-shaded-toon",
    "name": "Cel-Shaded / Toon",
    "category": "styles",
    "words": [
      "cel shading",
      "toon shading",
      "bold outlines",
      "flat colors",
      "cartoon aesthetic",
      "thick outlines",
      "anime cel shade",
      "vibrant flat fills"
    ],
    "description": "Bold cel-shaded cartoon look with thick outlines and flat fills",
    "thumbnail": "🎨",
    "isDefault": true
  },
  {
    "id": "pl-styles-low-poly-3d",
    "name": "Low-Poly 3D",
    "category": "styles",
    "words": [
      "low poly",
      "geometric",
      "faceted",
      "3d art",
      "polygon art",
      "angular shapes",
      "minimal geometry",
      "digital art",
      "abstract 3d"
    ],
    "description": "Geometric low-polygon 3D art with faceted angular forms",
    "thumbnail": "🔺",
    "isDefault": true
  },
  {
    "id": "pl-styles-digital-glitch-vaporwave",
    "name": "Digital Glitch / Vaporwave",
    "category": "styles",
    "words": [
      "glitch art",
      "vaporwave",
      "rgb split",
      "chromatic aberration",
      "digital distortion",
      "scanlines",
      "neon colors",
      "retro digital",
      "vhs effect",
      "pixel corruption"
    ],
    "description": "Vaporwave aesthetic with RGB glitch, scanlines, and digital distortion",
    "thumbnail": "📺",
    "isDefault": true
  },
  {
    "id": "pl-styles-concept-art-sketch",
    "name": "Concept Art Sketch",
    "category": "styles",
    "words": [
      "concept art",
      "sketch",
      "loose lines",
      "pencil drawing",
      "marker art",
      "rough sketch",
      "design sketch",
      "line art",
      "gestural drawing"
    ],
    "description": "Loose pencil and marker concept art sketch with unfinished energy",
    "thumbnail": "✏️",
    "isDefault": true
  },
  {
    "id": "pl-styles-moe-bishoujo",
    "name": "Moe / Bishoujo",
    "category": "styles",
    "words": [
      "moe",
      "bishoujo",
      "cute anime style",
      "soft shading",
      "pastel colors",
      "large eyes",
      "kawaii",
      "feminine",
      "soft anime aesthetic"
    ],
    "description": "Soft moe bishoujo anime style focused on cute feminine characters",
    "thumbnail": "🌸",
    "isDefault": true
  },
  {
    "id": "pl-styles-seinen-mature-anime",
    "name": "Seinen / Mature Anime",
    "category": "styles",
    "words": [
      "seinen",
      "mature anime",
      "detailed linework",
      "gritty art",
      "realistic proportions",
      "dark themes",
      "detailed rendering",
      "adult anime style",
      "complex shading"
    ],
    "description": "Gritty seinen anime style with realistic proportions and dark themes",
    "thumbnail": "⚡",
    "isDefault": true
  },
  {
    "id": "pl-styles-yaoi-bl-art-style",
    "name": "Yaoi / BL Art Style",
    "category": "styles",
    "words": [
      "yaoi",
      "boys love",
      "bl manga",
      "bishonen",
      "slender male",
      "soft shading",
      "romantic art",
      "male romance",
      "delicate male features",
      "shounen ai style"
    ],
    "description": "Boys' Love art style with slender bishonen males and soft romantic shading",
    "thumbnail": "💙",
    "isDefault": true
  },
  {
    "id": "pl-styles-art-deco",
    "name": "Art Deco",
    "category": "styles",
    "words": [
      "art deco",
      "geometric luxury",
      "gold and black",
      "streamlined forms",
      "ornamental",
      "1920s style",
      "decorative geometry",
      "chevrons",
      "symmetrical design"
    ],
    "description": "Art Deco aesthetic with geometric luxury, gold and black, streamlined forms",
    "thumbnail": "🏆",
    "isDefault": true
  },
  {
    "id": "pl-styles-impressionist-painterly",
    "name": "Impressionist / Painterly",
    "category": "styles",
    "words": [
      "impressionist",
      "painterly",
      "loose brushwork",
      "oil painting",
      "soft focus",
      "impressionism",
      "visible brushstrokes",
      "light and color",
      "atmospheric painting"
    ],
    "description": "Impressionist painterly style with loose brushwork and atmospheric light",
    "thumbnail": "🖌️",
    "isDefault": true
  },
  {
    "id": "pl-styles-street-art-graffiti",
    "name": "Street Art / Graffiti",
    "category": "styles",
    "words": [
      "street art",
      "graffiti",
      "spray paint",
      "urban art",
      "stencil art",
      "bold colors",
      "wall mural",
      "urban aesthetic",
      "tag art"
    ],
    "description": "Urban street art and graffiti aesthetic with spray paint texture",
    "thumbnail": "🎭",
    "isDefault": true
  },
  {
    "id": "pl-styles-infrared-photography",
    "name": "Infrared Photography",
    "category": "styles",
    "words": [
      "infrared photography",
      "infrared",
      "white foliage",
      "dark sky",
      "ethereal landscape",
      "false color",
      "dreamlike photography",
      "surreal photography",
      "monochrome infrared"
    ],
    "description": "Infrared photography with ghostly white foliage and dark dramatic skies",
    "thumbnail": "📷",
    "isDefault": true
  },
  {
    "id": "pl-styles-light-novel-illustration",
    "name": "Light Novel Illustration",
    "category": "styles",
    "words": [
      "light novel",
      "light novel illustration",
      "isekai art",
      "ln cover art",
      "soft gradient",
      "polished anime",
      "commercial anime art",
      "volume cover art"
    ],
    "description": "Polished isekai light novel cover illustration style",
    "thumbnail": "📚",
    "isDefault": true
  },
  {
    "id": "pl-styles-futanari-art-style",
    "name": "Futanari / Dickgirl Art Style",
    "category": "styles",
    "words": [
      "futanari",
      "futa",
      "detailed anatomy",
      "soft shading",
      "anime style",
      "hermaphrodite",
      "explicit anatomy detail",
      "adult anime art"
    ],
    "description": "Futa-specific rendering style focusing on anatomy detail and soft shading. Kept in styles (not explicit) as it describes a rendering approach.",
    "thumbnail": "💅",
    "isDefault": true
  },
  {
    "id": "pl-styles-body-horror-grotesque",
    "name": "Body Horror / Grotesque",
    "category": "styles",
    "words": [
      "body horror",
      "grotesque",
      "junji ito style",
      "dark surrealism",
      "disturbing imagery",
      "horror art",
      "cosmic horror",
      "distorted anatomy",
      "dark fantasy horror"
    ],
    "description": "Dark body horror aesthetic in the style of Junji Ito and Cronenberg",
    "thumbnail": "💀",
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
git commit -m "feat(presets): add 15 new style presets"
```

---

### Task 5: Add Perspectives presets (22 new)

**Files:**
- Modify: `src/data/presetLibrary.json`

> **IMPORTANT:** Perspectives word arrays use camera/framing tags only — NOT act/anatomy tags. This keeps them distinct from paired explicit presets.

- [ ] **Step 1: Append the 22 perspective presets**

```json
  {
    "id": "pl-perspectives-missionary-pov",
    "name": "Missionary POV",
    "category": "perspectives",
    "words": [
      "pov",
      "from below",
      "looking up at partner",
      "first person view",
      "lying down pov",
      "intimate lying angle",
      "upward intimate pov"
    ],
    "description": "Looking up at partner from below in missionary position framing",
    "thumbnail": "👀",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-prone-bone-mating-press-pov",
    "name": "Prone Bone / Mating Press POV",
    "category": "perspectives",
    "words": [
      "pov",
      "top down angle",
      "pinning pov",
      "looking down",
      "overhead intimate angle",
      "from above pov",
      "pressing down view"
    ],
    "description": "Top-down pinning angle looking down at subject being held",
    "thumbnail": "🗜️",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-standing-against-wall-pov",
    "name": "Standing Against Wall POV",
    "category": "perspectives",
    "words": [
      "pov",
      "against wall",
      "standing pov",
      "vertical angle",
      "wall behind subject",
      "standing shot pov",
      "upright pov"
    ],
    "description": "First-person vertical standing angle with subject against wall",
    "thumbnail": "🪨",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-kneeling-worship-view",
    "name": "Kneeling / Worship View",
    "category": "perspectives",
    "words": [
      "low angle",
      "from below",
      "looking up",
      "dominant figure above",
      "worship angle",
      "upward perspective",
      "kneeling viewer pov"
    ],
    "description": "Low angle looking up at a dominant figure from a kneeling viewpoint",
    "thumbnail": "🙇",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-spread-eagle-overhead",
    "name": "Spread Eagle Overhead",
    "category": "perspectives",
    "words": [
      "top down view",
      "overhead shot",
      "bird's eye",
      "spread from above",
      "looking down",
      "aerial body shot",
      "overhead full body"
    ],
    "description": "Overhead top-down view of a subject spread out below",
    "thumbnail": "⬛",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-face-expression-close-up",
    "name": "Face / Expression Close-Up",
    "category": "perspectives",
    "words": [
      "extreme close up",
      "face close up",
      "expression focus",
      "facial detail",
      "tight crop face",
      "emotion close up",
      "portrait crop extreme"
    ],
    "description": "Extreme close-up tightly cropped on the face and expression",
    "thumbnail": "😳",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-doggy-style-from-behind-pov",
    "name": "Doggy Style from Behind POV",
    "category": "perspectives",
    "words": [
      "pov",
      "from behind",
      "rear pov",
      "behind view pov",
      "back angle pov",
      "rearward pov shot"
    ],
    "description": "First-person camera angle from directly behind subject",
    "thumbnail": "🔙",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-penetration-close-up",
    "name": "Penetration Close-Up",
    "category": "perspectives",
    "words": [
      "extreme close up",
      "detail shot",
      "macro close up",
      "insertion detail",
      "tight crop",
      "explicit detail focus",
      "close up shot"
    ],
    "description": "Extreme macro close-up detail shot on the point of contact",
    "thumbnail": "🔍",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-pussy-spread-vulva-focus",
    "name": "Pussy Spread / Vulva Focus",
    "category": "perspectives",
    "words": [
      "close up",
      "detail focus",
      "spread focus",
      "explicit close up",
      "vulva detail",
      "anatomy close up",
      "spread shot"
    ],
    "description": "Close-up framing focused on vulva detail",
    "thumbnail": "🌹",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-anal-spread-focus",
    "name": "Anal Spread Focus",
    "category": "perspectives",
    "words": [
      "close up",
      "rear detail",
      "from behind close up",
      "rear anatomy close up",
      "spread rear detail",
      "explicit rear framing"
    ],
    "description": "Close-up framing focused on rear anatomy detail",
    "thumbnail": "🍑",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-handjob-pov",
    "name": "Handjob POV",
    "category": "perspectives",
    "words": [
      "pov",
      "hand pov",
      "first person",
      "from above hand angle",
      "hand focus pov",
      "manual pov"
    ],
    "description": "First-person downward angle from hand level",
    "thumbnail": "✋",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-cumshot-incoming-pov",
    "name": "Cumshot Incoming POV",
    "category": "perspectives",
    "words": [
      "pov",
      "facial pov",
      "looking up at",
      "incoming pov",
      "first person facial angle",
      "looking down at viewer"
    ],
    "description": "First-person angle looking up toward subject from facial shot perspective",
    "thumbnail": "💦",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-creampie-closeup-drip-shot",
    "name": "Creampie Closeup / Drip Shot",
    "category": "perspectives",
    "words": [
      "close up",
      "aftermath detail",
      "drip shot",
      "macro close up",
      "explicit aftermath",
      "detail focus shot"
    ],
    "description": "Macro close-up framing on aftermath/drip detail",
    "thumbnail": "🩸",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-pegging-femdom-pov",
    "name": "Pegging / Femdom POV",
    "category": "perspectives",
    "words": [
      "pov",
      "receiver pov",
      "from below looking up",
      "femdom pov",
      "strap-on pov",
      "submissive pov angle"
    ],
    "description": "Receiver's upward POV looking up at dominant partner",
    "thumbnail": "🎯",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-69-overhead",
    "name": "69 Overhead",
    "category": "perspectives",
    "words": [
      "top down",
      "overhead",
      "from above",
      "aerial shot",
      "looking down",
      "overhead two person view",
      "bird's eye intimate"
    ],
    "description": "Overhead top-down aerial angle looking down at two people",
    "thumbnail": "↕️",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-straddling-lap-pov",
    "name": "Straddling Lap POV",
    "category": "perspectives",
    "words": [
      "pov",
      "from below",
      "looking up",
      "lap rider view",
      "upward pov",
      "rider overhead pov",
      "first person under"
    ],
    "description": "First-person upward POV from beneath a rider straddling above",
    "thumbnail": "🪑",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-leash-collar-pull-angle",
    "name": "Leash / Collar Pull Angle",
    "category": "perspectives",
    "words": [
      "from behind",
      "collar pov",
      "dominant angle",
      "leash grip view",
      "over shoulder dominant",
      "behind dominant pov"
    ],
    "description": "Over-shoulder dominant angle from behind, grip on leash or collar",
    "thumbnail": "🦮",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-nipple-breast-squeeze-focus",
    "name": "Nipple / Breast Squeeze Focus",
    "category": "perspectives",
    "words": [
      "close up",
      "breast detail",
      "nipple focus",
      "chest close up",
      "squeeze detail",
      "breast macro",
      "explicit chest close up"
    ],
    "description": "Close-up macro framing on breast and nipple detail",
    "thumbnail": "🫶",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-navel-midriff-focus",
    "name": "Navel / Midriff Focus",
    "category": "perspectives",
    "words": [
      "close up",
      "midriff focus",
      "navel detail",
      "stomach close up",
      "body detail shot",
      "lower torso focus",
      "waist close up"
    ],
    "description": "Close-up framing on navel and midriff area",
    "thumbnail": "👙",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-thigh-focus-leg-shot",
    "name": "Thigh Focus / Leg Shot",
    "category": "perspectives",
    "words": [
      "thigh focus",
      "leg shot",
      "thigh close up",
      "leg detail",
      "stockings close up",
      "inner thigh focus",
      "lower body focus"
    ],
    "description": "Close framing on thighs and legs, often with stockings",
    "thumbnail": "🦵",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-rule-of-thirds-composition",
    "name": "Rule of Thirds Composition",
    "category": "perspectives",
    "words": [
      "rule of thirds",
      "compositional framing",
      "subject offset",
      "negative space",
      "balanced composition",
      "artistic framing",
      "photography composition"
    ],
    "description": "Subject offset to one side with breathing room and negative space",
    "thumbnail": "📐",
    "isDefault": true
  },
  {
    "id": "pl-perspectives-motion-blur-speed-lines",
    "name": "Motion Blur / Speed Lines",
    "category": "perspectives",
    "words": [
      "motion blur",
      "speed lines",
      "dynamic movement",
      "action blur",
      "kinetic energy",
      "fast motion",
      "movement effect"
    ],
    "description": "Dynamic motion blur and speed lines conveying fast movement",
    "thumbnail": "💨",
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
git commit -m "feat(presets): add 22 new perspective presets"
```

---

## Chunk 3: Explicit Acts + Fetishes

### Task 6: Add Explicit — Acts / Positions (15 new)

**Files:**
- Modify: `src/data/presetLibrary.json`

- [ ] **Step 1: Append the 15 explicit act presets**

```json
  {
    "id": "pl-explicit-mating-press-prone-bone",
    "name": "Mating Press / Prone Bone",
    "category": "explicit",
    "words": [
      "mating press",
      "prone bone",
      "legs up",
      "pinned down",
      "missionary variant",
      "legs over shoulders",
      "deep penetration position"
    ],
    "description": "Legs-up pinning position with deep penetration",
    "thumbnail": "🔒",
    "isDefault": true
  },
  {
    "id": "pl-explicit-standing-sex-wall-pin",
    "name": "Standing Sex / Wall Pin",
    "category": "explicit",
    "words": [
      "standing sex",
      "wall pin",
      "against wall",
      "standing intercourse",
      "lifted sex",
      "wall sex",
      "vertical sex"
    ],
    "description": "Standing sex against a wall, lifted or standing position",
    "thumbnail": "🧱",
    "isDefault": true
  },
  {
    "id": "pl-explicit-69-position",
    "name": "69 Position",
    "category": "explicit",
    "words": [
      "69",
      "sixty nine",
      "mutual oral",
      "simultaneous oral",
      "oral sex both",
      "cunnilingus and fellatio",
      "mutual pleasure"
    ],
    "description": "69 position — simultaneous mutual oral sex",
    "thumbnail": "🔀",
    "isDefault": true
  },
  {
    "id": "pl-explicit-gangbang-multiple-partners",
    "name": "Gangbang / Multiple Partners",
    "category": "explicit",
    "words": [
      "gangbang",
      "multiple partners",
      "group sex",
      "orgy",
      "multiple men",
      "passed around",
      "group intercourse"
    ],
    "description": "Group sex with multiple partners beyond a threesome",
    "thumbnail": "👥",
    "isDefault": true
  },
  {
    "id": "pl-explicit-pegging-femdom-sex",
    "name": "Pegging / Femdom Sex",
    "category": "explicit",
    "words": [
      "pegging",
      "femdom",
      "strap-on",
      "female dominant",
      "reverse penetration",
      "strapon sex",
      "femdom intercourse",
      "dominant female sex"
    ],
    "description": "Female-dominant strap-on pegging act",
    "thumbnail": "🔁",
    "isDefault": true
  },
  {
    "id": "pl-explicit-mutual-masturbation",
    "name": "Mutual Masturbation",
    "category": "explicit",
    "words": [
      "mutual masturbation",
      "masturbation",
      "self pleasure",
      "side by side",
      "watching each other",
      "hand on self",
      "voyeur masturbation"
    ],
    "description": "Side-by-side mutual masturbation",
    "thumbnail": "🤝",
    "isDefault": true
  },
  {
    "id": "pl-explicit-futa-on-female",
    "name": "Futa on Female",
    "category": "explicit",
    "words": [
      "futanari",
      "futa on female",
      "futa top",
      "female bottom",
      "futa sex",
      "hermaphrodite",
      "futa penetration"
    ],
    "description": "Futanari top with female bottom",
    "thumbnail": "⚧️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-futa-on-male",
    "name": "Futa on Male",
    "category": "explicit",
    "words": [
      "futanari",
      "futa on male",
      "futa top",
      "male bottom",
      "futa sex",
      "1boy",
      "hermaphrodite on male",
      "reverse sex"
    ],
    "description": "Futanari top with male bottom",
    "thumbnail": "🔵",
    "isDefault": true
  },
  {
    "id": "pl-explicit-lactation-milking",
    "name": "Lactation / Milking",
    "category": "explicit",
    "words": [
      "lactation",
      "breast milk",
      "milking",
      "milk leaking",
      "milk spray",
      "lactating",
      "dairy play"
    ],
    "description": "Lactation and breast milk play",
    "thumbnail": "🍼",
    "isDefault": true
  },
  {
    "id": "pl-explicit-spitroast",
    "name": "Spitroast",
    "category": "explicit",
    "words": [
      "spitroast",
      "spit roast",
      "oral and penetration",
      "two men one woman",
      "double ended",
      "front and back",
      "simultaneous penetration oral"
    ],
    "description": "Spitroast — oral and penetration simultaneously from both ends",
    "thumbnail": "🍡",
    "isDefault": true
  },
  {
    "id": "pl-explicit-deepthroat-throat-fuck",
    "name": "Deepthroat / Throat Fuck",
    "category": "explicit",
    "words": [
      "deepthroat",
      "throat fuck",
      "deep oral",
      "irrumatio",
      "face fuck",
      "throat bulge",
      "aggressive oral",
      "gagging"
    ],
    "description": "Aggressive deep oral with throat engagement",
    "thumbnail": "🫁",
    "isDefault": true
  },
  {
    "id": "pl-explicit-squirting-female-ejaculation",
    "name": "Squirting / Female Ejaculation",
    "category": "explicit",
    "words": [
      "squirting",
      "female ejaculation",
      "gushing",
      "squirt",
      "wet orgasm",
      "fluid release",
      "intense orgasm",
      "wet"
    ],
    "description": "Female ejaculation / squirting orgasm",
    "thumbnail": "🌊",
    "isDefault": true
  },
  {
    "id": "pl-explicit-shower-sex",
    "name": "Shower Sex",
    "category": "explicit",
    "words": [
      "shower sex",
      "shower intercourse",
      "wet sex",
      "bathroom sex",
      "shower steam",
      "wet bodies",
      "shower standing sex"
    ],
    "description": "Sex in a steamy shower — wet bodies, standing position",
    "thumbnail": "🚿",
    "isDefault": true
  },
  {
    "id": "pl-explicit-reverse-mating-press",
    "name": "Reverse Mating Press",
    "category": "explicit",
    "words": [
      "reverse mating press",
      "prone position",
      "face down",
      "lying prone sex",
      "ass up",
      "prone bone variant",
      "flat on stomach sex"
    ],
    "description": "Face-down prone variation of the mating press",
    "thumbnail": "🔂",
    "isDefault": true
  },
  {
    "id": "pl-explicit-creampie-eating-cum-eating",
    "name": "Creampie Eating / Cum Eating",
    "category": "explicit",
    "words": [
      "creampie eating",
      "cum eating",
      "cleanup oral",
      "eating creampie",
      "cum in mouth",
      "post sex oral",
      "cum taste"
    ],
    "description": "Post-sex oral cleanup — eating creampie or cum",
    "thumbnail": "🥄",
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
git commit -m "feat(presets): add 15 new explicit act/position presets"
```

---

### Task 7: Add Explicit — Fetishes / Kinks (15 new)

**Files:**
- Modify: `src/data/presetLibrary.json`

- [ ] **Step 1: Append the 15 explicit fetish/kink presets**

> Note on "Exhibitionism / Public Flashing": use act/arousal tags only — no scene location tags (those belong to the existing "Public / Exhibitionist" scene preset).

```json
  {
    "id": "pl-explicit-pet-play-collared-submissive",
    "name": "Pet Play / Collared Submissive",
    "category": "explicit",
    "words": [
      "pet play",
      "collar",
      "leash",
      "animal ears",
      "crawling",
      "submissive pet",
      "collar and leash",
      "on all fours",
      "good girl"
    ],
    "description": "Collar, leash, and animal ears pet play with submissive framing",
    "thumbnail": "🐾",
    "isDefault": true
  },
  {
    "id": "pl-explicit-latex-rubber-suit",
    "name": "Latex / Rubber Suit",
    "category": "explicit",
    "words": [
      "latex",
      "rubber suit",
      "latex bodysuit",
      "shiny latex",
      "tight latex",
      "pvc",
      "rubber clothing",
      "latex catsuit",
      "glossy suit"
    ],
    "description": "Full-body shiny latex or rubber suit aesthetic",
    "thumbnail": "🖤",
    "isDefault": true
  },
  {
    "id": "pl-explicit-wax-play-candle-drip",
    "name": "Wax Play / Candle Drip",
    "category": "explicit",
    "words": [
      "wax play",
      "candle wax",
      "dripping wax",
      "hot wax",
      "candle drip",
      "bdsm sensory",
      "wax on skin",
      "melted wax",
      "sensation play"
    ],
    "description": "BDSM sensory play with dripping hot candle wax on skin",
    "thumbnail": "🕯️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-breeding-impregnation-fantasy",
    "name": "Breeding / Impregnation Fantasy",
    "category": "explicit",
    "words": [
      "breeding",
      "impregnation",
      "fertile",
      "impregnation fantasy",
      "breeding sex",
      "fertile womb",
      "deep inside",
      "breed"
    ],
    "description": "Impregnation and breeding fantasy — distinct framing from creampie",
    "thumbnail": "🤰",
    "isDefault": true
  },
  {
    "id": "pl-explicit-cum-inflation",
    "name": "Cum Inflation",
    "category": "explicit",
    "words": [
      "cum inflation",
      "belly inflation",
      "cum bulge",
      "inflated belly",
      "belly bulge",
      "excess cum",
      "womb inflation",
      "x-ray cum fill"
    ],
    "description": "Belly inflation from excess cum — womb bulge and inflation",
    "thumbnail": "🎈",
    "isDefault": true
  },
  {
    "id": "pl-explicit-oviposition-egg-laying",
    "name": "Oviposition / Egg Laying",
    "category": "explicit",
    "words": [
      "oviposition",
      "egg laying",
      "egg insertion",
      "tentacle eggs",
      "laying eggs",
      "internal eggs",
      "egg belly bulge",
      "ovipositor"
    ],
    "description": "Oviposition and egg-laying kink — tentacle-adjacent niche",
    "thumbnail": "🥚",
    "isDefault": true
  },
  {
    "id": "pl-explicit-ntr-cuckolding",
    "name": "NTR / Cuckolding",
    "category": "explicit",
    "words": [
      "ntr",
      "netorare",
      "cuckolding",
      "cheating",
      "stolen",
      "taken",
      "cuckold",
      "affair",
      "infidelity",
      "netori"
    ],
    "description": "NTR / netorare cuckolding scenario framing",
    "thumbnail": "😔",
    "isDefault": true
  },
  {
    "id": "pl-explicit-somnophilia-sleeping",
    "name": "Somnophilia / Sleeping",
    "category": "explicit",
    "words": [
      "somnophilia",
      "sleeping",
      "unconscious",
      "asleep",
      "eyes closed",
      "sleeping beauty",
      "vulnerable sleeping",
      "sleep sex",
      "dormant"
    ],
    "description": "Somnophilia — asleep or unconscious subject framing",
    "thumbnail": "😴",
    "isDefault": true
  },
  {
    "id": "pl-explicit-chastity-orgasm-denial",
    "name": "Chastity / Orgasm Denial",
    "category": "explicit",
    "words": [
      "chastity",
      "orgasm denial",
      "denied",
      "edging",
      "chastity cage",
      "frustrated",
      "denial play",
      "teasing denial",
      "no release"
    ],
    "description": "Chastity cage and orgasm denial play — restrained and denied",
    "thumbnail": "🔐",
    "isDefault": true
  },
  {
    "id": "pl-explicit-exhibitionism-public-flashing",
    "name": "Exhibitionism / Public Flashing",
    "category": "explicit",
    "words": [
      "exhibitionism",
      "flashing",
      "public nudity",
      "aroused exhibitionist",
      "thrill",
      "indecent exposure",
      "no panties",
      "exposed"
    ],
    "description": "Exhibitionism and public flashing kink — act/arousal focused, not location focused",
    "thumbnail": "🌍",
    "isDefault": true
  },
  {
    "id": "pl-explicit-consensual-non-consent-ravishment",
    "name": "Consensual Non-Consent / Ravishment",
    "category": "explicit",
    "words": [
      "cnc",
      "consensual non-consent",
      "ravishment",
      "forced fantasy",
      "rough sex fantasy",
      "resistance roleplay",
      "held down consensual",
      "rough roleplay"
    ],
    "description": "CNC ravishment fantasy — consensual resistance roleplay",
    "thumbnail": "⚠️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-dollification-mannequin-play",
    "name": "Dollification / Mannequin Play",
    "category": "explicit",
    "words": [
      "dollification",
      "mannequin play",
      "blank expression",
      "doll eyes",
      "objectification",
      "posed like doll",
      "vacant expression",
      "human doll",
      "puppet play"
    ],
    "description": "Dollification — blank doll-like expression, objectification framing",
    "thumbnail": "🪆",
    "isDefault": true
  },
  {
    "id": "pl-explicit-sensory-deprivation",
    "name": "Sensory Deprivation",
    "category": "explicit",
    "words": [
      "sensory deprivation",
      "blindfold",
      "restrained",
      "unable to see",
      "bound and blindfolded",
      "deprived senses",
      "no sight",
      "bdsm restraint"
    ],
    "description": "Sensory deprivation — blindfolded and restrained BDSM play",
    "thumbnail": "😶",
    "isDefault": true
  },
  {
    "id": "pl-explicit-gagging-drool-play",
    "name": "Gagging / Drool Play",
    "category": "explicit",
    "words": [
      "ball gag",
      "gag",
      "drool",
      "drooling",
      "gagged",
      "mouth gagged",
      "saliva",
      "drool dripping",
      "silenced"
    ],
    "description": "Ball gag and drool play — mouth gagged with drool",
    "thumbnail": "🫧",
    "isDefault": true
  },
  {
    "id": "pl-explicit-macro-micro-size-play",
    "name": "Macro / Micro / Size Play",
    "category": "explicit",
    "words": [
      "macro",
      "micro",
      "size difference",
      "giant",
      "tiny",
      "size play",
      "giantess",
      "shrunken",
      "macro fantasy",
      "size fetish"
    ],
    "description": "Giant/tiny size difference fantasy — macro/micro size play",
    "thumbnail": "🔬",
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
git commit -m "feat(presets): add 15 new explicit fetish/kink presets"
```

---

## Chunk 4: Explicit Body Aesthetics + Quality Pass

### Task 8: Add Explicit — Body Focus / Aesthetics (12 new)

**Files:**
- Modify: `src/data/presetLibrary.json`

- [ ] **Step 1: Append the 12 explicit body aesthetic presets**

```json
  {
    "id": "pl-explicit-sweat-post-sex-glow",
    "name": "Sweat / Post-Sex Glow",
    "category": "explicit",
    "words": [
      "sweating",
      "post sex",
      "glistening skin",
      "sweat droplets",
      "exhausted",
      "after sex glow",
      "shiny skin",
      "exertion sweat",
      "flushed and sweaty"
    ],
    "description": "Glistening post-sex afterglow with sweat and exhaustion",
    "thumbnail": "😰",
    "isDefault": true
  },
  {
    "id": "pl-explicit-cum-covered-messy",
    "name": "Cum Covered / Messy",
    "category": "explicit",
    "words": [
      "cum covered",
      "covered in cum",
      "messy",
      "cum on body",
      "cum dripping",
      "cum all over",
      "splattered",
      "cum soaked",
      "drenched in cum"
    ],
    "description": "Full body or face covered in cum — maximally messy",
    "thumbnail": "🫙",
    "isDefault": true
  },
  {
    "id": "pl-explicit-arousal-drip-pussy-juice",
    "name": "Arousal Drip / Pussy Juice",
    "category": "explicit",
    "words": [
      "arousal",
      "wet",
      "dripping",
      "pussy juice",
      "natural lubricant",
      "aroused wet",
      "glistening wet",
      "love juice",
      "dripping arousal"
    ],
    "description": "Visible natural arousal wetness and dripping",
    "thumbnail": "🫦",
    "isDefault": true
  },
  {
    "id": "pl-explicit-erect-nipples-hard-nubs",
    "name": "Erect Nipples / Hard Nubs",
    "category": "explicit",
    "words": [
      "erect nipples",
      "hard nipples",
      "nipples visible",
      "pointed nipples",
      "aroused nipples",
      "stiff nipples",
      "nipple detail",
      "perky nipples"
    ],
    "description": "Erect, hard, clearly visible nipple detail",
    "thumbnail": "🔴",
    "isDefault": true
  },
  {
    "id": "pl-explicit-camel-toe-fabric-bulge",
    "name": "Camel Toe / Fabric Bulge",
    "category": "explicit",
    "words": [
      "camel toe",
      "fabric outline",
      "clothing impression",
      "vulva outline through clothing",
      "tight clothing detail",
      "fabric pulled tight",
      "visible outline"
    ],
    "description": "Camel toe or bulge visible through tight fabric",
    "thumbnail": "🩱",
    "isDefault": true
  },
  {
    "id": "pl-explicit-tan-lines-bikini-lines",
    "name": "Tan Lines / Bikini Lines",
    "category": "explicit",
    "words": [
      "tan lines",
      "bikini tan",
      "tan marks",
      "untanned areas",
      "bikini tan lines",
      "sun tan",
      "pale where covered",
      "contrast skin tone",
      "summer tan"
    ],
    "description": "Tan lines and bikini lines showing contrast between tanned and pale skin",
    "thumbnail": "☀️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-intimate-piercing-jewelry",
    "name": "Intimate Piercing / Jewelry",
    "category": "explicit",
    "words": [
      "nipple piercing",
      "genital piercing",
      "intimate jewelry",
      "pierced nipples",
      "body jewelry",
      "intimate adornment",
      "decorative piercing",
      "clit piercing"
    ],
    "description": "Intimate body piercings — nipple, genital, and navel jewelry",
    "thumbnail": "💍",
    "isDefault": true
  },
  {
    "id": "pl-explicit-bite-marks-hickeys",
    "name": "Bite Marks / Hickeys",
    "category": "explicit",
    "words": [
      "bite marks",
      "hickeys",
      "love bites",
      "passion marks",
      "neck bite",
      "bruise marks",
      "suction marks",
      "teeth marks skin",
      "possessive marks"
    ],
    "description": "Bite marks and hickeys — passion marks left on skin",
    "thumbnail": "🩹",
    "isDefault": true
  },
  {
    "id": "pl-explicit-ruined-makeup-teary-face",
    "name": "Ruined Makeup / Teary Face",
    "category": "explicit",
    "words": [
      "ruined makeup",
      "smeared mascara",
      "teary",
      "crying makeup",
      "streaked eyeliner",
      "messy makeup",
      "post cry",
      "mascara tears",
      "wet cheeks makeup"
    ],
    "description": "Smeared mascara and ruined makeup from tears",
    "thumbnail": "😢",
    "isDefault": true
  },
  {
    "id": "pl-explicit-flushed-chest-sex-flush",
    "name": "Flushed Chest / Sex Flush",
    "category": "explicit",
    "words": [
      "sex flush",
      "flushed chest",
      "red blush spreading",
      "arousal blush",
      "chest redness",
      "erotic flush",
      "flushed neck",
      "excited blush",
      "red from arousal"
    ],
    "description": "Sex flush — red arousal blush spreading across chest and neck",
    "thumbnail": "❤️",
    "isDefault": true
  },
  {
    "id": "pl-explicit-cum-in-hair",
    "name": "Cum in Hair",
    "category": "explicit",
    "words": [
      "cum in hair",
      "cum on hair",
      "hair soaked",
      "semen in hair",
      "messy hair cum",
      "hair dripping cum"
    ],
    "description": "Cum in or on hair — distinct from full facial or cum covered",
    "thumbnail": "💆",
    "isDefault": true
  },
  {
    "id": "pl-explicit-used-stretched-look",
    "name": "Used / Stretched Look",
    "category": "explicit",
    "words": [
      "used",
      "well used",
      "stretched",
      "worn out",
      "post sex exhaustion",
      "thoroughly used",
      "afteruse look",
      "disheveled post sex",
      "creampied and used"
    ],
    "description": "Post-sex worn, disheveled, thoroughly-used appearance",
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
git commit -m "feat(presets): add 12 new explicit body aesthetic presets"
```

---

### Task 9: Run quality-pass script and final validation

**Files:**
- Read: `scripts/quality-pass-preset-library.mjs`

- [ ] **Step 1: Run the quality-pass script to deduplicate word arrays**

```bash
cd swarmui-react && node scripts/quality-pass-preset-library.mjs
```

Expected: Script runs without errors, reports deduplication results.

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

Expected total: original count + 111. By category additions:
- characters: +17
- scenes: +15
- styles: +15
- perspectives: +22
- explicit: +42

- [ ] **Step 4: Commit final state**

```bash
git add swarmui-react/src/data/presetLibrary.json
git commit -m "feat(presets): run quality-pass deduplication on expanded library"
```
