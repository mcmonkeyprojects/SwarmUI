import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const repoRoot = process.cwd();
const srcRoot = join(repoRoot, 'src');

const ALLOWLIST = new Set([
  'src/theme.ts',
  'src/store/themeStore.ts',
  'src/components/ThemeBuilder.tsx',
  'src/components/ThemePreview.tsx',
  'src/components/ThemePreviewFrame.tsx',
  'src/components/ThemeImporter.tsx',
  'src/components/ui/SwarmActionIcon.tsx',
  'src/components/ui/SwarmButton.tsx',
]);

const NAMED_COLOR_PROP_REGEX = /\b(?:color|c)="(?:red|blue|green|orange|yellow|violet|cyan|pink|gray|dark|teal|lime|grape|indigo|invokeBrand|invokeGray)/g;
const HEX_REGEX = /#[0-9A-Fa-f]{3,8}/g;
const MANTINE_DARK_REGEX = /var\(--mantine-color-dark-/g;
const MANTINE_INVOKE_REGEX = /var\(--mantine-color-invoke(?:Brand|Gray)-/g;
const RAW_MANTINE_IMPORT_REGEX = /import\s*\{([\s\S]*?)\}\s*from\s*['"]@mantine\/core['"]/g;

function listFilesRecursive(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function countMatches(content, regex) {
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function getRawMantineControlImports(content) {
  const controls = new Set();
  let match;

  while ((match = RAW_MANTINE_IMPORT_REGEX.exec(content))) {
    const specifiers = match[1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    for (const specifier of specifiers) {
      if (/^Button(\s+as\s+\w+)?$/.test(specifier)) {
        controls.add('Button');
      }
      if (/^ActionIcon(\s+as\s+\w+)?$/.test(specifier)) {
        controls.add('ActionIcon');
      }
    }
  }

  RAW_MANTINE_IMPORT_REGEX.lastIndex = 0;
  return [...controls];
}

const candidates = listFilesRecursive(srcRoot).filter((filePath) => {
  const ext = extname(filePath);
  return ext === '.tsx' || ext === '.ts' || ext === '.css';
});

const rows = [];

for (const absPath of candidates) {
  const file = relative(repoRoot, absPath).replaceAll('\\', '/');
  if (ALLOWLIST.has(file)) continue;

  const content = readFileSync(absPath, 'utf8');
  const namedProps = countMatches(content, NAMED_COLOR_PROP_REGEX);
  const hexCount = countMatches(content, HEX_REGEX);
  const darkRefs = countMatches(content, MANTINE_DARK_REGEX);
  const invokeRefs = countMatches(content, MANTINE_INVOKE_REGEX);
  const rawMantineControls = getRawMantineControlImports(content);
  const rawMantineControlCount = rawMantineControls.length;

  if (namedProps || hexCount || darkRefs || invokeRefs || rawMantineControlCount) {
    rows.push({
      file,
      namedProps,
      hexCount,
      darkRefs,
      invokeRefs,
      rawMantineControls,
      rawMantineControlCount,
      score: namedProps + hexCount + darkRefs + invokeRefs + rawMantineControlCount * 10,
    });
  }
}

rows.sort((a, b) => b.score - a.score);

const totals = rows.reduce(
  (acc, row) => ({
    namedProps: acc.namedProps + row.namedProps,
    hexCount: acc.hexCount + row.hexCount,
    darkRefs: acc.darkRefs + row.darkRefs,
    invokeRefs: acc.invokeRefs + row.invokeRefs,
    rawMantineControlCount: acc.rawMantineControlCount + row.rawMantineControlCount,
  }),
  { namedProps: 0, hexCount: 0, darkRefs: 0, invokeRefs: 0, rawMantineControlCount: 0 }
);

console.log('Theme Audit Report');
console.log('==================');
console.log(`Files flagged: ${rows.length}`);
console.log(`Named color props: ${totals.namedProps}`);
console.log(`Hex literals: ${totals.hexCount}`);
console.log(`Mantine dark refs: ${totals.darkRefs}`);
console.log(`Mantine invoke refs: ${totals.invokeRefs}`);
console.log(`Raw Mantine Button/ActionIcon imports: ${totals.rawMantineControlCount}`);
console.log('');
console.log('Top hotspots');
console.log('------------');

for (const row of rows.slice(0, 30)) {
  console.log(
    `${row.file} | raw=${row.rawMantineControls.join(',') || '-'} named=${row.namedProps} hex=${row.hexCount} dark=${row.darkRefs} invoke=${row.invokeRefs}`
  );
}

if (rows.length === 0) {
  console.log('No theming issues found outside allowlist.');
}

if (totals.rawMantineControlCount > 0) {
  console.error('');
  console.error('Raw Mantine Button/ActionIcon imports are blockers. Route controls through SwarmButton/SwarmActionIcon.');
  process.exitCode = 1;
}
