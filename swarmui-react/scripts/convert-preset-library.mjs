import { readFileSync, writeFileSync } from 'fs';

const oldPresets = JSON.parse(readFileSync('src/data/promptBrowserPresets.json', 'utf-8'));
const tagLibrary = JSON.parse(readFileSync('src/data/promptTags.json', 'utf-8'));

const tagById = new Map(tagLibrary.map((tag) => [tag.id, tag]));
const missing = [];
const suspicious = [];

function fallbackWordFromTagId(tagId) {
  return tagId
    .replace(/^tag-[^-]+-/, '')
    .replace(/-/g, ' ')
    .trim();
}

const newPresets = oldPresets.map((preset) => {
  const words = preset.tagIds
    .map((tagId) => {
      const tag = tagById.get(tagId);
      if (!tag) {
        missing.push({ preset: preset.id, missingTag: tagId });
        return fallbackWordFromTagId(tagId);
      }

      if (/[()<>]|:\d/.test(tag.text)) {
        suspicious.push({ preset: preset.id, tag: tag.id, text: tag.text });
      }

      return tag.text;
    })
    .filter(Boolean);

  return {
    id: preset.id.replace(/^bp-/, 'pl-'),
    name: preset.name,
    category: preset.category,
    words,
    description: preset.description,
    thumbnail: preset.thumbnail,
    isDefault: true,
  };
});

if (missing.length > 0) {
  console.warn(`Warning: ${missing.length} tag IDs could not be resolved:`);
  missing.slice(0, 20).forEach((entry) => console.warn(`  ${entry.preset} -> ${entry.missingTag}`));
  if (missing.length > 20) {
    console.warn(`  ...and ${missing.length - 20} more`);
  }
}

if (suspicious.length > 0) {
  console.warn('Warning: some tag.text values contain weight or LoRA syntax (review manually):');
  suspicious.slice(0, 10).forEach((entry) => {
    console.warn(`  ${entry.preset} -> ${entry.tag}: "${entry.text}"`);
  });
}

const validPresets = newPresets.filter((preset) => preset.words.length > 0);
const skipped = newPresets.length - validPresets.length;
if (skipped > 0) {
  console.warn(`Warning: skipped ${skipped} presets with zero resolved words`);
}

writeFileSync('src/data/presetLibrary.json', `${JSON.stringify(validPresets, null, 2)}\n`);
console.log(`Wrote ${validPresets.length} presets to src/data/presetLibrary.json`);
