const fs = require('fs');
const path = require('path');

const dbPath = 'c:/Users/Phala/SwarmUI/swarmui-react/src/data/presetLibrary.json';
const backupPath = 'c:/Users/Phala/SwarmUI/swarmui-react/src/data/presetLibrary.json.bak';
const mappingPath = 'c:/Users/Phala/SwarmUI/swarmui-react/scratch/proposed_anatomy_enhancements.json';

console.log('Starting character anatomical details enrichment...');

// 1. Back up database first
try {
  fs.copyFileSync(dbPath, backupPath);
  console.log('Database backup created at:', backupPath);
} catch (err) {
  console.error('Failed to create backup:', err);
  process.exit(1);
}

// 2. Load database and proposed anatomical mappings
let data;
let mappings;
try {
  data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  mappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
} catch (err) {
  console.error('Failed to read database or mappings:', err);
  process.exit(1);
}

console.log(`Loaded database. Total presets: ${data.length}`);
console.log(`Loaded anatomical mappings for ${Object.keys(mappings).length} characters.`);

// List of core subject/gender identifiers to look for when inserting tags
const coreSubjectTags = [
  '1girl', '1boy', '1guy', '1man', '1woman', 'solo', 'centaur', 'arachne', 'slime girl',
  'alien girl', 'alien prince', 'void alien', 'combat android', 'living doll', 'familiar girl',
  'moth girl', 'crystal alien', 'plant alien', 'cyber succubus', 'hologram idol', 'bioengineered girl',
  'space pirate queen', 'moon elf', 'dark elf', 'dragon priestess', 'phoenix girl', 'ice witch queen',
  'lava demon girl', 'shadow beast girl', 'catgirl', 'elf girl', 'dark elf spy', 'cyber samurai',
  'steampunk inventor', 'knight', 'warrior', 'mage', 'sorceress', 'witch', 'samurai', 'cyberpunk hacker'
];

// Helper to inject tags after the first core tag, or after the 2nd tag
function injectAnatomicalTags(wordsList, tagsToInject) {
  if (!wordsList || !Array.isArray(wordsList) || wordsList.length === 0) {
    return [...tagsToInject];
  }

  const result = [...wordsList];

  // Clean tags to inject to avoid duplicates (case insensitive)
  const existingWordsSet = new Set(wordsList.map(w => w.toLowerCase().replace(/[()]/g, '').split(':')[0].trim()));
  const cleanTags = tagsToInject.filter(tag => {
    const rawTagBase = tag.toLowerCase().replace(/[()]/g, '').split(':')[0].trim();
    return !existingWordsSet.has(rawTagBase);
  });

  if (cleanTags.length === 0) {
    return result; // Nothing new to add
  }

  // Find optimal insertion index
  let insertIndex = -1;
  for (let i = 0; i < Math.min(result.length, 3); i++) {
    const wordLower = result[i].toLowerCase();
    const isCore = coreSubjectTags.some(coreTag => wordLower.includes(coreTag));
    if (isCore) {
      insertIndex = i + 1; // Insert immediately after the core tag
    }
  }

  // Fallback insertion index if no core tag found in the first 3 items
  if (insertIndex === -1) {
    insertIndex = Math.min(result.length, 2);
  }

  result.splice(insertIndex, 0, ...cleanTags);
  return result;
}

// Helper to clean up standard/non-explicit anatomical tags from explicit characters to prevent duplicate/conflicting details
const explicitAnatomyKeywordsToRemove = [
  'breast', 'butt', 'waist', 'skin', 'hips', 'collarbone', 'neck', 'shoulders', 'posture', 'hourglass', 'curves', 'silhouette', 'midriff', 'thighs', 'abs', 'physique', 'buttocks'
];

function cleanExplicitTargetWords(wordsList) {
  if (!wordsList || !Array.isArray(wordsList)) return [];
  return wordsList.filter(word => {
    const wl = word.toLowerCase();
    return !explicitAnatomyKeywordsToRemove.some(kw => wl.includes(kw));
  });
}

// 3. Process every preset in the database
let enrichedCount = 0;

data.forEach(preset => {
  if (preset.category === 'characters' && mappings[preset.id]) {
    const mapping = mappings[preset.id];

    // ONLY enrich female presets that are explicit/sensual in nature
    if (mapping.type !== 'female-explicit') {
      return;
    }

    // Clean up standard anatomical/physical description tags first
    preset.words = cleanExplicitTargetWords(preset.words);
    if (preset.variations && Array.isArray(preset.variations)) {
      preset.variations.forEach(variation => {
        variation.words = cleanExplicitTargetWords(variation.words);
      });
    }

    // Enrich parent words list
    const originalLength = preset.words.length;
    preset.words = injectAnatomicalTags(preset.words, mapping.proposedTags);
    const addedCount = preset.words.length - originalLength;

    // Enrich variations words list
    if (preset.variations && Array.isArray(preset.variations)) {
      preset.variations.forEach(variation => {
        variation.words = injectAnatomicalTags(variation.words, mapping.proposedTags);
      });
    }

    enrichedCount++;
    if (enrichedCount <= 10) {
      console.log(`Enriched [${preset.id}] "${preset.name}": injected ${addedCount} tags.`);
    }
  }
});

console.log(`Enrichment complete. Total character presets enriched: ${enrichedCount}`);

// 4. Save the updated database
try {
  const serialized = JSON.stringify(data, null, 2);
  // Syntax safety test
  JSON.parse(serialized);

  fs.writeFileSync(dbPath, serialized, 'utf8');
  console.log('Database successfully saved and verified!');
} catch (err) {
  console.error('Failed to save or verify database. Reverting to backup...', err);
  try {
    fs.copyFileSync(backupPath, dbPath);
    console.log('Reverted database to backup successfully.');
  } catch (revertErr) {
    console.error('CRITICAL: Failed to revert database to backup:', revertErr);
  }
  process.exit(1);
}
