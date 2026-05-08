import type {
  RoleplayModelCompatibilitySettings,
  RoleplayPromptBudgetMode,
} from '../types/roleplay';

export interface RoleplayLocalModelProfile {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  recommendedContextTokens: number;
  recommendedMaxTokens: number;
  recommendedTemperature: number;
  promptPresetId: string;
  promptBudgetMode: RoleplayPromptBudgetMode;
  loreEntryLimit: number;
  maxHistoryMessages: number;
  compatibility: Pick<RoleplayModelCompatibilitySettings, 'forceFinalUserTurn' | 'inlineSystemPrompt'>;
}

export const ROLEPLAY_LOCAL_SMALL_PRESET_ID = 'small-local-roleplay';
export const ROLEPLAY_LOCAL_MODEL_PROFILE_DEFAULT_ID = 'local-small-roleplay';

export const ROLEPLAY_LOCAL_MODEL_PROFILES: RoleplayLocalModelProfile[] = [
  {
    id: 'local-small-roleplay',
    label: 'Small Local Roleplay',
    shortLabel: 'Small Local',
    description:
      'Best first choice for 4k-6k local models. Keeps prompts compact, protects recent chat, and uses local-server compatibility guards.',
    recommendedContextTokens: 4096,
    recommendedMaxTokens: 512,
    recommendedTemperature: 0.85,
    promptPresetId: ROLEPLAY_LOCAL_SMALL_PRESET_ID,
    promptBudgetMode: 'compact',
    loreEntryLimit: 4,
    maxHistoryMessages: 24,
    compatibility: {
      forceFinalUserTurn: true,
      inlineSystemPrompt: true,
    },
  },
  {
    id: 'local-balanced-roleplay',
    label: 'Balanced Local Roleplay',
    shortLabel: 'Balanced',
    description:
      'For 8k-12k local models. Includes more memory and lore while still warning when prompt blocks crowd out chat.',
    recommendedContextTokens: 8192,
    recommendedMaxTokens: 768,
    recommendedTemperature: 0.8,
    promptPresetId: ROLEPLAY_LOCAL_SMALL_PRESET_ID,
    promptBudgetMode: 'compact',
    loreEntryLimit: 8,
    maxHistoryMessages: 40,
    compatibility: {
      forceFinalUserTurn: true,
      inlineSystemPrompt: false,
    },
  },
  {
    id: 'remote-large-fallback',
    label: 'Remote or Large Model',
    shortLabel: 'Remote/Large',
    description:
      'Fallback profile for OpenRouter, hosted OpenAI-compatible APIs, or large local models with enough context for fuller prompts.',
    recommendedContextTokens: 16384,
    recommendedMaxTokens: 1024,
    recommendedTemperature: 0.8,
    promptPresetId: 'none',
    promptBudgetMode: 'full',
    loreEntryLimit: 16,
    maxHistoryMessages: 60,
    compatibility: {
      forceFinalUserTurn: false,
      inlineSystemPrompt: false,
    },
  },
];

export function getRoleplayLocalModelProfile(id?: string | null): RoleplayLocalModelProfile {
  return (
    ROLEPLAY_LOCAL_MODEL_PROFILES.find((profile) => profile.id === id) ??
    ROLEPLAY_LOCAL_MODEL_PROFILES[0]
  );
}

export function createRoleplayCompatibilityFromProfile(
  profileId?: string | null
): RoleplayModelCompatibilitySettings {
  const profile = getRoleplayLocalModelProfile(profileId);
  return {
    forceFinalUserTurn: profile.compatibility.forceFinalUserTurn,
    inlineSystemPrompt: profile.compatibility.inlineSystemPrompt,
    localProfileId: profile.id,
    maxContextTokens: profile.recommendedContextTokens,
    memoryBudgetMode: profile.promptBudgetMode,
    loreEntryLimit: profile.loreEntryLimit,
    maxHistoryMessages: profile.maxHistoryMessages,
  };
}
