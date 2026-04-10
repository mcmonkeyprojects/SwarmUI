/**
 * Roleplay interaction style definitions and utilities.
 */
import type { RoleplayInteractionStyle } from '../types/roleplay';

export interface RoleplayInteractionStyleConfig {
  id: RoleplayInteractionStyle;
  label: string;
  description: string;
  systemPrompt: string;
  systemPromptHint: string;
  promptPlaceholder: string;
  sceneSuggestionPrompt: string;
}

export const ROLEPLAY_INTERACTION_STYLES: Array<{
  value: RoleplayInteractionStyle;
  label: string;
}> = [
  { value: 'storyteller', label: 'Storyteller' },
  { value: 'personal-chat', label: 'Personal Chat' },
];

const ROLEPLAY_INTERACTION_STYLE_CONFIGS: Record<
  RoleplayInteractionStyle,
  RoleplayInteractionStyleConfig
> = {
  storyteller: {
    id: 'storyteller',
    label: 'Storyteller',
    description: 'Narrative roleplay with scene descriptions, actions, and dialogue.',
    systemPrompt:
      'Write as the character in an immersive roleplay. Stay in-scene, describe actions and environment when useful, and keep the exchange moving naturally. When a scene is visually vivid and worth illustrating, append [SCENE: detailed image prompt] on its own line.',
    systemPromptHint:
      'Write in a narrative style with scene descriptions, character actions, and natural dialogue.',
    promptPlaceholder:
      'Write as the character in an immersive roleplay scene. Stay in character, describe actions naturally, and continue the story based on the user’s input.',
    sceneSuggestionPrompt:
      'Describe the current visual scene in one vivid image-generation sentence focused on setting, characters, mood, clothing, pose, lighting, and composition.',
  },
  'personal-chat': {
    id: 'personal-chat',
    label: 'Personal Chat',
    description: 'Casual conversational style, like texting or speaking directly.',
    systemPrompt:
      'Reply as the character in direct conversation with the user. Stay natural, personal, and in-character. Prioritize believable dialogue over narration, but still react clearly to what is happening.',
    systemPromptHint:
      'Respond in a casual, conversational tone as if chatting directly with the user.',
    promptPlaceholder:
      'Reply as the character in direct conversation. Keep the tone natural, personal, and in-character.',
    sceneSuggestionPrompt:
      'Describe the current conversation moment as a concise visual image prompt, including setting, expressions, body language, and mood.',
  },
};

export const DEFAULT_ROLEPLAY_INTERACTION_STYLE: RoleplayInteractionStyle = 'storyteller';
export const LEGACY_ROLEPLAY_INTERACTION_STYLE: RoleplayInteractionStyle = 'storyteller';

/**
 * Get the config for a given interaction style, falling back to the default.
 */
export function getRoleplayInteractionStyleConfig(
  style: RoleplayInteractionStyle
): RoleplayInteractionStyleConfig {
  return (
    ROLEPLAY_INTERACTION_STYLE_CONFIGS[style] ??
    ROLEPLAY_INTERACTION_STYLE_CONFIGS[DEFAULT_ROLEPLAY_INTERACTION_STYLE]
  );
}
