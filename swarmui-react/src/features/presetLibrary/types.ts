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
}

export interface PresetPromptSection {
  category: PresetCategory;
  words: string[];
  text: string;
}

export function isExplicitPreset(preset: LibraryPreset): boolean {
  return preset.category === 'explicit';
}
