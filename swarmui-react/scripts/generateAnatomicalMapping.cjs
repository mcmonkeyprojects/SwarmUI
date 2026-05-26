const fs = require('fs');
const path = require('path');

const dumpPath = 'c:/Users/Phala/SwarmUI/swarmui-react/scratch/characters_dump.json';
const characters = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));

function getAnatomyType(c) {
  const id = c.id.toLowerCase();
  const name = c.name.toLowerCase();
  const words = c.words.join(' ').toLowerCase();
  const allText = `${id} ${name} ${words}`;

  // 1. Highly Explicit & Sensual Characters (Precedence over generic/creature types)
  const explicitKeywords = [
    'succubus', 'mistress', 'nurse', 'courtesan', 'seductress', 'bdsm', 'naughty', 'french-maid',
    'exotic-dancer', 'submissive-pet', 'temptress', 'futa', 'milf', 'corrupted-nun', 'dominatrix',
    'pro-domme', 'pinup', 'burlesque', 'belly-dancer', 'camgirl', 'concubine', 'odalisque',
    'sugar-baby', 'kept-woman', 'nude-life', 'sexy-librarian', 'masseuse', 'bimbo', 'sex-worker',
    'call-girl', 'lingerie', 'seductive', 'stripper', 'escort', 'lilith'
  ];
  const isExplicit = explicitKeywords.some(kw => id.includes(kw) || name.includes(kw.replace('-', ' ')));
  if (isExplicit) return 'female-explicit';

  // 2. Specific Unique Creatures
  if (id.includes('slime') || name.includes('slime')) return 'slime';
  if (id.includes('crystal') || name.includes('crystal')) return 'crystal';
  if (id.includes('plant') || name.includes('plant')) return 'plant';
  if (id.includes('moth') || name.includes('moth')) return 'moth';
  if (id.includes('void') || name.includes('void')) return 'void';
  if (id.includes('tentacle') || name.includes('tentacle')) return 'tentacle';
  if (id.includes('centaur') || name.includes('centaur')) return 'centaur';
  if (id.includes('arachne') || name.includes('spider')) return 'arachne';
  if (id.includes('dragon') || name.includes('dragon') || id.includes('draconic')) return 'dragon';
  if (id.includes('lich') || id.includes('undead') || id.includes('zombie') || id.includes('ghost') || name.includes('lich') || name.includes('undead') || name.includes('zombie') || name.includes('ghost')) return 'undead';

  // 3. Androids / Robots / Holograms
  if (id.includes('android') || id.includes('cyborg') || id.includes('robot') || id.includes('hologram') || name.includes('android') || name.includes('cyborg') || name.includes('robot') || name.includes('hologram')) return 'android';

  // 4. Elves and Vampires
  if (id.includes('elf') || name.includes('elf')) return 'elf';
  if (id.includes('vampire') || name.includes('vampire') || id.includes('vamp') || name.includes('vamp')) return 'vampire';

  // 5. Succubus / Demon fallback
  if (id.includes('demon') || name.includes('demon')) return 'demon';

  // 6. Aliens
  if (id.includes('alien') || name.includes('alien')) {
    if (id.includes('male') || name.includes('male') || id.includes('prince') || name.includes('prince')) return 'male-alien';
    return 'female-alien';
  }

  // 7. Anthro / Beast Characters
  if (id.includes('wolf') || id.includes('catgirl') || id.includes('neko') || id.includes('fox') || id.includes('kitsune') || id.includes('bunny') || id.includes('cow') || id.includes('furry') || id.includes('anthro') || id.includes('harpy') || name.includes('wolf') || name.includes('catgirl') || name.includes('neko') || name.includes('fox') || name.includes('kitsune') || name.includes('bunny') || name.includes('cow') || name.includes('furry') || name.includes('anthro') || name.includes('harpy') || name.includes('familiar')) return 'beast-girl';

  // 8. Orcs / Goblins (using strict word check to avoid s-orc-eress and f-orc-e)
  const isOrc = /\b(orc|orcs|goblin|goblins)\b/i.test(name) || /\b(orc|orcs|goblin|goblins)\b/i.test(id) || id.includes('dragonkin');
  if (isOrc) return 'orc-goblin';

  // 9. Males
  const isMale = id.includes('male-') || id.includes('boy-') || id.includes('guy-') || id.includes('man-') || name.includes('male') || name.includes('boy') || name.includes('guy') || name.includes('gentleman') || name.includes('monk') || name.includes('shogun') || id.includes('ronin') || name.includes('ronin') || name.includes('husband') || name.includes('father');
  if (isMale) {
    if (allText.includes('muscular') || allText.includes('bodybuilder') || allText.includes('barbarian') || allText.includes('gladiator') || allText.includes('knight') || allText.includes('viking') || allText.includes('warrior')) return 'male-muscular';
    if (allText.includes('slender') || allText.includes('lean') || allText.includes('bishonen') || allText.includes('prince') || allText.includes('boy')) return 'male-slender';
    return 'male-standard';
  }

  // 10. Females (default fallback)
  if (allText.includes('curvy') || allText.includes('hourglass') || allText.includes('milf') || allText.includes('bbw') || allText.includes('plump') || allText.includes('chubby') || allText.includes('busty') || allText.includes('thick thighs') || allText.includes('mature female')) return 'female-curvy';

  if (allText.includes('muscular') || allText.includes('tomboy') || allText.includes('fit') || allText.includes('athletic') || allText.includes('warrior') || allText.includes('valkyrie') || allText.includes('gladiator') || allText.includes('fighter') || allText.includes('ninja') || allText.includes('amazon') || allText.includes('bodybuilder') || id.includes('sorceress') || name.includes('sorceress') || id.includes('queen') || name.includes('queen') || id.includes('princess') || name.includes('princess')) return 'female-athletic';

  // Clean checks for petite/cute using word boundaries
  const isPetite = allText.includes('cute') || /\bgirl\b/i.test(name) || (id.includes('girl') && !id.includes('dragon') && !id.includes('wolf') && !id.includes('beast') && !id.includes('catgirl')) || allText.includes('maid') || allText.includes('lolita') || allText.includes('school') || allText.includes('petite') || allText.includes('goth') || allText.includes('secretary');
  if (isPetite) return 'female-petite';

  return 'female-standard';
}

const mappings = {};

characters.forEach(c => {
  const type = getAnatomyType(c);
  let anatomyTags = [];

  switch (type) {
    case 'slime':
      anatomyTags = [
        '(translucent gelatinous body structure:1.15)',
        '(smooth glossy surface sheen:1.1)',
        'soft fluid body curves',
        'bouncy gelatinous breasts and rounded hips',
        'semi-liquid hair flow',
        'viscous glowing physique'
      ];
      break;
    case 'crystal':
      anatomyTags = [
        '(gemstone skin texture with prismatic highlights:1.15)',
        '(faceted crystalline body markings:1.1)',
        'sharp mineral silhouette',
        'firm faceted breasts and sculpted hips',
        'translucent crystal hair structure',
        'glowing inner chest core'
      ];
      break;
    case 'plant':
      anatomyTags = [
        '(photosynthetic leaf-patterned skin:1.15)',
        '(delicate organic vine-like hair coils:1.1)',
        'natural hourglass body contours with supple breasts and hips',
        'slender neck and organic collarbones',
        'delicate blooming flower details on shoulders'
      ];
      break;
    case 'moth':
      anatomyTags = [
        '(fuzzy soft fur texture on shoulders and collarbones:1.15)',
        '(slender insectoid compound eyes and antennae:1.1)',
        'delicate petite frame with small perk breasts',
        'slender lightweight limbs',
        'soft velvet pale skin'
      ];
      break;
    case 'void':
      anatomyTags = [
        '(starfield nebula patterned skin texture:1.15)',
        '(black sclera with glowing iris:1.1)',
        'floating ethereal hair structure',
        'slender cosmic silhouette with defined curves',
        'defined elegant collarbones and shoulders'
      ];
      break;
    case 'tentacle':
      anatomyTags = [
        '(slick smooth skin with bioluminescent markings:1.15)',
        '(unusual flexible body anatomy:1.1)',
        'slender waist and soft voluptuous curves',
        'plump firm breasts',
        'tendril-like hair silhouette',
        'glossy skin highlights'
      ];
      break;
    case 'centaur':
      anatomyTags = [
        '(muscular equine lower body with powerful legs:1.15)',
        '(toned slender human female upper torso:1.1)',
        'defined flat abs',
        'firm perk breasts',
        'prominent collarbones and shoulders',
        'graceful equine posture'
      ];
      break;
    case 'arachne':
      anatomyTags = [
        '(glossy chitinous spider lower body with eight legs:1.15)',
        '(slender toned human female upper body:1.1)',
        'defined hourglass waist and firm breasts',
        'prominent elegant collarbones',
        'sharp jawline'
      ];
      break;
    case 'dragon':
      anatomyTags = [
        '(imposing scaly skin texture:1.15)',
        '(powerful muscular tail and sharp back ridges:1.1)',
        'firm scaled breasts',
        'chiseled jawline',
        'glowing reptilian eyes',
        'clawed hands with defined tendons'
      ];
      break;
    case 'undead':
      anatomyTags = [
        '(prominent bone structure and skeletal chest:1.15)',
        '(sunken hollow cheeks:1.1)',
        'emaciated slender limbs',
        'sharp collarbones and defined shoulders',
        'pale grey decayed skin texture'
      ];
      break;
    case 'android':
      anatomyTags = [
        '(perfect symmetrical humanoid proportions:1.15)',
        '(flawless synthetic skin with subtle metallic sheen:1.1)',
        'seamless panel seams and glowing joints',
        'defined sleek cybernetic neck and shoulders',
        'polished artificial torso structure'
      ];
      break;
    case 'elf':
      anatomyTags = [
        '(slender elegant elven frame:1.15)',
        '(prominent elegant collarbones and long neck:1.1)',
        'perk elegant breasts',
        'slender waist and firm neat butt',
        'delicate high cheekbones',
        'pointed elven ears',
        'pale flawless glowing skin texture',
        'long slender graceful fingers'
      ];
      break;
    case 'vampire':
      anatomyTags = [
        '(aristocratic sharp cheekbones and cold defined jawline:1.15)',
        '(slender elegant neck and prominent collarbones:1.1)',
        'seductive athletic physical frame with perk breasts and firm butt',
        'pale flawless marble skin texture',
        'sharp elongated canine fangs'
      ];
      break;
    case 'demon':
      anatomyTags = [
        '(toned hourglass silhouette:1.15)',
        '(smooth supple skin with subtle sheen:1.1)',
        'plump firm breasts',
        'slender waist',
        'defined flat abs',
        'plump rounded butt',
        'sharp fingernails',
        'graceful back contours'
      ];
      break;
    case 'female-explicit':
      // Highly explicit premium physical and anatomical descriptions (breasts, butt, shaven vulva/pussy, soft pink asshole)
      anatomyTags = [
        '(voluptuous seductive hourglass body contours:1.15)',
        '(perfect plump firm breasts with detailed pink nipples:1.1)',
        'slender narrow waist and flared voluptuous hips',
        'plump heavy rounded butt cheeks and soft pink asshole',
        'perfect clean-shaven vulva pussy, tight pelvic contour',
        'smooth supple flawless glowing skin',
        'seductive bedroom posture'
      ];
      break;
    case 'male-alien':
      anatomyTags = [
        '(luminous extraterrestrial skin markings:1.15)',
        '(sharp chiseled alien facial features:1.1)',
        'tall slender athletic frame',
        'long elegant fingers and hands',
        'otherworldly regal physical posture'
      ];
      break;
    case 'female-alien':
      anatomyTags = [
        '(luminous extraterrestrial skin markings:1.15)',
        '(delicate otherworldly facial structure:1.1)',
        'slender elegant frame with soft alien curves',
        'graceful long neck and collarbones',
        'dainty hands and long slender fingers'
      ];
      break;
    case 'beast-girl':
      anatomyTags = [
        '(athletic toned body curves:1.15)',
        '(graceful flexible creature posture:1.1)',
        'firm perk breasts',
        'slender waist and perky rounded butt',
        'smooth skin with soft fur markings',
        'defined collarbones',
        'delicate features'
      ];
      break;
    case 'orc-goblin':
      anatomyTags = [
        '(broad heavy green-skinned physique:1.15)',
        '(thick muscular shoulders and neck:1.1)',
        'strong protruding lower jaw',
        'rugged chiseled chest',
        'powerful thick arms and clawed hands'
      ];
      break;
    case 'male-muscular':
      anatomyTags = [
        '(heavy muscular chiseled physique:1.15)',
        '(broad powerful shoulders and thick chest:1.1)',
        'defined vascular forearms and arms',
        'strong rugged jawline',
        'tall imposing muscular posture',
        'rippling abs and obliques'
      ];
      break;
    case 'male-slender':
      anatomyTags = [
        '(lean slender athletic build:1.15)',
        '(sharp chiseled jawline and high cheekbones:1.1)',
        'defined neck and prominent collarbones',
        'flat toned midriff',
        'long elegant hands and fingers',
        'tall lean posture'
      ];
      break;
    case 'male-standard':
      anatomyTags = [
        '(broad shoulders and lean athletic build:1.15)',
        '(strong chiseled jawline:1.1)',
        'defined neck muscles and collarbones',
        'vascular forearms',
        'tall powerful posture',
        'firm masculine physique'
      ];
      break;
    case 'female-curvy':
      anatomyTags = [
        '(plump hourglass silhouette:1.15)',
        '(soft full curves with a slender waist:1.1)',
        'generous heavy breasts and wide round hips',
        'soft belly contour and rounded hips',
        'plump heavy butt cheeks',
        'fleshy thick thighs',
        'soft elegant collarbones',
        'smooth flawless skin texture'
      ];
      break;
    case 'female-athletic':
      anatomyTags = [
        '(athletic toned physique:1.15)',
        '(defined midriff and visible abs:1.1)',
        'firm perk breasts and tight toned butt',
        'sculpted shoulders and toned biceps',
        'sharp chiseled jawline',
        'prominent collarbones and long neck',
        'lean muscular thighs and legs'
      ];
      break;
    case 'female-petite':
      anatomyTags = [
        '(petite slender delicate frame:1.15)',
        '(delicate neck and prominent collarbones:1.1)',
        'small perk breasts and neat perky butt',
        'soft rounded symmetrical face',
        'youthful elegant proportions',
        'dainty hands and slender fingers',
        'flawless smooth porcelain skin texture'
      ];
      break;
    case 'female-standard':
      anatomyTags = [
        '(slender waist and elegant hourglass curves:1.15)',
        '(defined elegant collarbones and long neck:1.1)',
        'firm perk breasts and soft curved hips',
        'graceful rounded butt cheeks',
        'gently sloped shoulders',
        'soft symmetrical facial features with defined cheekbones',
        'flawless smooth skin texture',
        'graceful feminine body posture'
      ];
      break;
  }

  mappings[c.id] = {
    name: c.name,
    type: type,
    proposedTags: anatomyTags
  };
});

fs.writeFileSync('c:/Users/Phala/SwarmUI/swarmui-react/scratch/proposed_anatomy_enhancements.json', JSON.stringify(mappings, null, 2), 'utf8');
console.log(`Generated improved, precise proposed anatomy enhancements with explicit female parameters for ${Object.keys(mappings).length} characters.`);
