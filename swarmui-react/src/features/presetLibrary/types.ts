export type PresetCategory = 'characters' | 'scenes' | 'styles' | 'perspectives' | 'explicit';

export const PRESET_CATEGORIES: PresetCategory[] = [
  'characters',
  'scenes',
  'styles',
  'perspectives',
  'explicit',
];

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  characters: 'Characters',
  scenes: 'Scenes',
  styles: 'Styles',
  perspectives: 'Perspectives',
  explicit: 'Explicit',
};

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

export function isExplicitPreset(preset: LibraryPreset): boolean {
  return preset.category === 'explicit';
}
