const fs = require('fs');
const path = require('path');

const dbPath = 'c:/Users/Phala/SwarmUI/swarmui-react/src/data/presetLibrary.json';
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const characters = data.filter(p => p.category === 'characters');

const result = characters.map(c => ({
  id: c.id,
  name: c.name,
  words: c.words,
  variationsCount: c.variations ? c.variations.length : 0,
  variations: c.variations ? c.variations.map(v => ({ id: v.id, name: v.name, words: v.words })) : []
}));

fs.writeFileSync(path.resolve(__dirname, 'characters_dump.json'), JSON.stringify(result, null, 2), 'utf8');
console.log(`Successfully dumped ${characters.length} characters to characters_dump.json.`);
