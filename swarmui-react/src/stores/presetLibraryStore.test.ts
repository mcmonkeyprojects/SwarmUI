
class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

// Instantiate global localStorage before importing store so persist reads it
globalThis.localStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: globalThis,
});
import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from 'vitest';
import type { LibraryPreset } from '../features/presetLibrary/types';
import type { usePresetLibraryStore as usePresetLibraryStoreType } from './presetLibraryStore';

let usePresetLibraryStore: typeof usePresetLibraryStoreType;
let PRESET_LIBRARY_MIGRATION_FLAG_KEY: string;
let PRESET_LIBRARY_STORAGE_KEY: string;
let WIZARD_PRESET_STORAGE_KEY: string;

beforeAll(async () => {
  const storeModule = await import('./presetLibraryStore');
  usePresetLibraryStore = storeModule.usePresetLibraryStore;
  PRESET_LIBRARY_MIGRATION_FLAG_KEY = storeModule.PRESET_LIBRARY_MIGRATION_FLAG_KEY;
  PRESET_LIBRARY_STORAGE_KEY = storeModule.PRESET_LIBRARY_STORAGE_KEY;
  WIZARD_PRESET_STORAGE_KEY = storeModule.WIZARD_PRESET_STORAGE_KEY;
});

vi.mock('../data/promptTags.json', () => ({
  default: [
    { id: 'tag-knight', text: 'Knight' },
    { id: 'tag-armor', text: 'Armor' },
    { id: 'tag-sword', text: 'Sword' },
  ],
}));

function createPreset(overrides: Partial<LibraryPreset> = {}): LibraryPreset {
  return {
    id: 'pl-heroic-knight',
    name: 'Heroic Knight',
    category: 'characters',
    words: ['Knight', 'Armor', 'Sword'],
    isDefault: true,
    ...overrides,
  };
}

function resetStore(): void {
  usePresetLibraryStore.getState().resetEphemeral();
  usePresetLibraryStore.setState({
    userPresets: [],
    activeCategory: 'characters',
    showExplicit: false,
  });
}

describe('presetLibraryStore', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    if (globalThis.localStorage && globalThis.localStorage !== MemoryStorage.prototype) {
      originalLocalStorage = globalThis.localStorage;
    }
    globalThis.localStorage.clear();
    if (usePresetLibraryStore) {
      resetStore();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    }
    if (usePresetLibraryStore) {
      resetStore();
    }
  });

  it('stages preset words without duplicates', () => {
    usePresetLibraryStore
      .getState()
      .stagePreset(createPreset({ words: ['Knight', 'Armor', 'Knight'] }));

    const state = usePresetLibraryStore.getState();
    expect(state.stagedWords).toEqual(['Knight', 'Armor']);
    expect(state.stagedFromPresetIds).toEqual(['pl-heroic-knight']);
  });

  it('ignores empty presets during staging', () => {
    usePresetLibraryStore.getState().stagePreset(createPreset({ words: [] }));
    expect(usePresetLibraryStore.getState().stagedWords).toEqual([]);
  });

  it('keeps shared words when un-staging one of two overlapping presets', () => {
    usePresetLibraryStore.getState().stagePreset(createPreset());
    usePresetLibraryStore.getState().stagePreset(
      createPreset({
        id: 'pl-sword-master',
        name: 'Sword Master',
        words: ['Sword', 'Cape'],
      })
    );

    usePresetLibraryStore.getState().unstagePreset('pl-heroic-knight');
    const state = usePresetLibraryStore.getState();
    expect(state.stagedWords).toEqual(['Sword', 'Cape']);
    expect(state.stagedFromPresetIds).toEqual(['pl-sword-master']);
  });

  it('unstages words case-insensitively and prunes orphan presets', () => {
    usePresetLibraryStore.getState().stagePreset(createPreset());
    usePresetLibraryStore.getState().unstageWord('knight');

    const state = usePresetLibraryStore.getState();
    expect(state.stagedWords).toEqual(['Armor', 'Sword']);
    expect(state.stagedFromPresetIds).toEqual(['pl-heroic-knight']);

    usePresetLibraryStore.getState().unstageWord('armor');
    usePresetLibraryStore.getState().unstageWord('Sword');
    expect(usePresetLibraryStore.getState().stagedFromPresetIds).toEqual([]);
  });

  it('commits staged words and clears the cart', () => {
    usePresetLibraryStore.getState().stagePreset(createPreset());
    const committedText = usePresetLibraryStore.getState().commitStaged();

    expect(committedText).toBe('Knight, Armor, Sword');
    expect(usePresetLibraryStore.getState().stagedWords).toEqual([]);
    expect(usePresetLibraryStore.getState().stagedFromPresetIds).toEqual([]);
  });

  it('auto-injects and stacks breasts and vulva segments when relevant keywords are present', () => {
    usePresetLibraryStore.getState().stagePreset(
      createPreset({
        words: ['1girl', 'heavy cleavage', 'wet pussy', 'blushing face'],
      })
    );
    const committedText = usePresetLibraryStore.getState().commitStaged();

    expect(committedText).toContain('<segment:face,0.65,0.4>');
    expect(committedText).toContain('<segment:breasts,0.65,0.3>');
    expect(committedText).toContain('<segment:vulva,0.65,0.3>');

    expect(committedText).toContain('<segment:face,0.65,0.4> 1girl, blushing face, high detail');
    expect(committedText).toContain('<segment:breasts,0.65,0.3> 1girl, heavy cleavage, high detail');
    expect(committedText).toContain('<segment:vulva,0.65,0.3> 1girl, wet pussy, high detail');

    expect(committedText).toMatch(/<segment:face,0.65,0.4>.*<segment:breasts,0.65,0.3>.*<segment:vulva,0.65,0.3>/);
  });

  it('auto-injects and stacks penis and butt segments when relevant keywords are present', () => {
    usePresetLibraryStore.getState().stagePreset(
      createPreset({
        words: ['1boy', 'erect cock', 'round bubble ass'],
      })
    );
    const committedText = usePresetLibraryStore.getState().commitStaged();

    expect(committedText).toContain('<segment:penis,0.65,0.3>');
    expect(committedText).toContain('<segment:butt,0.65,0.3>');

    expect(committedText).toContain('<segment:penis,0.65,0.3> 1boy, erect cock, high detail');
    expect(committedText).toContain('<segment:butt,0.65,0.3> 1boy, round bubble ass, high detail');
  });

  it('lets staged segment selections remove and add segment prompts', () => {
    usePresetLibraryStore.getState().stagePreset(
      createPreset({
        words: ['1girl', 'blushing face'],
      })
    );

    expect(usePresetLibraryStore.getState().stagedSegments.map((segment) => segment.part)).toEqual(['face']);

    usePresetLibraryStore.getState().setSegmentEnabled('face', false);
    expect(usePresetLibraryStore.getState().stagedSections[0].text).not.toContain('<segment:face');
    expect(usePresetLibraryStore.getState().stagedSegments).toEqual([]);

    usePresetLibraryStore.getState().setSegmentEnabled('hands', true);
    expect(usePresetLibraryStore.getState().stagedSections[0].text).toContain('<segment:hand|hands|fingers');
    expect(usePresetLibraryStore.getState().stagedSegments.map((segment) => segment.part)).toEqual(['hands']);
  });

  it('strictly isolates details across segments to prevent cross-contamination', () => {
    usePresetLibraryStore.getState().stagePreset(
      createPreset({
        words: ['1girl', 'rosy cheeks', 'perky nipples', 'perfect fingers'],
      })
    );
    const committedText = usePresetLibraryStore.getState().commitStaged();

    const facePart = committedText.match(/<segment:face,0.65,0.4> ([^<]+)/)?.[1];
    expect(facePart).toContain('rosy cheeks');
    expect(facePart).not.toContain('nipples');
    expect(facePart).not.toContain('fingers');

    const breastsPart = committedText.match(/<segment:breasts,0.65,0.3> ([^<]+)/)?.[1];
    expect(breastsPart).toContain('perky nipples');
    expect(breastsPart).not.toContain('rosy cheeks');
    expect(breastsPart).not.toContain('fingers');

    const handsPart = committedText.match(/<segment:hand\|hands\|fingers,0.6,0.35> ([^<]+)/)?.[1];
    expect(handsPart).toContain('perfect fingers');
    expect(handsPart).not.toContain('rosy cheeks');
    expect(handsPart).not.toContain('nipples');
  });

  it('persists only user presets, active category, and explicit toggle', async () => {
    const store = usePresetLibraryStore.getState();
    store.addUserPreset({
      name: 'My Preset',
      category: 'styles',
      words: ['Painterly', 'Soft light'],
    });
    store.setActiveCategory('styles');
    store.setShowExplicit(true);
    store.setSearchQuery('knight');
    store.stagePreset(createPreset());

    // Wait for Zustand v5's microtask storage persist queue to flush
    await new Promise((resolve) => setTimeout(resolve, 20));

    const persistedRaw = globalThis.localStorage.getItem(PRESET_LIBRARY_STORAGE_KEY);
    expect(persistedRaw).toBeTruthy();

    const persisted = JSON.parse(persistedRaw as string);
    expect(persisted.state.userPresets).toHaveLength(1);
    expect(persisted.state.activeCategory).toBe('styles');
    expect(persisted.state.showExplicit).toBe(true);
    expect(persisted.state.searchQuery).toBeUndefined();
    expect(persisted.state.stagedWords).toBeUndefined();
    expect(persisted.state.stagedFromPresetIds).toBeUndefined();
  });

  it('migrates legacy wizard presets once and strips the old persisted field', async () => {
    globalThis.localStorage.setItem(
      WIZARD_PRESET_STORAGE_KEY,
      JSON.stringify({
        state: {
          userBrowserPresets: [
            {
              id: 'browser-preset-legacy',
              name: 'Legacy Hero',
              category: 'characters',
              tagIds: ['tag-knight', 'tag-armor'],
              description: 'Legacy preset',
              thumbnail: 'K',
            },
          ],
        },
      })
    );

    await usePresetLibraryStore.getState().migrateFromWizardStore();

    const state = usePresetLibraryStore.getState();
    expect(state.userPresets).toHaveLength(1);
    expect(state.userPresets[0].words).toEqual(['Knight', 'Armor']);
    expect(globalThis.localStorage.getItem(PRESET_LIBRARY_MIGRATION_FLAG_KEY)).toBe('done');

    const wizardStore = JSON.parse(
      globalThis.localStorage.getItem(WIZARD_PRESET_STORAGE_KEY) as string
    );
    expect(wizardStore.state.userBrowserPresets).toBeUndefined();

    await usePresetLibraryStore.getState().migrateFromWizardStore();
    expect(usePresetLibraryStore.getState().userPresets).toHaveLength(1);
  });

  it('filters explicit and nsfw tokens from stagedWords when sfwMode is enabled', () => {
    const store = usePresetLibraryStore.getState();
    store.stagePreset(
      createPreset({
        id: 'pl-explicit-test',
        category: 'explicit',
        words: ['1girl', 'blonde hair', 'bare vulva', 'visible clit'],
      })
    );

    // Turn SFW mode on
    store.setSfwMode(true);
    let state = usePresetLibraryStore.getState();
    expect(state.stagedWords).not.toContain('bare vulva');
    expect(state.stagedWords).not.toContain('visible clit');
    expect(state.stagedWords).not.toContain('1girl');

    // Turn SFW mode off
    store.setSfwMode(false);
    state = usePresetLibraryStore.getState();
    expect(state.stagedWords).toContain('bare vulva');
    expect(state.stagedWords).toContain('visible clit');
    expect(state.stagedWords).toContain('1girl');
  });
});
