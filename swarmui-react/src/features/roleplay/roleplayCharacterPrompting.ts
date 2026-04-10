/**
 * Character prompting utilities for the roleplay system.
 * Builds system prompts and personality blocks from character data.
 */
import type {
  RoleplayCharacter,
  RoleplayPersonalityProfile,
  RoleplayPromptStack,
  RoleplayChatSession,
} from '../../types/roleplay';

type EffectivePromptCharacterInput = Pick<
  RoleplayCharacter,
  'interactionStyle' | 'chatSystemPrompt' | 'roleplaySystemPrompt' | 'systemPrompt'
> &
  Partial<
    Pick<RoleplayCharacter, 'personality' | 'personalityProfile' | 'description' | 'scenario'>
  >;

/** Create a default prompt stack for new sessions. */
export function createDefaultPromptSet(): RoleplayPromptStack {
  return {
    mainPromptOverride: '',
    authorNote: '',
    postHistoryNote: '',
    includePersona: true,
    includeCharacterDefinition: true,
    includeScenario: true,
    includeExampleMessages: true,
    includeMemory: true,
    includeLore: true,
  };
}

/** Create a blank personality profile for a new character. */
export function createEmptyRoleplayPersonalityProfile(): RoleplayPersonalityProfile {
  return {
    coreTraits: '',
    speakingStyle: '',
    emotionalTone: '',
    boundaries: '',
    motivations: '',
    relationshipToUser: '',
    quirks: '',
  };
}

/** Ensure personality profiles remain safe across persisted schema changes. */
export function normalizeRoleplayPersonalityProfile(
  profile?: Partial<RoleplayPersonalityProfile> | null
): RoleplayPersonalityProfile {
  return {
    ...createEmptyRoleplayPersonalityProfile(),
    ...(profile ?? {}),
  };
}

/**
 * Build a structured personality block from a character's personality profile.
 * Used in the CharacterEditor to preview what the AI sees.
 */
export function buildStructuredPersonalityBlock(
  profile?: Partial<RoleplayPersonalityProfile> | null
): string {
  const normalizedProfile = normalizeRoleplayPersonalityProfile(profile);
  const sections: string[] = [];
  if (normalizedProfile.coreTraits) sections.push(`Core traits: ${normalizedProfile.coreTraits}`);
  if (normalizedProfile.speakingStyle)
    sections.push(`Speaking style: ${normalizedProfile.speakingStyle}`);
  if (normalizedProfile.emotionalTone)
    sections.push(`Emotional tone: ${normalizedProfile.emotionalTone}`);
  if (normalizedProfile.boundaries) sections.push(`Boundaries: ${normalizedProfile.boundaries}`);
  if (normalizedProfile.motivations) sections.push(`Motivations: ${normalizedProfile.motivations}`);
  if (normalizedProfile.relationshipToUser) {
    sections.push(`Relationship to user: ${normalizedProfile.relationshipToUser}`);
  }
  if (normalizedProfile.quirks) sections.push(`Quirks: ${normalizedProfile.quirks}`);
  return sections.join('\n');
}

/**
 * Build a personality block from a character for injection into system prompts.
 */
export function buildCharacterPersonalityBlock(
  character: Pick<RoleplayCharacter, 'personality'> &
    Partial<Pick<RoleplayCharacter, 'personalityProfile'>>
): string {
  if (character.personality) {
    return character.personality;
  }
  return buildStructuredPersonalityBlock(character.personalityProfile);
}

/**
 * Resolve the effective system prompt for a character + session combination.
 * Applies the prompt stack overrides and includes character definition, scenario, etc.
 */
export function getEffectiveSystemPrompt(
  character: EffectivePromptCharacterInput,
  session?: RoleplayChatSession | null
): string {
  const promptStack = session?.promptStack ?? createDefaultPromptSet();

  if (promptStack.mainPromptOverride) {
    return promptStack.mainPromptOverride;
  }

  return character.interactionStyle === 'personal-chat'
    ? character.chatSystemPrompt || character.systemPrompt
    : character.roleplaySystemPrompt || character.systemPrompt;
}
