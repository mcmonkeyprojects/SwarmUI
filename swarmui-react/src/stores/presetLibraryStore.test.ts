import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryPreset } from '../features/presetLibrary/types';
import {
  PRESET_LIBRARY_MIGRATION_FLAG_KEY,
  PRESET_LIBRARY_STORAGE_KEY,
  WIZARD_PRESET_STORAGE_KEY,
  usePresetLibraryStore,
} from './presetLibraryStore';

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
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    globalThis.localStorage = new MemoryStorage();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
    resetStore();
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

  it('persists only user presets, active category, and explicit toggle', () => {
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
});
