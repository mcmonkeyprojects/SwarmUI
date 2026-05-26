const fs = require('fs');
const path = require('path');

const dumpPath = 'c:/Users/Phala/SwarmUI/swarmui-react/scratch/characters_dump.json';
const characters = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));

const anatomyKeywords = [
  'jawline', 'cheekbones', 'collarbone', 'clavicle', 'muscle', 'muscular', 'physique', 'build',
  'shoulders', 'hips', 'waist', 'complexion', 'skin', 'body', 'height', 'neck', 'eyes', 'ears',
  'forehead', 'cheek', 'lip', 'nose', 'chin', 'athletic', 'slender', 'toned', 'lean', 'stature',
  'torso', 'limbs', 'wrists', 'hands', 'proportion', 'hourglass', 'petite', 'sturdy', 'robust'
];

let totalCharacters = characters.length;
let withAnatomyCount = 0;
const report = [];

characters.forEach(c => {
  const allWords = [
    ...c.words,
    ...c.variations.flatMap(v => v.words)
  ].map(w => w.toLowerCase());

  const foundKeywords = [];
  anatomyKeywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (allWords.some(w => regex.test(w))) {
      foundKeywords.push(kw);
    }
  });

  const hasAnatomy = foundKeywords.length >= 3; // Let's say 3 or more keywords is robust
  if (hasAnatomy) {
    withAnatomyCount++;
  }

  report.push({
    id: c.id,
    name: c.name,
    foundKeywords,
    keywordCount: foundKeywords.length,
    isRobust: hasAnatomy
  });
});

console.log('--- ANATOMICAL DETAILS AUDIT REPORT ---');
console.log(`Total Character Presets Audited: ${totalCharacters}`);
console.log(`Presets with Robust Anatomy (>= 3 terms): ${withAnatomyCount}`);
console.log(`Presets lacking Robust Anatomy: ${totalCharacters - withAnatomyCount}`);
console.log('\nSample Presets lacking robust anatomy:');
report.filter(r => !r.isRobust).slice(0, 15).forEach(r => {
  console.log(`- [${r.id}] "${characters.find(c => c.id === r.id).name}": keywords found: [${r.foundKeywords.join(', ')}]`);
});

fs.writeFileSync('c:/Users/Phala/SwarmUI/swarmui-react/scratch/anatomy_audit_report.json', JSON.stringify({
  summary: {
    totalCharacters,
    withAnatomyCount,
    lackingCount: totalCharacters - withAnatomyCount
  },
  details: report
}, null, 2), 'utf8');
