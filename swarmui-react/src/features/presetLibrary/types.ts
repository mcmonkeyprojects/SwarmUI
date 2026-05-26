export type PresetCategory =
  | 'characters'
  | 'scenes'
  | 'styles'
  | 'quality'
  | 'lighting'
  | 'perspectives'
  | 'explicit';

export const PRESET_CATEGORIES: PresetCategory[] = [
  'characters',
  'scenes',
  'styles',
  'quality',
  'lighting',
  'perspectives',
  'explicit',
];

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  characters: 'Characters',
  scenes: 'Scenes',
  styles: 'Styles',
  quality: 'Quality',
  lighting: 'Lighting',
  perspectives: 'Perspectives',
  explicit: 'Explicit',
};

export const PRESET_PROMPT_SECTION_ORDER: PresetCategory[] = [
  'quality',
  'styles',
  'characters',
  'explicit',
  'scenes',
  'perspectives',
  'lighting',
];

export interface PresetVariation {
  id: string;
  name: string;
  words: string[];
  description?: string;
  thumbnail?: string;
  templateVariables?: Record<string, string[]>;
}

export interface LibraryPreset {
  id: string;
  name: string;
  category: PresetCategory;
  words: string[];
  description?: string;
  thumbnail?: string;
  isDefault: boolean;
  createdAt?: number;
  updatedAt?: number;
  variations?: PresetVariation[];
  templateVariables?: Record<string, string[]>;
}

export interface PresetPromptSection {
  category: PresetCategory;
  words: string[];
  text: string;
}

export function isExplicitPreset(preset: LibraryPreset): boolean {
  return preset.category === 'explicit';
}

export interface WeightedWord {
  baseWord: string;
  weight: number;
}

export function parseWeightedWord(word: string): WeightedWord {
  const match = word.trim().match(/^\((.+):([0-9.]+)\)$/);
  if (match) {
    const baseWord = match[1].trim();
    const weight = parseFloat(match[2]);
    if (!isNaN(weight)) {
      return { baseWord, weight };
    }
  }
  return { baseWord: word.trim(), weight: 1.0 };
}

export function formatWeightedWord(baseWord: string, weight: number): string {
  if (weight === 1.0) {
    return baseWord;
  }
  return `(${baseWord}:${Number(weight.toFixed(2))})`;
}
