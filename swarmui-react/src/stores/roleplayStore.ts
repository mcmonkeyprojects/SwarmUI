import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { createIndexedDbStorage } from '../lib/indexedDbStorage';
import type {
  ChatMessage,
  ChatMessageVariant,
  RoleplayCatalogTemplate,
  RoleplayCharacter,
  RoleplayCharacterExpressionSprite,
  RoleplayCharacterGalleryImage,
  RoleplayCharacterGalleryReferenceRole,
  RoleplayCharacterVisualProfile,
  RoleplayChatBranch,
  RoleplayChatCheckpoint,
  RoleplayChatSession,
  RoleplayCharacterImportMode,
  RoleplayCharacterSourceMetadata,
  RoleplayConnectionState,
  RoleplayContinuityState,
  RoleplayChatProvider,
  RoleplayLorebook,
  RoleplayLorebookEntry,
  RoleplayKnowledgeDocument,
  RoleplayKnowledgeScope,
  RoleplayMemoryFact,
  RoleplayMemoryStatus,
  RoleplayModelCompatibilitySettings,
  RoleplayPersona,
  RoleplayPromptInjection,
  RoleplayPromptStack,
  RoleplayQuickReply,
  RoleplayScriptTraceEntry,
  RoleplayScriptVariable,
  RoleplaySessionVisualState,
  RoleplayVisualCharacterState,
} from '../types/roleplay';
import type { TavernImportResult } from '../features/roleplay/tavernCard';
import type { AssistantModel, AssistantServerMode } from '../types/assistant';
import {
  DEFAULT_ROLEPLAY_INTERACTION_STYLE,
  LEGACY_ROLEPLAY_INTERACTION_STYLE,
  getRoleplayInteractionStyleConfig,
} from '../data/roleplayInteractionStyles';
import {
  getRoleplayPresetStack,
  ROLEPLAY_PRESET_NONE_ID,
} from '../data/roleplayPresetStacks';
import {
  createRoleplayCompatibilityFromProfile,
  getRoleplayLocalModelProfile,
} from '../data/roleplayLocalModelProfiles';
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
import { chunkRoleplayKnowledgeDocument } from '../features/roleplay/roleplayKnowledgeRetrieval';

const DEFAULT_CHAT_MAX_TOKENS = 768;
export const DEFAULT_PERSONA_ID = 'default-persona';

type LegacyRoleplayCharacter = Partial<RoleplayCharacter> & {
  id: string;
  name: string;
};

interface RoleplayCharacterImportOptions {
  mode?: RoleplayCharacterImportMode;
  targetCharacterId?: string;
  sourceMetadata?: RoleplayCharacterSourceMetadata;
}

type LegacyRoleplayState = Partial<RoleplayStoreState> & {
  characters?: LegacyRoleplayCharacter[];
  chatSessions?: RoleplayChatSession[];
  personas?: RoleplayPersona[];
  lorebooks?: RoleplayLorebook[];
  conversations?: Record<string, ChatMessage[]>;
};

function createKnowledgeDocument(input: {
  title: string;
  description?: string;
  scope: RoleplayKnowledgeScope;
  characterId?: string | null;
  personaId?: string | null;
  sessionId?: string | null;
  sourceType?: RoleplayKnowledgeDocument['sourceType'];
  content: string;
  enabled?: boolean;
}): RoleplayKnowledgeDocument {
  const now = Date.now();
  const id = crypto.randomUUID();
  const title = normalizeString(input.title, 'Knowledge Note');
  const content = normalizeString(input.content);
  return {
    id,
    title,
    description: normalizeString(input.description),
    scope: input.scope,
    characterId: input.characterId ?? null,
    personaId: input.personaId ?? null,
    sessionId: input.sessionId ?? null,
    sourceType: input.sourceType ?? 'note',
    content,
    chunks: chunkRoleplayKnowledgeDocument({ documentId: id, title, content }),
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeKnowledgeDocument(document: Partial<RoleplayKnowledgeDocument>): RoleplayKnowledgeDocument {
  const now = Date.now();
  const id = normalizeString(document.id, crypto.randomUUID());
  const title = normalizeString(document.title, 'Knowledge Note');
  const content = normalizeString(document.content);
  const scope =
    document.scope === 'character' || document.scope === 'persona' || document.scope === 'session'
      ? document.scope
      : 'global';
  const chunks =
    Array.isArray(document.chunks) && document.chunks.length > 0
      ? document.chunks.map((chunk, index) => ({
          id: normalizeString(chunk.id, `${id}-chunk-${index + 1}`),
          documentId: id,
          index: normalizeNumber(chunk.index, index),
          title: normalizeString(chunk.title, `${title} #${index + 1}`),
          content: normalizeString(chunk.content),
          tokenEstimate: normalizeNumber(chunk.tokenEstimate, Math.ceil(normalizeString(chunk.content).length / 4)),
          embedding: Array.isArray(chunk.embedding) ? chunk.embedding : null,
          embeddingModel: normalizeNullableString(chunk.embeddingModel),
          updatedAt: chunk.updatedAt ?? now,
        }))
      : chunkRoleplayKnowledgeDocument({ documentId: id, title, content });
  return {
    id,
    title,
    description: normalizeString(document.description),
    scope,
    characterId: normalizeNullableString(document.characterId),
    personaId: normalizeNullableString(document.personaId),
    sessionId: normalizeNullableString(document.sessionId),
    sourceType:
      document.sourceType === 'text-file' ||
      document.sourceType === 'chat-history' ||
      document.sourceType === 'external'
        ? document.sourceType
        : 'note',
    content,
    chunks,
    enabled: document.enabled !== false,
    createdAt: document.createdAt ?? now,
    updatedAt: document.updatedAt ?? now,
  };
}

function normalizeModelCompatibilitySettings(
  value?: Partial<RoleplayModelCompatibilitySettings>
): RoleplayModelCompatibilitySettings {
  const profile = getRoleplayLocalModelProfile(value?.localProfileId);
  return {
    ...createRoleplayCompatibilityFromProfile(profile.id),
    ...value,
    localProfileId: profile.id,
    maxContextTokens: Math.max(
      1024,
      value?.maxContextTokens ?? profile.recommendedContextTokens
    ),
    loreEntryLimit: Math.max(0, value?.loreEntryLimit ?? profile.loreEntryLimit),
    maxHistoryMessages: Math.max(1, value?.maxHistoryMessages ?? profile.maxHistoryMessages),
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

function normalizeVisualCharacterState(value: unknown): RoleplayVisualCharacterState {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<RoleplayVisualCharacterState>)
    : {};
  return {
    attire: normalizeString(record.attire),
    condition: normalizeString(record.condition),
    mood: normalizeString(record.mood),
    poseCue: normalizeString(record.poseCue),
    referenceImageId: normalizeNullableString(record.referenceImageId),
  };
}

function createEmptyVisualCharacterState(): RoleplayVisualCharacterState {
  return {
    attire: '',
    condition: '',
    mood: '',
    poseCue: '',
    referenceImageId: null,
  };
}

function normalizeVisualCharacterStateMap(
  value: unknown
): Record<string, RoleplayVisualCharacterState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, RoleplayVisualCharacterState> = {};
  for (const [characterId, characterState] of Object.entries(value as Record<string, unknown>)) {
    if (!characterId.trim()) {
      continue;
    }
    normalized[characterId] = normalizeVisualCharacterState(characterState);
  }
  return normalized;
}

function normalizeCharacterVisualProfile(
  value: unknown,
  appearancePrompt?: string | null
): RoleplayCharacterVisualProfile {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<RoleplayCharacterVisualProfile>)
    : {};
  return {
    permanentAnchor: normalizeString(record.permanentAnchor, appearancePrompt ?? ''),
    defaultAttire: normalizeString(record.defaultAttire),
    styleAnchor: normalizeString(record.styleAnchor),
    negativeAnchor: normalizeString(record.negativeAnchor),
  };
}

function normalizeSessionVisualState(
  value: unknown,
  session: Partial<RoleplayChatSession>
): RoleplaySessionVisualState {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<RoleplaySessionVisualState>)
    : {};
  const characterStates = normalizeVisualCharacterStateMap(record.characterStates);
  const activeCharacterId = normalizeNullableString(session.activeSpeakerCharacterId) || session.characterId || '';
  if (activeCharacterId && !characterStates[activeCharacterId]) {
    characterStates[activeCharacterId] = {
      ...createEmptyVisualCharacterState(),
      poseCue: normalizeString(session.activeExpression),
    };
  }
  return {
    location: normalizeString(record.location, session.continuity?.currentLocation ?? ''),
    timeOfDay: normalizeString(record.timeOfDay),
    lighting: normalizeString(record.lighting, normalizeString(session.ambiencePrompt)),
    sceneAnchor: normalizeString(record.sceneAnchor, normalizeString(session.sceneBackgroundPrompt)),
    persistentObjects: normalizeString(record.persistentObjects),
    negativePrompt: normalizeString(record.negativePrompt),
    characterStates,
  };
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

function applySourceMetadata(
  character: Partial<RoleplayCharacter>,
  metadata?: RoleplayCharacterSourceMetadata
): Partial<RoleplayCharacter> {
  if (!metadata) {
    return character;
  }
  return {
    ...character,
    sourceUrl: metadata.sourceUrl ?? character.sourceUrl,
    sourceDownloadUrl: metadata.sourceDownloadUrl ?? character.sourceDownloadUrl,
    sourceProviderId: metadata.sourceProviderId ?? character.sourceProviderId,
    sourceExternalId: metadata.sourceExternalId ?? character.sourceExternalId,
    sourceImportedAt: metadata.sourceImportedAt ?? character.sourceImportedAt,
    sourceLastCheckedAt: metadata.sourceLastCheckedAt ?? character.sourceLastCheckedAt,
    sourceLicense: metadata.sourceLicense ?? character.sourceLicense,
    sourceContentRating: metadata.sourceContentRating ?? character.sourceContentRating,
  };
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

function normalizeChatMessages(messages: ChatMessage[] | undefined): ChatMessage[] {
  return (messages ?? []).map((message) => normalizeChatMessage(message));
}

function normalizeChatBranch(
  branch: Partial<RoleplayChatBranch> & { id: string; name?: string }
): RoleplayChatBranch {
  const now = Date.now();
  return {
    id: branch.id,
    name: normalizeString(branch.name, 'Main'),
    parentBranchId: normalizeNullableString(branch.parentBranchId),
    forkMessageId: normalizeNullableString(branch.forkMessageId),
    messages: normalizeChatMessages(branch.messages),
    createdAt: branch.createdAt ?? now,
    updatedAt: branch.updatedAt ?? now,
  };
}

function normalizeChatCheckpoint(
  checkpoint: Partial<RoleplayChatCheckpoint> & { id: string; name?: string; branchId?: string }
): RoleplayChatCheckpoint {
  const now = Date.now();
  const emptyMemoryState = createEmptyRoleplayMemoryState();
  return {
    id: checkpoint.id,
    name: normalizeString(checkpoint.name, 'Checkpoint'),
    branchId: normalizeString(checkpoint.branchId, ''),
    forkMessageId: normalizeNullableString(checkpoint.forkMessageId),
    messages: normalizeChatMessages(checkpoint.messages),
    memoryState: {
      conversationSummary: normalizeString(
        checkpoint.memoryState?.conversationSummary,
        emptyMemoryState.conversationSummary
      ),
      continuity: checkpoint.memoryState?.continuity ?? emptyMemoryState.continuity,
      memoryFacts: checkpoint.memoryState?.memoryFacts ?? emptyMemoryState.memoryFacts,
      memoryStatus: checkpoint.memoryState?.memoryStatus ?? emptyMemoryState.memoryStatus,
      messagesSinceMemoryRefresh:
        checkpoint.memoryState?.messagesSinceMemoryRefresh ??
        emptyMemoryState.messagesSinceMemoryRefresh,
      lastMemoryUpdatedAt:
        checkpoint.memoryState?.lastMemoryUpdatedAt ?? emptyMemoryState.lastMemoryUpdatedAt,
      lastVisitedAt: checkpoint.memoryState?.lastVisitedAt ?? emptyMemoryState.lastVisitedAt,
    },
    createdAt: checkpoint.createdAt ?? now,
  };
}

function getSessionMemoryState(session: RoleplayChatSession): RoleplayChatCheckpoint['memoryState'] {
  return {
    conversationSummary: session.conversationSummary,
    continuity: session.continuity,
    memoryFacts: session.memoryFacts,
    memoryStatus: session.memoryStatus,
    messagesSinceMemoryRefresh: session.messagesSinceMemoryRefresh,
    lastMemoryUpdatedAt: session.lastMemoryUpdatedAt,
    lastVisitedAt: session.lastVisitedAt,
  };
}

function createDefaultPromptStack(): RoleplayPromptStack {
  return {
    roleplayPresetId: 'none',
    mainPromptOverride: '',
    authorNote: '',
    postHistoryNote: '',
    includePersona: true,
    includeCharacterDefinition: true,
    includeScenario: true,
    includeExampleMessages: true,
    includeMemory: true,
    includeLore: true,
    promptBlockSettings: {},
    promptBlockSettingsByPresetId: {},
  };
}

function normalizeScriptVariables(
  variables: Record<string, RoleplayScriptVariable> | undefined
): Record<string, RoleplayScriptVariable> {
  const normalized: Record<string, RoleplayScriptVariable> = {};
  for (const [name, variable] of Object.entries(variables ?? {})) {
    const normalizedName = normalizeString(variable?.name, name).trim();
    if (!normalizedName) {
      continue;
    }
    normalized[normalizedName] = {
      name: normalizedName,
      value: normalizeString(variable?.value),
      updatedAt: normalizeNumber(variable?.updatedAt, Date.now()),
    };
  }
  return normalized;
}

function normalizePromptInjection(injection: Partial<RoleplayPromptInjection>): RoleplayPromptInjection {
  const now = Date.now();
  const position = injection.position === 'after-history' || injection.position === 'in-history'
    ? injection.position
    : 'before-history';
  const role = injection.role === 'user' || injection.role === 'assistant' ? injection.role : 'system';
  return {
    id: normalizeString(injection.id, crypto.randomUUID()),
    label: normalizeString(injection.label, 'Script Injection'),
    content: normalizeString(injection.content),
    role,
    position,
    depth: position === 'in-history' ? normalizeNumber(injection.depth, 4) : null,
    order: normalizeNumber(injection.order, 850),
    enabled: injection.enabled !== false,
    createdAt: injection.createdAt ?? now,
    updatedAt: injection.updatedAt ?? now,
  };
}

function normalizeQuickReply(reply: Partial<RoleplayQuickReply>): RoleplayQuickReply {
  const now = Date.now();
  return {
    id: normalizeString(reply.id, crypto.randomUUID()),
    label: normalizeString(reply.label, 'Quick Reply'),
    script: normalizeString(reply.script),
    enabled: reply.enabled !== false,
    createdAt: reply.createdAt ?? now,
    updatedAt: reply.updatedAt ?? now,
  };
}

function createDefaultRoleplayQuickReplies(): RoleplayQuickReply[] {
  return [
    normalizeQuickReply({
      label: 'Quiet Refresh',
      script: '/quiet',
      enabled: true,
    }),
    normalizeQuickReply({
      label: 'Continue',
      script: '/continue',
      enabled: true,
    }),
  ];
}

function normalizePromptBlockSettings(
  settings: RoleplayPromptStack['promptBlockSettings'] | undefined
): RoleplayPromptStack['promptBlockSettings'] {
  if (!settings || typeof settings !== 'object') {
    return {};
  }

  const normalizedSettings: RoleplayPromptStack['promptBlockSettings'] = {};
  for (const [blockId, blockSettings] of Object.entries(settings)) {
    if (!blockId || !blockSettings || typeof blockSettings !== 'object') {
      continue;
    }

    normalizedSettings[blockId] = {
      enabled:
        typeof blockSettings.enabled === 'boolean' ? blockSettings.enabled : undefined,
      order: typeof blockSettings.order === 'number' ? blockSettings.order : undefined,
      role:
        blockSettings.role === 'system' ||
        blockSettings.role === 'user' ||
        blockSettings.role === 'assistant'
          ? blockSettings.role
          : undefined,
      position:
        blockSettings.position === 'before-history' ||
        blockSettings.position === 'after-history' ||
        blockSettings.position === 'in-history'
          ? blockSettings.position
          : undefined,
      depth:
        typeof blockSettings.depth === 'number' || blockSettings.depth === null
          ? blockSettings.depth
          : undefined,
      triggerModes: Array.isArray(blockSettings.triggerModes)
        ? blockSettings.triggerModes.filter(
            (mode) =>
              mode === 'normal' ||
              mode === 'swipe' ||
              mode === 'regenerate' ||
              mode === 'continue' ||
              mode === 'impersonate' ||
              mode === 'quiet'
          )
        : undefined,
      tokenBudget:
        typeof blockSettings.tokenBudget === 'number' || blockSettings.tokenBudget === null
          ? blockSettings.tokenBudget
          : undefined,
    };
  }

  return normalizedSettings;
}

function normalizePromptBlockSettingsByPresetId(
  settingsByPresetId: RoleplayPromptStack['promptBlockSettingsByPresetId'] | undefined
): RoleplayPromptStack['promptBlockSettingsByPresetId'] {
  if (!settingsByPresetId || typeof settingsByPresetId !== 'object') {
    return {};
  }

  const normalizedSettingsByPresetId: RoleplayPromptStack['promptBlockSettingsByPresetId'] = {};
  for (const [presetId, presetSettings] of Object.entries(settingsByPresetId)) {
    if (!presetId || !presetSettings || typeof presetSettings !== 'object') {
      continue;
    }
    normalizedSettingsByPresetId[presetId] = normalizePromptBlockSettings(presetSettings);
  }
  return normalizedSettingsByPresetId;
}

function normalizeInteractionStyle(value: unknown): RoleplayCharacter['interactionStyle'] {
  return value === 'personal-chat' || value === 'storyteller'
    ? value
    : LEGACY_ROLEPLAY_INTERACTION_STYLE;
}

function normalizeExpressionSprites(value: unknown): RoleplayCharacterExpressionSprite[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((sprite, index) => {
      const source = sprite as Partial<RoleplayCharacterExpressionSprite>;
      const label = normalizeString(source.label).trim();
      const prompt = normalizeString(source.prompt).trim();
      if (!label && !prompt) {
        return null;
      }
      return {
        id: normalizeString(source.id, `expression-${index}`),
        label: label || prompt || `Expression ${index + 1}`,
        prompt: prompt || label,
        imageUrl: normalizeNullableString(source.imageUrl),
      };
    })
    .filter((sprite): sprite is RoleplayCharacterExpressionSprite => sprite !== null);
}

function normalizeGalleryReferenceRole(value: unknown): RoleplayCharacterGalleryReferenceRole | null {
  return value === 'portrait' ||
    value === 'face' ||
    value === 'body' ||
    value === 'outfit' ||
    value === 'expression' ||
    value === 'scene' ||
    value === 'other'
    ? value
    : null;
}

function normalizeGalleryImages(value: unknown): RoleplayCharacterGalleryImage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalizedImages: RoleplayCharacterGalleryImage[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const source = value[index] as Partial<RoleplayCharacterGalleryImage>;
    const imageUrl = normalizeString(source.imageUrl).trim();
    if (!imageUrl) {
      continue;
    }
    const imageSource =
      source.source === 'portrait' ||
      source.source === 'scene' ||
      source.source === 'upload' ||
      source.source === 'import'
        ? source.source
        : 'import';
    normalizedImages.push({
      id: normalizeString(source.id, `gallery-${index}`),
      imageUrl,
      source: imageSource,
      referenceRole: normalizeGalleryReferenceRole(source.referenceRole),
      isPrimaryReference: normalizeBoolean(source.isPrimaryReference, false),
      prompt: normalizeString(source.prompt),
      negativePrompt: normalizeNullableString(source.negativePrompt),
      sessionId: normalizeNullableString(source.sessionId),
      messageId: normalizeNullableString(source.messageId),
      createdAt: normalizeNumber(source.createdAt, Date.now()),
    });
  }
  return normalizedImages;
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
  const appearancePrompt = normalizeNullableString(character.appearancePrompt);

  return {
    id: character.id,
    name: normalizeString(character.name, 'Unnamed Character'),
    favorite: normalizeBoolean(character.favorite, false),
    creator: normalizeString(character.creator),
    characterVersion: normalizeString(character.characterVersion),
    sourceFormat: character.sourceFormat ?? 'native',
    sourceUrl: normalizeString(character.sourceUrl),
    sourceDownloadUrl: normalizeString(character.sourceDownloadUrl),
    sourceProviderId: normalizeString(character.sourceProviderId),
    sourceExternalId: normalizeString(character.sourceExternalId),
    sourceImportedAt: normalizeNullableNumber(character.sourceImportedAt),
    sourceLastCheckedAt: normalizeNullableNumber(character.sourceLastCheckedAt),
    sourceLicense: normalizeString(character.sourceLicense),
    sourceContentRating: normalizeString(character.sourceContentRating),
    catalogTemplateId: normalizeNullableString(character.catalogTemplateId),
    catalogCategory: normalizeNullableString(character.catalogCategory),
    cardExtensions: normalizeRecord(character.cardExtensions),
    avatar: normalizeNullableString(character.avatar),
    headshotUrl: normalizeNullableString(character.headshotUrl),
    interactionStyle,
    appearancePrompt,
    visualProfile: normalizeCharacterVisualProfile(character.visualProfile, appearancePrompt),
    expressionSprites: normalizeExpressionSprites(character.expressionSprites),
    galleryImages: normalizeGalleryImages(character.galleryImages),
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
    postHistoryInstructions: normalizeString(character.postHistoryInstructions),
    characterNote: normalizeString(character.characterNote),
    characterNoteRole:
      character.characterNoteRole === 'user' || character.characterNoteRole === 'assistant'
        ? character.characterNoteRole
        : 'system',
    characterNoteDepth:
      typeof character.characterNoteDepth === 'number' ? character.characterNoteDepth : null,
    tavernV2Data: normalizeRecord(character.tavernV2Data),
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
    global: normalizeBoolean(lorebook.global, false),
    entries: (lorebook.entries ?? []).map((entry) => ({
      id: entry.id,
      title: normalizeString(entry.title),
      content: normalizeString(entry.content),
      keywords: normalizeStringArray(entry.keywords),
      secondaryKeywords: normalizeStringArray(entry.secondaryKeywords),
      negativeKeywords: normalizeStringArray(entry.negativeKeywords),
      mode: entry.mode ?? 'keyword',
      keywordMode: entry.keywordMode ?? 'plain',
      activationLogic: entry.activationLogic ?? 'any',
      selective: normalizeBoolean(entry.selective, false),
      caseSensitive: normalizeBoolean(entry.caseSensitive, false),
      scanDepth: normalizeNumber(entry.scanDepth, 4),
      insertionOrder: normalizeNumber(entry.insertionOrder, 100),
      insertionPosition: entry.insertionPosition ?? 'before-history',
      insertionDepth: normalizeNumber(entry.insertionDepth, 4),
      tokenBudget: normalizeNullableNumber(entry.tokenBudget),
      recursive: normalizeBoolean(entry.recursive, false),
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
  const roleplayPresetId = normalizeString(
    normalizedPromptStack.roleplayPresetId,
    ROLEPLAY_PRESET_NONE_ID
  );
  const promptBlockSettings = normalizePromptBlockSettings(
    normalizedPromptStack.promptBlockSettings
  );
  const promptBlockSettingsByPresetId = normalizePromptBlockSettingsByPresetId(
    normalizedPromptStack.promptBlockSettingsByPresetId
  );
  const activePreset = getRoleplayPresetStack(roleplayPresetId);
  if (activePreset.id !== ROLEPLAY_PRESET_NONE_ID) {
    const activePresetSettings = { ...(promptBlockSettingsByPresetId[activePreset.id] ?? {}) };
    for (const presetBlock of activePreset.blocks) {
      const legacyPresetBlockSettings = promptBlockSettings[presetBlock.id];
      if (!legacyPresetBlockSettings) {
        continue;
      }
      activePresetSettings[presetBlock.id] = {
        ...legacyPresetBlockSettings,
        ...(activePresetSettings[presetBlock.id] ?? {}),
      };
      delete promptBlockSettings[presetBlock.id];
    }
    promptBlockSettingsByPresetId[activePreset.id] = activePresetSettings;
  }
  const normalizedMessages = normalizeChatMessages(session.messages);
  const activeBranchId = normalizeString(session.activeBranchId, 'main');
  const normalizedBranches =
    session.branches && session.branches.length > 0
      ? session.branches.map((branch) => normalizeChatBranch(branch))
      : [
          normalizeChatBranch({
            id: activeBranchId,
            name: 'Main',
            parentBranchId: null,
            forkMessageId: null,
            messages: normalizedMessages,
            createdAt: session.createdAt ?? now,
            updatedAt: session.updatedAt ?? now,
          }),
        ];
  const branchExists = normalizedBranches.some((branch) => branch.id === activeBranchId);
  const effectiveActiveBranchId = branchExists ? activeBranchId : normalizedBranches[0].id;
  const branches = normalizedBranches.map((branch) =>
    branch.id === effectiveActiveBranchId
      ? normalizeChatBranch({ ...branch, messages: normalizedMessages })
      : branch
  );

  return {
    id: session.id,
    characterId: session.characterId,
    title: normalizeString(session.title, 'Main Chat'),
    activePersonaId: normalizeString(session.activePersonaId, DEFAULT_PERSONA_ID),
    participantCharacterIds:
      normalizeStringArray(session.participantCharacterIds).length > 0
        ? normalizeStringArray(session.participantCharacterIds)
        : [session.characterId],
    activeSpeakerCharacterId: normalizeNullableString(session.activeSpeakerCharacterId),
    sceneBackgroundPrompt: normalizeString(session.sceneBackgroundPrompt),
    ambiencePrompt: normalizeString(session.ambiencePrompt),
    activeExpression: normalizeString(session.activeExpression),
    visualState: normalizeSessionVisualState(session.visualState, session),
    chatBackgroundImage: normalizeNullableString(session.chatBackgroundImage),
    boundLorebookIds: normalizeStringArray(session.boundLorebookIds),
    promptStack: {
      ...createDefaultPromptStack(),
      ...normalizedPromptStack,
      roleplayPresetId,
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
      promptBlockSettings,
      promptBlockSettingsByPresetId,
    },
    scriptVariables: normalizeScriptVariables(session.scriptVariables),
    promptInjections: (session.promptInjections ?? [])
      .map((injection) => normalizePromptInjection(injection))
      .filter((injection) => injection.content.trim()),
    messages: normalizedMessages,
    activeBranchId: effectiveActiveBranchId,
    branches,
    checkpoints: (session.checkpoints ?? []).map((checkpoint) =>
      normalizeChatCheckpoint({
        ...checkpoint,
        branchId: checkpoint.branchId || effectiveActiveBranchId,
      })
    ),
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
    participantCharacterIds: [character.id],
    activeSpeakerCharacterId: character.id,
    sceneBackgroundPrompt: '',
    ambiencePrompt: '',
    activeExpression: '',
    chatBackgroundImage: null,
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
      negativeKeywords: [],
      mode: entry.keywords.length > 0 ? 'keyword' : 'always-on',
      keywordMode: 'plain',
      activationLogic: 'any',
      selective: false,
      caseSensitive: false,
      scanDepth: 6,
      insertionOrder: 100 + index,
      insertionPosition: 'before-history',
      insertionDepth: 4,
      tokenBudget: 180,
      recursive: false,
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
    sourceDownloadUrl: '',
    sourceProviderId: 'local-catalog',
    sourceExternalId: template.id,
    sourceImportedAt: now,
    sourceLastCheckedAt: now,
    sourceLicense: '',
    sourceContentRating: '',
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
    postHistoryInstructions: '',
    characterNote: '',
    characterNoteRole: 'system',
    characterNoteDepth: null,
    tavernV2Data: null,
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
    postHistoryInstructions: '',
    characterNote: '',
    characterNoteRole: 'system',
    characterNoteDepth: null,
    tavernV2Data: null,
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

function updateActiveBranchMessages(
  session: RoleplayChatSession,
  messages: ChatMessage[],
  updatedAt: number = Date.now()
): RoleplayChatSession {
  const normalizedMessages = normalizeChatMessages(messages);
  const activeBranchId = session.activeBranchId || 'main';
  const hasActiveBranch = session.branches.some((branch) => branch.id === activeBranchId);
  const branches = (
    hasActiveBranch
      ? session.branches
      : [
          ...session.branches,
          normalizeChatBranch({
            id: activeBranchId,
            name: 'Main',
            parentBranchId: null,
            forkMessageId: null,
            messages: [],
            createdAt: session.createdAt,
            updatedAt,
          }),
        ]
  ).map((branch) =>
    branch.id === activeBranchId
      ? normalizeChatBranch({
          ...branch,
          messages: normalizedMessages,
          updatedAt,
        })
      : branch
  );

  return {
    ...session,
    activeBranchId,
    messages: normalizedMessages,
    branches,
    updatedAt,
  };
}

function getDefaultBranchName(session: RoleplayChatSession): string {
  return `Branch ${session.branches.length + 1}`;
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
      left[index].insertionDepth !== right[index].insertionDepth ||
      left[index].tokenBudget !== right[index].tokenBudget ||
      left[index].recursive !== right[index].recursive ||
      left[index].enabled !== right[index].enabled ||
      !areStringArraysEqual(left[index].keywords, right[index].keywords) ||
      !areStringArraysEqual(left[index].secondaryKeywords, right[index].secondaryKeywords) ||
      !areStringArraysEqual(left[index].negativeKeywords, right[index].negativeKeywords)
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
  if (Object.hasOwn(updates, 'global') && updates.global !== lorebook.global) {
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
    Object.hasOwn(updates, 'roleplayPresetId') &&
    updates.roleplayPresetId !== promptStack.roleplayPresetId
  ) {
    return true;
  }
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
  if (
    Object.hasOwn(updates, 'promptBlockSettings') &&
    JSON.stringify(updates.promptBlockSettings ?? {}) !==
      JSON.stringify(promptStack.promptBlockSettings ?? {})
  ) {
    return true;
  }
  if (
    Object.hasOwn(updates, 'promptBlockSettingsByPresetId') &&
    JSON.stringify(updates.promptBlockSettingsByPresetId ?? {}) !==
      JSON.stringify(promptStack.promptBlockSettingsByPresetId ?? {})
  ) {
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
  roleplayKnowledgeDocuments: RoleplayKnowledgeDocument[];
  roleplayEmbeddingModelId: string;
  roleplayVectorRetrievalEnabled: boolean;
  chatSessions: RoleplayChatSession[];
  activeCharacterId: string | null;
  activeSessionId: string | null;
  isStreamingChat: boolean;
  streamingContent: string;
  roleplayScriptVariables: Record<string, RoleplayScriptVariable>;
  roleplayQuickReplies: RoleplayQuickReply[];
  roleplayScriptTrace: RoleplayScriptTraceEntry[];
  connectionStatus: RoleplayConnectionState;
  connectionMessage: string | null;
  chatProvider: RoleplayChatProvider;
  chatApiKey: string;
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
  importCharacterCard: (result: TavernImportResult, options?: RoleplayCharacterImportOptions) => void;
  replaceCharacterFromCard: (
    characterId: string,
    result: TavernImportResult,
    sourceMetadata?: RoleplayCharacterSourceMetadata
  ) => void;
  setCharacterSourceMetadata: (
    characterId: string,
    metadata: RoleplayCharacterSourceMetadata
  ) => void;
  createCharacterFromTemplate: (template: RoleplayCatalogTemplate) => void;
  duplicateCharacter: (id: string) => void;
  setCharacterFavorite: (id: string, favorite?: boolean) => void;
  updateCharacter: (id: string, updates: Partial<Omit<RoleplayCharacter, 'id'>>) => void;
  removeCharacter: (id: string) => void;
  setActiveCharacter: (id: string | null) => void;
  updateCharacterAvatar: (id: string, avatarUrl: string, headshotUrl?: string) => void;
  addCharacterGalleryImage: (
    characterId: string,
    image: Omit<RoleplayCharacterGalleryImage, 'id' | 'createdAt'>
  ) => void;
  removeCharacterGalleryImage: (characterId: string, imageId: string) => void;
  addPersona: (persona: RoleplayPersona) => void;
  updatePersona: (id: string, updates: Partial<Omit<RoleplayPersona, 'id'>>) => void;
  removePersona: (id: string) => void;
  setSessionActivePersona: (sessionId: string, personaId: string | null) => void;
  addLorebook: (lorebook: RoleplayLorebook) => void;
  updateLorebook: (id: string, updates: Partial<Omit<RoleplayLorebook, 'id'>>) => void;
  removeLorebook: (id: string) => void;
  addKnowledgeDocument: (input: {
    title: string;
    description?: string;
    scope: RoleplayKnowledgeScope;
    characterId?: string | null;
    personaId?: string | null;
    sessionId?: string | null;
    sourceType?: RoleplayKnowledgeDocument['sourceType'];
    content: string;
    enabled?: boolean;
  }) => void;
  updateKnowledgeDocument: (id: string, updates: Partial<Omit<RoleplayKnowledgeDocument, 'id' | 'chunks' | 'createdAt'>>) => void;
  setKnowledgeDocumentChunkEmbeddings: (
    id: string,
    embeddingModel: string,
    embeddings: Array<{ chunkId: string; embedding: number[] }>
  ) => void;
  removeKnowledgeDocument: (id: string) => void;
  createSession: (characterId: string, title?: string) => void;
  duplicateSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  updateSessionPromptStack: (sessionId: string, updates: Partial<RoleplayPromptStack>) => void;
  setSessionBoundLorebooks: (sessionId: string, lorebookIds: string[]) => void;
  setSessionParticipants: (sessionId: string, characterIds: string[]) => void;
  setSessionActiveSpeaker: (sessionId: string, characterId: string | null) => void;
  updateSessionVisualState: (
    sessionId: string,
    updates: Partial<
      Pick<
        RoleplayChatSession,
        | 'sceneBackgroundPrompt'
        | 'ambiencePrompt'
        | 'activeExpression'
        | 'visualState'
        | 'chatBackgroundImage'
      >
    >
  ) => void;
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
  branchFromMessage: (
    sessionId: string,
    messageId: string,
    options?: { name?: string; replacementMessage?: ChatMessage }
  ) => void;
  switchBranch: (sessionId: string, branchId: string) => void;
  returnToParentBranch: (sessionId: string) => void;
  renameBranch: (sessionId: string, branchId: string, name: string) => void;
  createCheckpoint: (sessionId: string, name: string) => void;
  restoreCheckpoint: (sessionId: string, checkpointId: string) => void;
  removeCheckpoint: (sessionId: string, checkpointId: string) => void;
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
  setRoleplayScriptVariable: (sessionId: string | null, name: string, value: string) => void;
  removeRoleplayScriptVariable: (sessionId: string | null, name: string) => void;
  addPromptInjection: (sessionId: string, injection: Omit<RoleplayPromptInjection, 'id' | 'createdAt' | 'updatedAt'>) => void;
  removePromptInjection: (sessionId: string, injectionId: string) => void;
  clearPromptInjections: (sessionId: string) => void;
  addQuickReply: (reply: Omit<RoleplayQuickReply, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateQuickReply: (replyId: string, updates: Partial<Omit<RoleplayQuickReply, 'id'>>) => void;
  removeQuickReply: (replyId: string) => void;
  addScriptTrace: (entry: Omit<RoleplayScriptTraceEntry, 'id' | 'timestamp'>) => void;
  markSessionVisited: (sessionId: string, visitedAt?: number) => void;
  setConnectionStatus: (status: RoleplayConnectionState) => void;
  setConnectionMessage: (message: string | null) => void;
  setChatProvider: (provider: RoleplayChatProvider) => void;
  setChatApiKey: (apiKey: string) => void;
  setLmStudioEndpoint: (endpoint: string) => void;
  setSelectedModelId: (modelId: string) => void;
  setDetectedServerMode: (mode: AssistantServerMode | null) => void;
  setAvailableModels: (models: AssistantModel[]) => void;
  setRoleplayEmbeddingModelId: (modelId: string) => void;
  setRoleplayVectorRetrievalEnabled: (enabled: boolean) => void;
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
        roleplayKnowledgeDocuments: [],
        roleplayEmbeddingModelId: '',
        roleplayVectorRetrievalEnabled: true,
        chatSessions: DEFAULT_CHAT_SESSIONS,
        activeCharacterId: DEFAULT_CHARACTERS[0].id,
        activeSessionId: DEFAULT_CHAT_SESSIONS[0].id,
        isStreamingChat: false,
        streamingContent: '',
        roleplayScriptVariables: {},
        roleplayQuickReplies: createDefaultRoleplayQuickReplies(),
        roleplayScriptTrace: [],
        connectionStatus: 'idle',
        connectionMessage: null,
        chatProvider: 'local',
        chatApiKey: '',
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
        importCharacterCard: (result, options = {}) => {
          if (options.mode === 'replace' && options.targetCharacterId) {
            get().replaceCharacterFromCard(
              options.targetCharacterId,
              result,
              options.sourceMetadata
            );
            return;
          }
          set((state) => {
            const now = Date.now();
            const importedLorebooks = result.lorebooks.map((lorebook) =>
              normalizeLorebook(lorebook)
            );
            const importedLorebookIds = importedLorebooks.map((lorebook) => lorebook.id);
            const sourceMetadata: RoleplayCharacterSourceMetadata = {
              sourceImportedAt: now,
              sourceLastCheckedAt: now,
              ...options.sourceMetadata,
            };
            const normalizedCharacter = normalizeCharacter(
              applySourceMetadata(
                {
                  ...result.character,
                  id: crypto.randomUUID(),
                  name:
                    options.mode === 'duplicate'
                      ? `${result.character.name} Copy`
                      : result.character.name,
                  boundLorebookIds: [
                    ...new Set([...result.character.boundLorebookIds, ...importedLorebookIds]),
                  ],
                  createdAt: now,
                  updatedAt: now,
                },
                sourceMetadata
              ) as RoleplayCharacter
            );
            const nextSession = createSessionFromCharacter(normalizedCharacter);
            return {
              characters: [...state.characters, normalizedCharacter],
              lorebooks: [...state.lorebooks, ...importedLorebooks],
              chatSessions: [...state.chatSessions, nextSession],
              activeCharacterId: normalizedCharacter.id,
              activeSessionId: nextSession.id,
            };
          });
        },
        replaceCharacterFromCard: (characterId, result, sourceMetadata) =>
          set((state) => {
            const existingCharacter = state.characters.find((character) => character.id === characterId);
            if (!existingCharacter) {
              return {};
            }
            const now = Date.now();
            const importedLorebooks = result.lorebooks.map((lorebook) =>
              normalizeLorebook(lorebook)
            );
            const importedLorebookIds = importedLorebooks.map((lorebook) => lorebook.id);
            const normalizedCharacter = normalizeCharacter(
              applySourceMetadata(
                {
                  ...result.character,
                  id: existingCharacter.id,
                  favorite: existingCharacter.favorite,
                  boundLorebookIds: [
                    ...new Set([...result.character.boundLorebookIds, ...importedLorebookIds]),
                  ],
                  createdAt: existingCharacter.createdAt,
                  updatedAt: now,
                },
                {
                  sourceImportedAt: existingCharacter.sourceImportedAt ?? now,
                  sourceLastCheckedAt: now,
                  ...sourceMetadata,
                }
              ) as RoleplayCharacter
            );
            return {
              characters: state.characters.map((character) =>
                character.id === characterId ? normalizedCharacter : character
              ),
              lorebooks: [...state.lorebooks, ...importedLorebooks],
              activeCharacterId: normalizedCharacter.id,
            };
          }),
        setCharacterSourceMetadata: (characterId, metadata) =>
          set((state) => ({
            characters: state.characters.map((character) =>
              character.id === characterId
                ? normalizeCharacter(
                    applySourceMetadata(
                      {
                        ...character,
                        updatedAt: Date.now(),
                      },
                      metadata
                    ) as RoleplayCharacter
                  )
                : character
            ),
          })),
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
              sourceUrl: '',
              sourceDownloadUrl: '',
              sourceProviderId: '',
              sourceExternalId: '',
              sourceImportedAt: null,
              sourceLastCheckedAt: null,
              sourceLicense: '',
              sourceContentRating: '',
              catalogTemplateId: null,
              catalogCategory: null,
              tavernV2Data: null,
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
            let nextChatSessions = state.chatSessions;
            let nextSessionId = getMostRecentSessionId(state.chatSessions, id);
            if (id && !nextSessionId) {
              const character = state.characters.find((entry) => entry.id === id);
              if (character) {
                const nextSession = createSessionFromCharacter(character);
                nextChatSessions = [nextSession, ...state.chatSessions];
                nextSessionId = nextSession.id;
              }
            }
            if (
              state.activeCharacterId === id &&
              state.activeSessionId === nextSessionId &&
              state.streamingContent === '' &&
              !state.isStreamingChat
            ) {
              return {};
            }
            return {
              chatSessions: nextChatSessions,
              activeCharacterId: id,
              activeSessionId: nextSessionId,
              streamingContent: '',
              isStreamingChat: false,
            };
          }),
  updateCharacterAvatar: (id, avatarUrl, headshotUrl?) =>
    set((state) => ({
      characters: state.characters.map((character) =>
        character.id === id
          ? normalizeCharacter({
              ...character,
              avatar: avatarUrl || null,
              ...(headshotUrl !== undefined && { headshotUrl: headshotUrl || null }),
              updatedAt: Date.now(),
            })
          : character
      ),
    })),
        addCharacterGalleryImage: (characterId, image) =>
          set((state) => ({
            characters: state.characters.map((character) => {
              if (character.id !== characterId) {
                return character;
              }
              const normalizedImage = normalizeGalleryImages([
                {
                  ...image,
                  id: crypto.randomUUID(),
                  createdAt: Date.now(),
                },
              ])[0];
              if (!normalizedImage) {
                return character;
              }
              if (
                character.galleryImages.some(
                  (galleryImage) => galleryImage.imageUrl === normalizedImage.imageUrl
                )
              ) {
                return character;
              }
              return normalizeCharacter({
                ...character,
                galleryImages: [normalizedImage, ...character.galleryImages].slice(0, 200),
                updatedAt: Date.now(),
              });
            }),
          })),
        removeCharacterGalleryImage: (characterId, imageId) =>
          set((state) => ({
            characters: state.characters.map((character) =>
              character.id === characterId
                ? normalizeCharacter({
                    ...character,
                    galleryImages: character.galleryImages.filter((image) => image.id !== imageId),
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
        addKnowledgeDocument: (input) =>
          set((state) => ({
            roleplayKnowledgeDocuments: [
              createKnowledgeDocument(input),
              ...state.roleplayKnowledgeDocuments,
            ],
          })),
        updateKnowledgeDocument: (id, updates) =>
          set((state) => ({
            roleplayKnowledgeDocuments: state.roleplayKnowledgeDocuments.map((document) => {
              if (document.id !== id) {
                return document;
              }
              const nextDocument = {
                ...document,
                ...updates,
                updatedAt: Date.now(),
              };
              const contentChanged = Object.hasOwn(updates, 'content') || Object.hasOwn(updates, 'title');
              return normalizeKnowledgeDocument({
                ...nextDocument,
                chunks: contentChanged ? [] : nextDocument.chunks,
              });
            }),
          })),
        setKnowledgeDocumentChunkEmbeddings: (id, embeddingModel, embeddings) =>
          set((state) => {
            const embeddingByChunkId = new Map(
              embeddings.map((entry) => [entry.chunkId, entry.embedding])
            );
            return {
              roleplayKnowledgeDocuments: state.roleplayKnowledgeDocuments.map((document) => {
                if (document.id !== id) {
                  return document;
                }
                return {
                  ...document,
                  chunks: document.chunks.map((chunk) => {
                    const embedding = embeddingByChunkId.get(chunk.id);
                    if (!embedding) {
                      return chunk;
                    }
                    return {
                      ...chunk,
                      embedding,
                      embeddingModel,
                      updatedAt: Date.now(),
                    };
                  }),
                  updatedAt: Date.now(),
                };
              }),
            };
          }),
        removeKnowledgeDocument: (id) =>
          set((state) => ({
            roleplayKnowledgeDocuments: state.roleplayKnowledgeDocuments.filter(
              (document) => document.id !== id
            ),
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
              participantCharacterIds: [characterId],
              activeSpeakerCharacterId: characterId,
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
              activeBranchId: 'main',
              branches: [],
              checkpoints: [],
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
                      participantCharacterIds: [targetSession.characterId],
                      activeSpeakerCharacterId: targetSession.characterId,
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
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const currentPromptStack = {
                ...createDefaultPromptStack(),
                ...session.promptStack,
              };
              return promptStackHasChanges(currentPromptStack, updates)
                ? {
                    ...session,
                    promptStack: {
                      ...currentPromptStack,
                      ...updates,
                    },
                    updatedAt: Date.now(),
                  }
                : session;
            }),
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
        setSessionParticipants: (sessionId, characterIds) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const nextParticipantIds = [
                ...new Set([session.characterId, ...characterIds.filter(Boolean)]),
              ];
              const nextActiveSpeakerId =
                session.activeSpeakerCharacterId &&
                nextParticipantIds.includes(session.activeSpeakerCharacterId)
                  ? session.activeSpeakerCharacterId
                  : session.characterId;
              if (
                areStringArraysEqual(session.participantCharacterIds, nextParticipantIds) &&
                session.activeSpeakerCharacterId === nextActiveSpeakerId
              ) {
                return session;
              }
              return {
                ...session,
                participantCharacterIds: nextParticipantIds,
                activeSpeakerCharacterId: nextActiveSpeakerId,
                updatedAt: Date.now(),
              };
            }),
          })),
        setSessionActiveSpeaker: (sessionId, characterId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const nextSpeakerId =
                characterId && session.participantCharacterIds.includes(characterId)
                  ? characterId
                  : session.characterId;
              return session.activeSpeakerCharacterId === nextSpeakerId
                ? session
                : {
                    ...session,
                    activeSpeakerCharacterId: nextSpeakerId,
                    updatedAt: Date.now(),
                  };
            }),
          })),
        updateSessionVisualState: (sessionId, updates) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const nextSession = {
                ...session,
                ...updates,
                sceneBackgroundPrompt:
                  updates.sceneBackgroundPrompt ?? session.sceneBackgroundPrompt,
                ambiencePrompt: updates.ambiencePrompt ?? session.ambiencePrompt,
                activeExpression: updates.activeExpression ?? session.activeExpression,
                visualState:
                  updates.visualState !== undefined
                    ? normalizeSessionVisualState(updates.visualState, {
                        ...session,
                        ...updates,
                      })
                    : session.visualState,
                chatBackgroundImage:
                  updates.chatBackgroundImage !== undefined
                    ? updates.chatBackgroundImage
                    : session.chatBackgroundImage,
              };
              if (
                nextSession.sceneBackgroundPrompt === session.sceneBackgroundPrompt &&
                nextSession.ambiencePrompt === session.ambiencePrompt &&
                nextSession.activeExpression === session.activeExpression &&
                JSON.stringify(nextSession.visualState) === JSON.stringify(session.visualState) &&
                nextSession.chatBackgroundImage === session.chatBackgroundImage
              ) {
                return session;
              }
              return {
                ...nextSession,
                updatedAt: Date.now(),
              };
            }),
          })),
        addMessage: (sessionId, message) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              updateActiveBranchMessages(session, [...session.messages, normalizeChatMessage(message)])
            ),
          })),
        updateMessage: (sessionId, messageId, updates) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              updateActiveBranchMessages(
                session,
                session.messages.map((message) =>
                  message.id === messageId
                    ? normalizeChatMessage({ ...message, ...updates })
                    : message
                )
              )
            ),
          })),
        replaceMessageContent: (sessionId, messageId, content) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              updateActiveBranchMessages(
                session,
                session.messages.map((message) => {
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
                })
              )
            ),
          })),
        deleteMessage: (sessionId, messageId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              updateActiveBranchMessages(
                session,
                session.messages.filter((message) => message.id !== messageId)
              )
            ),
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
              return updateActiveBranchMessages(session, messages);
            }),
          })),
        setMessageIncluded: (sessionId, messageId, included) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              updateActiveBranchMessages(
                session,
                session.messages.map((message) =>
                  message.id === messageId
                    ? normalizeChatMessage({ ...message, includedInPrompt: included })
                    : message
                )
              )
            ),
          })),
        addAssistantMessageVariant: (sessionId, messageId, variant) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              updateActiveBranchMessages(
                session,
                session.messages.map((message) => {
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
                })
              )
            ),
          })),
        selectMessageVariant: (sessionId, messageId, variantId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              updateActiveBranchMessages(
                session,
                session.messages.map((message) => {
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
                })
              )
            ),
          })),
        deleteMessagesFrom: (sessionId, messageId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const deleteIndex = session.messages.findIndex((message) => message.id === messageId);
              if (deleteIndex === -1) {
                return session;
              }

              return updateActiveBranchMessages(session, session.messages.slice(0, deleteIndex));
            }),
          })),
        branchFromMessage: (sessionId, messageId, options = {}) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const forkIndex = session.messages.findIndex((message) => message.id === messageId);
              if (forkIndex === -1) {
                return session;
              }
              const now = Date.now();
              const nextBranchId = crypto.randomUUID();
              const branchMessages = options.replacementMessage
                ? [
                    ...session.messages.slice(0, forkIndex),
                    normalizeChatMessage(options.replacementMessage),
                  ]
                : session.messages.slice(0, forkIndex + 1);
              const nextBranch = normalizeChatBranch({
                id: nextBranchId,
                name: options.name?.trim() || getDefaultBranchName(session),
                parentBranchId: session.activeBranchId,
                forkMessageId: messageId,
                messages: branchMessages,
                createdAt: now,
                updatedAt: now,
              });

              return {
                ...session,
                activeBranchId: nextBranchId,
                messages: nextBranch.messages,
                branches: [...session.branches, nextBranch],
                updatedAt: now,
              };
            }),
          })),
        switchBranch: (sessionId, branchId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const branch = session.branches.find((entry) => entry.id === branchId);
              if (!branch || branch.id === session.activeBranchId) {
                return session;
              }
              return {
                ...session,
                activeBranchId: branch.id,
                messages: normalizeChatMessages(branch.messages),
                updatedAt: Date.now(),
              };
            }),
          })),
        returnToParentBranch: (sessionId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const activeBranch = session.branches.find(
                (branch) => branch.id === session.activeBranchId
              );
              if (!activeBranch?.parentBranchId) {
                return session;
              }
              const parentBranch = session.branches.find(
                (branch) => branch.id === activeBranch.parentBranchId
              );
              if (!parentBranch) {
                return session;
              }
              return {
                ...session,
                activeBranchId: parentBranch.id,
                messages: normalizeChatMessages(parentBranch.messages),
                updatedAt: Date.now(),
              };
            }),
          })),
        renameBranch: (sessionId, branchId, name) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const trimmedName = name.trim();
              if (!trimmedName) {
                return session;
              }
              return {
                ...session,
                branches: session.branches.map((branch) =>
                  branch.id === branchId
                    ? normalizeChatBranch({ ...branch, name: trimmedName, updatedAt: Date.now() })
                    : branch
                ),
                updatedAt: Date.now(),
              };
            }),
          })),
        createCheckpoint: (sessionId, name) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const trimmedName = name.trim() || `Checkpoint ${session.checkpoints.length + 1}`;
              const now = Date.now();
              return {
                ...session,
                checkpoints: [
                  ...session.checkpoints,
                  normalizeChatCheckpoint({
                    id: crypto.randomUUID(),
                    name: trimmedName,
                    branchId: session.activeBranchId,
                    forkMessageId: session.messages[session.messages.length - 1]?.id ?? null,
                    messages: session.messages,
                    memoryState: getSessionMemoryState(session),
                    createdAt: now,
                  }),
                ],
                updatedAt: now,
              };
            }),
          })),
        restoreCheckpoint: (sessionId, checkpointId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
              const checkpoint = session.checkpoints.find((entry) => entry.id === checkpointId);
              if (!checkpoint) {
                return session;
              }
              const now = Date.now();
              const branchId = crypto.randomUUID();
              const restoredBranch = normalizeChatBranch({
                id: branchId,
                name: `${checkpoint.name} Restore`,
                parentBranchId: session.activeBranchId,
                forkMessageId: checkpoint.forkMessageId,
                messages: checkpoint.messages,
                createdAt: now,
                updatedAt: now,
              });
              return {
                ...session,
                activeBranchId: branchId,
                messages: restoredBranch.messages,
                branches: [...session.branches, restoredBranch],
                ...checkpoint.memoryState,
                updatedAt: now,
              };
            }),
          })),
        removeCheckpoint: (sessionId, checkpointId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              checkpoints: session.checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId),
              updatedAt: Date.now(),
            })),
          })),
        clearConversation: (sessionId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...updateActiveBranchMessages(session, []),
              ...createEmptyRoleplayMemoryState(),
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

              return updateActiveBranchMessages(
                session,
                session.messages.map((message, index) => {
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
                })
              );
            }),
          })),
        dismissSuggestion: (sessionId, messageId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) =>
              updateActiveBranchMessages(
                session,
                session.messages.map((message) => {
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
                })
              )
            ),
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
        setRoleplayScriptVariable: (sessionId, name, value) =>
          set((state) => {
            const normalizedName = name.trim();
            if (!normalizedName) {
              return {};
            }
            const variable: RoleplayScriptVariable = {
              name: normalizedName,
              value,
              updatedAt: Date.now(),
            };
            if (!sessionId) {
              return {
                roleplayScriptVariables: {
                  ...state.roleplayScriptVariables,
                  [normalizedName]: variable,
                },
              };
            }
            return {
              chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
                ...session,
                scriptVariables: {
                  ...session.scriptVariables,
                  [normalizedName]: variable,
                },
                updatedAt: Date.now(),
              })),
            };
          }),
        removeRoleplayScriptVariable: (sessionId, name) =>
          set((state) => {
            const normalizedName = name.trim();
            if (!normalizedName) {
              return {};
            }
            if (!sessionId) {
              const nextVariables = { ...state.roleplayScriptVariables };
              delete nextVariables[normalizedName];
              return { roleplayScriptVariables: nextVariables };
            }
            return {
              chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => {
                const nextVariables = { ...session.scriptVariables };
                delete nextVariables[normalizedName];
                return {
                  ...session,
                  scriptVariables: nextVariables,
                  updatedAt: Date.now(),
                };
              }),
            };
          }),
        addPromptInjection: (sessionId, injection) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              promptInjections: [
                ...session.promptInjections,
                normalizePromptInjection({
                  ...injection,
                  id: crypto.randomUUID(),
                }),
              ],
              updatedAt: Date.now(),
            })),
          })),
        removePromptInjection: (sessionId, injectionId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              promptInjections: session.promptInjections.filter((injection) => injection.id !== injectionId),
              updatedAt: Date.now(),
            })),
          })),
        clearPromptInjections: (sessionId) =>
          set((state) => ({
            chatSessions: updateSessionInList(state.chatSessions, sessionId, (session) => ({
              ...session,
              promptInjections: [],
              updatedAt: Date.now(),
            })),
          })),
        addQuickReply: (reply) =>
          set((state) => ({
            roleplayQuickReplies: [
              ...state.roleplayQuickReplies,
              normalizeQuickReply({
                ...reply,
                id: crypto.randomUUID(),
              }),
            ],
          })),
        updateQuickReply: (replyId, updates) =>
          set((state) => ({
            roleplayQuickReplies: state.roleplayQuickReplies.map((reply) =>
              reply.id === replyId
                ? normalizeQuickReply({
                    ...reply,
                    ...updates,
                    updatedAt: Date.now(),
                  })
                : reply
            ),
          })),
        removeQuickReply: (replyId) =>
          set((state) => ({
            roleplayQuickReplies: state.roleplayQuickReplies.filter((reply) => reply.id !== replyId),
          })),
        addScriptTrace: (entry) =>
          set((state) => ({
            roleplayScriptTrace: [
              {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                ...entry,
              },
              ...state.roleplayScriptTrace,
            ].slice(0, 50),
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
        setChatProvider: (provider) => set({ chatProvider: provider }),
        setChatApiKey: (apiKey) => set({ chatApiKey: apiKey }),
        setLmStudioEndpoint: (endpoint) => set({ lmStudioEndpoint: endpoint }),
        setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
        setDetectedServerMode: (mode) => set({ detectedServerMode: mode }),
        setAvailableModels: (models) => set({ availableModels: models }),
        setRoleplayEmbeddingModelId: (modelId) => set({ roleplayEmbeddingModelId: modelId }),
        setRoleplayVectorRetrievalEnabled: (enabled) =>
          set({ roleplayVectorRetrievalEnabled: enabled }),
        setModelCompatibility: (modelId, updates) =>
          set((state) => {
            const normalizedModelId = modelId.trim();
            if (!normalizedModelId) {
              return {};
            }
            const currentSettings = normalizeModelCompatibilitySettings(
              state.modelCompatibilityByModelId[normalizedModelId]
            );
            const nextSettings = updates.localProfileId
              ? {
                  ...createRoleplayCompatibilityFromProfile(updates.localProfileId),
                  ...updates,
                }
              : {
                  ...currentSettings,
                  ...updates,
                };

            return {
              modelCompatibilityByModelId: {
                ...state.modelCompatibilityByModelId,
                [normalizedModelId]: normalizeModelCompatibilitySettings(nextSettings),
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
        version: 20,
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
            roleplayKnowledgeDocuments: (state.roleplayKnowledgeDocuments ?? []).map((document) =>
              normalizeKnowledgeDocument(document)
            ),
            roleplayEmbeddingModelId:
              typeof state.roleplayEmbeddingModelId === 'string'
                ? state.roleplayEmbeddingModelId
                : '',
            roleplayVectorRetrievalEnabled: state.roleplayVectorRetrievalEnabled !== false,
            chatSessions,
            activeCharacterId,
            activeSessionId,
            chatProvider:
              state.chatProvider === 'openrouter' || state.chatProvider === 'openai-compatible'
                ? state.chatProvider
                : 'local',
            chatApiKey: typeof state.chatApiKey === 'string' ? state.chatApiKey : '',
            chatMaxTokens:
              typeof state.chatMaxTokens === 'number'
                ? state.chatMaxTokens === 2048
                  ? DEFAULT_CHAT_MAX_TOKENS
                  : state.chatMaxTokens
                : DEFAULT_CHAT_MAX_TOKENS,
            lmStudioEndpoint:
              typeof state.lmStudioEndpoint === 'string' && state.lmStudioEndpoint.trim()
                ? state.lmStudioEndpoint
                : 'http://localhost:1234',
            selectedModelId:
              typeof state.selectedModelId === 'string' ? state.selectedModelId : '',
            chatTemperature:
              typeof state.chatTemperature === 'number' ? state.chatTemperature : 0.8,
            roleplayScriptVariables: normalizeScriptVariables(state.roleplayScriptVariables),
            roleplayQuickReplies: Array.isArray(state.roleplayQuickReplies)
              ? state.roleplayQuickReplies.map((reply) => normalizeQuickReply(reply))
              : createDefaultRoleplayQuickReplies(),
            roleplayScriptTrace: Array.isArray(state.roleplayScriptTrace)
              ? state.roleplayScriptTrace.slice(0, 50)
              : [],
            modelCompatibilityByModelId: Object.fromEntries(
              Object.entries(state.modelCompatibilityByModelId ?? {}).map(([modelId, settings]) => [
                modelId,
                normalizeModelCompatibilitySettings(settings),
              ])
            ),
          } as RoleplayStoreState;
        },
        partialize: (state) => ({
          characters: state.characters,
          personas: state.personas,
          lorebooks: state.lorebooks,
          roleplayKnowledgeDocuments: state.roleplayKnowledgeDocuments,
          roleplayEmbeddingModelId: state.roleplayEmbeddingModelId,
          roleplayVectorRetrievalEnabled: state.roleplayVectorRetrievalEnabled,
          chatSessions: state.chatSessions,
          activeCharacterId: state.activeCharacterId,
          activeSessionId: state.activeSessionId,
          roleplayScriptVariables: state.roleplayScriptVariables,
          roleplayQuickReplies: state.roleplayQuickReplies,
          roleplayScriptTrace: state.roleplayScriptTrace,
          chatProvider: state.chatProvider,
          chatApiKey: state.chatApiKey,
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
