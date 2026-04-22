# Preset Library Explicit Expansion — Design Spec

**Date:** 2026-04-22
**Status:** Approved

## Overview

Add 95 new default presets to `src/data/presetLibrary.json` in two categories:

- **`characters`** — 30 new ungated adult-themed character archetypes (visible by default)
- **`explicit`** — 65 new explicit-gated presets: 40 explicit characters (22 archetype-based + 18 act-framed) and 25 in-the-act scene presets

This is a content-only pass. No schema changes, no new categories, no UI changes.

**Baseline:** 210 presets currently in library. Target after this pass: 305 presets.

---

## Scope

- **In scope:** New entries in `presetLibrary.json`, IDs following `pl-<category>-<slug>` convention, `isDefault: true`, appropriate emoji thumbnails, concise `words[]` arrays (6–20 tags each)
- **Out of scope:** New categories, UI changes, schema changes, removal of existing presets

---

## Key Distinctions

### Ungated vs Explicit Characters
- **Ungated** (`category: 'characters'`): Adult-themed but not pornographic — same tier as existing "Naughty Nurse", "BDSM Mistress", "Exotic Dancer". Visible without explicit toggle. Word arrays: character/appearance/occupation tags only — no explicit act tags, no nude body-state tags.
- **Explicit** (`category: 'explicit'`): Pornographic framing — nude, actively sexual, or explicit act-first. Requires explicit toggle.
  - **Archetype-based explicit characters**: word arrays contain nude body-state tags and explicit visual cues (e.g., `nude, collared, cum dripping, exposed`) but NOT act-in-progress tags.
  - **Act-framed explicit characters**: word arrays contain act/position tags describing what is actively happening (e.g., `riding, cowgirl position, sex, bouncing`).

### In-the-Act Scenes vs Location Scenes
- Existing explicit scenes (BDSM Dungeon, Love Hotel, Casting Couch) describe **locations/venues**.
- New in-the-act scenes describe **active sexual situations** — what is happening right now, not where.
- Word arrays for in-the-act scenes: action/act/state tags only — NO location tags. Location is the job of the `scenes` category.

### Corrupted Paladin threshold
"Corrupted Paladin" is placed in `explicit` (not ungated `characters`) because the framing is explicitly pornographic: armor physically torn open to expose the body, eyes glowing with lust, fallen fully into sexual corruption. This crosses the threshold from "thematically adult" into explicit visual content.

---

## New Presets by Section

### Part 1 — Ungated Adult Characters (30 new, `category: 'characters'`)

Emoji verified against all 210 existing presets. All are unique within the `characters` category.

#### Standard Adult Archetypes (20)

| Name | Thumbnail | Notes |
|---|---|---|
| Dominatrix / Pro Domme | 👢 | Professional domme — polished, distinct from BDSM Mistress |
| Pinup Model / Cheesecake | 📌 | Classic 1950s cheesecake pose archetype |
| Burlesque Performer | 🪶 | Theatrical adult entertainer — feathers, corsets, tease |
| Belly Dancer | 🪙 | Sensual dancer with coin belt and veil |
| Camgirl / Content Creator | 📱 | Modern adult content creator archetype |
| Harem Concubine / Odalisque | 🏺 | Fantasy/historical concubine in silks |
| Oiran / Courtesan | 🌸 | High-class Japanese historical courtesan |
| Sugar Baby / Kept Woman | 💎 | Modern kept woman, luxury aesthetic |
| Nude Life Drawing Model | 🎨 | Artistic nude — tasteful, posed |
| Sexy Librarian | 📚 | Classic archetype — glasses, hair up, prim outfit |
| Cougar / Older Seductress | 🐆 | Mature seductress — predatory rather than maternal (distinct from MILF) |
| Bath Attendant / Masseuse | 🛁 | Intimate service worker, minimal clothing |
| Bimbo / Dumb Blonde | 💅 | Exaggerated blonde archetype — big proportions, vapid expression |
| Sex Worker / Call Girl | 👠 | Explicit occupation archetype |
| Lingerie Model | 🩱 | Professional underwear model shoot archetype |
| Femme Fatale / Noir Seductress | 🕸️ | Dangerous film noir woman — distinct from Detective Noir Heroine |
| Fantasy Concubine | 💍 | Fantasy world royal concubine — jewels, minimal drapery |
| Seductive Villainess | 🦹 | Evil female antagonist with sex appeal |
| Stripper / Pole Dancer | 🪩 | Club performer — distinct from Exotic Dancer (more specific setting) |
| Gyaru Escort | 🌟 | Tanned gyaru in escort/companion role |

#### Fantasy Adult Archetypes (10)

| Name | Thumbnail | Notes |
|---|---|---|
| Dark Elf Seductress | 🌑 | Drow with explicit allure — distinct from existing Slim Elf Girl |
| Nymph / Dryad | 🌿 | Nature spirit — semi-clothed, ethereal, forest-bound |
| Harpy / Winged Temptress | 🦅 | Bird-woman hybrid, feathered and barely clothed |
| Lamia / Snake Woman | 🐲 | Serpent lower body, seductive upper — classic monster girl |
| Kitsune Courtesan | 🍵 | Fox spirit in courtesan role — distinct from Foxgirl/Kitsune |
| Demon Queen / Lilith | 👹 | Powerful demon ruler — regal, distinct from Demon Girl/Succubus |
| Dark Fairy / Fae Temptress | 🧚 | Malevolent fairy with seductive magic |
| Lich / Undead Seductress | 💀 | Undead sorceress — pale, hollow eyes, dark magic |
| Centaur Girl | 🐴 | Horse lower body, female upper — distinct monster girl |
| Arachne / Spider Girl | 🕷️ | Spider lower body — distinct monster girl archetype |

---

### Part 2 — Explicit Characters (40 new, `category: 'explicit'`)

Emoji verified against all 35 existing explicit presets and all 30 new Part 1 presets. All are unique within the `explicit` category.

#### Archetype-Based (22) — who they are, with explicit nude/used visual state implied

Word arrays: nude body-state and explicit visual cue tags. No act-in-progress tags.

| Name | Thumbnail | Notes |
|---|---|---|
| Nude Maid | 🪣 | Naked/barely-dressed maid in service pose |
| Sex Slave / Naked Captive | ⛓️ | Collared, nude, bound archetype |
| Willing Fucktoy | 🎁 | Eager submissive with explicit visual cues |
| Nude Idol / Used Idol | 🎤 | K/J-pop idol in explicit exposed state |
| Naked Pet / Human Pet | 🐾 | Human pet play — nude, collared, on all fours |
| Broodmother / Bred Girl | 🤰 | Post-breeding, pregnant belly, satisfied |
| Cum Dumpster / Used Hole | 🫙 | Thoroughly used, multiple creampies implied |
| Naked Elf Prisoner | 🧝 | Fantasy captive — stripped, bound |
| Exposed Shrine Maiden | ⛩️ | Miko in explicit undressed state |
| Nude Warrior (Post-Battle) | ⚔️ | Stripped after defeat — armor torn, weapons gone |
| Ahegao Doll | 🪆 | Mind-broken, blank doll-like explicit state |
| Creampied Mess | 🥄 | Post-sex aftermath with heavy creampie framing |
| Demon Concubine / Hell Consort | 🌋 | Demon explicitly kept as sexual companion |
| Enslaved Succubus | 🔗 | Succubus captured and used rather than doing the using |
| Dark Elf Sex Slave | 🌑 | Drow in explicit captive/collared state |
| Dragon's Hoard Concubine | 🐉 | Kept and claimed by a dragon — treasure among treasures |
| Goblin-Claimed Heroine | 👺 | Adventurer captured by goblins — classic fantasy scenario |
| Tentacle Monster's Bride | 🐙 | Explicitly claimed/bonded to a tentacle creature |
| Corrupted Paladin | ✝️ | Holy warrior fully fallen to lust — armor physically torn, body exposed, eyes glowing |
| Elven Breeding Mare | 🌿 | Elf explicitly kept for breeding purposes |
| Fairy Sex Pet | 🧚 | Tiny fairy as intimate kept companion |
| Divine Vessel / God's Toy | ⭐ | Deity's chosen consort — marked, nude, devoted |

#### Act-Framed (18) — what they are actively doing

Word arrays: act/position/action tags. No location tags.

| Name | Thumbnail | Notes |
|---|---|---|
| Girl Being Fucked (Missionary) | 🔒 | Active missionary act framing |
| Girl Being Eaten Out | 🩷 | Receiving oral sex |
| Girl Giving Blowjob | 😮 | Performing oral |
| Girl Riding Cowgirl | 🪑 | Active cowgirl position |
| Girl Getting Anal | 🔴 | Active anal sex framing |
| Gangbang Participant | 🔢 | Multi-partner active framing |
| Spitroast Subject | 🍡 | Both ends simultaneously occupied |
| Double Penetration Subject | 🤜 | Active DP framing |
| Futa Fucking Girl | ⚧️ | Futa-on-female active framing |
| Girl Being Pegged | 🎯 | Receiving strap-on |
| Squirting / Mid-Orgasm | 🌊 | Active climax moment |
| Mind-Broken / Ahegao Mid-Act | 💫 | Mid-sex dissociated state |
| Tentacle Violation Subject | 🌪️ | Active tentacle scenario |
| Hypno Sex Slave | 🔮 | Mid-hypnosis sexual act |
| Gloryhole Participant | 🟣 | Active gloryhole use |
| Cum Inflation Mid-Act | 🎈 | Active inflation in progress |
| Lactation Mid-Extraction | 🍼 | Active milking/feeding act |
| Oviposition Subject | 🥚 | Active egg-laying scenario |

---

### Part 3 — Explicit In-The-Act Scenes (25 new, `category: 'explicit'`)

These describe active sexual situations — what is happening right now. Word arrays: action/act/state tags only, NO location tags.

Emoji verified against all 35 existing explicit presets and all 40 new Part 2 presets. All are unique within the `explicit` category.

#### Active Sex Scenarios (12)

| Name | Thumbnail | Notes |
|---|---|---|
| Mid-Missionary Scene | 🛏️ | Active, in-progress missionary framing |
| Mid-Doggy Style Scene | 🔙 | Active rear-entry in-progress |
| Active Cowgirl Ride | 🏇 | Mid-riding, bouncing framing |
| Mid-Blowjob Scene | 👄 | Active oral performance in-progress |
| Mid-Cunnilingus Scene | 🌼 | Active receiving oral in-progress |
| Active Spitroast Scene | 🍢 | Both ends simultaneously occupied |
| Mid-Threesome (FFM) | 🔺 | Two women, one man active |
| Mid-Threesome (MMF) | 🔵 | Two men, one woman active |
| Active Gangbang Scene | 🫂 | Multiple partners all engaged |
| Mid-Anal Scene | 🫣 | Active anal sex in-progress |
| Mid-69 Scene | 🔀 | Simultaneous mutual oral active |
| Active Double Penetration | 🤞 | Both openings occupied simultaneously |

#### Kink / Fetish In-Act Scenes (8)

| Name | Thumbnail | Notes |
|---|---|---|
| Active Bondage Play Scene | 🧲 | Mid-session tied/restrained with partner present |
| Active Pet Play Scene | 🦴 | Handler and pet mid-interaction |
| Mid-CNC / Ravishment Scene | ⚠️ | Consensual resistance fantasy in-progress |
| Active Tentacle Scene | 🐚 | Tentacles actively engaged |
| Active Pegging Scene | 🔁 | Strap-on in-progress |
| Mid-Wax Play Scene | 🕯️ | Candle dripping, active sensation |
| Active Hypno Scene | 🌠 | Mid-hypnosis with subject responding |
| Gloryhole In-Use Scene | 🪤 | Active gloryhole encounter |

#### Climax / Aftermath Scenes (5)

| Name | Thumbnail | Notes |
|---|---|---|
| Mid-Orgasm / Climax Scene | 💥 | Active climax moment — ahegao, arching |
| Active Squirting Scene | 🫧 | Mid-female ejaculation |
| Mid-Creampie Scene | 💧 | Active internal finish moment |
| Cum Shower Scene | 🚿 | Multiple sources covering subject simultaneously |
| Exhausted Aftermath Scene | 😵 | Post-multiple-rounds — used, leaking, satisfied |

---

## Implementation Notes

- All IDs follow convention: `pl-<category>-<kebab-slug>`
- All `isDefault: true`
- Words arrays: 6–20 tags using standard Stable Diffusion vocabulary
- Run `quality-pass-preset-library.mjs` after insertion to deduplicate word arrays

### Word Array Rules by Preset Type

| Type | Include | Exclude |
|---|---|---|
| Ungated adult characters (Part 1) | Character/appearance/occupation/costume tags | Explicit acts, nude body-state tags |
| Explicit archetype characters (Part 2a) | Nude body-state, explicit visual cues, bondage/collar state | Act-in-progress tags, location tags |
| Explicit act-framed characters (Part 2b) | Act/position/action tags | Location tags |
| In-the-act scenes (Part 3) | Action/act/state tags | Location tags (those belong in `scenes` category) |

### Sample Tag Vocabulary Reference

**Ungated character example** (Dominatrix / Pro Domme):
`dominatrix, latex, whip, corset, high heels, leather, commanding expression, professional, dom, mistress`

**Explicit archetype example** (Sex Slave / Naked Captive):
`nude, collar, bound, restrained, slave, captive, exposed, submissive, on knees, chains`

**Explicit act-framed example** (Girl Riding Cowgirl):
`riding, cowgirl position, sex, bouncing, on top, straddling, sexual intercourse, explicit`

**In-the-act scene example** (Mid-Missionary Scene):
`missionary position, sex, intercourse, lying down, explicit, penetration, intimate, active sex`

### Emoji Conflict Resolution

All emoji assignments above are verified clean against the 210 existing presets. Within-category conflicts were resolved as follows (changes from initial draft):

**Part 1 characters:**
- Dominatrix: 🖤→👢 (🖤 taken by BDSM Mistress + Goth Girl in characters)
- Femme Fatale: 🕵️→🕸️ (🕵️ taken by Detective Noir Heroine in characters)
- Seductive Villainess: 😈→🦹 (😈 taken by Demon Girl + Succubus/Demoness in characters)
- Stripper / Pole Dancer: 💃→🪩 (💃 taken by Exotic Dancer in characters)
- Lamia / Snake Woman: 🐍→🐲 (🐍 taken by Monster Girl in characters)
- Kitsune Courtesan: 🦊→🍵 (🦊 taken by Foxgirl/Kitsune in characters)

**Part 2 explicit:**
- Willing Fucktoy: 🎀→🎁 (🎀 taken by Bondage + Lingerie Adjustment in explicit)
- Creampied Mess: 💦→🥄 (💦 taken by Facial/Cumshot in explicit)
- Demon Concubine: 🔥→🌋 (🔥 taken by Riding in explicit)
- Gloryhole Participant: 🕳️→🟣 (🕳️ taken by Gloryhole in explicit)
- Girl Being Eaten Out: 👅→🩷 (👅 taken by Oral in explicit)
- Girl Giving Blowjob: 💋→😮 (💋 taken by Suggestive Position in explicit)
- Girl Getting Anal: 🍑→🔴 (🍑 taken by Anal Sex in explicit)
- Gangbang Participant: 👥→🔢 (👥 taken by Threesome/Group in explicit)
- Double Penetration Subject: ✌️→🤜 (✌️ taken by Double Penetration in explicit)
- Mind-Broken / Ahegao Mid-Act: 🌀→💫 (🌀 taken by Mind Break/Hypnosis in explicit)
- Tentacle Violation Subject: 🐙→🌪️ (to avoid within-new conflict with Tentacle Monster's Bride 🐙)

**Part 3 explicit scenes:**
- Mid-Missionary Scene: 🔒→🛏️ (to avoid within-new conflict with Girl Being Fucked 🔒)
- Active Cowgirl Ride: 🪑→🏇 (to avoid within-new conflict with Girl Riding Cowgirl 🪑)
- Mid-Blowjob Scene: 💋→👄 (💋 taken by Suggestive Position in existing explicit)
- Mid-Cunnilingus Scene: 👅→🌼 (👅 taken by Oral in existing explicit)
- Active Spitroast Scene: 🍡→🍢 (to avoid within-new conflict with Spitroast Subject 🍡)
- Active Gangbang Scene: 👥→🫂 (👥 taken by Threesome/Group in existing explicit)
- Mid-Anal Scene: 🍑→🫣 (🍑 taken by Anal Sex in existing explicit)
- Active Double Penetration: ✌️→🤞 (✌️ taken by Double Penetration in existing explicit)
- Active Bondage Play Scene: ⛓️→🧲 (to avoid within-new conflict with Sex Slave/Naked Captive ⛓️)
- Active Pet Play Scene: 🐾→🦴 (to avoid within-new conflict with Naked Pet/Human Pet 🐾)
- Active Pegging Scene: 🎯→🔁 (to avoid within-new conflict with Girl Being Pegged 🎯)
- Active Hypno Scene: 🔮→🌠 (to avoid within-new conflict with Hypno Sex Slave 🔮)
- Gloryhole In-Use Scene: 🕳️→🪤 (🕳️ taken by Gloryhole in existing explicit)
- Active Squirting Scene: 🌊→🫧 (to avoid within-new conflict with Squirting/Mid-Orgasm 🌊)
- Mid-Creampie Scene: 💦→💧 (💦 taken by Facial/Cumshot in existing explicit)

## Files to Modify

- `src/data/presetLibrary.json` — append 95 new preset objects
