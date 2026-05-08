import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const TEMP_MODULE_PATH = resolve(process.cwd(), 'scripts', '.theme-contrast-audit-themeStore.mjs');
const THEME_STORE_PATH = resolve(process.cwd(), 'src', 'store', 'themeStore.ts');
// Text contrast assertions (WCAG 2.2 §1.4.3, 4.5:1 for normal text).
const AUDIT_CASES = [
  { name: 'text-on-app', textVar: '--theme-text-on-app', bgVar: '--theme-surface-app', threshold: 4.5 },
  { name: 'text-on-panel', textVar: '--theme-text-on-panel', bgVar: '--theme-surface-panel', threshold: 4.5 },
  { name: 'text-on-card', textVar: '--theme-text-on-card', bgVar: '--theme-surface-card', threshold: 4.5 },
  { name: 'text-on-input', textVar: '--theme-text-on-input', bgVar: '--theme-surface-input', threshold: 4.5 },
  { name: 'text-on-dropdown', textVar: '--theme-text-on-dropdown', bgVar: '--theme-surface-dropdown', threshold: 4.5 },
  { name: 'text-primary-on-card', textVar: '--theme-text-primary', bgVar: '--theme-surface-card', threshold: 4.5 },
  { name: 'text-secondary-on-card', textVar: '--theme-text-secondary', bgVar: '--theme-surface-card', threshold: 3.5 },
  { name: 'selected-text', textVar: '--theme-selected-text', bgVar: '--theme-selected-surface', threshold: 4.5 },
  { name: 'interactive-text', textVar: '--theme-interactive-text', bgVar: '--theme-interactive-active-surface', threshold: 4.5 },
];

// Non-text contrast assertions for *strict* WCAG requirements:
//   - WCAG 2.2 §1.4.11 Non-text Contrast: 3:1 for component boundaries
//   - WCAG 2.2 §2.4.13 Focus Appearance: 3:1 for focus indicators
// Focus rings and selection borders must stand out against every surface
// they can appear on. Failures here block the build.
const NON_TEXT_CASES = [
  { name: 'focus-ring-on-app', fgVar: '--theme-focus-ring', bgVar: '--theme-surface-app', threshold: 3.0 },
  { name: 'focus-ring-on-panel', fgVar: '--theme-focus-ring', bgVar: '--theme-surface-panel', threshold: 3.0 },
  { name: 'focus-ring-on-card', fgVar: '--theme-focus-ring', bgVar: '--theme-surface-card', threshold: 3.0 },
  { name: 'selected-border-on-card', fgVar: '--theme-selected-border', bgVar: '--theme-surface-card', threshold: 3.0 },
];

// Soft non-text assertions: decorative *fill* states (selected surfaces,
// active interactive surfaces) where the boundary is the WCAG-relevant
// signal, not the fill itself. Reported as warnings so theme authors can
// improve contrast, but not gated since the strict border/text cases above
// already guarantee state can be identified.
const SOFT_NON_TEXT_CASES = [
  { name: 'selected-surface-on-card', fgVar: '--theme-selected-surface', bgVar: '--theme-surface-card', threshold: 3.0 },
  { name: 'interactive-active-on-card', fgVar: '--theme-interactive-active-surface', bgVar: '--theme-surface-card', threshold: 3.0 },
];

const TONES = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];

class MockStyle {
  constructor() {
    this.map = new Map();
  }

  setProperty(name, value) {
    this.map.set(name, String(value));
  }

  getPropertyValue(name) {
    return this.map.get(name) ?? '';
  }
}

class MockRoot {
  constructor() {
    this.style = new MockStyle();
    this.attributes = new Map();
    this.dataset = {};
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name.startsWith('data-')) {
      this.dataset[toDatasetKey(name)] = stringValue;
    }
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) {
      delete this.dataset[toDatasetKey(name)];
    }
  }
}

function toDatasetKey(attributeName) {
  return attributeName
    .slice(5)
    .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function normalizeHexColor(input, fallback = '#000000') {
  if (!input) {
    return fallback;
  }

  const trimmed = String(input).trim();
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const shortMatch = /^#([0-9a-f]{3})$/i.exec(normalized);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split('')
      .map((value) => value + value)
      .join('')
      .toLowerCase()}`;
  }

  if (/^#([0-9a-f]{6})$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  return fallback;
}

function hexToRgb(hexColor) {
  const normalized = normalizeHexColor(hexColor).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function toLinearChannel(value) {
  const normalized = value / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hexColor) {
  const rgb = hexToRgb(hexColor);
  return 0.2126 * toLinearChannel(rgb.r) + 0.7152 * toLinearChannel(rgb.g) + 0.0722 * toLinearChannel(rgb.b);
}

function getContrastRatio(foreground, background) {
  const lighter = Math.max(getRelativeLuminance(foreground), getRelativeLuminance(background));
  const darker = Math.min(getRelativeLuminance(foreground), getRelativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function readHexVar(root, name) {
  const value = normalizeHexColor(root.style.getPropertyValue(name), '');
  if (!value) {
    throw new Error(`Missing or non-hex CSS variable: ${name}`);
  }
  return value;
}

function readToneBackground(root, tone) {
  const value = root.style.getPropertyValue(`--theme-tone-${tone}-bg`);
  const match = /,\s*(#[0-9a-f]{6})\s*$/i.exec(value);
  if (!match) {
    throw new Error(`Missing trailing tone fill color for ${tone}: ${value}`);
  }
  return normalizeHexColor(match[1], '');
}

async function importThemeStoreModule() {
  const source = await readFile(THEME_STORE_PATH, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: 'themeStore.ts',
  });

  await writeFile(TEMP_MODULE_PATH, transpiled.outputText, 'utf8');

  const originalDebug = console.debug;
  console.debug = () => {};

  const originalLocalStorage = globalThis.localStorage;
  const originalDocument = globalThis.document;

  try {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    globalThis.document = { documentElement: new MockRoot() };

    return await import(`${pathToFileURL(TEMP_MODULE_PATH).href}?t=${Date.now()}`);
  } finally {
    console.debug = originalDebug;
    globalThis.localStorage = originalLocalStorage;
    globalThis.document = originalDocument;
  }
}

function buildToneCases(root) {
  return TONES.map((tone) => ({
    name: `tone-${tone}`,
    text: readHexVar(root, `--theme-tone-${tone}-text`),
    background: readToneBackground(root, tone),
    threshold: 4.5,
  }));
}

function runCase(themeId, modeLabel, caseName, text, background, threshold, curated, soft = false) {
  const ratio = getContrastRatio(text, background);
  return {
    themeId,
    modeLabel,
    caseName,
    text,
    background,
    threshold,
    ratio,
    passed: ratio >= threshold,
    curated,
    soft,
  };
}

try {
  const themeStoreModule = await importThemeStoreModule();
  const {
    THEME_PALETTES,
    applyThemeToCSS,
    CURATED_DARK_THEMES,
    CURATED_LIGHT_THEMES,
  } = themeStoreModule;
  const curatedDark = new Set(CURATED_DARK_THEMES ?? []);
  const curatedLight = new Set(CURATED_LIGHT_THEMES ?? []);
  const results = [];

  for (const theme of THEME_PALETTES) {
    for (const isLightMode of [false, true]) {
      const root = new MockRoot();
      globalThis.document = { documentElement: root };
      applyThemeToCSS(theme, isLightMode, null);

      const modeLabel = isLightMode ? 'light' : 'dark';
      const curated = isLightMode ? curatedLight.has(theme.id) : curatedDark.has(theme.id);

      for (const auditCase of AUDIT_CASES) {
        results.push(
          runCase(
            theme.id,
            modeLabel,
            auditCase.name,
            readHexVar(root, auditCase.textVar),
            readHexVar(root, auditCase.bgVar),
            auditCase.threshold,
            curated
          )
        );
      }

      for (const nonTextCase of NON_TEXT_CASES) {
        results.push(
          runCase(
            theme.id,
            modeLabel,
            nonTextCase.name,
            readHexVar(root, nonTextCase.fgVar),
            readHexVar(root, nonTextCase.bgVar),
            nonTextCase.threshold,
            curated,
            false
          )
        );
      }

      for (const softCase of SOFT_NON_TEXT_CASES) {
        results.push(
          runCase(
            theme.id,
            modeLabel,
            softCase.name,
            readHexVar(root, softCase.fgVar),
            readHexVar(root, softCase.bgVar),
            softCase.threshold,
            curated,
            true
          )
        );
      }

      for (const toneCase of buildToneCases(root)) {
        results.push(
          runCase(
            theme.id,
            modeLabel,
            toneCase.name,
            toneCase.text,
            toneCase.background,
            toneCase.threshold,
            curated
          )
        );
      }
    }
  }

  const strictResults = results.filter((result) => !result.soft);
  const softResults = results.filter((result) => result.soft);
  const strictFailures = strictResults.filter((result) => !result.passed);
  const softFailures = softResults.filter((result) => !result.passed);
  const curatedStrictFailures = strictFailures.filter((result) => result.curated);
  const curatedSoftFailures = softFailures.filter((result) => result.curated);
  const worstStrict = [...strictResults].sort((a, b) => a.ratio - b.ratio).slice(0, 12);
  const curatedAssertionCount = results.reduce((count, result) => {
    return result.curated ? count + 1 : count;
  }, 0);

  console.log('Theme Contrast Audit');
  console.log('====================');
  console.log(`Themes checked: ${THEME_PALETTES.length}`);
  console.log(`Color schemes checked: ${THEME_PALETTES.length * 2}`);
  console.log(`Strict assertions checked: ${strictResults.length}`);
  console.log(`Soft (advisory) assertions checked: ${softResults.length}`);
  console.log(`Curated assertions checked: ${curatedAssertionCount}`);
  console.log(`Strict failures: ${strictFailures.length} (curated: ${curatedStrictFailures.length})`);
  console.log(`Soft failures: ${softFailures.length} (curated: ${curatedSoftFailures.length})`);
  console.log('');
  console.log('Worst strict ratios');
  console.log('-------------------');

  for (const result of worstStrict) {
    const tag = result.curated ? ' [curated]' : '';
    console.log(
      `${result.themeId} (${result.modeLabel}) ${result.caseName}${tag} | ratio=${result.ratio.toFixed(2)} threshold=${result.threshold}`
    );
  }

  if (strictFailures.length > 0) {
    console.log('');
    console.log('Strict failures (block build)');
    console.log('-----------------------------');
    for (const failure of strictFailures) {
      const tag = failure.curated ? ' [curated]' : '';
      console.log(
        `${failure.themeId} (${failure.modeLabel}) ${failure.caseName}${tag} | ratio=${failure.ratio.toFixed(2)} threshold=${failure.threshold} text=${failure.text} bg=${failure.background}`
      );
    }
    if (curatedStrictFailures.length > 0) {
      console.log('');
      console.log('Curated preset strict failures (must be zero before shipping)');
      console.log('-------------------------------------------------------------');
      for (const failure of curatedStrictFailures) {
        console.log(
          `${failure.themeId} (${failure.modeLabel}) ${failure.caseName} | ratio=${failure.ratio.toFixed(2)} threshold=${failure.threshold}`
        );
      }
    }
    process.exitCode = 1;
  } else {
    console.log('');
    console.log('All strict (WCAG-required) theme contrast assertions pass.');
  }

  if (softFailures.length > 0) {
    console.log('');
    console.log('Soft (advisory) failures');
    console.log('------------------------');
    console.log('These are decorative fill cases where the boundary already');
    console.log('carries the WCAG signal. Reported for theme-author awareness');
    console.log('but they do not gate the build.');
    if (curatedSoftFailures.length > 0) {
      console.log(`Curated themes with soft failures: ${curatedSoftFailures.length}`);
    }
  }
} finally {
  globalThis.document = undefined;
  globalThis.localStorage = undefined;
  await rm(TEMP_MODULE_PATH, { force: true });
}
