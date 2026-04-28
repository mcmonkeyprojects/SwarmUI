import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { createIndexedDbStorage } from '../lib/indexedDbStorage';
import type {
  ChatMessage,
  ChatMessageVariant,
  RoleplayCatalogTemplate,
  RoleplayCharacter,
  RoleplayChatSession,
  RoleplayConnectionState,
  RoleplayContinuityState,
  RoleplayLorebook,
  RoleplayLorebookEntry,
  RoleplayMemoryFact,
  RoleplayMemoryStatus,
  RoleplayModelCompatibilitySettings,
  RoleplayPersona,
  RoleplayPromptStack,
} from '../types/roleplay';
import type { AssistantModel, AssistantServerMode } from '../types/assistant';
import {
  DEFAULT_ROLEPLAY_INTERACTION_STYLE,
  LEGACY_ROLEPLAY_INTERACTION_STYLE,
  getRoleplayInteractionStyleConfig,
} from '../data/roleplayInteractionStyles';
import {
  ROLEPLAY_MAX_MEMORY_FACTS,
  createEmptyRoleplayMemoryState,
} from '../features/roleplay/roleplayMemory';
import {
  createEmptyRoleplayPersonalityProfile,
  getEffectiveSystemPrompt,
  normalizeRoleplayPersonalityProfile,
} from '../features/roleplay/roleplayCharacterPrompting';
import type { RoleplayBundleData } from '../features/roleplay/roleplayBundle';

const DEFAULT_CHAT_MAX_TOKENS = 768;
export const DEFAULT_PERSONA_ID = 'default-persona';

type LegacyRoleplayCharacter = Partial<RoleplayCharacter> & {
  id: string;
  name: string;
};

type LegacyRoleplayState = Partial<RoleplayStoreState> & {
  characters?: LegacyRoleplayCharacter[];
  chatSessions?: RoleplayChatSession[];
  personas?: RoleplayPersona[];
  lorebooks?: RoleplayLorebook[];
  conversations?: Record<string, ChatMessage[]>;
};

function createDefaultModelCompatibilitySettings(): RoleplayModelCompatibilitySettings {
  return {
    forceFinalUserTurn: false,
    inlineSystemPrompt: false,
  };
}

function normalizeString(value: unknown, fallback: string = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function normalizeMessageVariant(
  variant: Partial<ChatMessageVariant> & { id?: string }
): ChatMessageVariant {
  return {
    id: normalizeString(variant.id, crypto.randomUUID()),
    content: normalizeString(variant.content),
    timestamp: normalizeNumber(variant.timestamp, Date.now()),
    sceneImageUrl: normalizeNullableString(variant.sceneImageUrl),
    suggestedImagePrompt: normalizeNullableString(variant.suggestedImagePrompt),
  };
}

function normalizeChatMessage(message: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage {
  const variants = Array.isArray(message.variants)
    ? message.variants.map((variant) => normalizeMessageVariant(variant))
    : [];
  const requestedActiveVariantId = normalizeNullableString(message.activeVariantId);
  const activeVariantId =
    requestedActiveVariantId && variants.some((variant) => variant.id === requestedActiveVariantId)
      ? requestedActiveVariantId
      : null;
  return {
    id: normalizeString(message.id, crypto.randomUUID()),
    role:
      message.role === 'user' || message.role === 'assistant' || message.role === 'system'
        ? message.role
        : 'assistant',
    content: normalizeString(message.content),
    includedInPrompt: message.includedInPrompt !== false,
    variants,
    activeVariantId,
    timestamp: normalizeNumber(message.timestamp, Date.now()),
    sceneImageUrl: normalizeNullableString(message.sceneImageUrl),
    suggestedImagePrompt: normalizeNullableString(message.suggestedImagePrompt),
  };
}

function createDefaultPromptStack(): RoleplayPromptStack {
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

function normalizeInteractionStyle(value: unknown): RoleplayCharacter['interactionStyle'] {
  return value === 'personal-chat' || value === 'storyteller'
    ? value
    : LEGACY_ROLEPLAY_INTERACTION_STYLE;
}

function normalizeCharacter(character: LegacyRoleplayCharacter): RoleplayCharacter {
  const now = Date.now();
  const interactionStyle = normalizeInteractionStyle(character.interactionStyle);
  const legacySystemPrompt = normalizeString(character.systemPrompt);
  const chatSystemPrompt =
    normalizeString(character.chatSystemPrompt) ||
    (interactionStyle === 'personal-chat' ? legacySystemPrompt : '');
  const roleplaySystemPrompt =
    normalizeString(character.roleplaySystemPrompt) ||
    (interactionStyle === 'storyteller' ? legacySystemPrompt : '');

  return {
    id: character.id,
    name: normalizeString(character.name, 'Unnamed Character'),
    favorite: normalizeBoolean(character.favorite, false),
    creator: normalizeString(character.creator),
    characterVersion: normalizeString(character.characterVersion),
    sourceFormat: character.sourceFormat ?? 'native',
    sourceUrl: normalizeString(character.sourceUrl),
    catalogTemplateId: normalizeNullableString(character.catalogTemplateId),
    catalogCategory: normalizeNullableString(character.catalogCategory),
    cardExtensions: normalizeRecord(character.cardExtensions),
    avatar: normalizeNullableString(character.avatar),
    interactionStyle,
    appearancePrompt: normalizeNullableString(character.appearancePrompt),
    imageModelId: normalizeNullableString(character.imageModelId),
    personalityProfile: normalizeRoleplayPersonalityProfile(character.personalityProfile),
    personality: normalizeString(character.personality),
    systemPrompt: getEffectiveSystemPrompt({
      interactionStyle,
      chatSystemPrompt,
      roleplaySystemPrompt,
      systemPrompt: legacySystemPrompt,
    }),
    chatSystemPrompt,
    roleplaySystemPrompt,
    openingChatMessage: normalizeString(character.openingChatMessage),
    openingRoleplayMessage: normalizeString(character.openingRoleplayMessage),
    alternateGreetings: normalizeStringArray(character.alternateGreetings),
    sceneSuggestionPrompt:
      normalizeString(character.sceneSuggestionPrompt) ||
      getRoleplayInteractionStyleConfig(interactionStyle).sceneSuggestionPrompt,
    description: normalizeString(character.description),
    scenario: normalizeString(character.scenario),
    exampleMessages: normalizeString(character.exampleMessages),
    tags: normalizeStringArray(character.tags),
    creatorNotes: normalizeString(character.creatorNotes),
    boundLorebookIds: normalizeStringArray(character.boundLorebookIds),
    characterLora: normalizeNullableString(character.characterLora),
    characterLoraWeight: character.characterLoraWeight ?? 0.8,
    ipAdapterEnabled: character.ipAdapterEnabled ?? false,
    ipAdapterModel: normalizeString(character.ipAdapterModel, 'faceid plus v2'),
    ipAdapterWeight: character.ipAdapterWeight ?? 1.0,
    conversationSummary: normalizeString(character.conversationSummary),
    continuity: character.continuity ?? {
      relationshipSummary: '',
      currentLocation: '',
      currentSituation: '',
      openThreads: [],
    },
    memoryFacts: character.memoryFacts ?? [],
    memoryStatus: character.memoryStatus ?? 'idle',
    messagesSinceMemoryRefresh: character.messagesSinceMemoryRefresh ?? 0,
    lastMemoryUpdatedAt: character.lastMemoryUpdatedAt ?? null,
    lastVisitedAt: character.lastVisitedAt ?? null,
    createdAt: character.createdAt ?? now,
    updatedAt: character.updatedAt ?? now,
  };
}

function normalizePersona(
  persona: Partial<RoleplayPersona> & { id: string; name: string }
): RoleplayPersona {
  const now = Date.now();
  return {
    id: persona.id,
    name: normalizeString(persona.name, 'Unnamed Persona'),
    description: normalizeString(persona.description),
    notes: normalizeString(persona.notes),
    avatar: normalizeNullableString(persona.avatar),
    tags: normalizeStringArray(persona.tags),
    boundLorebookIds: normalizeStringArray(persona.boundLorebookIds),
    createdAt: persona.createdAt ?? now,
    updatedAt: persona.updatedAt ?? now,
  };
}

function normalizeLorebook(
  lorebook: Partial<RoleplayLorebook> & { id: string; name: string }
): RoleplayLorebook {
  const now = Date.now();
  return {
    id: lorebook.id,
    name: normalizeString(lorebook.name, 'Untitled Lorebook'),
    description: normalizeString(lorebook.description),
    entries: (lorebook.entries ?? []).map((entry) => ({
      id: entry.id,
      title: normalizeString(entry.title),
      content: normalizeString(entry.content),
      keywords: normalizeStringArray(entry.keywords),
      secondaryKeywords: normalizeStringArray(entry.secondaryKeywords),
      mode: entry.mode ?? 'keyword',
      keywordMode: entry.keywordMode ?? 'plain',
      activationLogic: entry.activationLogic ?? 'any',
      selective: normalizeBoolean(entry.selective, false),
      caseSensitive: normalizeBoolean(entry.caseSensitive, false),
      scanDepth: normalizeNumber(entry.scanDepth, 4),
      insertionOrder: normalizeNumber(entry.insertionOrder, 100),
      insertionPosition: entry.insertionPosition ?? 'before-history',
      tokenBudget: normalizeNullableNumber(entry.tokenBudget),
      enabled: entry.enabled ?? true,
      createdAt: entry.createdAt ?? now,
      updatedAt: entry.updatedAt ?? now,
    })),
    createdAt: lorebook.createdAt ?? now,
    updatedAt: lorebook.updatedAt ?? now,
  };
}

function normalizeSession(
  session: Partial<RoleplayChatSession> & Pick<RoleplayChatSession, 'id' | 'characterId'>
): RoleplayChatSession {
  const now = Date.now();
  const emptyMemoryState = createEmptyRoleplayMemoryState();
  const normalizedPromptStack = (session.promptStack ?? {}) as Partial<RoleplayPromptStack>;

  return {
    id: session.id,
    characterId: session.characterId,
    title: normalizeString(session.title, 'Main Chat'),
    activePersonaId: normalizeString(session.activePersonaId, DEFAULT_PERSONA_ID),
    boundLorebookIds: normalizeStringArray(session.boundLorebookIds),
    promptStack: {
      ...createDefaultPromptStack(),
      ...normalizedPromptStack,
      mainPromptOverride: normalizeString(normalizedPromptStack.mainPromptOverride),
      authorNote: normalizeString(normalizedPromptStack.authorNote),
      postHistoryNote: normalizeString(normalizedPromptStack.postHistoryNote),
      includePersona:
        typeof normalizedPromptStack.includePersona === 'boolean'
          ? normalizedPromptStack.includePersona
          : true,
      includeCharacterDefinition:
        typeof normalizedPromptStack.includeCharacterDefinition === 'boolean'
          ? normalizedPromptStack.includeCharacterDefinition
          : true,
      includeScenario:
        typeof normalizedPromptStack.includeScenario === 'boolean'
          ? normalizedPromptStack.includeScenario
          : true,
      includeExampleMessages:
        typeof normalizedPromptStack.includeExampleMessages === 'boolean'
          ? normalizedPromptStack.includeExampleMessages
          : true,
      includeMemory:
        typeof normalizedPromptStack.includeMemory === 'boolean'
          ? normalizedPromptStack.includeMemory
          : true,
      includeLore:
        typeof normalizedPromptStack.includeLore === 'boolean'
          ? normalizedPromptStack.includeLore
          : true,
    },
    messages: (session.messages ?? []).map((message) => normalizeChatMessage(message)),
    conversationSummary: session.conversationSummary ?? emptyMemoryState.conversationSummary,
    continuity: session.continuity ?? emptyMemoryState.continuity,
    memoryFacts: session.memoryFacts ?? emptyMemoryState.memoryFacts,
    memoryStatus: session.memoryStatus ?? emptyMemoryState.memoryStatus,
    messagesSinceMemoryRefresh:
      session.messagesSinceMemoryRefresh ?? emptyMemoryState.messagesSinceMemoryRefresh,
    lastMemoryUpdatedAt: session.lastMemoryUpdatedAt ?? emptyMemoryState.lastMemoryUpdatedAt,
    lastVisitedAt: session.lastVisitedAt ?? emptyMemoryState.lastVisitedAt,
    createdAt: session.createdAt ?? now,
    updatedAt: session.updatedAt ?? now,
  };
}

function createSessionFromCharacter(
  character: RoleplayCharacter,
  messages: ChatMessage[] = [],
  title: string = 'Main Chat'
): RoleplayChatSession {
  return normalizeSession({
    id: crypto.randomUUID(),
    characterId: character.id,
    title,
    activePersonaId: DEFAULT_PERSONA_ID,
    boundLorebookIds: [],
    promptStack: createDefaultPromptStack(),
    messages,
    conversationSummary: character.conversationSummary,
    continuity: character.continuity,
    memoryFacts: character.memoryFacts,
    memoryStatus: character.memoryStatus,
    messagesSinceMemoryRefresh: character.messagesSinceMemoryRefresh,
    lastMemoryUpdatedAt: character.lastMemoryUpdatedAt,
    lastVisitedAt: character.lastVisitedAt,
  });
}

function createDefaultPersona(): RoleplayPersona {
  return normalizePersona({
    id: DEFAULT_PERSONA_ID,
    name: 'You',
    description: 'The current user interacting with the roleplay.',
    notes: '',
    avatar: null,
    tags: ['default'],
    boundLorebookIds: [],
  });
}

function createLorebookFromTemplate(template: RoleplayCatalogTemplate): RoleplayLorebook | null {
  if (!template.lorebook) {
    return null;
  }
  const now = Date.now();
  return normalizeLorebook({
    id: crypto.randomUUID(),
    name: template.lorebook.name,
    description: template.lorebook.description,
    entries: template.lorebook.entries.map((entry, index) => ({
      id: crypto.randomUUID(),
      title: entry.title,
      content: entry.content,
      keywords: entry.keywords,
      secondaryKeywords: [],
      mode: entry.keywords.length > 0 ? 'keyword' : 'always-on',
      keywordMode: 'plain',
      activationLogic: 'any',
      selective: false,
      caseSensitive: false,
      scanDepth: 6,
      insertionOrder: 100 + index,
      insertionPosition: 'before-history',
      tokenBudget: 180,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  });
}

function createCharacterFromCatalogTemplate(template: RoleplayCatalogTemplate): RoleplayCharacter {
  const now = Date.now();
  return normalizeCharacter({
    id: crypto.randomUUID(),
    name: template.name,
    favorite: false,
    creator: 'SwarmUI Catalog',
    characterVersion: '1.0',
    sourceFormat: 'catalog',
    sourceUrl: '',
    catalogTemplateId: template.id,
    catalogCategory: template.category,
    cardExtensions: null,
    avatar: null,
    interactionStyle: DEFAULT_ROLEPLAY_INTERACTION_STYLE,
    appearancePrompt: template.appearancePrompt,
    imageModelId: null,
    personalityProfile: template.personalityProfile,
    personality: template.personality,
    systemPrompt: template.systemPrompt,
    chatSystemPrompt: template.chatSystemPrompt,
    roleplaySystemPrompt: template.roleplaySystemPrompt,
    openingChatMessage: template.openingChatMessage,
    openingRoleplayMessage: template.openingRoleplayMessage,
    alternateGreetings: template.alternateGreetings,
    sceneSuggestionPrompt: defaultInteractionStyleConfig.sceneSuggestionPrompt,
    description: template.description,
    scenario: template.scenario,
    exampleMessages: template.exampleMessages,
    tags: template.tags,
    creatorNotes: template.creatorNotes,
    boundLorebookIds: [],
    characterLora: null,
    characterLoraWeight: 0.8,
    ipAdapterEnabled: false,
    ipAdapterModel: 'faceid plus v2',
    ipAdapterWeight: 1.0,
    ...createEmptyRoleplayMemoryState(),
    createdAt: now,
    updatedAt: now,
  });
}

const DEFAULT_PERSONAS: RoleplayPersona[] = [createDefaultPersona()];

const defaultInteractionStyleConfig = getRoleplayInteractionStyleConfig(
  DEFAULT_ROLEPLAY_INTERACTION_STYLE
);

const DEFAULT_CHARACTERS: RoleplayCharacter[] = [
  normalizeCharacter({
    id: 'default-companion',
    name: 'Companion',
    avatar: null,
    interactionStyle: DEFAULT_ROLEPLAY_INTERACTION_STYLE,
    appearancePrompt: null,
    imageModelId: null,
    personalityProfile: createEmptyRoleplayPersonalityProfile(),
    description: 'A warm companion character meant to make it easy to start a chat.',
    scenario: '',
    exampleMessages: '',
    alternateGreetings: [],
    tags: ['starter'],
    creatorNotes: '',
    boundLorebookIds: [],
    characterLora: null,
    characterLoraWeight: 0.8,
    ipAdapterEnabled: false,
    ipAdapterModel: 'faceid plus v2',
    ipAdapterWeight: 1.0,
    personality:
      'Warm, attentive, and personal. Talks directly to the user without narrating for them.',
    systemPrompt: defaultInteractionStyleConfig.systemPrompt,
    chatSystemPrompt: '',
    roleplaySystemPrompt: '',
    openingChatMessage: '',
    openingRoleplayMessage: '',
    sceneSuggestionPrompt: defaultInteractionStyleConfig.sceneSuggestionPrompt,
    ...createEmptyRoleplayMemoryState(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
];

const DEFAULT_CHAT_SESSIONS: RoleplayChatSession[] = [
  createSessionFromCharacter(DEFAULT_CHARACTERS[0]),
];

function getMostRecentSessionId(
  sessions: RoleplayChatSession[],
  characterId: string | null
): string | null {
  if (!characterId) {
    return sessions[0]?.id ?? null;
  }

  const matchingSessions = sessions
    .filter((session) => session.characterId === characterId)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return matchingSessions[0]?.id ?? null;
}

function updateSessionInList(
  sessions: RoleplayChatSession[],
  sessionId: string,
  updater: (session: RoleplayChatSession) => RoleplayChatSession
): RoleplayChatSession[] {
  return sessions.map((session) => (session.id === sessionId ? updater(session) : session));
}

function areStringArraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function areLorebookEntriesEqual(
  left: RoleplayLorebookEntry[] | undefined,
  right: RoleplayLorebookEntry[] | undefined
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index].id !== right[index].id ||
      left[index].title !== right[index].title ||
      left[index].content !== right[index].content ||
      left[index].mode !== right[index].mode ||
      left[index].keywordMode !== right[index].keywordMode ||
      left[index].activationLogic !== right[index].activationLogic ||
      left[index].selective !== right[index].selective ||
      left[index].caseSensitive !== right[index].caseSensitive ||
      left[index].scanDepth !== right[index].scanDepth ||
      left[index].insertionOrder !== right[index].insertionOrder ||
      left[index].insertionPosition !== right[index].insertionPosition ||
      left[index].tokenBudget !== right[index].tokenBudget ||
      left[index].enabled !== right[index].enabled ||
      !areStringArraysEqual(left[index].keywords, right[index].keywords) ||
      !areStringArraysEqual(left[index].secondaryKeywords, right[index].secondaryKeywords)
    ) {
      return false;
    }
  }
  return true;
}

function personaHasChanges(
  persona: RoleplayPersona,
  updates: Partial<Omit<RoleplayPersona, 'id'>>
): boolean {
  if (Object.hasOwn(updates, 'name') && updates.name !== persona.name) {
    return true;
  }
  if (Object.hasOwn(updates, 'description') && updates.description !== persona.description) {
    return true;
  }
  if (Object.hasOwn(updates, 'notes') && updates.notes !== persona.notes) {
    return true;
  }
  if (Object.hasOwn(updates, 'avatar') && updates.avatar !== persona.avatar) {
    return true;
  }
  if (Object.hasOwn(updates, 'tags') && !areStringArraysEqual(updates.tags, persona.tags)) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'boundLorebookIds') &&
    !areStringArraysEqual(updates.boundLorebookIds, persona.boundLorebookIds)
  ) {
    return true;
  }
  if (Object.hasOwn(updates, 'createdAt') && updates.createdAt !== persona.createdAt) {
    return true;
  }
  if (Object.hasOwn(updates, 'updatedAt') && updates.updatedAt !== persona.updatedAt) {
    return true;
  }
  return false;
}

function lorebookHasChanges(
  lorebook: RoleplayLorebook,
  updates: Partial<Omit<RoleplayLorebook, 'id'>>
): boolean {
  if (Object.hasOwn(updates, 'name') && updates.name !== lorebook.name) {
    return true;
  }
  if (Object.hasOwn(updates, 'description') && updates.description !== lorebook.description) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'entries') &&
    !areLorebookEntriesEqual(updates.entries, lorebook.entries)
  ) {
    return true;
  }
  if (Object.hasOwn(updates, 'createdAt') && updates.createdAt !== lorebook.createdAt) {
    return true;
  }
  if (Object.hasOwn(updates, 'updatedAt') && updates.updatedAt !== lorebook.updatedAt) {
    return true;
  }
  return false;
}

function promptStackHasChanges(
  promptStack: RoleplayPromptStack,
  updates: Partial<RoleplayPromptStack>
): boolean {
  if (
    Object.hasOwn(updates, 'mainPromptOverride') &&
    updates.mainPromptOverride !== promptStack.mainPromptOverride
  ) {
    return true;
  }
  if (Object.hasOwn(updates, 'authorNote') && updates.authorNote !== promptStack.authorNote) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'postHistoryNote') &&
    updates.postHistoryNote !== promptStack.postHistoryNote
  ) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'includePersona') &&
    updates.includePersona !== promptStack.includePersona
  ) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'includeCharacterDefinition') &&
    updates.includeCharacterDefinition !== promptStack.includeCharacterDefinition
  ) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'includeScenario') &&
    updates.includeScenario !== promptStack.includeScenario
  ) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'includeExampleMessages') &&
    updates.includeExampleMessages !== promptStack.includeExampleMessages
  ) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'includeMemory') &&
    updates.includeMemory !== promptStack.includeMemory
  ) {
    return true;
  }
  if (Object.hasOwn(updates, 'includeLore') && updates.includeLore !== promptStack.includeLore) {
    return true;
  }
  return false;
}

function remapIdsForImport(bundle: RoleplayBundleData, state: RoleplayStoreState) {
  const characterIdMap = new Map<string, string>();
  const personaIdMap = new Map<string, string>();
  const lorebookIdMap = new Map<string, string>();
  const sessionIdMap = new Map<string, string>();
  const takenCharacterIds = new Set(state.characters.map((character) => character.id));
  const takenLorebookIds = new Set(state.lorebooks.map((lorebook) => lorebook.id));
  const takenSessionIds = new Set(state.chatSessions.map((session) => session.id));

  for (const character of [bundle.character]) {
    const nextId = takenCharacterIds.has(character.id) ? crypto.randomUUID() : character.id;
    takenCharacterIds.add(nextId);
    characterIdMap.set(character.id, nextId);
  }
  for (const lorebook of (bundle.lorebooks ?? [])) {
    const nextId = takenLorebookIds.has(lorebook.id) ? crypto.randomUUID() : lorebook.id;
    takenLorebookIds.add(nextId);
    lorebookIdMap.set(lorebook.id, nextId);
  }
  for (const session of (bundle.sessions ?? [])) {
    const nextId = takenSessionIds.has(session.id) ? crypto.randomUUID() : session.id;
    takenSessionIds.add(nextId);
    sessionIdMap.set(session.id, nextId);
  }

  return {
    characterIdMap,
    personaIdMap,
    lorebookIdMap,
    sessionIdMap,
  };
}

export interface RoleplayStoreState {
  characters: RoleplayCharacter[];
  personas: RoleplayPersona[];
  lorebooks: RoleplayLorebook[];
  chatSessions: RoleplayChatSession[];
  activeCharacterId: string | null;
  activeSessionId: string | null;
  isStreamingChat: boolean;
  streamingContent: string;
  connectionStatus: RoleplayConnectionState;
  connectionMessage: string | null;
  lmStudioEndpoint: string;
  selectedModelId: string;
  detectedServerMode: AssistantServerMode | null;
  availableModels: AssistantModel[];
  modelCompatibilityByModelId: Record<string, RoleplayModelCompatibilitySettings>;
  imageSteps: number;
  imageCfgScale: number;
  imageClipStopAtLayer: number | null;
  imageModelId: string;
  chatTemperature: number;
  chatMaxTokens: number;
  imageWidth: number;
  imageHeight: number;
  generatingPortraitForId: string | null;
  addCharacter: (character: RoleplayCharacter) => void;
  addCharacterWithLorebooks: (character: RoleplayCharacter, lorebooks?: RoleplayLorebook[]) => void;
  createCharacterFromTemplate: (template: RoleplayCatalogTemplate) => void;
  duplicateCharacter: (id: string) => void;
  setCharacterFavorite: (id: string, favorite?: boolean) => void;
  updateCharacter: (id: string, updates: Partial<Omit<RoleplayCharacter, 'id'>>) => void;
  removeCharacter: (id: string) => void;
  setActiveCharacter: (id: string | null) => void;
  updateCharacterAvatar: (id: string, avatarUrl: string) => void;
  addPersona: (persona: RoleplayPersona) => void;
  updatePersona: (id: string, updates: Partial<Omit<RoleplayPersona, 'id'>>) => void;
  removePersona: (id: string) => void;
  setSessionActivePersona: (sessionId: string, personaId: string | null) => void;
  addLorebook: (lorebook: RoleplayLorebook) => void;
  updateLorebook: (id: string, updates: Partial<Omit<RoleplayLorebook, 'id'>>) => void;
  removeLorebook: (id: string) => void;
  createSession: (characterId: string, title?: string) => void;
  duplicateSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  updateSessionPromptStack: (sessionId: string, updates: Partial<RoleplayPromptStack>) => void;
  setSessionBoundLorebooks: (sessionId: string, lorebookIds: string[]) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (
    sessionId: string,
    messageId: string,
    updates: Partial<Omit<ChatMessage, 'id' | 'role' | 'timestamp'>>
  ) => void;
  replaceMessageContent: (sessionId: string, messageId: string, content: string) => void;
  deleteMessage: (sessionId: string, messageId: string) => void;
  moveMessage: (sessionId: string, messageId: string, direction: -1 | 1) => void;
  setMessageIncluded: (sessionId: string, messageId: string, included: boolean) => void;
  addAssistantMessageVariant: (
    sessionId: string,
    messageId: string,
    variant: Omit<ChatMessageVariant, 'id' | 'timestamp'>
  ) => void;
  selectMessageVariant: (sessionId: string, messageId: string, variantId: string | null) => void;
  deleteMessagesFrom: (sessionId: string, messageId: string) => void;
  clearConversation: (sessionId: string) => void;
  setStreamingChat: (streaming: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (token: string) => void;
  attachSceneImageToLastMessage: (sessionId: string, imageUrl: string) => void;
  dismissSuggestion: (sessionId: string, messageId: string) => void;
  setSessionMemoryStatus: (sessionId: string, status: RoleplayMemoryStatus) => void;
  incrementMessagesSinceMemoryRefresh: (sessionId: string, amount?: number) => void;
  applyGeneratedMemory: (
    sessionId: string,
    summary: string,
    continuity: RoleplayContinuityState,
    facts: RoleplayMemoryFact[],
    updatedAt?: number
  ) => void;
  clearSessionMemory: (sessionId: string) => void;
  addMemoryFact: (sessionId: string, text: string) => void;
  updateMemoryFact: (sessionId: string, factId: string, text: string) => void;
  removeMemoryFact: (sessionId: string, factId: string) => void;
  toggleMemoryFactPinned: (sessionId: string, factId: string) => void;
  addContinuityThread: (sessionId: string, text: string) => void;
  removeContinuityThread: (sessionId: string, threadIndex: number) => void;
  moveContinuityThread: (sessionId: string, threadIndex: number, direction: -1 | 1) => void;
  markSessionVisited: (sessionId: string, visitedAt?: number) => void;
  setConnectionStatus: (status: RoleplayConnectionState) => void;
  setConnectionMessage: (message: string | null) => void;
  setLmStudioEndpoint: (endpoint: string) => void;
  setSelectedModelId: (modelId: string) => void;
  setDetectedServerMode: (mode: AssistantServerMode | null) => void;
  setAvailableModels: (models: AssistantModel[]) => void;
  setModelCompatibility: (
    modelId: string,
    updates: Partial<RoleplayModelCompatibilitySettings>
  ) => void;
  setImageSteps: (v: number) => void;
  setImageCfgScale: (v: number) => void;
  setImageClipStopAtLayer: (v: number | null) => void;
  setImageModelId: (id: string) => void;
  setChatTemperature: (v: number) => void;
  setChatMaxTokens: (v: number) => void;
  setImageDimensions: (width: number, height: number) => void;
  setGeneratingPortraitForId: (id: string | null) => void;
  importBundle: (bundle: RoleplayBundleData) => void;
  getActiveCharacter: () => RoleplayCharacter | null;
  getActiveSession: () => RoleplayChatSession | null;
  getActivePersona: () => RoleplayPersona | null;
  getCharacterSessions: (characterId: string) => RoleplayChatSession[];
  getActiveConversation: () => ChatMessage[];
}

export const useRoleplayStore = create<RoleplayStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        characters: DEFAULT_CHARACTERS,
        personas: DEFAULT_PERSONAS,
        lorebooks: [],
        chatSessions: DEFAULT_CHAT_SESSIONS,
        activeCharacterId: DEFAULT_CHARACTERS[0].id,
        activeSessionId: DEFAULT_CHAT_SESSIONS[0].id,
        isStreamingChat: false,
        streamingContent: '',
        connectionStatus: 'idle',
        connectionMessage: null,
        lmStudioEndpoint: 'http://localhost:1234',
        selectedModelId: '',
        detectedServerMode: null,
        availableModels: [],
        modelCompatibilityByModelId: {},
        imageSteps: 20,
        imageCfgScale: 7,
        imageClipStopAtLayer: null,
        imageModelId: '',
        chatTemperature: 0.8,
        chatMaxTokens: DEFAULT_CHAT_MAX_TOKENS,
        imageWidth: 768,
        imageHeight: 512,
        generatingPortraitForId: null,
        addCharacter: (character) =>
          set((state) => {
            const normalizedCharacter = normalizeCharacter(character);
            const nextSession = createSessionFromCharacter(normalizedCharacter);
            return {
              characters: [...state.characters, normalizedCharacter],
              chatSessions: [...state.chatSessions, nextSession],
              activeCharacterId: normalizedCharacter.id,
              activeSessionId: nextSession.id,
            };
          }),
        addCharacterWithLorebooks: (character, lorebooks = []) =>
          set((state) => {
            const importedLorebooks = lorebooks.map((lorebook) => normalizeLorebook(lorebook));
            const importedLorebookIds = importedLorebooks.map((lorebook) => lorebook.id);
            const normalizedCharacter = normalizeCharacter({
              ...character,
              boundLorebookIds: [
                ...new Set([...character.boundLorebookIds, ...importedLorebookIds]),
              ],
            });
            const nextSession = createSessionFromCharacter(normalizedCharacter);
            return {
              characters: [...state.characters, normalizedCharacter],
              lorebooks: [...state.lorebooks, ...importedLorebooks],
              chatSessions: [...state.chatSessions, nextSession],
              activeCharacterId: normalizedCharacter.id,
              activeSessionId: nextSession.id,
            };
          }),
        createCharacterFromTemplate: (template) =>
          set((state) => {
            const lorebook = createLorebookFromTemplate(template);
            const character = createCharacterFromCatalogTemplate(template);
            const normalizedCharacter = normalizeCharacter({
              ...character,
              boundLorebookIds: lorebook ? [lorebook.id] : [],
            });
            const nextSession = createSessionFromCharacter(normalizedCharacter);
            return {
              characters: [...state.characters, normalizedCharacter],
              lorebooks: lorebook ? [...state.lorebooks, lorebook] : state.lorebooks,
              chatSessions: [...state.chatSessions, nextSession],
              activeCharacterId: normalizedCharacter.id,
              activeSessionId: nextSession.id,
            };
          }),
        duplicateCharacter: (id) =>
          set((state) => {
            const sourceCharacter = state.characters.find((character) => character.id === id);
            if (!sourceCharacter) {
              return {};
            }

            const normalizedCharacter = normalizeCharacter({
              ...sourceCharacter,
              id: crypto.randomUUID(),
              name: `${sourceCharacter.name} Copy`,
              favorite: false,
              sourceFormat: 'native',
              catalogTemplateId: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            const nextSession = createSessionFromCharacter(normalizedCharacter);
            return {
              characters: [...state.characters, normalizedCharacter],
              chatSessions: [...state.chatSessions, nextSession],
              activeCharacterId: normalizedCharacter.id,
              activeSessionId: nextSession.id,
            };
          }),
        setCharacterFavorite: (id, favorite) =>
          set((state) => ({
            characters: state.characters.map((character) =>
              character.id === id
                ? normalizeCharacter({
                    ...character,
                    favorite: favorite ?? !character.favorite,
                    updatedAt: Date.now(),
                  })
                : character
            ),
          })),
        updateCharacter: (id, updates) =>
          set((state) => ({
            characters: state.characters.map((character) =>
              character.id === id
                ? normalizeCharacter({ ...character, ...updates, updatedAt: Date.now() })
                : character
            ),
          })),
        removeCharacter: (id) =>
          set((state) => {
            const remainingCharacters = state.characters.filter((character) => character.id !== id);
            const remainingSessions = state.chatSessions.filter(
              (session) => session.characterId !== id
            );
            const nextActiveCharacterId =
              state.activeCharacterId === id
                ? (remainingCharacters[0]?.id ?? null)
                : state.activeCharacterId;
            const nextActiveSessionId =
              state.activeSessionId &&
              !remainingSessions.some((session) => session.id === state.activeSessionId)
                ? getMostRecentSessionId(remainingSessions, nextActiveCharacterId)
                : state.activeSessionId;
            return {
              characters: remainingCharacters,
              chatSessions: remainingSessions,
              activeCharacterId: nextActiveCharacterId,
              activeSessionId: nextActiveSessionId,
            };
          }),
        setActiveCharacter: (id) =>
          set((state) => {
            const nextSessionId = getMostRecentSessionId(state.chatSessions, id);
            if (
              state.activeCharacterId === id &&
              state.activeSessionId === nextSessionId &&
              state.streamingContent === '' &&
              !state.isStreamingChat
            ) {
              return {};
            }
            return {
              activeCharacterId: id,
              activeSessionId: nextSessionId,
              streamingContent: '',
              isStreamingChat: false,
            };
          }),
        updateCharacterAvatar: (id, avatarUrl) =>
          set((state) => ({
            characters: state.characters.map((character) =>
              character.id === id
                ? normalizeCharacter({
                    ...character,
                    avatar: avatarUrl || null,
                    updatedAt: Date.now(),
                  })
                : character
            ),
          })),
        addPersona: (persona) =>
          set((state) => ({
            personas: [...state.personas, normalizePersona(persona)],
          })),
        updatePersona: (id, updates) =>
          set((state) => {
            let didChange = false;
            const personas = state.personas.map((persona) => {
              if (persona.id !== id) {
                return persona;
              }
              if (!personaHasChanges(persona, updates)) {
                return persona;
              }
              didChange = true;
              return normalizePersona({ ...persona, ...updates, updatedAt: Date.now() });
            });

            if (!didChange) {
              return {};
            }

            return { personas };
          }),
        removePersona: (id) =>
          set((state) => {
            if (id === DEFAULT_PERSONA_ID) {
              return {};
            }

            return {
              personas: state.personas.filter((persona) => persona.id !== id),
              chatSessions: state.chatSessions.map((session) =>
                session.activePersonaId === id
                  ? { ...session, activePersonaId: DEFAULT_PERSONA_ID }
                  : session
              ),
            };
          }),
        setSessionActivePersona: (sessionId, personaId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              session.activePersonaId === personaId
                ? session
                : {
                    ...session,
                    activePersonaId: personaId,
                    updatedAt: Date.now(),
                  }
            ),
          })),
        addLorebook: (lorebook) =>
          set((state) => ({
            lorebooks: [...state.lorebooks, normalizeLorebook(lorebook)],
          })),
        updateLorebook: (id, updates) =>
          set((state) => {
            let didChange = false;
            const lorebooks = state.lorebooks.map((lorebook) => {
              if (lorebook.id !== id) {
                return lorebook;
              }
              if (!lorebookHasChanges(lorebook, updates)) {
                return lorebook;
              }
              didChange = true;
              return normalizeLorebook({ ...lorebook, ...updates, updatedAt: Date.now() });
            });

            if (!didChange) {
              return {};
            }

            return { lorebooks };
          }),
        removeLorebook: (id) =>
          set((state) => ({
            lorebooks: state.lorebooks.filter((lorebook) => lorebook.id !== id),
            characters: state.characters.map((character) => ({
              ...character,
              boundLorebookIds: character.boundLorebookIds.filter(
                (lorebookId) => lorebookId !== id
              ),
            })),
            personas: state.personas.map((persona) => ({
              ...persona,
              boundLorebookIds: persona.boundLorebookIds.filter((lorebookId) => lorebookId !== id),
            })),
            chatSessions: state.chatSessions.map((session) => ({
              ...session,
              boundLorebookIds: session.boundLorebookIds.filter((lorebookId) => lorebookId !== id),
            })),
          })),
        createSession: (characterId, title = 'New Chat') =>
          set((state) => {
            const nextSession = normalizeSession({
              id: crypto.randomUUID(),
              characterId,
              title,
              activePersonaId:
                state.chatSessions.find((session) => session.characterId === characterId)
                  ?.activePersonaId ?? DEFAULT_PERSONA_ID,
              boundLorebookIds: [],
              promptStack: createDefaultPromptStack(),
              messages: [],
            });
            return {
              chatSessions: [nextSession, ...state.chatSessions],
              activeCharacterId: characterId,
              activeSessionId: nextSession.id,
            };
          }),
        duplicateSession: (sessionId) =>
          set((state) => {
            const sourceSession = state.chatSessions.find((session) => session.id === sessionId);
            if (!sourceSession) {
              return {};
            }

            const nextSession = normalizeSession({
              ...sourceSession,
              id: crypto.randomUUID(),
              title: `${sourceSession.title} Copy`,
              messages: sourceSession.messages.map((message) => ({
                ...message,
                id: crypto.randomUUID(),
                variants: message.variants.map((variant) => ({
                  ...variant,
                  id: crypto.randomUUID(),
                })),
              })),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            return {
              chatSessions: [nextSession, ...state.chatSessions],
              activeCharacterId: nextSession.characterId,
              activeSessionId: nextSession.id,
            };
          }),
        renameSession: (sessionId, title) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              title: title.trim() || session.title,
              updatedAt: Date.now(),
            })),
          })),
        removeSession: (sessionId) =>
          set((state) => {
            const targetSession = state.chatSessions.find((session) => session.id === sessionId);
            if (!targetSession) {
              return {};
            }

            const siblingSessions = state.chatSessions.filter(
              (session) =>
                session.characterId === targetSession.characterId && session.id !== sessionId
            );
            const nextSessions =
              siblingSessions.length > 0
                ? state.chatSessions.filter((session) => session.id !== sessionId)
                : [
                    ...state.chatSessions.filter((session) => session.id !== sessionId),
                    normalizeSession({
                      id: crypto.randomUUID(),
                      characterId: targetSession.characterId,
                      title: 'Main Chat',
                      activePersonaId: targetSession.activePersonaId,
                      boundLorebookIds: [],
                      promptStack: createDefaultPromptStack(),
                      messages: [],
                    }),
                  ];
            const nextActiveSessionId =
              state.activeSessionId === sessionId
                ? getMostRecentSessionId(nextSessions, targetSession.characterId)
                : state.activeSessionId;
            return {
              chatSessions: nextSessions,
              activeSessionId: nextActiveSessionId,
              activeCharacterId: targetSession.characterId,
            };
          }),
        setActiveSession: (sessionId) =>
          set((state) => {
            const session = state.chatSessions.find((entry) => entry.id === sessionId);
            const nextCharacterId = session?.characterId ?? state.activeCharacterId;
            if (
              state.activeSessionId === sessionId &&
              state.activeCharacterId === nextCharacterId &&
              state.streamingContent === '' &&
              !state.isStreamingChat
            ) {
              return {};
            }
            return {
              activeSessionId: sessionId,
              activeCharacterId: nextCharacterId,
              streamingContent: '',
              isStreamingChat: false,
            };
          }),
        updateSessionPromptStack: (sessionId, updates) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              promptStackHasChanges(session.promptStack, updates)
                ? {
                    ...session,
                    promptStack: {
                      ...session.promptStack,
                      ...updates,
                    },
                    updatedAt: Date.now(),
                  }
                : session
            ),
          })),
        setSessionBoundLorebooks: (sessionId, lorebookIds) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              areStringArraysEqual(session.boundLorebookIds, lorebookIds)
                ? session
                : {
                    ...session,
                    boundLorebookIds: lorebookIds,
                    updatedAt: Date.now(),
                  }
            ),
          })),
        addMessage: (sessionId, message) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: [...session.messages, normalizeChatMessage(message)],
              updatedAt: Date.now(),
            })),
          })),
        updateMessage: (sessionId, messageId, updates) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === messageId ? normalizeChatMessage({ ...message, ...updates }) : message
              ),
              updatedAt: Date.now(),
            })),
          })),
        replaceMessageContent: (sessionId, messageId, content) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: session.messages.map((message) => {
                if (message.id !== messageId) {
                  return message;
                }
                if (!message.activeVariantId) {
                  return normalizeChatMessage({
                    ...message,
                    content,
                  });
                }
                const variants = message.variants.map((variant) =>
                  variant.id === message.activeVariantId
                    ? {
                        ...variant,
                        content,
                        timestamp: Date.now(),
                      }
                    : variant
                );
                return normalizeChatMessage({
                  ...message,
                  variants,
                });
              }),
              updatedAt: Date.now(),
            })),
          })),
        deleteMessage: (sessionId, messageId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: session.messages.filter((message) => message.id !== messageId),
              updatedAt: Date.now(),
            })),
          })),
        moveMessage: (sessionId, messageId, direction) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const sourceIndex = session.messages.findIndex((message) => message.id === messageId);
              const targetIndex = sourceIndex + direction;
              if (
                sourceIndex < 0 ||
                targetIndex < 0 ||
                targetIndex >= session.messages.length
              ) {
                return session;
              }
              const messages = [...session.messages];
              const [movedMessage] = messages.splice(sourceIndex, 1);
              messages.splice(targetIndex, 0, movedMessage);
              return {
                ...session,
                messages,
                updatedAt: Date.now(),
              };
            }),
          })),
        setMessageIncluded: (sessionId, messageId, included) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === messageId
                  ? normalizeChatMessage({ ...message, includedInPrompt: included })
                  : message
              ),
              updatedAt: Date.now(),
            })),
          })),
        addAssistantMessageVariant: (sessionId, messageId, variant) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: session.messages.map((message) => {
                if (message.id !== messageId || message.role !== 'assistant') {
                  return message;
                }
                const nextVariant: ChatMessageVariant = {
                  id: crypto.randomUUID(),
                  timestamp: Date.now(),
                  ...variant,
                };
                return normalizeChatMessage({
                  ...message,
                  variants: [...message.variants, nextVariant],
                  activeVariantId: nextVariant.id,
                });
              }),
              updatedAt: Date.now(),
            })),
          })),
        selectMessageVariant: (sessionId, messageId, variantId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: session.messages.map((message) => {
                if (message.id !== messageId) {
                  return message;
                }
                if (!variantId) {
                  return normalizeChatMessage({ ...message, activeVariantId: null });
                }
                const variant = message.variants.find((entry) => entry.id === variantId);
                if (!variant) {
                  return message;
                }
                return normalizeChatMessage({
                  ...message,
                  activeVariantId: variant.id,
                });
              }),
              updatedAt: Date.now(),
            })),
          })),
        deleteMessagesFrom: (sessionId, messageId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const deleteIndex = session.messages.findIndex((message) => message.id === messageId);
              if (deleteIndex === -1) {
                return session;
              }

              return {
                ...session,
                messages: session.messages.slice(0, deleteIndex),
                updatedAt: Date.now(),
              };
            }),
          })),
        clearConversation: (sessionId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: [],
              ...createEmptyRoleplayMemoryState(),
              updatedAt: Date.now(),
            })),
          })),
        setStreamingChat: (streaming) => set({ isStreamingChat: streaming }),
        setStreamingContent: (content) => set({ streamingContent: content }),
        appendStreamingContent: (token) =>
          set((state) => ({ streamingContent: state.streamingContent + token })),
        attachSceneImageToLastMessage: (sessionId, imageUrl) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              let lastAssistantIndex = -1;
              for (let i = session.messages.length - 1; i >= 0; i--) {
                if (session.messages[i].role === 'assistant') {
                  lastAssistantIndex = i;
                  break;
                }
              }
              if (lastAssistantIndex === -1) {
                return session;
              }

              return {
                ...session,
                messages: session.messages.map((message, index) => {
                  if (index !== lastAssistantIndex) {
                    return message;
                  }
                  if (!message.activeVariantId) {
                    return normalizeChatMessage({ ...message, sceneImageUrl: imageUrl });
                  }
                  return normalizeChatMessage({
                    ...message,
                    variants: message.variants.map((variant) =>
                      variant.id === message.activeVariantId
                        ? { ...variant, sceneImageUrl: imageUrl }
                        : variant
                    ),
                  });
                }),
                updatedAt: Date.now(),
              };
            }),
          })),
        dismissSuggestion: (sessionId, messageId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messages: session.messages.map((message) => {
                if (message.id !== messageId) {
                  return message;
                }
                if (!message.activeVariantId) {
                  return normalizeChatMessage({ ...message, suggestedImagePrompt: null });
                }
                return normalizeChatMessage({
                  ...message,
                  variants: message.variants.map((variant) =>
                    variant.id === message.activeVariantId
                      ? { ...variant, suggestedImagePrompt: null }
                      : variant
                  ),
                });
              }),
              updatedAt: Date.now(),
            })),
          })),
        setSessionMemoryStatus: (sessionId, status) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              memoryStatus: status,
              updatedAt: Date.now(),
            })),
          })),
        incrementMessagesSinceMemoryRefresh: (sessionId, amount = 1) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              messagesSinceMemoryRefresh: session.messagesSinceMemoryRefresh + amount,
              updatedAt: Date.now(),
            })),
          })),
        applyGeneratedMemory: (sessionId, summary, continuity, facts, updatedAt = Date.now()) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              conversationSummary: summary.trim(),
              continuity: {
                relationshipSummary: continuity.relationshipSummary.trim(),
                currentLocation: continuity.currentLocation.trim(),
                currentSituation: continuity.currentSituation.trim(),
                openThreads: continuity.openThreads
                  .map((thread) => thread.trim())
                  .filter((thread) => thread),
              },
              memoryFacts: facts,
              memoryStatus: 'idle',
              messagesSinceMemoryRefresh: 0,
              lastMemoryUpdatedAt: updatedAt,
              updatedAt,
            })),
          })),
        clearSessionMemory: (sessionId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              ...createEmptyRoleplayMemoryState(),
              updatedAt: Date.now(),
            })),
          })),
        addMemoryFact: (sessionId, text) =>
          set((state) => {
            const trimmedText = text.trim();
            if (!trimmedText) {
              return {};
            }

            const now = Date.now();
            return {
              chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
                session.memoryFacts.length >= ROLEPLAY_MAX_MEMORY_FACTS
                  ? session
                  : {
                      ...session,
                      memoryFacts: [
                        ...session.memoryFacts,
                        {
                          id: crypto.randomUUID(),
                          text: trimmedText,
                          pinned: true,
                          createdAt: now,
                          updatedAt: now,
                        },
                      ],
                      updatedAt: now,
                    }
              ),
            };
          }),
        updateMemoryFact: (sessionId, factId, text) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              memoryFacts: session.memoryFacts.map((fact) =>
                fact.id === factId ? { ...fact, text, updatedAt: Date.now() } : fact
              ),
              updatedAt: Date.now(),
            })),
          })),
        removeMemoryFact: (sessionId, factId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              memoryFacts: session.memoryFacts.filter((fact) => fact.id !== factId),
              updatedAt: Date.now(),
            })),
          })),
        toggleMemoryFactPinned: (sessionId, factId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              memoryFacts: session.memoryFacts.map((fact) =>
                fact.id === factId ? { ...fact, pinned: !fact.pinned, updatedAt: Date.now() } : fact
              ),
              updatedAt: Date.now(),
            })),
          })),
        addContinuityThread: (sessionId, text) =>
          set((state) => {
            const trimmedText = text.trim().replace(/\s+/g, ' ');
            if (!trimmedText) {
              return {};
            }

            return {
              chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
                const existingThreads = session.continuity.openThreads.map((thread) =>
                  thread.trim()
                );
                if (existingThreads.includes(trimmedText)) {
                  return session;
                }

                return {
                  ...session,
                  continuity: {
                    ...session.continuity,
                    openThreads: [...existingThreads, trimmedText].slice(0, 6),
                  },
                  updatedAt: Date.now(),
                };
              }),
            };
          }),
        removeContinuityThread: (sessionId, threadIndex) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              continuity: {
                ...session.continuity,
                openThreads: session.continuity.openThreads.filter(
                  (_thread, index) => index !== threadIndex
                ),
              },
              updatedAt: Date.now(),
            })),
          })),
        moveContinuityThread: (sessionId, threadIndex, direction) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const targetIndex = threadIndex + direction;
              if (
                threadIndex < 0 ||
                threadIndex >= session.continuity.openThreads.length ||
                targetIndex < 0 ||
                targetIndex >= session.continuity.openThreads.length
              ) {
                return session;
              }

              const nextThreads = [...session.continuity.openThreads];
              const [movedThread] = nextThreads.splice(threadIndex, 1);
              nextThreads.splice(targetIndex, 0, movedThread);
              return {
                ...session,
                continuity: {
                  ...session.continuity,
                  openThreads: nextThreads,
                },
                updatedAt: Date.now(),
              };
            }),
          })),
        markSessionVisited: (sessionId, visitedAt = Date.now()) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              lastVisitedAt: visitedAt,
              updatedAt: Date.now(),
            })),
          })),
        setConnectionStatus: (status) => set({ connectionStatus: status }),
        setConnectionMessage: (message) => set({ connectionMessage: message }),
        setLmStudioEndpoint: (endpoint) => set({ lmStudioEndpoint: endpoint }),
        setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
        setDetectedServerMode: (mode) => set({ detectedServerMode: mode }),
        setAvailableModels: (models) => set({ availableModels: models }),
        setModelCompatibility: (modelId, updates) =>
          set((state) => {
            const normalizedModelId = modelId.trim();
            if (!normalizedModelId) {
              return {};
            }

            return {
              modelCompatibilityByModelId: {
                ...state.modelCompatibilityByModelId,
                [normalizedModelId]: {
                  ...(state.modelCompatibilityByModelId[normalizedModelId] ??
                    createDefaultModelCompatibilitySettings()),
                  ...updates,
                },
              },
            };
          }),
        setImageSteps: (v) => set({ imageSteps: v }),
        setImageCfgScale: (v) => set({ imageCfgScale: v }),
        setImageClipStopAtLayer: (v) => set({ imageClipStopAtLayer: v }),
        setImageModelId: (id) => set({ imageModelId: id }),
        setChatTemperature: (v) => set({ chatTemperature: v }),
        setChatMaxTokens: (v) => set({ chatMaxTokens: v }),
        setImageDimensions: (width, height) => set({ imageWidth: width, imageHeight: height }),
        setGeneratingPortraitForId: (id) => set({ generatingPortraitForId: id }),
        importBundle: (bundle) =>
          set((state) => {
            const { characterIdMap, personaIdMap, lorebookIdMap, sessionIdMap } = remapIdsForImport(
              bundle,
              state
            );
            const importedCharacters = [bundle.character].map((character) =>
              normalizeCharacter({
                ...character,
                id: characterIdMap.get(character.id) ?? character.id,
                boundLorebookIds: character.boundLorebookIds.map(
                  (lorebookId) => lorebookIdMap.get(lorebookId) ?? lorebookId
                ),
              })
            );
            const importedLorebooks = (bundle.lorebooks ?? []).map((lorebook) =>
              normalizeLorebook({
                ...lorebook,
                id: lorebookIdMap.get(lorebook.id) ?? lorebook.id,
              })
            );
            const importedSessions = (bundle.sessions ?? []).map((session) =>
              normalizeSession({
                ...session,
                id: sessionIdMap.get(session.id) ?? session.id,
                characterId: characterIdMap.get(session.characterId) ?? session.characterId,
                activePersonaId: session.activePersonaId
                  ? (personaIdMap.get(session.activePersonaId) ?? session.activePersonaId)
                  : null,
                boundLorebookIds: session.boundLorebookIds.map(
                  (lorebookId) => lorebookIdMap.get(lorebookId) ?? lorebookId
                ),
              })
            );

            return {
              characters: [...state.characters, ...importedCharacters],
              lorebooks: [...state.lorebooks, ...importedLorebooks],
              chatSessions: [...importedSessions, ...state.chatSessions],
              activeCharacterId: importedCharacters[0]?.id ?? state.activeCharacterId,
              activeSessionId: importedSessions[0]?.id ?? state.activeSessionId,
            };
          }),
        getActiveCharacter: () => {
          const { characters, activeCharacterId } = get();
          return characters.find((character) => character.id === activeCharacterId) ?? null;
        },
        getActiveSession: () => {
          const { chatSessions, activeSessionId } = get();
          return chatSessions.find((session) => session.id === activeSessionId) ?? null;
        },
        getActivePersona: () => {
          const { personas } = get();
          const activeSession = get().getActiveSession();
          return personas.find((persona) => persona.id === activeSession?.activePersonaId) ?? null;
        },
        getCharacterSessions: (characterId) =>
          get()
            .chatSessions.filter((session) => session.characterId === characterId)
            .sort((left, right) => right.updatedAt - left.updatedAt),
        getActiveConversation: () => {
          const activeSession = get().getActiveSession();
          return activeSession?.messages ?? [];
        },
      }),
      {
        name: 'swarmui-roleplay-v2',
        storage: createJSONStorage(() => createIndexedDbStorage('swarmui-roleplay')),
        version: 12,
        migrate: (persistedState) => {
          const state = persistedState as LegacyRoleplayState;
          const normalizedCharacters =
            Array.isArray(state.characters) && state.characters.length > 0
              ? state.characters.map((character) => normalizeCharacter(character))
              : DEFAULT_CHARACTERS;
          const personas =
            Array.isArray(state.personas) && state.personas.length > 0
              ? state.personas.map((persona) => normalizePersona(persona))
              : DEFAULT_PERSONAS;
          const lorebooks =
            Array.isArray(state.lorebooks) && state.lorebooks.length > 0
              ? state.lorebooks.map((lorebook) => normalizeLorebook(lorebook))
              : [];
          let chatSessions: RoleplayChatSession[] =
            Array.isArray(state.chatSessions) && state.chatSessions.length > 0
              ? state.chatSessions.map((session) => normalizeSession(session))
              : [];

          if (chatSessions.length === 0) {
            const legacyConversations = state.conversations ?? {};
            chatSessions = normalizedCharacters.map((character) =>
              createSessionFromCharacter(
                character,
                legacyConversations[character.id] ?? [],
                (legacyConversations[character.id] ?? []).length > 0 ? 'Imported Chat' : 'Main Chat'
              )
            );
          }

          for (const character of normalizedCharacters) {
            if (!chatSessions.some((session) => session.characterId === character.id)) {
              chatSessions.push(createSessionFromCharacter(character));
            }
          }

          const activeCharacterId = normalizedCharacters.some(
            (character) => character.id === state.activeCharacterId
          )
            ? (state.activeCharacterId ?? normalizedCharacters[0]?.id ?? null)
            : (normalizedCharacters[0]?.id ?? null);
          const activeSessionId = chatSessions.some(
            (session) => session.id === state.activeSessionId
          )
            ? (state.activeSessionId ?? getMostRecentSessionId(chatSessions, activeCharacterId))
            : getMostRecentSessionId(chatSessions, activeCharacterId);

          return {
            characters: normalizedCharacters,
            personas,
            lorebooks,
            chatSessions,
            activeCharacterId,
            activeSessionId,
            chatMaxTokens:
              typeof state.chatMaxTokens === 'number'
                ? state.chatMaxTokens === 2048
                  ? DEFAULT_CHAT_MAX_TOKENS
                  : state.chatMaxTokens
                : DEFAULT_CHAT_MAX_TOKENS,
            modelCompatibilityByModelId: state.modelCompatibilityByModelId ?? {},
          } as RoleplayStoreState;
        },
        partialize: (state) => ({
          characters: state.characters,
          personas: state.personas,
          lorebooks: state.lorebooks,
          chatSessions: state.chatSessions,
          activeCharacterId: state.activeCharacterId,
          activeSessionId: state.activeSessionId,
          lmStudioEndpoint: state.lmStudioEndpoint,
          selectedModelId: state.selectedModelId,
          modelCompatibilityByModelId: state.modelCompatibilityByModelId,
          imageSteps: state.imageSteps,
          imageCfgScale: state.imageCfgScale,
          imageClipStopAtLayer: state.imageClipStopAtLayer,
          imageModelId: state.imageModelId,
          chatTemperature: state.chatTemperature,
          chatMaxTokens: state.chatMaxTokens,
          imageWidth: state.imageWidth,
          imageHeight: state.imageHeight,
        }),
      }
    ),
    { name: 'RoleplayStore' }
  )
);
