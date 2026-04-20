# Preset Library Expansion — Design Spec

**Date:** 2026-04-21
**Status:** Approved

## Overview

Add 111 new default presets to `src/data/presetLibrary.json` across all five existing categories. This is a content-only pass — no schema changes, no new categories, no UI changes. All new presets follow the existing `LibraryPreset` format.

**Goal:** Fill clear archetype gaps and broaden coverage in all categories, with particular emphasis on the Explicit category (acts/positions, fetishes/kinks, body aesthetics).

---

## Scope

- **In scope:** New entries in `presetLibrary.json`, IDs following the `pl-<category>-<slug>` convention, `isDefault: true`, appropriate `thumbnail` emoji, concise `words[]` arrays
- **Out of scope:** New categories, UI changes, schema changes, removal of existing presets

---

## New Presets by Category

### Characters — 17 new

| Name | Thumbnail | Notes |
|---|---|---|
| Shrine Maiden / Miko | ⛩️ | Japanese shrine maiden aesthetic |
| Kunoichi / Female Ninja | 🥷 | Stealth female ninja archetype |
| Idol / Pop Star | 🎤 | J/K-pop idol aesthetic |
| Delinquent / Yankee Girl | 🚬 | Sukeban gang archetype |
| Ojou-sama / Heiress | 👑 | Refined rich girl, different from Princess |
| Succubus Nun | 😈 | Demon inhabiting/disguised as a nun — horns, tail, and wings retained under habit; demonic body markings, glowing eyes. Distinct from existing "Corrupted Nun" (fallen angel/gothic fallen-from-grace framing with no demonic anatomy) |
| Male Rogue / Assassin | 🗡️ | Agile hooded male archetype |
| Male Hunter / Ranger | 🏹 | Rugged outdoorsman, bow-and-arrow |
| Male Priest / Cleric | ✝️ | Holy divine male archetype |
| Male Barbarian | ⚔️ | Conan-style male warrior — muscular male, loincloth, fur pelt, greatsword, battle-scarred, rugged. Distinct from existing "Amazonian / Barbarian" which is female-coded with female body tags |
| Orc / Half-Orc | 🟢 | Green-skin fantasy race |
| Alien Girl | 👽 | Sci-fi non-human character |
| Witch / Occultist | 🔮 | Folk/hedge witch, different from Dark Sorceress |
| Cheerleader / Athlete | 📣 | School sports archetype |
| Egyptian / Pharaoh Girl | 🐍 | Cultural archetype, gold jewelry + headdress |
| Viking Shield-Maiden | 🛡️ | Norse warrior woman |
| Gangster / Yakuza Girl | 🔱 | Tattooed criminal archetype |

### Scenes — 15 new

| Name | Thumbnail | Notes |
|---|---|---|
| Classroom / School | 🏫 | Anime staple, glaring absence |
| Dressing Room / Backstage | 🪞 | Voyeur/intimate feel |
| Hospital / Nurse's Office | 🏥 | Clinical setting |
| Greenhouse / Conservatory | 🌿 | Lush moody indoor garden |
| Tropical Jungle / Rainforest | 🌴 | Dense foliage, dappled light |
| Ancient Ruins / Temple Exterior | 🏛️ | Overgrown stone ruins |
| Crystal Cave / Gem Grotto | 💎 | Fantasy underground, vibrant colors |
| Spaceship Interior / Cockpit | 🚀 | Sci-fi indoor, different from Space Station |
| Research Laboratory | 🧪 | Sterile or chaotic lab setting |
| Swimming Pool / Poolside Night | 🏊 | Night pool lighting |
| Strip Club Stage | 💃 | Explicit-leaning venue |
| Rooftop Garden / Urban Terrace | 🪴 | Green + city backdrop combo |
| Autumn Forest / Fall Foliage | 🍂 | Seasonal variety |
| Viking Hall / Mead Hall | 🍺 | Norse feast hall interior |
| Private Jet Interior | ✈️ | Luxury mobility setting |

### Styles — 15 new

| Name | Thumbnail | Notes |
|---|---|---|
| Ukiyo-e / Woodblock Print | 🎴 | Traditional Japanese art style |
| Cel-Shaded / Toon | 🎨 | Bold outlines, flat fills |
| Low-Poly 3D | 🔺 | Geometric faceted aesthetic |
| Digital Glitch / Vaporwave | 📺 | RGB split, distortion, neon |
| Concept Art Sketch | ✏️ | Loose pencil/marker lines |
| Moe / Bishoujo | 🌸 | Soft cute anime style |
| Seinen / Mature Anime | ⚡ | Grittier detailed anime (Berserk-esque) |
| Yaoi / BL Art Style | 💙 | Boys' Love — slender males, soft shading |
| Art Deco | 🏆 | Geometric luxury, gold/black |
| Impressionist / Painterly | 🖌️ | Loose brushwork, light over detail |
| Street Art / Graffiti | 🎭 | Spray paint texture, urban walls |
| Infrared Photography | 📷 | Ghostly whites, dark skies |
| Light Novel Illustration | 📚 | Isekai/LN cover style |
| Futanari / Dickgirl Art Style | 💅 | Futa-specific rendering style — kept in `styles` (not `explicit`) because it describes a rendering approach, not an act. Word array should contain style/anatomy tags (futanari, hermaphrodite, detailed anatomy, soft shading) rather than act tags |
| Body Horror / Grotesque | 💀 | Dark body distortion, Junji Ito-adjacent |

### Perspectives — 22 new

| Name | Thumbnail | Notes |
|---|---|---|
| Missionary POV | 👀 | Looking up at partner during missionary |
| Prone Bone / Mating Press POV | 🗜️ | Top-down pinning angle |
| Standing Against Wall POV | 🪨 | Vertical sex angle |
| Kneeling / Worship View | 🙇 | Low angle looking up at dominant figure |
| Spread Eagle Overhead | ⬛ | Top-down full body spread |
| Face / Expression Close-Up | 😳 | Tight crop on climax reaction |
| Doggy Style from Behind POV | 🔙 | Active penetration angle from behind |
| Penetration Close-Up | 🔍 | Explicit insertion detail |
| Pussy Spread / Vulva Focus | 🌹 | Explicit body-part detail |
| Anal Spread Focus | 🍑 | Explicit rear detail |
| Handjob POV | ✋ | First-person hand angle |
| Cumshot Incoming POV | 💦 | First-person facial angle |
| Creampie Closeup / Drip Shot | 🩸 | Aftermath detail focus |
| Pegging / Femdom POV | 🎯 | Strap-on from receiver's view |
| 69 Overhead | ↕️ | Top-down mutual oral angle |
| Straddling Lap POV | 🪑 | From below looking up at rider |
| Leash / Collar Pull Angle | 🦮 | Dominant grip from behind |
| Nipple / Breast Squeeze Focus | 🫶 | Explicit breast detail |
| Navel / Midriff Focus | 👙 | Body-part focus gap |
| Thigh Focus / Leg Shot | 🦵 | Thighs + stockings angle |
| Rule of Thirds Composition | 📐 | Subject offset, breathing room |
| Motion Blur / Speed Lines | 💨 | Dynamic action movement |

### Explicit — 42 new

**Acts / Positions**

| Name | Thumbnail | Notes |
|---|---|---|
| Mating Press / Prone Bone | 🔒 | Legs-up pinning position |
| Standing Sex / Wall Pin | 🧱 | Lifted or standing penetration |
| 69 Position | 🔀 | Mutual oral |
| Gangbang / Multiple Partners | 👥 | Group beyond threesome |
| Pegging / Femdom Sex | 🔁 | Female-dominant strap-on act |
| Mutual Masturbation | 🤝 | Side-by-side self-pleasure |
| Futa on Female | ⚧️ | Futa top, female bottom |
| Futa on Male | 🔵 | Futa top, male bottom |
| Lactation / Milking | 🍼 | Breast milk play |
| Spitroast | 🍡 | Oral + penetration simultaneously |
| Deepthroat / Throat Fuck | 🫁 | Aggressive oral |
| Squirting / Female Ejaculation | 🌊 | Explicit fluid release |
| Shower Sex | 🚿 | Wet environment standing sex |
| Reverse Mating Press | 🔂 | Prone variation |
| Creampie Eating / Cum Eating | 🥄 | Post-sex oral cleanup act |

**Fetishes / Kinks**

| Name | Thumbnail | Notes |
|---|---|---|
| Pet Play / Collared Submissive | 🐾 | Collar, leash, ears |
| Latex / Rubber Suit | 🖤 | Full-body latex aesthetic |
| Wax Play / Candle Drip | 🕯️ | Sensory BDSM |
| Breeding / Impregnation Fantasy | 🤰 | Distinct framing from Creampie |
| Cum Inflation | 🎈 | Belly bulge from excess |
| Oviposition / Egg Laying | 🥚 | Tentacle-adjacent niche |
| NTR / Cuckolding | 😔 | Netorare scenario framing |
| Somnophilia / Sleeping | 😴 | Asleep/unconscious framing |
| Chastity / Orgasm Denial | 🔐 | Restraint and denial play |
| Exhibitionism / Public Flashing | 🌍 | Outdoor exposure |
| Consensual Non-Consent / Ravishment | ⚠️ | CNC fantasy framing |
| Dollification / Mannequin Play | 🪆 | Blank expression, posed objectification |
| Sensory Deprivation | 😶 | Blindfold + restraint |
| Gagging / Drool Play | 🫧 | Ball gag, drool |
| Macro / Micro / Size Play | 🔬 | Giant/tiny size difference fantasy |

**Body Focus / Aesthetics**

| Name | Thumbnail | Notes |
|---|---|---|
| Sweat / Post-Sex Glow | 😰 | Glistening exhausted skin |
| Cum Covered / Messy | 🫙 | Full body or face covered |
| Arousal Drip / Pussy Juice | 🫦 | Visible wetness/arousal |
| Erect Nipples / Hard Nubs | 🔴 | Explicit nipple focus |
| Camel Toe / Fabric Bulge | 🩱 | Clothing outline detail |
| Tan Lines / Bikini Lines | ☀️ | Contrast tan marks |
| Intimate Piercing / Jewelry | 💍 | Genital/nipple piercings |
| Bite Marks / Hickeys | 🩹 | Passion marks on skin |
| Ruined Makeup / Teary Face | 😢 | Smeared mascara, post-cry look |
| Flushed Chest / Sex Flush | ❤️ | Red blush spreading across chest/neck |
| Cum in Hair | 💆 | Distinct from facial/cum covered |
| Used / Stretched Look | 😵 | Post-sex worn appearance |

---

## Implementation Notes

- All IDs follow convention: `pl-<category>-<kebab-slug>`
- All `isDefault: true`
- Words arrays should be 6–20 tags each, using standard Stable Diffusion tag vocabulary
- Explicit presets get `category: 'explicit'`; all others get their appropriate category
- The `quality-pass-preset-library.mjs` script can be run after insertion to deduplicate words

### Perspectives vs Explicit — word array distinction
Several new `perspectives` presets describe the same acts as new `explicit` presets (e.g., "Missionary POV" / "Missionary", "Prone Bone POV" / "Mating Press"). These must use **non-overlapping tag sets**:
- **Perspectives** word arrays: camera/framing/composition tags only (e.g., `pov, from below, first-person view, looking up at viewer, dutch angle`)
- **Explicit** word arrays: act/anatomy/position tags (e.g., `mating press, missionary position, legs up, pinned down, sex`)
This prevents the dedup script from collapsing paired presets into near-identical entries.

### Exhibitionism disambiguation
"Exhibitionism / Public Flashing" (`explicit`) vs "Public / Exhibitionist" (`scenes`):
- **Scenes** entry: location tags (outdoor, street, public place, park, passersby)
- **Explicit** entry: act/arousal tags (exhibitionism, public nudity, flashing, thrill, aroused, no panties) — no location tags that duplicate the scene preset

## Files to Modify

- `src/data/presetLibrary.json` — add 111 new preset objects
