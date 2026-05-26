import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  Badge,
  Checkbox,
  FileButton,
  Group,
  MultiSelect,
  PasswordInput,
  Progress,
  Select,
  Slider,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconBook2,
  IconBrain,
  IconCircleCheck,
  IconCircleX,
  IconDeviceFloppy,
  IconDownload,
  IconEdit,
  IconFileImport,
  IconPhotoSpark,
  IconPlugConnected,
  IconSearch,
  IconSend,
  IconSparkles,
  IconTrash,
  IconUserCircle,
  IconX,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import { swarmClient } from '../../api/client';
import type { GenerateParams } from '../../api/types';
import { resolveAssetUrl, resolveRuntimeEndpoints } from '../../config/runtimeEndpoints';
import { getRoleplayInteractionStyleConfig } from '../../data/roleplayInteractionStyles';
import {
  getRoleplayPresetStack,
  ROLEPLAY_PRESET_NONE_ID,
  ROLEPLAY_PRESET_STACK_OPTIONS,
} from '../../data/roleplayPresetStacks';
import {
  createRoleplayCompatibilityFromProfile,
  getRoleplayLocalModelProfile,
  ROLEPLAY_LOCAL_MODEL_PROFILES,
} from '../../data/roleplayLocalModelProfiles';
import { compileRoleplayPrompt } from '../../features/roleplay/roleplayPromptCompiler';
import {
  createRoleplayBundle,
  downloadRoleplayBundle,
  parseRoleplayBundle,
} from '../../features/roleplay/roleplayBundle';
import {
  formatMessagesForMemoryRefresh,
  getMessagesForMemoryRefresh,
  mergeGeneratedMemoryFacts,
  ROLEPLAY_MAX_MEMORY_FACTS,
} from '../../features/roleplay/roleplayMemory';
import {
  buildCharacterPersonalityBlock,
  getEffectiveSystemPrompt,
} from '../../features/roleplay/roleplayCharacterPrompting';
import {
  getLastAssistantMessage,
  getMessageContent,
} from '../../features/roleplay/roleplayMessageUtils';
import { useModelLoading } from '../../hooks/useModelLoading';
import { useModels } from '../../hooks/useModels';
import {
  generateRoleplayMemory,
  generateSceneDescription,
  testRoleplayServerReply,
} from '../../services/roleplayChatService';
import { embedRoleplayTexts } from '../../services/roleplayEmbeddingService';
import {
  enhanceRoleplayImagePrompt,
} from '../../services/magicPromptService';
import {
  unloadLocalTextModelNow,
} from '../../services/localModelVramCoordinator';
import { useRoleplayStore } from '../../stores/roleplayStore';
import { resolvePromptEnhancePreset, usePromptEnhanceStore } from '../../stores/promptEnhanceStore';
import { useCreativeWorkspaceStore } from '../../stores/creativeWorkspaceStore';
import { useQueueStore } from '../../stores/queue';
import { useNavigationStore } from '../../stores/navigationStore';
import type {
  RoleplayGenerationMode,
  RoleplayChatSession,
  RoleplayKnowledgeDocument,
  RoleplayKnowledgeScope,
  RoleplayMemoryFact,
  RoleplayPromptBlock,
  RoleplayPromptBlockSettings,
  RoleplayPromptStack,
  RoleplayQuickReply,
  RoleplaySessionVisualState,
  RoleplayVisualCharacterState,
} from '../../types/roleplay';
import { useGenerationStore } from '../../store/generationStore';
import { buildRoleplaySceneBrief } from '../../features/creativeWorkspace/sceneBriefs';
import {
  compileRoleplayImagePrompt,
  type CompiledRoleplayImagePrompt,
} from '../../features/roleplay/roleplayImagePromptCompiler';
import { SwarmActionIcon as ActionIcon } from '../../components/ui/SwarmActionIcon';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { LorebookManagerModal } from './LorebookManagerModal';
import { PersonaManagerModal } from './PersonaManagerModal';
import { PromptInspectorModal } from './PromptInspectorModal';

const STEPS_MARKS = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
];
const CFG_MARKS = [
  { value: 7, label: '7' },
  { value: 15, label: '15' },
];
const EMPTY_VISUAL_CHARACTER_STATE: RoleplayVisualCharacterState = {
  attire: '',
  condition: '',
  mood: '',
  poseCue: '',
  referenceImageId: null,
};
const RESPONSE_LENGTH_TOKENS = {
  short: 512,
  medium: 768,
  long: 1024,
} as const;
const ROLEPLAY_PROVIDER_DEFAULT_ENDPOINTS = {
  local: 'http://localhost:1234',
  openrouter: 'https://openrouter.ai/api/v1',
  'openai-compatible': 'https://api.openai.com/v1',
} as const;
const ROLEPLAY_PROVIDER_OPTIONS = [
  { value: 'local', label: 'Local Roleplay Server' },
  { value: 'openrouter', label: 'OpenRouter Fallback' },
  { value: 'openai-compatible', label: 'Remote Compatible Fallback' },
];

type ResponseLengthPreset = keyof typeof RESPONSE_LENGTH_TOKENS;

interface RoleplayImagePromptPreview {
  prompt: string;
  negativePrompt: string;
  sceneSummary: string;
  enhanced: boolean;
  model: string | null;
  formatPreset: string;
  scenePromptSource: CompiledRoleplayImagePrompt['debug']['scenePromptSource'];
  referenceImageLabels: string[];
}

const PROMPT_TRIGGER_OPTIONS: Array<{ value: RoleplayGenerationMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'swipe', label: 'Swipe' },
  { value: 'regenerate', label: 'Regenerate' },
  { value: 'continue', label: 'Continue' },
  { value: 'impersonate', label: 'Impersonate' },
  { value: 'quiet', label: 'Quiet' },
];

function getResponseLengthPreset(chatMaxTokens: number): ResponseLengthPreset | null {
  if (chatMaxTokens === RESPONSE_LENGTH_TOKENS.short) {
    return 'short';
  }
  if (chatMaxTokens === RESPONSE_LENGTH_TOKENS.medium) {
    return 'medium';
  }
  if (chatMaxTokens === RESPONSE_LENGTH_TOKENS.long) {
    return 'long';
  }
  return null;
}

function normalizeModelPath(value: string | null | undefined): string {
  return (value || '').replaceAll('\\', '/').trim().toLowerCase();
}

function modelNamesMatch(modelName: string, currentModel: string | null | undefined): boolean {
  const normalizedModel = normalizeModelPath(modelName);
  const normalizedCurrent = normalizeModelPath(currentModel);
  if (!normalizedModel || !normalizedCurrent) {
    return false;
  }
  return (
    normalizedModel === normalizedCurrent ||
    normalizedModel === `${normalizedCurrent}.safetensors` ||
    `${normalizedModel}.safetensors` === normalizedCurrent
  );
}

function areStringListsEqual(left: string[], right: string[]): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function getSafeSessionVisualState(
  session: RoleplayChatSession | null | undefined
): RoleplaySessionVisualState {
  return session?.visualState ?? {
    location: '',
    timeOfDay: '',
    lighting: session?.ambiencePrompt ?? '',
    sceneAnchor: session?.sceneBackgroundPrompt ?? '',
    persistentObjects: '',
    negativePrompt: '',
    characterStates: {},
  };
}

interface ControlsPanelProps {
  onProbeConnection: () => void;
  onRegisterGenerate?: (fn: () => void) => void;
  onRegisterGenerateWithPrompt?: (fn: (prompt: string) => void) => void;
}

export function ControlsPanel({
  onProbeConnection,
  onRegisterGenerate,
  onRegisterGenerateWithPrompt,
}: ControlsPanelProps) {
  const [clipOverride, setClipOverride] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isEjectingImageModel, setIsEjectingImageModel] = useState(false);
  const [isTestingRoleplayServer, setIsTestingRoleplayServer] = useState(false);
  const [roleplayServerTestReply, setRoleplayServerTestReply] = useState<string | null>(null);
  const [newMemoryFactText, setNewMemoryFactText] = useState('');
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [lorebookModalOpen, setLorebookModalOpen] = useState(false);
  const [promptInspectorOpen, setPromptInspectorOpen] = useState(false);
  const [activeDirectorTab, setActiveDirectorTab] = useState<string | null>('roleplay');
  const [roleplayImageEnhanceEnabled, setRoleplayImageEnhanceEnabled] = useState(true);
  const [quickReplyLabelDraft, setQuickReplyLabelDraft] = useState('');
  const [quickReplyScriptDraft, setQuickReplyScriptDraft] = useState('');
  const [editingQuickReplyId, setEditingQuickReplyId] = useState<string | null>(null);
  const [quickReplyEditLabelDraft, setQuickReplyEditLabelDraft] = useState('');
  const [quickReplyEditScriptDraft, setQuickReplyEditScriptDraft] = useState('');
  const [knowledgeTitleDraft, setKnowledgeTitleDraft] = useState('');
  const [knowledgeContentDraft, setKnowledgeContentDraft] = useState('');
  const [knowledgeScopeDraft, setKnowledgeScopeDraft] = useState<RoleplayKnowledgeScope>('session');
  const [isVectorizingKnowledge, setIsVectorizingKnowledge] = useState(false);
  const [knowledgeSearchDraft, setKnowledgeSearchDraft] = useState('');
  const [editingKnowledgeDocumentId, setEditingKnowledgeDocumentId] = useState<string | null>(null);
  const [knowledgeEditTitleDraft, setKnowledgeEditTitleDraft] = useState('');
  const [knowledgeEditDescriptionDraft, setKnowledgeEditDescriptionDraft] = useState('');
  const [knowledgeEditContentDraft, setKnowledgeEditContentDraft] = useState('');
  const [lastImagePromptPreview, setLastImagePromptPreview] =
    useState<RoleplayImagePromptPreview | null>(null);
  const [openSections, setOpenSections] = useState<string[]>([
    'connection',
    'roleplay',
    'generation',
    'memory',
  ]);
  const imageModelLoadNotificationIdRef = useRef<string | null>(null);

  const {
    characters,
    personas,
    lorebooks,
    chatSessions,
    activeSessionId,
    roleplayScriptVariables,
    roleplayKnowledgeDocuments,
    roleplayEmbeddingModelId,
    roleplayVectorRetrievalEnabled,
    roleplayQuickReplies,
    roleplayScriptTrace,
    connectionStatus,
    connectionMessage,
    chatProvider,
    chatApiKey,
    setChatProvider,
    setChatApiKey,
    lmStudioEndpoint,
    setLmStudioEndpoint,
    selectedModelId,
    setSelectedModelId,
    detectedServerMode,
    setDetectedServerMode,
    availableModels,
    modelCompatibilityByModelId,
    imageSteps,
    imageCfgScale,
    imageClipStopAtLayer,
    imageModelId,
    imageWidth,
    imageHeight,
    chatTemperature,
    chatMaxTokens,
    setImageSteps,
    setImageCfgScale,
    setImageClipStopAtLayer,
    setImageModelId,
    setImageDimensions,
    setChatTemperature,
    setChatMaxTokens,
    setModelCompatibility,
    setSessionActivePersona,
    updateSessionPromptStack,
    setSessionBoundLorebooks,
    setSessionParticipants,
    setSessionActiveSpeaker,
    updateSessionVisualState,
    attachSceneImageToLastMessage,
    addCharacterGalleryImage,
    setSessionMemoryStatus,
    applyGeneratedMemory,
    addMemoryFact,
    updateMemoryFact,
    removeMemoryFact,
    toggleMemoryFactPinned,
    removeContinuityThread,
    moveContinuityThread,
    addQuickReply,
    updateQuickReply,
    removeQuickReply,
    removePromptInjection,
    clearPromptInjections,
    addKnowledgeDocument,
    updateKnowledgeDocument,
    setKnowledgeDocumentChunkEmbeddings,
    removeKnowledgeDocument,
    setRoleplayEmbeddingModelId,
    setRoleplayVectorRetrievalEnabled,
    importBundle,
  } = useRoleplayStore(
    useShallow((state) => ({
      characters: state.characters,
      personas: state.personas,
      lorebooks: state.lorebooks,
      chatSessions: state.chatSessions,
      activeSessionId: state.activeSessionId,
      roleplayScriptVariables: state.roleplayScriptVariables,
      roleplayKnowledgeDocuments: state.roleplayKnowledgeDocuments,
      roleplayEmbeddingModelId: state.roleplayEmbeddingModelId,
      roleplayVectorRetrievalEnabled: state.roleplayVectorRetrievalEnabled,
      roleplayQuickReplies: state.roleplayQuickReplies,
      roleplayScriptTrace: state.roleplayScriptTrace,
      connectionStatus: state.connectionStatus,
      connectionMessage: state.connectionMessage,
      chatProvider: state.chatProvider,
      chatApiKey: state.chatApiKey,
      setChatProvider: state.setChatProvider,
      setChatApiKey: state.setChatApiKey,
      lmStudioEndpoint: state.lmStudioEndpoint,
      setLmStudioEndpoint: state.setLmStudioEndpoint,
      selectedModelId: state.selectedModelId,
      setSelectedModelId: state.setSelectedModelId,
      detectedServerMode: state.detectedServerMode,
      setDetectedServerMode: state.setDetectedServerMode,
      availableModels: state.availableModels,
      modelCompatibilityByModelId: state.modelCompatibilityByModelId,
      imageSteps: state.imageSteps,
      imageCfgScale: state.imageCfgScale,
      imageClipStopAtLayer: state.imageClipStopAtLayer,
      imageModelId: state.imageModelId,
      imageWidth: state.imageWidth,
      imageHeight: state.imageHeight,
      chatTemperature: state.chatTemperature,
      chatMaxTokens: state.chatMaxTokens,
      setImageSteps: state.setImageSteps,
      setImageCfgScale: state.setImageCfgScale,
      setImageClipStopAtLayer: state.setImageClipStopAtLayer,
      setImageModelId: state.setImageModelId,
      setImageDimensions: state.setImageDimensions,
      setChatTemperature: state.setChatTemperature,
      setChatMaxTokens: state.setChatMaxTokens,
      setModelCompatibility: state.setModelCompatibility,
      setSessionActivePersona: state.setSessionActivePersona,
      updateSessionPromptStack: state.updateSessionPromptStack,
      setSessionBoundLorebooks: state.setSessionBoundLorebooks,
      setSessionParticipants: state.setSessionParticipants,
      setSessionActiveSpeaker: state.setSessionActiveSpeaker,
      updateSessionVisualState: state.updateSessionVisualState,
      attachSceneImageToLastMessage: state.attachSceneImageToLastMessage,
      addCharacterGalleryImage: state.addCharacterGalleryImage,
      setSessionMemoryStatus: state.setSessionMemoryStatus,
      applyGeneratedMemory: state.applyGeneratedMemory,
      addMemoryFact: state.addMemoryFact,
      updateMemoryFact: state.updateMemoryFact,
      removeMemoryFact: state.removeMemoryFact,
      toggleMemoryFactPinned: state.toggleMemoryFactPinned,
      removeContinuityThread: state.removeContinuityThread,
      moveContinuityThread: state.moveContinuityThread,
      addQuickReply: state.addQuickReply,
      updateQuickReply: state.updateQuickReply,
      removeQuickReply: state.removeQuickReply,
      removePromptInjection: state.removePromptInjection,
      clearPromptInjections: state.clearPromptInjections,
      addKnowledgeDocument: state.addKnowledgeDocument,
      updateKnowledgeDocument: state.updateKnowledgeDocument,
      setKnowledgeDocumentChunkEmbeddings: state.setKnowledgeDocumentChunkEmbeddings,
      removeKnowledgeDocument: state.removeKnowledgeDocument,
      setRoleplayEmbeddingModelId: state.setRoleplayEmbeddingModelId,
      setRoleplayVectorRetrievalEnabled: state.setRoleplayVectorRetrievalEnabled,
      importBundle: state.importBundle,
    }))
  );

  const generatePageModel = useGenerationStore((state) => state.selectedModel);
  const promptEnhancer = usePromptEnhanceStore(
    useShallow((state) => ({
      enabled: state.enabled,
      endpointUrl: state.endpointUrl,
      modelId: state.modelId,
      systemPrompt: state.systemPrompt,
      detectedServerMode: state.detectedServerMode,
      formatMode: state.formatMode,
      creativeStrength: state.creativeStrength,
      setEnhancing: state.setEnhancing,
      setLastError: state.setLastError,
    }))
  );
  const navigateToGenerate = useNavigationStore((state) => state.navigateToGenerate);
  const addQueueJob = useQueueStore((state) => state.addJob);
  const {
    activeProjectId,
    ensureActiveProject,
    saveSceneBrief,
  } = useCreativeWorkspaceStore(
    useShallow((state) => ({
      activeProjectId: state.activeProjectId,
      ensureActiveProject: state.ensureActiveProject,
      saveSceneBrief: state.saveSceneBrief,
    }))
  );
  const activeSession = useMemo(
    () => chatSessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions]
  );
  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters]
  );
  const activeCharacter = useMemo(
    () =>
      activeSession?.characterId ? (characterById.get(activeSession.characterId) ?? null) : null,
    [activeSession, characterById]
  );
  const personaById = useMemo(
    () => new Map(personas.map((persona) => [persona.id, persona])),
    [personas]
  );
  const activePersona = useMemo(
    () =>
      activeSession?.activePersonaId
        ? (personaById.get(activeSession.activePersonaId) ?? null)
        : null,
    [activeSession, personaById]
  );
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession?.messages]);
  const activePromptStack: RoleplayPromptStack = useMemo(
    () => ({
      roleplayPresetId: activeSession?.promptStack?.roleplayPresetId ?? ROLEPLAY_PRESET_NONE_ID,
      mainPromptOverride: activeSession?.promptStack?.mainPromptOverride ?? '',
      authorNote: activeSession?.promptStack?.authorNote ?? '',
      postHistoryNote: activeSession?.promptStack?.postHistoryNote ?? '',
      includePersona: activeSession?.promptStack?.includePersona ?? true,
      includeCharacterDefinition: activeSession?.promptStack?.includeCharacterDefinition ?? true,
      includeScenario: activeSession?.promptStack?.includeScenario ?? true,
      includeExampleMessages: activeSession?.promptStack?.includeExampleMessages ?? true,
      includeMemory: activeSession?.promptStack?.includeMemory ?? true,
      includeLore: activeSession?.promptStack?.includeLore ?? true,
      promptBlockSettings: activeSession?.promptStack?.promptBlockSettings ?? {},
      promptBlockSettingsByPresetId: activeSession?.promptStack?.promptBlockSettingsByPresetId ?? {},
    }),
    [activeSession?.promptStack]
  );
  const effectiveModel = activeCharacter?.imageModelId || imageModelId || generatePageModel;
  const responseLengthPreset = getResponseLengthPreset(chatMaxTokens);
  const selectedModelCompatibility = useMemo(
    () =>
      selectedModelId
        ? (modelCompatibilityByModelId[selectedModelId] ??
            createRoleplayCompatibilityFromProfile())
        : createRoleplayCompatibilityFromProfile(),
    [modelCompatibilityByModelId, selectedModelId]
  );
  const selectedModelProfile = useMemo(
    () => getRoleplayLocalModelProfile(selectedModelCompatibility.localProfileId),
    [selectedModelCompatibility.localProfileId]
  );
  const selectedPromptBudgetMode =
    selectedModelCompatibility.memoryBudgetMode ?? selectedModelProfile.promptBudgetMode;
  const selectedContextTokens =
    selectedModelCompatibility.maxContextTokens ?? selectedModelProfile.recommendedContextTokens;
  const selectedLoreEntryLimit =
    selectedModelCompatibility.loreEntryLimit ?? selectedModelProfile.loreEntryLimit;
  const selectedMaxHistoryMessages =
    selectedModelCompatibility.maxHistoryMessages ?? selectedModelProfile.maxHistoryMessages;
  const selectedModelAvailable =
    !selectedModelId || availableModels.some((model) => model.id === selectedModelId);
  const handleChatProviderChange = useCallback(
    (provider: string | null) => {
      if (
        provider !== 'local' &&
        provider !== 'openrouter' &&
        provider !== 'openai-compatible'
      ) {
        return;
      }

      const previousDefaultEndpoint = ROLEPLAY_PROVIDER_DEFAULT_ENDPOINTS[chatProvider];
      setChatProvider(provider);
      setDetectedServerMode(null);
      if (!lmStudioEndpoint.trim() || lmStudioEndpoint === previousDefaultEndpoint) {
        setLmStudioEndpoint(ROLEPLAY_PROVIDER_DEFAULT_ENDPOINTS[provider]);
      }
    },
    [chatProvider, lmStudioEndpoint, setChatProvider, setDetectedServerMode, setLmStudioEndpoint]
  );
  const handleModelProfileChange = useCallback(
    (profileId: string | null) => {
      if (!selectedModelId || !profileId) {
        return;
      }
      const profile = getRoleplayLocalModelProfile(profileId);
      setModelCompatibility(selectedModelId, createRoleplayCompatibilityFromProfile(profile.id));
      setChatTemperature(profile.recommendedTemperature);
      setChatMaxTokens(profile.recommendedMaxTokens);
      if (activeSessionId && profile.promptPresetId) {
        updateSessionPromptStack(activeSessionId, {
          roleplayPresetId: profile.promptPresetId,
        });
      }
    },
    [
      activeSessionId,
      selectedModelId,
      setChatMaxTokens,
      setChatTemperature,
      setModelCompatibility,
      updateSessionPromptStack,
    ]
  );
  const handleTestRoleplayServerReply = useCallback(async () => {
    if (!selectedModelId || !detectedServerMode) {
      setRoleplayServerTestReply('Probe the connection and select a model first.');
      return;
    }
    setIsTestingRoleplayServer(true);
    setRoleplayServerTestReply(null);
    const result = await testRoleplayServerReply({
      endpointUrl: lmStudioEndpoint,
      serverMode: detectedServerMode,
      modelId: selectedModelId,
      compatibility: selectedModelCompatibility,
      requestConfig: {
        provider: chatProvider,
        apiKey: chatApiKey,
        title: 'SwarmUI Roleplay',
      },
    });
    setIsTestingRoleplayServer(false);
    if (result.correctedMode) {
      setDetectedServerMode(result.correctedMode);
    }
    setRoleplayServerTestReply(
      result.success ? result.content : result.error || 'Roleplay test failed.'
    );
  }, [
    chatApiKey,
    chatProvider,
    detectedServerMode,
    lmStudioEndpoint,
    selectedModelCompatibility,
    selectedModelId,
    setDetectedServerMode,
  ]);
  const memoryLastUpdatedText = activeSession?.lastMemoryUpdatedAt
    ? new Date(activeSession.lastMemoryUpdatedAt).toLocaleString()
    : 'Never';
  const memoryStatusLabel =
    activeSession?.memoryStatus === 'updating'
      ? 'Updating'
      : activeSession?.memoryStatus === 'stale'
        ? 'Stale'
        : activeSession?.memoryStatus === 'error'
          ? 'Error'
          : 'Idle';
  const memoryStatusColor =
    activeSession?.memoryStatus === 'updating'
      ? 'var(--theme-brand)'
      : activeSession?.memoryStatus === 'stale'
        ? 'var(--theme-warning)'
        : activeSession?.memoryStatus === 'error'
          ? 'var(--theme-error)'
          : 'var(--theme-success)';
  const personaOptions = useMemo(
    () => personas.map((persona) => ({ value: persona.id, label: persona.name })),
    [personas]
  );
  const lorebookOptions = useMemo(
    () => lorebooks.map((lorebook) => ({ value: lorebook.id, label: lorebook.name })),
    [lorebooks]
  );
  const characterOptions = useMemo(
    () => characters.map((character) => ({ value: character.id, label: character.name })),
    [characters]
  );
  const activeParticipantIds = useMemo(
    () =>
      activeSession
        ? [
            ...new Set([
              activeSession.characterId,
              ...((activeSession.participantCharacterIds ?? []).length > 0
                ? activeSession.participantCharacterIds
                : [activeSession.characterId]),
            ]),
          ]
        : [],
    [activeSession]
  );
  const activeGroupCharacters = useMemo(
    () =>
      activeParticipantIds
        .map((characterId) => characterById.get(characterId))
        .filter((character): character is (typeof characters)[number] => Boolean(character)),
    [activeParticipantIds, characterById]
  );
  const activeParticipantIdSet = useMemo(
    () => new Set(activeParticipantIds),
    [activeParticipantIds]
  );
  const activeVisualState = useMemo(
    () => getSafeSessionVisualState(activeSession),
    [activeSession]
  );
  const activeSpeakerCharacter = useMemo(() => {
    if (!activeSession) {
      return activeCharacter ?? null;
    }
    const speakerCharacterId = activeSession.activeSpeakerCharacterId ?? activeSession.characterId;
    return (
      activeGroupCharacters.find((character) => character.id === speakerCharacterId) ??
      activeCharacter ??
      null
    );
  }, [activeCharacter, activeGroupCharacters, activeSession]);
  const activeSpeakerVisualState = useMemo<RoleplayVisualCharacterState>(
    () =>
      (activeSpeakerCharacter
        ? activeVisualState.characterStates[activeSpeakerCharacter.id]
        : null) ?? EMPTY_VISUAL_CHARACTER_STATE,
    [activeSpeakerCharacter, activeVisualState.characterStates]
  );
  const speakerOptions = useMemo(
    () =>
      characterOptions.filter((option) =>
        activeParticipantIdSet.size > 0 ? activeParticipantIdSet.has(option.value) : true
      ),
    [activeParticipantIdSet, characterOptions]
  );
  const referenceImageOptions = useMemo(
    () =>
      (activeSpeakerCharacter?.galleryImages ?? []).map((image, index) => ({
        value: image.id,
        label: `${image.referenceRole || image.source} ${index + 1}`,
      })),
    [activeSpeakerCharacter?.galleryImages]
  );
  const expressionSpriteOptions = useMemo(
    () => activeSpeakerCharacter?.expressionSprites ?? [],
    [activeSpeakerCharacter?.expressionSprites]
  );
  const activeExpressionSprite = useMemo(
    () =>
      expressionSpriteOptions.find(
        (sprite) =>
          sprite.label.toLowerCase() === (activeSession?.activeExpression ?? '').trim().toLowerCase()
      ) ?? null,
    [activeSession?.activeExpression, expressionSpriteOptions]
  );
  const compiledPrompt = useMemo(
    () =>
      activeCharacter && activeSession
        ? compileRoleplayPrompt({
            character: activeCharacter,
            session: activeSession,
            persona: activePersona,
            groupCharacters: activeGroupCharacters,
            lorebooks,
            maxHistoryMessages: selectedMaxHistoryMessages,
            maxContextTokens: selectedContextTokens,
            reservedResponseTokens: chatMaxTokens,
            promptBudgetMode: selectedPromptBudgetMode,
            loreEntryLimit: selectedLoreEntryLimit,
            scriptVariables: roleplayScriptVariables,
            knowledgeDocuments: roleplayKnowledgeDocuments,
          })
        : null,
    [
      activeCharacter,
      activeGroupCharacters,
      activePersona,
      activeSession,
      chatMaxTokens,
      lorebooks,
      roleplayScriptVariables,
      roleplayKnowledgeDocuments,
      selectedContextTokens,
      selectedLoreEntryLimit,
      selectedMaxHistoryMessages,
      selectedPromptBudgetMode,
    ]
  );
  const promptBlocks = useMemo(
    () => compiledPrompt?.promptBlocks ?? [],
    [compiledPrompt?.promptBlocks]
  );
  const activeRoleplayPreset = useMemo(
    () => getRoleplayPresetStack(activePromptStack.roleplayPresetId),
    [activePromptStack.roleplayPresetId]
  );

  const handleRoleplayPresetChange = useCallback(
    (presetId: string | null) => {
      if (!activeSessionId) {
        return;
      }

      const nextPresetId = presetId || ROLEPLAY_PRESET_NONE_ID;
      updateSessionPromptStack(activeSessionId, {
        roleplayPresetId: nextPresetId,
      });

      const preset = getRoleplayPresetStack(nextPresetId);
      if (preset.id !== ROLEPLAY_PRESET_NONE_ID) {
        setChatTemperature(preset.recommendedTemperature);
        setChatMaxTokens(preset.recommendedMaxTokens);
      }
    },
    [activeSessionId, setChatMaxTokens, setChatTemperature, updateSessionPromptStack]
  );

  const updatePromptBlockSetting = useCallback(
    (blockId: string, updates: RoleplayPromptBlockSettings) => {
      if (!activeSessionId || !activeSession) {
        return;
      }

      const targetBlock = promptBlocks.find((block) => block.id === blockId);
      if (targetBlock?.source === 'preset' && activeRoleplayPreset.id !== ROLEPLAY_PRESET_NONE_ID) {
        const currentSettingsByPresetId = activePromptStack.promptBlockSettingsByPresetId;
        const currentPresetSettings = currentSettingsByPresetId[activeRoleplayPreset.id] ?? {};
        updateSessionPromptStack(activeSessionId, {
          promptBlockSettingsByPresetId: {
            ...currentSettingsByPresetId,
            [activeRoleplayPreset.id]: {
              ...currentPresetSettings,
              [blockId]: {
                ...(currentPresetSettings[blockId] ?? {}),
                ...updates,
              },
            },
          },
        });
        return;
      }

      const currentSettings = activePromptStack.promptBlockSettings;
      updateSessionPromptStack(activeSessionId, {
        promptBlockSettings: {
          ...currentSettings,
          [blockId]: {
            ...(currentSettings[blockId] ?? {}),
            ...updates,
          },
        },
      });
    },
    [
      activePromptStack.promptBlockSettings,
      activePromptStack.promptBlockSettingsByPresetId,
      activeRoleplayPreset.id,
      activeSession,
      activeSessionId,
      promptBlocks,
      updateSessionPromptStack,
    ]
  );

  const movePromptBlock = useCallback(
    (blockId: string, direction: -1 | 1) => {
      if (!activeSessionId || !activeSession || promptBlocks.length === 0) {
        return;
      }

      const currentIndex = promptBlocks.findIndex((block) => block.id === blockId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= promptBlocks.length) {
        return;
      }

      const reorderedBlocks = [...promptBlocks];
      const [movedBlock] = reorderedBlocks.splice(currentIndex, 1);
      reorderedBlocks.splice(nextIndex, 0, movedBlock);

      const nextSharedSettings = { ...activePromptStack.promptBlockSettings };
      const nextSettingsByPresetId = { ...activePromptStack.promptBlockSettingsByPresetId };
      const nextPresetSettings =
        activeRoleplayPreset.id !== ROLEPLAY_PRESET_NONE_ID
          ? { ...(nextSettingsByPresetId[activeRoleplayPreset.id] ?? {}) }
          : {};
      const applyOrderSetting = (block: RoleplayPromptBlock, order: number) => {
        if (block.source === 'preset' && activeRoleplayPreset.id !== ROLEPLAY_PRESET_NONE_ID) {
          nextPresetSettings[block.id] = {
            ...(nextPresetSettings[block.id] ?? {}),
            order,
          };
          return;
        }
        nextSharedSettings[block.id] = {
          ...(nextSharedSettings[block.id] ?? {}),
          order,
        };
      };

      for (let index = 0; index < reorderedBlocks.length; index += 1) {
        applyOrderSetting(reorderedBlocks[index], index * 10);
      }
      if (activeRoleplayPreset.id !== ROLEPLAY_PRESET_NONE_ID) {
        nextSettingsByPresetId[activeRoleplayPreset.id] = nextPresetSettings;
      }

      updateSessionPromptStack(activeSessionId, {
        promptBlockSettings: nextSharedSettings,
        promptBlockSettingsByPresetId: nextSettingsByPresetId,
      });
    },
    [
      activePromptStack.promptBlockSettings,
      activePromptStack.promptBlockSettingsByPresetId,
      activeRoleplayPreset.id,
      activeSession,
      activeSessionId,
      promptBlocks,
      updateSessionPromptStack,
    ]
  );

  const updateVisualStateField = useCallback(
    (field: 'location' | 'timeOfDay' | 'lighting' | 'sceneAnchor' | 'persistentObjects' | 'negativePrompt', value: string) => {
      if (!activeSessionId || !activeSession) {
        return;
      }
      updateSessionVisualState(activeSessionId, {
        visualState: {
          ...activeVisualState,
          [field]: value,
        },
      });
    },
    [activeSession, activeSessionId, activeVisualState, updateSessionVisualState]
  );

  const updateActiveSpeakerVisualState = useCallback(
    (field: keyof RoleplayVisualCharacterState, value: string | null) => {
      if (!activeSessionId || !activeSession || !activeSpeakerCharacter) {
        return;
      }
      const nextCharacterState: RoleplayVisualCharacterState = {
        ...activeSpeakerVisualState,
      };
      if (field === 'referenceImageId') {
        nextCharacterState.referenceImageId = value;
      }
      else {
        nextCharacterState[field] = value ?? '';
      }
      updateSessionVisualState(activeSessionId, {
        visualState: {
          ...activeVisualState,
          characterStates: {
            ...activeVisualState.characterStates,
            [activeSpeakerCharacter.id]: nextCharacterState,
          },
        },
      });
    },
    [
      activeSession,
      activeSessionId,
      activeSpeakerCharacter,
      activeSpeakerVisualState,
      activeVisualState,
      updateSessionVisualState,
    ]
  );

  const { data: sdModels, isLoading: loadingModels } = useModels('Stable-Diffusion');
  const {
    isLoading: isLoadingModel,
    progress: modelLoadProgress,
    modelName: loadingModelName,
    isProgressEstimated: modelLoadProgressEstimated,
    error: modelLoadError,
    loadModel,
  } = useModelLoading();
  const swarmBaseUrl = useMemo(
    () => resolveRuntimeEndpoints().apiBaseUrl || window.location.origin,
    []
  );

  const maybeEnhanceRoleplayImagePrompt = useCallback(
    async (compiled: CompiledRoleplayImagePrompt): Promise<{
      compiled: CompiledRoleplayImagePrompt;
      enhanced: boolean;
      sceneSummary: string;
    }> => {
      if (
        !roleplayImageEnhanceEnabled ||
        !promptEnhancer.enabled ||
        !promptEnhancer.modelId ||
        !compiled.prompt.trim()
      ) {
        return { compiled, enhanced: false, sceneSummary: compiled.sceneSummary };
      }

      promptEnhancer.setEnhancing(true);
      promptEnhancer.setLastError(null);
      try {
        const result = await enhanceRoleplayImagePrompt({
          prompt: compiled.prompt,
          negativePrompt: compiled.negativePrompt,
          promptBlocks: compiled.promptBlocks.map((block) => ({
            label: block.label,
            content: block.content,
          })),
          negativePromptBlocks: compiled.negativePromptBlocks.map((block) => ({
            label: block.label,
            content: block.content,
          })),
          memorySummary: activeSession?.conversationSummary ?? '',
          openThreads: activeSession?.continuity.openThreads ?? [],
          modelId: promptEnhancer.modelId,
          systemPrompt: promptEnhancer.systemPrompt,
          endpointUrl: promptEnhancer.endpointUrl,
          preferredMode: promptEnhancer.detectedServerMode,
          options: {
            formatMode: promptEnhancer.formatMode,
            creativeStrength: promptEnhancer.creativeStrength,
            imageModelId: effectiveModel,
          },
        });

        if (!result.success || !result.draft) {
          const errorMessage = result.error || 'Prompt enhancer could not improve the scene prompt.';
          promptEnhancer.setLastError(errorMessage);
          notifications.show({
            title: 'Using Compiled Prompt',
            message: errorMessage,
            color: 'yellow',
          });
          return { compiled, enhanced: false, sceneSummary: compiled.sceneSummary };
        }

        const enhancedPrompt = result.draft.promptDraft?.trim() || compiled.prompt;
        const enhancedNegativePrompt =
          result.draft.negativePromptDraft?.trim() || compiled.negativePrompt;
        return {
          compiled: {
            ...compiled,
            prompt: enhancedPrompt,
            negativePrompt: enhancedNegativePrompt,
            generateParams: {
              ...compiled.generateParams,
              prompt: enhancedPrompt,
              negativeprompt: enhancedNegativePrompt,
            },
          },
          enhanced: true,
          sceneSummary: result.draft.sceneSummary?.trim() || compiled.sceneSummary,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Prompt enhancer could not improve the scene prompt.';
        promptEnhancer.setLastError(errorMessage);
        notifications.show({
          title: 'Using Compiled Prompt',
          message: errorMessage,
          color: 'yellow',
        });
        return { compiled, enhanced: false, sceneSummary: compiled.sceneSummary };
      } finally {
        const unloadResult = await unloadLocalTextModelNow({
          endpointUrl: promptEnhancer.endpointUrl,
          modelId: promptEnhancer.modelId,
          serverMode: promptEnhancer.detectedServerMode,
        });
        if (unloadResult.attempted && !unloadResult.success) {
          notifications.show({
            title: 'Assistant Model Still Loaded',
            message:
              unloadResult.error ||
              'The assistant model could not be unloaded before image generation.',
            color: 'yellow',
          });
        }
        promptEnhancer.setEnhancing(false);
      }
    },
    [
      activeSession,
      effectiveModel,
      promptEnhancer,
      roleplayImageEnhanceEnabled,
    ]
  );

  const unloadTextModelForImageWork = useCallback(
    async (actionLabel: string) => {
      if (!selectedModelId) {
        return;
      }

      const unloadResult = await unloadLocalTextModelNow({
        endpointUrl: lmStudioEndpoint,
        modelId: selectedModelId,
        serverMode: detectedServerMode,
      });
      if (unloadResult.attempted && !unloadResult.success) {
        notifications.show({
          title: 'Text Model Still Loaded',
          message:
            unloadResult.error ||
            `The local text model could not be unloaded before ${actionLabel}.`,
          color: 'yellow',
        });
      }
    },
    [detectedServerMode, lmStudioEndpoint, selectedModelId]
  );

  const updateLastImagePromptPreview = useCallback(
    (
      compiled: CompiledRoleplayImagePrompt,
      sceneSummary: string,
      enhanced: boolean
    ) => {
      setLastImagePromptPreview({
        prompt: compiled.prompt,
        negativePrompt: compiled.negativePrompt,
        sceneSummary: sceneSummary || compiled.sceneSummary,
        enhanced,
        model: compiled.debug.model,
        formatPreset: resolvePromptEnhancePreset(
          promptEnhancer.formatMode,
          compiled.debug.model
        ),
        scenePromptSource: compiled.debug.scenePromptSource,
        referenceImageLabels: compiled.referenceImages.map((reference) => reference.label),
      });
    },
    [promptEnhancer.formatMode]
  );

  const buildCurrentSceneBrief = useCallback((projectId?: string | null) => {
    if (!activeCharacter || !activeSession) {
      return null;
    }
    return buildRoleplaySceneBrief({
      character: activeCharacter,
      session: activeSession,
      persona: activePersona,
      groupCharacters: activeGroupCharacters,
      model: effectiveModel,
      width: imageWidth,
      height: imageHeight,
      steps: imageSteps,
      cfgscale: imageCfgScale,
      clipstopatlayer: imageClipStopAtLayer,
      projectId,
    });
  }, [
    activeCharacter,
    activeGroupCharacters,
    activePersona,
    activeSession,
    effectiveModel,
    imageCfgScale,
    imageClipStopAtLayer,
    imageHeight,
    imageSteps,
    imageWidth,
  ]);

  const buildCurrentSceneBriefWithEnhancement = useCallback(async (projectId?: string | null) => {
    const brief = buildCurrentSceneBrief(projectId);
    if (!brief || !activeCharacter || !activeSession) {
      return brief;
    }

    const compiled = compileRoleplayImagePrompt({
      character: activeCharacter,
      session: activeSession,
      persona: activePersona,
      groupCharacters: activeGroupCharacters,
      model: effectiveModel,
      width: imageWidth,
      height: imageHeight,
      steps: imageSteps,
      cfgscale: imageCfgScale,
      clipstopatlayer: imageClipStopAtLayer,
    });
    const enhancedResult = await maybeEnhanceRoleplayImagePrompt(compiled);
    const finalCompiled = enhancedResult.compiled;
    updateLastImagePromptPreview(
      finalCompiled,
      enhancedResult.sceneSummary,
      enhancedResult.enhanced
    );
    return {
      ...brief,
      prompt: finalCompiled.prompt,
      negativePrompt: finalCompiled.negativePrompt,
      sceneSummary: enhancedResult.sceneSummary || finalCompiled.sceneSummary,
      referenceImageUrls: finalCompiled.referenceImages.map((reference) => reference.url),
      generateParams: finalCompiled.generateParams,
      provenance: {
        ...brief.provenance,
        prompt: finalCompiled.prompt,
        negativePrompt: finalCompiled.negativePrompt,
      },
      updatedAt: Date.now(),
    };
  }, [
    activeCharacter,
    activeGroupCharacters,
    activePersona,
    activeSession,
    buildCurrentSceneBrief,
    effectiveModel,
    imageCfgScale,
    imageClipStopAtLayer,
    imageHeight,
    imageSteps,
    imageWidth,
    maybeEnhanceRoleplayImagePrompt,
    updateLastImagePromptPreview,
  ]);

  const handleSaveSceneBrief = useCallback(async () => {
    const projectId = activeProjectId ?? ensureActiveProject();
    const brief = await buildCurrentSceneBriefWithEnhancement(projectId);
    if (!brief || !brief.prompt.trim()) {
      notifications.show({
        title: 'Scene Brief Unavailable',
        message: 'Open a character session with conversation context first.',
        color: 'orange',
      });
      return;
    }
    saveSceneBrief(brief, projectId);
    notifications.show({
      title: 'Scene Brief Saved',
      message: `${brief.title} was added to the active project.`,
      color: 'teal',
    });
  }, [activeProjectId, buildCurrentSceneBriefWithEnhancement, ensureActiveProject, saveSceneBrief]);

  const handleSendSceneToGenerate = useCallback(async () => {
    const projectId = activeProjectId ?? ensureActiveProject();
    const brief = await buildCurrentSceneBriefWithEnhancement(projectId);
    if (!brief || !brief.prompt.trim()) {
      notifications.show({
        title: 'Scene Brief Unavailable',
        message: 'Open a character session with conversation context first.',
        color: 'orange',
      });
      return;
    }
    saveSceneBrief(brief, projectId);
    const generationStore = useGenerationStore.getState();
    generationStore.setParams(brief.generateParams);
    if (typeof brief.generateParams.model === 'string') {
      generationStore.setSelectedModel(brief.generateParams.model);
    }
    navigateToGenerate({ mode: 'advanced' });
    notifications.show({
      title: 'Scene Sent To Generate',
      message: 'The roleplay scene brief is ready in the Generate workspace.',
      color: 'teal',
    });
  }, [activeProjectId, buildCurrentSceneBriefWithEnhancement, ensureActiveProject, navigateToGenerate, saveSceneBrief]);

  const handleQueueScenePack = useCallback(async () => {
    const projectId = activeProjectId ?? ensureActiveProject();
    const brief = await buildCurrentSceneBriefWithEnhancement(projectId);
    if (!brief || !brief.prompt.trim()) {
      notifications.show({
        title: 'Scene Brief Unavailable',
        message: 'Open a character session with conversation context first.',
        color: 'orange',
      });
      return;
    }
    saveSceneBrief(brief, projectId);
    for (let index = 0; index < 4; index += 1) {
      addQueueJob(
        {
          ...brief.generateParams,
          prompt: brief.generateParams.prompt ?? brief.prompt,
          seed: Math.floor(Math.random() * 2147483647),
        },
        {
          name: `${brief.title} Variant ${index + 1}`,
          tags: ['roleplay', 'scene-pack'],
          provenance: {
            ...brief.provenance,
            source: 'roleplay',
            projectId,
          },
        }
      );
    }
    notifications.show({
      title: 'Scene Pack Queued',
      message: 'Four roleplay scene variants were added to the queue.',
      color: 'teal',
    });
  }, [activeProjectId, addQueueJob, buildCurrentSceneBriefWithEnhancement, ensureActiveProject, saveSceneBrief]);

  useEffect(() => {
    queueMicrotask(() => {
      setClipOverride(imageClipStopAtLayer !== null);
    });
  }, [imageClipStopAtLayer]);

  useEffect(() => {
    const activeNotificationId = imageModelLoadNotificationIdRef.current;
    const targetModelName = loadingModelName || effectiveModel || 'image model';

    if (isLoadingModel) {
      const message = modelLoadProgressEstimated
        ? `Loading ${targetModelName}. Progress will update when the backend reports it.`
        : `Loading ${targetModelName} (${Math.round(modelLoadProgress * 100)}%).`;
      if (activeNotificationId) {
        notifications.update({
          id: activeNotificationId,
          title: 'Loading Image Model',
          message,
          color: 'blue',
          autoClose: false,
          loading: true,
        });
      } else {
        imageModelLoadNotificationIdRef.current = notifications.show({
          title: 'Loading Image Model',
          message,
          color: 'blue',
          autoClose: false,
          loading: true,
        });
      }
      return;
    }

    if (modelLoadError && activeNotificationId) {
      notifications.update({
        id: activeNotificationId,
        title: 'Image Model Load Failed',
        message: modelLoadError,
        color: 'red',
        autoClose: 5000,
        loading: false,
      });
      imageModelLoadNotificationIdRef.current = null;
      return;
    }

    if (activeNotificationId) {
      notifications.update({
        id: activeNotificationId,
        title: 'Image Model Ready',
        message: `${targetModelName} is ready for roleplay scene generation.`,
        color: 'teal',
        autoClose: 2500,
        loading: false,
      });
      imageModelLoadNotificationIdRef.current = null;
    }
  }, [
    effectiveModel,
    isLoadingModel,
    loadingModelName,
    modelLoadError,
    modelLoadProgress,
    modelLoadProgressEstimated,
  ]);

  const generateImageWithPrompt = useCallback(
    async (
      prompt: string,
      scenePromptSource: CompiledRoleplayImagePrompt['debug']['scenePromptSource'] = 'manual'
    ) => {
      if (!activeCharacter || !activeSession) {
        notifications.show({
          title: 'Cannot Generate',
          message: 'Choose a session before generating a scene image.',
          color: 'orange',
        });
        return;
      }

      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        notifications.show({
          title: 'Missing Prompt',
          message: 'There is no scene prompt to generate from.',
          color: 'orange',
        });
        return;
      }

      setIsGeneratingImage(true);

      const compiled = compileRoleplayImagePrompt({
        character: activeCharacter,
        session: activeSession,
        persona: activePersona,
        groupCharacters: activeGroupCharacters,
        scenePrompt: trimmedPrompt,
        scenePromptSource,
        model: effectiveModel,
        width: imageWidth,
        height: imageHeight,
        steps: imageSteps,
        cfgscale: imageCfgScale,
        clipstopatlayer: imageClipStopAtLayer,
      });
      const enhancedResult = await maybeEnhanceRoleplayImagePrompt(compiled);
      const finalCompiled = enhancedResult.compiled;
      updateLastImagePromptPreview(
        finalCompiled,
        enhancedResult.sceneSummary,
        enhancedResult.enhanced
      );
      await unloadTextModelForImageWork('starting image generation');

      try {
        swarmClient.generateImage(
          finalCompiled.generateParams as GenerateParams,
          {
            onImage: (data: { image?: string }) => {
              if (!data.image) {
                return;
              }

              const normalizedPath = data.image.startsWith('/') ? data.image : `/${data.image}`;
              const imageUrl = resolveAssetUrl(normalizedPath);
              const lastAssistantMessage = getLastAssistantMessage(activeSession.messages);
              attachSceneImageToLastMessage(activeSession.id, imageUrl);
              addCharacterGalleryImage(activeCharacter.id, {
                imageUrl,
                source: 'scene',
                referenceRole: 'scene',
                isPrimaryReference: false,
                prompt: finalCompiled.prompt,
                negativePrompt: finalCompiled.negativePrompt,
                sessionId: activeSession.id,
                messageId: lastAssistantMessage?.id ?? null,
              });
            },
            onComplete: () => setIsGeneratingImage(false),
            onError: () => {
              notifications.show({
                title: 'Image Generation Failed',
                message: 'SwarmUI could not generate the scene image.',
                color: 'red',
              });
              setIsGeneratingImage(false);
            },
            onDataError: (errorMessage: string) => {
              notifications.show({
                title: 'Image Generation Error',
                message: errorMessage,
                color: 'red',
              });
              setIsGeneratingImage(false);
            },
          }
        );
      } catch (error) {
        notifications.show({
          title: 'Image Generation Failed',
          message: error instanceof Error ? error.message : 'SwarmUI could not start the image request.',
          color: 'red',
        });
        setIsGeneratingImage(false);
      }
    },
    [
      activeCharacter,
      activeGroupCharacters,
      activePersona,
      activeSession,
      addCharacterGalleryImage,
      attachSceneImageToLastMessage,
      effectiveModel,
      maybeEnhanceRoleplayImagePrompt,
      imageCfgScale,
      imageClipStopAtLayer,
      imageHeight,
      imageSteps,
      imageWidth,
      unloadTextModelForImageWork,
      updateLastImagePromptPreview,
    ]
  );

  const handleGenerateScene = useCallback(
    async (manualPrompt?: string) => {
      if (
        !activeCharacter ||
        !activeSession ||
        !selectedModelId ||
        !detectedServerMode ||
        connectionStatus !== 'connected'
      ) {
        notifications.show({
          title: 'Cannot Generate',
          message: 'Connect to LM Studio, select a model, and open a chat session first.',
          color: 'orange',
        });
        return;
      }

      if (messages.length === 0) {
        notifications.show({
          title: 'No Conversation',
          message: 'Start chatting before generating a scene.',
          color: 'orange',
        });
        return;
      }

      if (isLoadingModel) {
        notifications.show({
          title: 'Image Model Still Loading',
          message: `${
            loadingModelName || effectiveModel || 'The selected image model'
          } is still loading${modelLoadProgressEstimated ? '' : ` (${Math.round(modelLoadProgress * 100)}%)`}.`,
          color: 'blue',
        });
        return;
      }

      setIsGeneratingImage(true);
      const contextStr = messages
        .slice(-6)
        .map((message) => `${message.role === 'user' ? 'User' : 'Character'}: ${message.content}`)
        .join('\n');
      const sceneSuggestionPrompt =
        manualPrompt?.trim() ||
        activeCharacter.sceneSuggestionPrompt ||
        getRoleplayInteractionStyleConfig(activeCharacter.interactionStyle).sceneSuggestionPrompt;
      let sceneResult: Awaited<ReturnType<typeof generateSceneDescription>>;
      try {
        sceneResult = await generateSceneDescription({
          endpointUrl: lmStudioEndpoint,
          serverMode: detectedServerMode,
          modelId: selectedModelId,
          conversationContext: contextStr,
          sceneSuggestionPrompt,
          compatibility: selectedModelCompatibility,
          requestConfig: {
            provider: chatProvider,
            apiKey: chatApiKey,
            title: 'SwarmUI Roleplay',
          },
        });
      } catch (error) {
        await unloadTextModelForImageWork('leaving scene generation');
        notifications.show({
          title: 'Scene Description Failed',
          message: error instanceof Error ? error.message : 'Could not generate a scene description.',
          color: 'red',
        });
        setIsGeneratingImage(false);
        return;
      }

      if (sceneResult.correctedMode) {
        setDetectedServerMode(sceneResult.correctedMode);
      }

      if (!sceneResult.success) {
        await unloadTextModelForImageWork('leaving scene generation');
        notifications.show({
          title: 'Scene Description Failed',
          message: sceneResult.error ?? 'Could not generate a scene description.',
          color: 'red',
        });
        setIsGeneratingImage(false);
        return;
      }

      if (!sceneResult.description.trim()) {
        await unloadTextModelForImageWork('leaving scene generation');
        notifications.show({
          title: 'Scene Description Failed',
          message: 'The assistant returned an empty scene description.',
          color: 'red',
        });
        setIsGeneratingImage(false);
        return;
      }

      await generateImageWithPrompt(sceneResult.description, 'suggested');
    },
    [
      activeCharacter,
      activeSession,
      chatApiKey,
      chatProvider,
      connectionStatus,
      detectedServerMode,
      generateImageWithPrompt,
      lmStudioEndpoint,
      messages,
      effectiveModel,
      isLoadingModel,
      loadingModelName,
      modelLoadProgress,
      modelLoadProgressEstimated,
      selectedModelCompatibility,
      selectedModelId,
      setDetectedServerMode,
      unloadTextModelForImageWork,
    ]
  );

  const handleRefreshMemory = useCallback(async () => {
    if (!activeCharacter || !activeSession || !activeSessionId) {
      return;
    }

    if (!selectedModelId || !detectedServerMode || connectionStatus !== 'connected') {
      setSessionMemoryStatus(activeSessionId, 'stale');
      notifications.show({
        title: 'Memory Unavailable',
        message: 'Connect to LM Studio before refreshing memory.',
        color: 'orange',
      });
      return;
    }

    const sourceMessages = getMessagesForMemoryRefresh(messages);
    const triggerMessageId = messages[messages.length - 1]?.id ?? null;
    if (sourceMessages.length === 0) {
      notifications.show({
        title: 'Memory Unavailable',
        message: 'There is not enough conversation context to refresh memory yet.',
        color: 'orange',
      });
      return;
    }

    setSessionMemoryStatus(activeSessionId, 'updating');

    const result = await generateRoleplayMemory({
      endpointUrl: lmStudioEndpoint,
      serverMode: detectedServerMode,
      modelId: selectedModelId,
      character: {
        name: activeCharacter.name,
        interactionStyle: activeCharacter.interactionStyle,
        personality: buildCharacterPersonalityBlock(activeCharacter) || activeCharacter.personality,
        systemPrompt: getEffectiveSystemPrompt(activeCharacter),
        conversationSummary: activeSession.conversationSummary,
        continuity: activeSession.continuity,
        memoryFacts: activeSession.memoryFacts,
      },
      sourceMessages,
      conversationContext: formatMessagesForMemoryRefresh(sourceMessages),
      memoryBudgetMode: selectedPromptBudgetMode,
      compatibility: selectedModelCompatibility,
      requestConfig: {
        provider: chatProvider,
        apiKey: chatApiKey,
        title: 'SwarmUI Roleplay',
      },
    });

    if (result.correctedMode) {
      setDetectedServerMode(result.correctedMode);
    }

    if (!result.success) {
      setSessionMemoryStatus(activeSessionId, connectionStatus === 'connected' ? 'error' : 'stale');
      notifications.show({
        title: 'Memory Refresh Failed',
        message: result.error ?? 'Could not update conversation memory.',
        color: 'orange',
      });
      return;
    }

    const latestSession = useRoleplayStore
      .getState()
      .chatSessions.find((session) => session.id === activeSessionId);
    if (
      !latestSession ||
      (triggerMessageId &&
        !latestSession.messages.some((message) => message.id === triggerMessageId))
    ) {
      return;
    }

    applyGeneratedMemory(
      activeSessionId,
      result.conversationSummary,
      result.continuity,
      mergeGeneratedMemoryFacts(latestSession.memoryFacts, result.memoryFacts.map((text): RoleplayMemoryFact => ({
        id: crypto.randomUUID(), text, pinned: false, createdAt: Date.now(), updatedAt: Date.now(),
      }))),
      Date.now()
    );
  }, [
    activeCharacter,
    activeSession,
    activeSessionId,
    applyGeneratedMemory,
    chatApiKey,
    chatProvider,
    connectionStatus,
    detectedServerMode,
    lmStudioEndpoint,
    messages,
    selectedModelCompatibility,
    selectedModelId,
    selectedPromptBudgetMode,
    setDetectedServerMode,
    setSessionMemoryStatus,
  ]);

  const handleAddMemoryFact = () => {
    if (!activeSessionId || !newMemoryFactText.trim()) {
      return;
    }
    addMemoryFact(activeSessionId, newMemoryFactText);
    setNewMemoryFactText('');
  };

  const handleAddQuickReply = () => {
    const label = quickReplyLabelDraft.trim();
    const script = quickReplyScriptDraft.trim();
    if (!label || !script) {
      return;
    }
    addQuickReply({
      label,
      script,
      enabled: true,
    });
    setQuickReplyLabelDraft('');
    setQuickReplyScriptDraft('');
  };

  const editingQuickReply = useMemo(
    () =>
      editingQuickReplyId
        ? roleplayQuickReplies.find((reply) => reply.id === editingQuickReplyId) ?? null
        : null,
    [editingQuickReplyId, roleplayQuickReplies]
  );

  useEffect(() => {
    if (editingQuickReplyId && !editingQuickReply) {
      queueMicrotask(() => {
        setEditingQuickReplyId(null);
        setQuickReplyEditLabelDraft('');
        setQuickReplyEditScriptDraft('');
      });
    }
  }, [editingQuickReply, editingQuickReplyId]);

  const clearQuickReplyEditDraft = () => {
    setEditingQuickReplyId(null);
    setQuickReplyEditLabelDraft('');
    setQuickReplyEditScriptDraft('');
  };

  const handleEditQuickReply = (reply: RoleplayQuickReply) => {
    setEditingQuickReplyId(reply.id);
    setQuickReplyEditLabelDraft(reply.label);
    setQuickReplyEditScriptDraft(reply.script);
  };

  const handleSaveQuickReplyEdit = () => {
    if (!editingQuickReplyId) {
      return;
    }
    const label = quickReplyEditLabelDraft.trim();
    const script = quickReplyEditScriptDraft.trim();
    if (!label || !script) {
      notifications.show({
        title: 'Quick Reply Needs Content',
        message: 'Add a label and script before saving.',
        color: 'orange',
      });
      return;
    }
    updateQuickReply(editingQuickReplyId, {
      label,
      script,
    });
    clearQuickReplyEditDraft();
  };

  const scopedKnowledgeDocuments = useMemo(
    () =>
      roleplayKnowledgeDocuments.filter((document) => {
        if (!activeCharacter || !activeSession) {
          return document.scope === 'global';
        }
        if (document.scope === 'global') {
          return true;
        }
        if (document.scope === 'character') {
          return document.characterId === activeCharacter.id;
        }
        if (document.scope === 'persona') {
          return Boolean(activePersona?.id && document.personaId === activePersona.id);
        }
        return document.sessionId === activeSession.id;
      }),
    [activeCharacter, activePersona, activeSession, roleplayKnowledgeDocuments]
  );

  const filteredKnowledgeDocuments = useMemo(() => {
    const query = knowledgeSearchDraft.trim().toLowerCase();
    if (!query) {
      return scopedKnowledgeDocuments;
    }
    return scopedKnowledgeDocuments.filter((document) =>
      [
        document.title,
        document.description,
        document.scope,
        document.sourceType,
        document.content,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [knowledgeSearchDraft, scopedKnowledgeDocuments]);

  const editingKnowledgeDocument = useMemo(
    () =>
      editingKnowledgeDocumentId
        ? scopedKnowledgeDocuments.find((document) => document.id === editingKnowledgeDocumentId) ?? null
        : null,
    [editingKnowledgeDocumentId, scopedKnowledgeDocuments]
  );

  useEffect(() => {
    if (editingKnowledgeDocumentId && !editingKnowledgeDocument) {
      queueMicrotask(() => {
        setEditingKnowledgeDocumentId(null);
        setKnowledgeEditTitleDraft('');
        setKnowledgeEditDescriptionDraft('');
        setKnowledgeEditContentDraft('');
      });
    }
  }, [editingKnowledgeDocument, editingKnowledgeDocumentId]);

  const clearKnowledgeEditDraft = () => {
    setEditingKnowledgeDocumentId(null);
    setKnowledgeEditTitleDraft('');
    setKnowledgeEditDescriptionDraft('');
    setKnowledgeEditContentDraft('');
  };

  const handleEditKnowledgeDocument = (document: RoleplayKnowledgeDocument) => {
    setEditingKnowledgeDocumentId(document.id);
    setKnowledgeEditTitleDraft(document.title);
    setKnowledgeEditDescriptionDraft(document.description);
    setKnowledgeEditContentDraft(document.content);
  };

  const handleSaveKnowledgeDocumentEdit = () => {
    if (!editingKnowledgeDocumentId) {
      return;
    }
    const title = knowledgeEditTitleDraft.trim();
    const content = knowledgeEditContentDraft.trim();
    if (!title || !content) {
      notifications.show({
        title: 'Knowledge Needs Content',
        message: 'Add a title and knowledge text before saving.',
        color: 'orange',
      });
      return;
    }
    updateKnowledgeDocument(editingKnowledgeDocumentId, {
      title,
      description: knowledgeEditDescriptionDraft.trim(),
      content,
    });
    clearKnowledgeEditDraft();
  };

  const handleAddKnowledgeDocument = () => {
    if (!knowledgeTitleDraft.trim() || !knowledgeContentDraft.trim()) {
      return;
    }
    addKnowledgeDocument({
      title: knowledgeTitleDraft.trim(),
      content: knowledgeContentDraft.trim(),
      scope: knowledgeScopeDraft,
      characterId: knowledgeScopeDraft === 'character' ? activeCharacter?.id : null,
      personaId: knowledgeScopeDraft === 'persona' ? activePersona?.id : null,
      sessionId: knowledgeScopeDraft === 'session' ? activeSession?.id : null,
      sourceType: 'note',
      enabled: true,
    });
    setKnowledgeTitleDraft('');
    setKnowledgeContentDraft('');
  };

  const handleImportKnowledgeDocument = async (file: File | null) => {
    if (!file) {
      return;
    }
    if (knowledgeScopeDraft === 'session' && !activeSession) {
      notifications.show({
        title: 'No Active Chat',
        message: 'Choose a chat before importing session-scoped knowledge.',
        color: 'orange',
      });
      return;
    }
    try {
      const content = (await file.text()).trim();
      if (!content) {
        notifications.show({
          title: 'Knowledge Import Empty',
          message: 'This file did not contain text that can be indexed.',
          color: 'orange',
        });
        return;
      }
      addKnowledgeDocument({
        title: file.name,
        description: 'Imported text file.',
        content,
        scope: knowledgeScopeDraft,
        characterId: knowledgeScopeDraft === 'character' ? activeCharacter?.id : null,
        personaId: knowledgeScopeDraft === 'persona' ? activePersona?.id : null,
        sessionId: knowledgeScopeDraft === 'session' ? activeSession?.id ?? null : null,
        sourceType: 'text-file',
        enabled: true,
      });
    } catch (error) {
      notifications.show({
        title: 'Knowledge Import Failed',
        message: error instanceof Error ? error.message : 'Could not read this file.',
        color: 'red',
      });
    }
  };

  const handleIndexCurrentChat = () => {
    if (!activeSession || activeSession.messages.length === 0) {
      return;
    }
    const content = activeSession.messages
      .filter((message) => message.includedInPrompt !== false)
      .map((message) => `[${message.role}] ${getMessageContent(message).trim()}`)
      .filter((message) => message.trim().length > 0)
      .join('\n\n');
    if (!content) {
      return;
    }
    addKnowledgeDocument({
      title: `${activeSession.title || 'Current Chat'} History`,
      description: 'Indexed chat transcript for retrieval.',
      content,
      scope: 'session',
      sessionId: activeSession.id,
      sourceType: 'chat-history',
      enabled: true,
    });
  };

  const handleVectorizeScopedKnowledge = async () => {
    const embeddingModel = roleplayEmbeddingModelId.trim();
    if (!embeddingModel) {
      notifications.show({
        title: 'Embedding Model Required',
        message: 'Enter the local embedding model ID exposed by your server.',
        color: 'orange',
      });
      return;
    }
    const vectorizableDocuments = scopedKnowledgeDocuments.filter(
      (document) =>
        document.enabled &&
        document.chunks.some(
          (chunk) => !chunk.embedding?.length || chunk.embeddingModel !== embeddingModel
        )
    );
    if (vectorizableDocuments.length === 0) {
      notifications.show({
        title: 'Knowledge Already Vectorized',
        message: 'All enabled scoped chunks already have embeddings for this model.',
        color: 'blue',
      });
      return;
    }

    setIsVectorizingKnowledge(true);
    try {
      for (const document of vectorizableDocuments) {
        const chunks = document.chunks.filter(
          (chunk) => !chunk.embedding?.length || chunk.embeddingModel !== embeddingModel
        );
        const embeddings = await embedRoleplayTexts({
          endpointUrl: lmStudioEndpoint,
          serverMode: detectedServerMode,
          modelId: embeddingModel,
          texts: chunks.map((chunk) => chunk.content),
          requestConfig: {
            provider: chatProvider,
            apiKey: chatApiKey,
            title: 'SwarmUI Roleplay',
          },
        });
        setKnowledgeDocumentChunkEmbeddings(
          document.id,
          embeddingModel,
          chunks
            .map((chunk, index) => ({
              chunkId: chunk.id,
              embedding: embeddings[index] ?? [],
            }))
            .filter((entry) => entry.embedding.length > 0)
        );
      }
      notifications.show({
        title: 'Knowledge Vectorized',
        message: `${vectorizableDocuments.length} document(s) updated for vector retrieval.`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Vectorization Failed',
        message: error instanceof Error ? error.message : 'Could not create embeddings.',
        color: 'red',
      });
    } finally {
      setIsVectorizingKnowledge(false);
    }
  };

  const handleExportBundle = () => {
    if (!activeCharacter) {
      return;
    }
    const bundle = createRoleplayBundle(activeCharacter, chatSessions, lorebooks);
    downloadRoleplayBundle(bundle);
  };

  const handleImportBundle = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const bundle = await parseRoleplayBundle(file);
      importBundle(bundle);
      notifications.show({
        title: 'Bundle Imported',
        message:
          'Characters, sessions, personas, and lorebooks were added to your local roleplay library.',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Could not import this roleplay bundle.',
        color: 'red',
      });
    }
  };

  useEffect(() => {
    onRegisterGenerate?.(() => {
      void handleGenerateScene();
    });
  }, [handleGenerateScene, onRegisterGenerate]);

  useEffect(() => {
    onRegisterGenerateWithPrompt?.((prompt: string) => {
      void generateImageWithPrompt(prompt, 'manual');
    });
  }, [generateImageWithPrompt, onRegisterGenerateWithPrompt]);

  const handleLoadModel = async () => {
    if (!effectiveModel) {
      notifications.show({
        title: 'No Image Model Selected',
        message: 'Choose an image model before loading it.',
        color: 'orange',
      });
      return;
    }
    if (isLoadingModel) {
      notifications.show({
        title: 'Image Model Already Loading',
        message: `${loadingModelName || effectiveModel} is still loading.`,
        color: 'blue',
      });
      return;
    }
    await unloadTextModelForImageWork('loading the image model');
    loadModel(effectiveModel);
  };

  const handleOpenSectionsChange = (nextSections: string[]) => {
    setOpenSections((current) =>
      areStringListsEqual(current, nextSections) ? current : nextSections
    );
    setActiveDirectorTab(nextSections[nextSections.length - 1] ?? null);
  };

  const handleDirectorTabChange = (value: string | null) => {
    setActiveDirectorTab(value);
    setOpenSections(value ? [value] : []);
  };

  const handleEjectImageModel = async () => {
    if (!effectiveModel || isEjectingImageModel) {
      return;
    }

    setIsEjectingImageModel(true);
    try {
      const response = await fetch(`${swarmBaseUrl}/api/models/unloadmodel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: effectiveModel }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      notifications.show({
        title: 'Model Unloaded',
        message: effectiveModel,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Unload Failed',
        message: error instanceof Error ? error.message : 'Could not unload the image model.',
        color: 'red',
      });
    } finally {
      setIsEjectingImageModel(false);
    }
  };

  return (
    <>
      <Stack h="100%" gap={0} p="xs" style={{ overflow: 'auto' }}>
        <Tabs
          value={activeDirectorTab}
          onChange={handleDirectorTabChange}
          className="roleplay-director-tabs"
        >
          <Tabs.List grow>
            <Tabs.Tab value="generation" leftSection={<IconPhotoSpark size={14} />}>
              Scene
            </Tabs.Tab>
            <Tabs.Tab value="roleplay" leftSection={<IconUserCircle size={14} />}>
              Prompt
            </Tabs.Tab>
            <Tabs.Tab value="memory" leftSection={<IconBrain size={14} />}>
              Memory
            </Tabs.Tab>
            <Tabs.Tab value="library" leftSection={<IconBook2 size={14} />}>
              Lore
            </Tabs.Tab>
            <Tabs.Tab value="connection" leftSection={<IconPlugConnected size={14} />}>
              Link
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <Accordion
          variant="separated"
          radius="sm"
          multiple
          value={openSections}
          onChange={handleOpenSectionsChange}
        >
          <Accordion.Item value="connection">
            <Accordion.Control
              icon={
                connectionStatus === 'connected' ? (
                  <IconCircleCheck size={16} color="var(--theme-success)" />
                ) : (
                  <IconCircleX size={16} color="var(--theme-error)" />
                )
              }
            >
              <Text size="sm" fw={600}>
                Connection
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <ElevatedCard elevation="floor">
                  <Stack gap="xs">
                    <Select
                      label="Chat Provider"
                      allowDeselect={false}
                      value={chatProvider}
                      data={ROLEPLAY_PROVIDER_OPTIONS}
                      onChange={handleChatProviderChange}
                    />
                    <TextInput
                      label={
                        chatProvider === 'local'
                          ? 'Local Server Endpoint'
                          : 'Fallback API Base URL'
                      }
                      value={lmStudioEndpoint}
                      onChange={(event) => setLmStudioEndpoint(event.currentTarget.value)}
                      placeholder={ROLEPLAY_PROVIDER_DEFAULT_ENDPOINTS[chatProvider]}
                    />
                    {chatProvider !== 'local' ? (
                      <Group gap="xs" align="flex-end" wrap="nowrap">
                        <PasswordInput
                          label={chatProvider === 'openrouter' ? 'OpenRouter API Key' : 'API Key'}
                          value={chatApiKey}
                          onChange={(event) => setChatApiKey(event.currentTarget.value)}
                          placeholder="sk-..."
                          style={{ flex: 1 }}
                        />
                        <SwarmButton
                          tone="secondary"
                          emphasis="ghost"
                          size="xs"
                          onClick={() => setChatApiKey('')}
                          disabled={!chatApiKey.trim()}
                        >
                          Clear
                        </SwarmButton>
                      </Group>
                    ) : null}
                    <SwarmButton
                      tone="brand"
                      emphasis="solid"
                      size="xs"
                      leftSection={<IconPlugConnected size={14} />}
                      onClick={onProbeConnection}
                    >
                      Refresh Models
                    </SwarmButton>
                    <Group gap="xs">
                      <Badge size="sm" variant="light">
                        {detectedServerMode ? `Mode: ${detectedServerMode}` : 'Mode: not detected'}
                      </Badge>
                      <Badge size="sm" variant="light">
                        Models: {availableModels.length}
                      </Badge>
                      <Badge size="sm" color={selectedModelAvailable ? 'green' : 'orange'} variant="light">
                        {selectedModelAvailable ? 'Model available' : 'Selected model missing'}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {connectionMessage ||
                        (chatProvider === 'local'
                          ? 'Connect to LM Studio or another local OpenAI-compatible roleplay server.'
                          : 'Remote providers stay available as fallback. API keys are stored locally in this browser profile.')}
                    </Text>
                  </Stack>
                </ElevatedCard>

                <ElevatedCard elevation="floor">
                  <Stack gap="xs">
                    <Select
                      label="Chat Model"
                      searchable
                      value={selectedModelId || null}
                      data={availableModels.map((model) => ({
                        value: model.id,
                        label: model.id,
                      }))}
                      onChange={(value) => setSelectedModelId(value ?? '')}
                      placeholder="Choose a chat model"
                    />
                    <Select
                      label="Roleplay Model Profile"
                      allowDeselect={false}
                      value={selectedModelProfile.id}
                      data={ROLEPLAY_LOCAL_MODEL_PROFILES.map((profile) => ({
                        value: profile.id,
                        label: profile.label,
                      }))}
                      onChange={handleModelProfileChange}
                      disabled={!selectedModelId}
                    />
                    <Text size="xs" c="dimmed">
                      {selectedModelProfile.description}
                    </Text>
                    <Group gap="xs">
                      <Badge size="sm" variant="light">
                        Context: {selectedContextTokens.toLocaleString()}
                      </Badge>
                      <Badge size="sm" variant="light">
                        Budget: {selectedPromptBudgetMode}
                      </Badge>
                      <Badge size="sm" variant="light">
                        Lore cap: {selectedLoreEntryLimit}
                      </Badge>
                      <Badge size="sm" variant="light">
                        History: {selectedMaxHistoryMessages}
                      </Badge>
                    </Group>
                    <SwarmButton
                      tone="secondary"
                      emphasis="soft"
                      size="xs"
                      leftSection={<IconSend size={14} />}
                      onClick={handleTestRoleplayServerReply}
                      loading={isTestingRoleplayServer}
                      disabled={!selectedModelId || !detectedServerMode}
                    >
                      Test Roleplay Reply
                    </SwarmButton>
                    {roleplayServerTestReply ? (
                      <Text size="xs" c="dimmed">
                        {roleplayServerTestReply}
                      </Text>
                    ) : null}
                    <Checkbox
                      label="Force final user turn"
                      checked={selectedModelCompatibility.forceFinalUserTurn}
                      onChange={(event) =>
                        selectedModelId &&
                        setModelCompatibility(selectedModelId, {
                          forceFinalUserTurn: event.currentTarget.checked,
                        })
                      }
                      disabled={!selectedModelId}
                    />
                    <Checkbox
                      label="Inline system prompt"
                      checked={selectedModelCompatibility.inlineSystemPrompt}
                      onChange={(event) =>
                        selectedModelId &&
                        setModelCompatibility(selectedModelId, {
                          inlineSystemPrompt: event.currentTarget.checked,
                        })
                      }
                      disabled={!selectedModelId}
                    />
                  </Stack>
                </ElevatedCard>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="roleplay">
            <Accordion.Control icon={<IconUserCircle size={16} />}>
              <Text size="sm" fw={600}>
                Roleplay Core
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              {activeCharacter && activeSession ? (
                <Stack gap="xs">
                  <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text size="xs" fw={600}>
                            Active Session
                          </Text>
                          <Text size="xs" c="dimmed">
                            {activeSession.title}
                          </Text>
                        </Stack>
                        <SwarmButton
                          tone="brand"
                          emphasis="ghost"
                          size="xs"
                          onClick={() => setPromptInspectorOpen(true)}
                        >
                          Inspect Prompt
                        </SwarmButton>
                      </Group>

                      <Select
                        label="Persona"
                        data={personaOptions}
                        value={activeSession.activePersonaId}
                        onChange={(value) =>
                          activeSessionId && setSessionActivePersona(activeSessionId, value)
                        }
                        allowDeselect={false}
                      />

                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                          {activePersona
                            ? `${activePersona.name}: ${activePersona.description || 'No persona description yet.'}`
                            : 'No active persona selected.'}
                        </Text>
                        <SwarmButton
                          tone="brand"
                          emphasis="soft"
                          size="xs"
                          onClick={() => setPersonaModalOpen(true)}
                        >
                          Manage
                        </SwarmButton>
                      </Group>

                      <MultiSelect
                        label="Group Characters"
                        description="Characters included in this session roster. The primary character is always included."
                        data={characterOptions}
                        value={activeParticipantIds}
                        onChange={(value) =>
                          activeSessionId && setSessionParticipants(activeSessionId, value)
                        }
                        searchable
                        placeholder="Choose cast members"
                      />

                      <Select
                        label="Active Speaker"
                        description="Used for assistant avatar/name and group prompt steering."
                        data={speakerOptions}
                        value={activeSession.activeSpeakerCharacterId ?? activeCharacter.id}
                        onChange={(value) =>
                          activeSessionId && setSessionActiveSpeaker(activeSessionId, value)
                        }
                        allowDeselect={false}
                      />

                      <MultiSelect
                        label="Session Lorebooks"
                        description="These lorebooks only apply to this chat session."
                        data={lorebookOptions}
                        value={activeSession.boundLorebookIds}
                        onChange={(value) =>
                          activeSessionId && setSessionBoundLorebooks(activeSessionId, value)
                        }
                        searchable
                        placeholder="Choose lorebooks"
                      />

                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                          Character-bound lore: {activeCharacter.boundLorebookIds.length} |
                          Persona-bound lore: {activePersona?.boundLorebookIds.length ?? 0}
                        </Text>
                        <SwarmButton
                          tone="brand"
                          emphasis="soft"
                          size="xs"
                          onClick={() => setLorebookModalOpen(true)}
                        >
                          Lorebooks
                        </SwarmButton>
                      </Group>
                    </Stack>
                  </ElevatedCard>

                  <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Text size="xs" fw={600}>
                            Roleplay Preset
                          </Text>
                          <Text size="xs" c="dimmed">
                            {activeRoleplayPreset.description}
                          </Text>
                        </Stack>
                        {activeRoleplayPreset.id !== ROLEPLAY_PRESET_NONE_ID ? (
                          <Badge size="sm" variant="light">
                            {activeRoleplayPreset.shortLabel}
                          </Badge>
                        ) : null}
                      </Group>
                      <Select
                        label="Preset"
                        description="Adds SillyTavern-style prompt sections to this session."
                        data={ROLEPLAY_PRESET_STACK_OPTIONS}
                        value={activeRoleplayPreset.id}
                        onChange={handleRoleplayPresetChange}
                        allowDeselect={false}
                      />
                      {activeRoleplayPreset.id !== ROLEPLAY_PRESET_NONE_ID ? (
                        <Group gap="xs" wrap="wrap">
                          <Badge size="xs" variant="outline">
                            Temp {activeRoleplayPreset.recommendedTemperature.toFixed(2)}
                          </Badge>
                          <Badge size="xs" variant="outline">
                            Response {activeRoleplayPreset.recommendedMaxTokens}
                          </Badge>
                          <Badge size="xs" variant="outline">
                            {activeRoleplayPreset.blocks.length} sections
                          </Badge>
                        </Group>
                      ) : null}
                    </Stack>
                  </ElevatedCard>

                  <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Text size="xs" fw={600}>
                            Knowledge Bank
                          </Text>
                          <Text size="xs" c="dimmed">
                            Scoped notes are chunked, retrieved against recent chat, and inserted before lore.
                          </Text>
                        </Stack>
                        <Badge size="sm" variant="light">
                          {scopedKnowledgeDocuments.length} in scope
                        </Badge>
                      </Group>
                      <Group gap="xs" align="flex-end">
                        <TextInput
                          label="Title"
                          size="xs"
                          placeholder="Location notes"
                          value={knowledgeTitleDraft}
                          onChange={(event) => setKnowledgeTitleDraft(event.currentTarget.value)}
                          style={{ flex: 1 }}
                        />
                        <Select
                          label="Scope"
                          size="xs"
                          allowDeselect={false}
                          value={knowledgeScopeDraft}
                          data={[
                            { value: 'session', label: 'Session' },
                            { value: 'character', label: 'Character' },
                            { value: 'persona', label: 'Persona' },
                            { value: 'global', label: 'Global' },
                          ]}
                          onChange={(value) => setKnowledgeScopeDraft((value as RoleplayKnowledgeScope) ?? 'session')}
                          style={{ width: 130 }}
                        />
                        <SwarmButton
                          tone="brand"
                          emphasis="soft"
                          size="xs"
                          leftSection={<IconBook2 size={12} />}
                          onClick={handleAddKnowledgeDocument}
                          disabled={!knowledgeTitleDraft.trim() || !knowledgeContentDraft.trim()}
                        >
                          Add
                        </SwarmButton>
                      </Group>
                      <Group gap="xs">
                        <Checkbox
                          label="Vector retrieval"
                          size="xs"
                          checked={roleplayVectorRetrievalEnabled}
                          onChange={(event) =>
                            setRoleplayVectorRetrievalEnabled(event.currentTarget.checked)
                          }
                        />
                        <TextInput
                          size="xs"
                          placeholder="Embedding model ID"
                          value={roleplayEmbeddingModelId}
                          onChange={(event) => setRoleplayEmbeddingModelId(event.currentTarget.value)}
                          style={{ flex: 1, minWidth: 180 }}
                        />
                        <SwarmButton
                          tone="brand"
                          emphasis="ghost"
                          size="xs"
                          loading={isVectorizingKnowledge}
                          onClick={() => void handleVectorizeScopedKnowledge()}
                          disabled={!roleplayEmbeddingModelId.trim() || scopedKnowledgeDocuments.length === 0}
                        >
                          Vectorize
                        </SwarmButton>
                      </Group>
                      <Group gap="xs">
                        <FileButton
                          onChange={(file) => void handleImportKnowledgeDocument(file)}
                          accept=".txt,.md,.json,.csv,text/plain,text/markdown,application/json"
                        >
                          {(props) => (
                            <SwarmButton
                              {...props}
                              tone="secondary"
                              emphasis="ghost"
                              size="xs"
                              leftSection={<IconFileImport size={12} />}
                            >
                              Import Text
                            </SwarmButton>
                          )}
                        </FileButton>
                        <SwarmButton
                          tone="secondary"
                          emphasis="ghost"
                          size="xs"
                          leftSection={<IconBook2 size={12} />}
                          onClick={handleIndexCurrentChat}
                          disabled={!activeSession || activeSession.messages.length === 0}
                        >
                          Index Chat
                        </SwarmButton>
                      </Group>
                      <Textarea
                        label="Knowledge Text"
                        size="xs"
                        placeholder="Paste world notes, character history, previous events, rules, or reference material."
                        value={knowledgeContentDraft}
                        onChange={(event) => setKnowledgeContentDraft(event.currentTarget.value)}
                        minRows={3}
                        autosize
                      />
                      <TextInput
                        size="xs"
                        placeholder="Search scoped knowledge"
                        leftSection={<IconSearch size={12} />}
                        value={knowledgeSearchDraft}
                        onChange={(event) => setKnowledgeSearchDraft(event.currentTarget.value)}
                      />
                      <Stack gap={6} style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {filteredKnowledgeDocuments.map((document) => {
                          const currentVectorCount = document.chunks.filter(
                            (chunk) =>
                              chunk.embedding?.length &&
                              chunk.embeddingModel === roleplayEmbeddingModelId
                          ).length;
                          const needsVectorRefresh =
                            Boolean(roleplayVectorRetrievalEnabled && roleplayEmbeddingModelId.trim()) &&
                            currentVectorCount < document.chunks.length;
                          return (
                            <Group key={document.id} gap={6} wrap="nowrap">
                              <Checkbox
                                checked={document.enabled}
                                onChange={(event) =>
                                  updateKnowledgeDocument(document.id, {
                                    enabled: event.currentTarget.checked,
                                  })
                                }
                                size="xs"
                                aria-label={`Toggle ${document.title}`}
                              />
                              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                                <Text size="xs" fw={600} truncate>
                                  {document.title}
                                </Text>
                                <Text size="xs" c="dimmed" truncate>
                                  {document.scope} | {document.chunks.length} chunks |{' '}
                                  {currentVectorCount} vectors
                                  {needsVectorRefresh ? ' | needs vectors' : ''}
                                </Text>
                              </Stack>
                              <ActionIcon
                                variant="subtle"
                                size="xs"
                                onClick={() => handleEditKnowledgeDocument(document)}
                                aria-label={`Edit ${document.title}`}
                              >
                                <IconEdit size={12} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                size="xs"
                                color="red"
                                onClick={() => removeKnowledgeDocument(document.id)}
                                aria-label={`Remove ${document.title}`}
                              >
                                <IconTrash size={12} />
                              </ActionIcon>
                            </Group>
                          );
                        })}
                        {scopedKnowledgeDocuments.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            No scoped knowledge yet.
                          </Text>
                        ) : null}
                        {scopedKnowledgeDocuments.length > 0 &&
                        filteredKnowledgeDocuments.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            No scoped knowledge matches this search.
                          </Text>
                        ) : null}
                      </Stack>
                      {editingKnowledgeDocument ? (
                        <Stack
                          gap="xs"
                          p="xs"
                          style={{
                            border: '1px solid var(--theme-border-subtle)',
                            borderRadius: 8,
                          }}
                        >
                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                              <Text size="xs" fw={600} truncate>
                                Edit Knowledge
                              </Text>
                              <Text size="xs" c="dimmed" truncate>
                                {editingKnowledgeDocument.scope} | {editingKnowledgeDocument.sourceType} |{' '}
                                {editingKnowledgeDocument.chunks.length} chunks
                              </Text>
                            </Stack>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              onClick={clearKnowledgeEditDraft}
                              aria-label="Close knowledge editor"
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          </Group>
                          <TextInput
                            label="Title"
                            size="xs"
                            value={knowledgeEditTitleDraft}
                            onChange={(event) => setKnowledgeEditTitleDraft(event.currentTarget.value)}
                          />
                          <TextInput
                            label="Description"
                            size="xs"
                            value={knowledgeEditDescriptionDraft}
                            onChange={(event) =>
                              setKnowledgeEditDescriptionDraft(event.currentTarget.value)
                            }
                          />
                          <Textarea
                            label="Knowledge Text"
                            size="xs"
                            value={knowledgeEditContentDraft}
                            onChange={(event) => setKnowledgeEditContentDraft(event.currentTarget.value)}
                            minRows={4}
                            autosize
                          />
                          <Group justify="flex-end" gap="xs">
                            <SwarmButton
                              tone="secondary"
                              emphasis="ghost"
                              size="xs"
                              leftSection={<IconX size={12} />}
                              onClick={clearKnowledgeEditDraft}
                            >
                              Cancel
                            </SwarmButton>
                            <SwarmButton
                              tone="brand"
                              emphasis="soft"
                              size="xs"
                              leftSection={<IconDeviceFloppy size={12} />}
                              onClick={handleSaveKnowledgeDocumentEdit}
                              disabled={
                                !knowledgeEditTitleDraft.trim() ||
                                !knowledgeEditContentDraft.trim()
                              }
                            >
                              Save
                            </SwarmButton>
                          </Group>
                        </Stack>
                      ) : null}
                    </Stack>
                  </ElevatedCard>

                  <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Text size="xs" fw={600}>
                            Roleplay Scripts
                          </Text>
                          <Text size="xs" c="dimmed">
                            Slash commands, quick replies, variables, and prompt injections for this chat.
                          </Text>
                        </Stack>
                        <Badge size="sm" variant="light">
                          {activeSession.promptInjections.length} injects
                        </Badge>
                      </Group>
                      <Group gap="xs" align="flex-end">
                        <TextInput
                          label="Quick Reply"
                          size="xs"
                          placeholder="Button label"
                          value={quickReplyLabelDraft}
                          onChange={(event) => setQuickReplyLabelDraft(event.currentTarget.value)}
                          style={{ flex: 1 }}
                        />
                        <SwarmButton
                          tone="brand"
                          emphasis="soft"
                          size="xs"
                          onClick={handleAddQuickReply}
                          disabled={!quickReplyLabelDraft.trim() || !quickReplyScriptDraft.trim()}
                        >
                          Add
                        </SwarmButton>
                      </Group>
                      <Textarea
                        label="Quick Reply Script"
                        size="xs"
                        placeholder="/sendas user I look around.\n/continue"
                        value={quickReplyScriptDraft}
                        onChange={(event) => setQuickReplyScriptDraft(event.currentTarget.value)}
                        minRows={2}
                        autosize
                      />
                      <Stack gap={6}>
                        {roleplayQuickReplies.map((reply) => (
                          <Group key={reply.id} gap={6} wrap="nowrap">
                            <Checkbox
                              checked={reply.enabled}
                              onChange={(event) =>
                                updateQuickReply(reply.id, { enabled: event.currentTarget.checked })
                              }
                              size="xs"
                              aria-label={`Toggle ${reply.label}`}
                            />
                            <Text size="xs" fw={600} style={{ flex: 1 }} truncate>
                              {reply.label}
                            </Text>
                            <Text size="xs" c="dimmed" style={{ flex: 2 }} truncate>
                              {reply.script}
                            </Text>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              onClick={() => handleEditQuickReply(reply)}
                              aria-label={`Edit ${reply.label}`}
                            >
                              <IconEdit size={12} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              color="red"
                              onClick={() => removeQuickReply(reply.id)}
                              aria-label={`Remove ${reply.label}`}
                            >
                              <IconTrash size={12} />
                            </ActionIcon>
                          </Group>
                        ))}
                        {roleplayQuickReplies.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            No quick replies yet.
                          </Text>
                        ) : null}
                      </Stack>
                      {editingQuickReply ? (
                        <Stack
                          gap="xs"
                          p="xs"
                          style={{
                            border: '1px solid var(--theme-border-subtle)',
                            borderRadius: 8,
                          }}
                        >
                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                              <Text size="xs" fw={600} truncate>
                                Edit Quick Reply
                              </Text>
                              <Text size="xs" c="dimmed" truncate>
                                Updates the button shown under the chat.
                              </Text>
                            </Stack>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              onClick={clearQuickReplyEditDraft}
                              aria-label="Close quick reply editor"
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          </Group>
                          <TextInput
                            label="Label"
                            size="xs"
                            value={quickReplyEditLabelDraft}
                            onChange={(event) => setQuickReplyEditLabelDraft(event.currentTarget.value)}
                          />
                          <Textarea
                            label="Script"
                            size="xs"
                            value={quickReplyEditScriptDraft}
                            onChange={(event) => setQuickReplyEditScriptDraft(event.currentTarget.value)}
                            minRows={3}
                            autosize
                          />
                          <Group justify="flex-end" gap="xs">
                            <SwarmButton
                              tone="secondary"
                              emphasis="ghost"
                              size="xs"
                              leftSection={<IconX size={12} />}
                              onClick={clearQuickReplyEditDraft}
                            >
                              Cancel
                            </SwarmButton>
                            <SwarmButton
                              tone="brand"
                              emphasis="soft"
                              size="xs"
                              leftSection={<IconDeviceFloppy size={12} />}
                              onClick={handleSaveQuickReplyEdit}
                              disabled={
                                !quickReplyEditLabelDraft.trim() ||
                                !quickReplyEditScriptDraft.trim()
                              }
                            >
                              Save
                            </SwarmButton>
                          </Group>
                        </Stack>
                      ) : null}
                      {activeSession.promptInjections.length > 0 ? (
                        <Stack gap={6}>
                          <Group justify="space-between">
                            <Text size="xs" fw={600}>
                              Active Injections
                            </Text>
                            <SwarmButton
                              tone="danger"
                              emphasis="ghost"
                              size="xs"
                              onClick={() => activeSessionId && clearPromptInjections(activeSessionId)}
                            >
                              Clear
                            </SwarmButton>
                          </Group>
                          {activeSession.promptInjections.map((injection) => (
                            <Group key={injection.id} gap={6} wrap="nowrap">
                              <Badge size="xs" variant="outline">
                                {injection.position}
                              </Badge>
                              <Text size="xs" fw={600} style={{ flex: 1 }} truncate>
                                {injection.label}
                              </Text>
                              <ActionIcon
                                variant="subtle"
                                size="xs"
                                color="red"
                                onClick={() =>
                                  activeSessionId && removePromptInjection(activeSessionId, injection.id)
                                }
                                aria-label={`Remove ${injection.label}`}
                              >
                                <IconTrash size={12} />
                              </ActionIcon>
                            </Group>
                          ))}
                        </Stack>
                      ) : null}
                      {roleplayScriptTrace[0] ? (
                        <Text size="xs" c={roleplayScriptTrace[0].status === 'success' ? 'dimmed' : 'red'}>
                          Last script: {roleplayScriptTrace[0].message}
                        </Text>
                      ) : null}
                    </Stack>
                  </ElevatedCard>

                  <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                      <Text size="xs" fw={600}>
                        Prompt Stack
                      </Text>
                      <Stack gap={6} className="roleplay-prompt-block-list">
                        {promptBlocks.map((block, index) => (
                          <Stack key={block.id} gap={6}>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                              <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                                <Checkbox
                                  checked={block.enabled}
                                  onChange={(event) =>
                                    updatePromptBlockSetting(block.id, {
                                      enabled: event.currentTarget.checked,
                                    })
                                  }
                                  size="xs"
                                  aria-label={`Toggle ${block.label}`}
                                />
                                <Stack gap={2} style={{ minWidth: 0 }}>
                                  <Text size="xs" fw={600} truncate>
                                    {block.label}
                                  </Text>
                                  <Group gap={4} wrap="wrap">
                                    <Badge size="xs" variant="light">
                                      {block.role}
                                    </Badge>
                                    <Badge size="xs" variant="outline">
                                      {block.position}
                                      {block.depth !== null ? `:${block.depth}` : ''}
                                    </Badge>
                                    <Badge size="xs" variant="dot">
                                      {block.source}
                                    </Badge>
                                    <Text size="xs" c="dimmed">
                                      ~{block.tokenEstimate}
                                    </Text>
                                  </Group>
                                </Stack>
                              </Group>
                              <Group gap={2} wrap="nowrap">
                                <ActionIcon
                                  variant="subtle"
                                  size="xs"
                                  onClick={() => movePromptBlock(block.id, -1)}
                                  disabled={index === 0}
                                  aria-label={`Move ${block.label} up`}
                                >
                                  <IconArrowUp size={12} />
                                </ActionIcon>
                                <ActionIcon
                                  variant="subtle"
                                  size="xs"
                                  onClick={() => movePromptBlock(block.id, 1)}
                                  disabled={index === promptBlocks.length - 1}
                                  aria-label={`Move ${block.label} down`}
                                >
                                  <IconArrowDown size={12} />
                                </ActionIcon>
                              </Group>
                            </Group>
                            <MultiSelect
                              label="Triggers"
                              size="xs"
                              data={PROMPT_TRIGGER_OPTIONS}
                              value={block.triggerModes}
                              onChange={(value) =>
                                updatePromptBlockSetting(block.id, {
                                  triggerModes:
                                    value.length > 0
                                      ? (value as RoleplayGenerationMode[])
                                      : ['normal'],
                                })
                              }
                              comboboxProps={{ withinPortal: true }}
                            />
                          </Stack>
                        ))}
                        {promptBlocks.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            No active prompt blocks.
                          </Text>
                        ) : null}
                      </Stack>
                      <Textarea
                        label="Main Prompt Override"
                        description="Leave blank to use the character's active system prompt."
                        value={activePromptStack.mainPromptOverride}
                        onChange={(event) =>
                          activeSessionId &&
                          updateSessionPromptStack(activeSessionId, {
                            mainPromptOverride: event.currentTarget.value,
                          })
                        }
                        minRows={3}
                        autosize
                      />
                      <Textarea
                        label="Author Note"
                        description="Placed before the live history."
                        value={activePromptStack.authorNote}
                        onChange={(event) =>
                          activeSessionId &&
                          updateSessionPromptStack(activeSessionId, {
                            authorNote: event.currentTarget.value,
                          })
                        }
                        minRows={2}
                        autosize
                      />
                      <Textarea
                        label="Post-History Note"
                        description="Appended after the live history for steering."
                        value={activePromptStack.postHistoryNote}
                        onChange={(event) =>
                          activeSessionId &&
                          updateSessionPromptStack(activeSessionId, {
                            postHistoryNote: event.currentTarget.value,
                          })
                        }
                        minRows={2}
                        autosize
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Checkbox
                          label="Include Persona"
                          checked={activePromptStack.includePersona}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includePersona: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Character"
                          checked={activePromptStack.includeCharacterDefinition}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeCharacterDefinition: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Scenario"
                          checked={activePromptStack.includeScenario}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeScenario: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Examples"
                          checked={activePromptStack.includeExampleMessages}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeExampleMessages: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Memory"
                          checked={activePromptStack.includeMemory}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeMemory: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Lore"
                          checked={activePromptStack.includeLore}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeLore: event.currentTarget.checked,
                            })
                          }
                        />
                      </div>
                    </Stack>
                  </ElevatedCard>
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Select a character session to configure its persona, lore, and prompt stack.
                </Text>
              )}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="generation">
            <Accordion.Control icon={<IconPhotoSpark size={16} />}>
              <Text size="sm" fw={600}>
                Generation
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <ElevatedCard elevation="floor">
                  <Stack gap="xs">
                    <Select
                      label="Scene Model"
                      searchable
                      value={effectiveModel || null}
                      data={(sdModels ?? []).map((model) => ({
                        value: model.name,
                        label: model.title || model.name,
                      }))}
                      onChange={(value) => setImageModelId(value ?? '')}
                      placeholder={loadingModels ? 'Loading models...' : 'Choose an image model'}
                    />
                    <Group grow>
                      <SwarmButton
                        tone="brand"
                        emphasis="soft"
                        size="xs"
                        onClick={handleLoadModel}
                        loading={isLoadingModel}
                        disabled={!effectiveModel}
                      >
                        Load Model
                      </SwarmButton>
                      <SwarmButton
                        tone="secondary"
                        emphasis="ghost"
                        size="xs"
                        onClick={handleEjectImageModel}
                        loading={isEjectingImageModel}
                        disabled={!effectiveModel}
                      >
                        Unload
                      </SwarmButton>
                    </Group>
                    {isLoadingModel ? (
                      <Stack gap={4}>
                        <Progress value={modelLoadProgress * 100} size="sm" />
                        <Text size="xs" c="dimmed">
                          {modelLoadProgressEstimated
                            ? `Loading ${loadingModelName || effectiveModel || 'image model'}...`
                            : `Loading ${loadingModelName || effectiveModel || 'image model'} (${Math.round(modelLoadProgress * 100)}%)`}
                        </Text>
                      </Stack>
                    ) : null}
                    {modelLoadError ? (
                      <Text size="xs" c="red">
                        {modelLoadError}
                      </Text>
                    ) : null}
                    <Text size="xs" c="dimmed">
                      {effectiveModel && modelNamesMatch(effectiveModel, imageModelId)
                        ? `Using ${effectiveModel}`
                        : 'Uses the character image model first, then the shared image model.'}
                    </Text>
                  </Stack>
                </ElevatedCard>

                <ElevatedCard elevation="floor">
                  <Stack gap="xs">
                    <Text size="xs" fw={600}>
                      Stage Controls
                    </Text>
                    <Textarea
                      label="Background"
                      description="Reusable location or backdrop prompt for this chat."
                      value={activeSession?.sceneBackgroundPrompt ?? ''}
                      onChange={(event) =>
                        activeSessionId &&
                        updateSessionVisualState(activeSessionId, {
                          sceneBackgroundPrompt: event.currentTarget.value,
                        })
                      }
                      placeholder="moonlit archive, rain on stained glass, candlelit table..."
                      minRows={2}
                      autosize
                    />
                    <Textarea
                      label="Ambience"
                      description="Mood, sound, lighting, weather, or atmosphere."
                      value={activeSession?.ambiencePrompt ?? ''}
                      onChange={(event) =>
                        activeSessionId &&
                        updateSessionVisualState(activeSessionId, {
                          ambiencePrompt: event.currentTarget.value,
                        })
                      }
                      placeholder="low fireplace crackle, tense quiet, warm amber light..."
                      minRows={2}
                      autosize
                    />
                    <TextInput
                      label="Active Expression"
                      description="Sprite/expression cue for the current speaker."
                      value={activeSession?.activeExpression ?? ''}
                      onChange={(event) =>
                        activeSessionId &&
                        updateSessionVisualState(activeSessionId, {
                          activeExpression: event.currentTarget.value,
                        })
                      }
                      placeholder="soft smile, suspicious glance, battle-ready stance"
                    />
                    {expressionSpriteOptions.length > 0 ? (
                      <Stack gap={6}>
                        <Group gap={6}>
                          {expressionSpriteOptions.map((sprite) => (
                            <SwarmButton
                              key={sprite.id}
                              tone={
                                activeExpressionSprite?.id === sprite.id ? 'brand' : 'secondary'
                              }
                              emphasis={
                                activeExpressionSprite?.id === sprite.id ? 'solid' : 'soft'
                              }
                              size="xs"
                              onClick={() =>
                                activeSessionId &&
                                updateSessionVisualState(activeSessionId, {
                                  activeExpression: sprite.label,
                                })
                              }
                            >
                              {sprite.label}
                            </SwarmButton>
                          ))}
                        </Group>
                        {activeExpressionSprite ? (
                          <Group gap="xs" align="flex-start" wrap="nowrap">
                            {activeExpressionSprite.imageUrl ? (
                              <div className="roleplay-expression-stage-preview">
                                <img
                                  src={resolveAssetUrl(activeExpressionSprite.imageUrl)}
                                  alt={activeExpressionSprite.label}
                                />
                              </div>
                            ) : null}
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                              {activeExpressionSprite.prompt || activeExpressionSprite.label}
                            </Text>
                          </Group>
                        ) : null}
                      </Stack>
                    ) : null}
                    <Textarea
                      label="Scene Anchor"
                      description="Persistent room, location layout, or recurring scene card."
                      value={activeVisualState.sceneAnchor}
                      onChange={(event) => updateVisualStateField('sceneAnchor', event.currentTarget.value)}
                      placeholder="private cyberpunk apartment, rain-streaked window, CRT desk..."
                      minRows={2}
                      autosize
                    />
                    <Group grow>
                      <TextInput
                        label="Location"
                        value={activeVisualState.location}
                        onChange={(event) => updateVisualStateField('location', event.currentTarget.value)}
                        placeholder="neon alley, ship cabin, clinic..."
                      />
                      <TextInput
                        label="Time"
                        value={activeVisualState.timeOfDay}
                        onChange={(event) => updateVisualStateField('timeOfDay', event.currentTarget.value)}
                        placeholder="late night, dawn, stormy evening..."
                      />
                    </Group>
                    <Textarea
                      label="Lighting"
                      value={activeVisualState.lighting}
                      onChange={(event) => updateVisualStateField('lighting', event.currentTarget.value)}
                      placeholder="blue/pink neon, warm desk lamp, wet reflections..."
                      minRows={2}
                      autosize
                    />
                    <Textarea
                      label="Persistent Objects"
                      value={activeVisualState.persistentObjects}
                      onChange={(event) => updateVisualStateField('persistentObjects', event.currentTarget.value)}
                      placeholder="black umbrella, encrypted briefcase, cracked glasses..."
                      minRows={2}
                      autosize
                    />
                    <Textarea
                      label="Scene Negative Prompt"
                      value={activeVisualState.negativePrompt}
                      onChange={(event) => updateVisualStateField('negativePrompt', event.currentTarget.value)}
                      placeholder="wrong location, different room layout, missing prop..."
                      minRows={2}
                      autosize
                    />
                    <Textarea
                      label={`${activeSpeakerCharacter?.name ?? 'Speaker'} Attire`}
                      value={activeSpeakerVisualState.attire}
                      onChange={(event) => updateActiveSpeakerVisualState('attire', event.currentTarget.value)}
                      placeholder="same black turtleneck, charcoal coat, leather gloves..."
                      minRows={2}
                      autosize
                    />
                    <Group grow>
                      <TextInput
                        label="Condition"
                        value={activeSpeakerVisualState.condition}
                        onChange={(event) => updateActiveSpeakerVisualState('condition', event.currentTarget.value)}
                        placeholder="coat damp, small cut on cheek..."
                      />
                      <TextInput
                        label="Mood"
                        value={activeSpeakerVisualState.mood}
                        onChange={(event) => updateActiveSpeakerVisualState('mood', event.currentTarget.value)}
                        placeholder="guarded, suspicious..."
                      />
                    </Group>
                    <Textarea
                      label="Pose Cue"
                      value={activeSpeakerVisualState.poseCue}
                      onChange={(event) => updateActiveSpeakerVisualState('poseCue', event.currentTarget.value)}
                      placeholder="leaning against doorway, hand near pendant..."
                      minRows={2}
                      autosize
                    />
                    <Select
                      label="Reference Image"
                      value={activeSpeakerVisualState.referenceImageId}
                      onChange={(value) => updateActiveSpeakerVisualState('referenceImageId', value)}
                      data={referenceImageOptions}
                      placeholder="Use primary reference or avatar"
                      clearable
                      disabled={referenceImageOptions.length === 0}
                    />
                    <TextInput
                      label="Chat Background Image"
                      description="Optional image URL for the chat stage."
                      value={activeSession?.chatBackgroundImage ?? ''}
                      onChange={(event) =>
                        activeSessionId &&
                        updateSessionVisualState(activeSessionId, {
                          chatBackgroundImage: event.currentTarget.value.trim() || null,
                        })
                      }
                      placeholder="https://... or /View/local-image.png"
                    />
                  </Stack>
                </ElevatedCard>

                <ElevatedCard elevation="floor">
                  <Stack gap="xs">
                    <Text size="xs" fw={600}>
                      Scene Settings
                    </Text>
                    <Text size="xs" c="dimmed">
                      Steps: {imageSteps}
                    </Text>
                    <Slider
                      min={10}
                      max={60}
                      step={1}
                      marks={STEPS_MARKS}
                      value={imageSteps}
                      onChange={setImageSteps}
                    />
                    <Text size="xs" c="dimmed">
                      CFG: {imageCfgScale}
                    </Text>
                    <Slider
                      min={1}
                      max={20}
                      step={0.5}
                      marks={CFG_MARKS}
                      value={imageCfgScale}
                      onChange={setImageCfgScale}
                    />
                    <Group grow>
                      <TextInput
                        label="Width"
                        value={String(imageWidth)}
                        onChange={(event) => {
                          const nextWidth = Number(event.currentTarget.value) || imageWidth;
                          setImageDimensions(nextWidth, imageHeight);
                        }}
                      />
                      <TextInput
                        label="Height"
                        value={String(imageHeight)}
                        onChange={(event) => {
                          const nextHeight = Number(event.currentTarget.value) || imageHeight;
                          setImageDimensions(imageWidth, nextHeight);
                        }}
                      />
                    </Group>
                    <Checkbox
                      label="Override CLIP stop-at-layer"
                      checked={clipOverride}
                      onChange={(event) => {
                        const enabled = event.currentTarget.checked;
                        setClipOverride(enabled);
                        setImageClipStopAtLayer(enabled ? -2 : null);
                      }}
                    />
                    {clipOverride ? (
                      <Slider
                        min={-24}
                        max={-1}
                        step={1}
                        value={imageClipStopAtLayer ?? -2}
                        onChange={setImageClipStopAtLayer}
                      />
                    ) : null}
                    <Checkbox
                      label="Enhance roleplay image prompts"
                      description="Uses the prompt enhancer after continuity blocks are compiled."
                      checked={roleplayImageEnhanceEnabled}
                      onChange={(event) =>
                        setRoleplayImageEnhanceEnabled(event.currentTarget.checked)
                      }
                      disabled={!promptEnhancer.enabled}
                    />
                    {lastImagePromptPreview ? (
                      <Stack
                        gap={6}
                        p="xs"
                        style={{
                          border: '1px solid var(--mantine-color-gray-7)',
                          borderRadius: 6,
                        }}
                      >
                        <Group justify="space-between" gap="xs">
                          <Text size="xs" fw={600}>
                            Last Image Prompt
                          </Text>
                          <Group gap={6}>
                            <Badge
                              size="xs"
                              color={lastImagePromptPreview.enhanced ? 'violet' : 'gray'}
                              variant="light"
                            >
                              {lastImagePromptPreview.enhanced ? 'Enhanced' : 'Compiled'}
                            </Badge>
                            <Badge size="xs" color="blue" variant="light">
                              {lastImagePromptPreview.formatPreset}
                            </Badge>
                          </Group>
                        </Group>
                        <Text size="xs" c="dimmed">
                          Model: {lastImagePromptPreview.model || effectiveModel || 'Not set'} | Source:{' '}
                          {lastImagePromptPreview.scenePromptSource}
                        </Text>
                        {lastImagePromptPreview.referenceImageLabels.length > 0 ? (
                          <Text size="xs" c="dimmed">
                            References: {lastImagePromptPreview.referenceImageLabels.join(', ')}
                          </Text>
                        ) : null}
                        {lastImagePromptPreview.sceneSummary ? (
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                            {lastImagePromptPreview.sceneSummary}
                          </Text>
                        ) : null}
                        <Textarea
                          label="Prompt"
                          value={lastImagePromptPreview.prompt}
                          readOnly
                          autosize
                          minRows={3}
                        />
                        <Textarea
                          label="Negative"
                          value={lastImagePromptPreview.negativePrompt}
                          readOnly
                          autosize
                          minRows={2}
                        />
                      </Stack>
                    ) : null}
                    <SwarmButton
                      tone="brand"
                      emphasis="solid"
                      size="xs"
                      leftSection={<IconSparkles size={14} />}
                      onClick={() => void handleGenerateScene()}
                      disabled={!activeSession || messages.length === 0 || isGeneratingImage}
                      loading={isGeneratingImage}
                    >
                      Generate Scene
                    </SwarmButton>
                    <Group grow>
                      <SwarmButton
                        tone="primary"
                        emphasis="soft"
                        size="xs"
                        leftSection={<IconSend size={14} />}
                        onClick={() => void handleSendSceneToGenerate()}
                        disabled={!activeSession || messages.length === 0}
                      >
                        Send To Generate
                      </SwarmButton>
                      <SwarmButton
                        tone="secondary"
                        emphasis="soft"
                        size="xs"
                        onClick={() => void handleQueueScenePack()}
                        disabled={!activeSession || messages.length === 0}
                      >
                        Queue Pack
                      </SwarmButton>
                    </Group>
                    <SwarmButton
                      tone="secondary"
                      emphasis="ghost"
                      size="xs"
                      onClick={() => void handleSaveSceneBrief()}
                      disabled={!activeSession || messages.length === 0}
                    >
                      Save Scene Brief
                    </SwarmButton>
                  </Stack>
                </ElevatedCard>

                <ElevatedCard elevation="floor">
                  <Stack gap="xs">
                    <Text size="xs" fw={600}>
                      Chat Output
                    </Text>
                    <Text size="xs" c="dimmed">
                      Temperature: {chatTemperature.toFixed(2)}
                    </Text>
                    <Slider
                      min={0.2}
                      max={1.4}
                      step={0.05}
                      value={chatTemperature}
                      onChange={setChatTemperature}
                    />
                    <Select
                      label="Response Length"
                      allowDeselect={false}
                      value={responseLengthPreset ?? 'medium'}
                      data={[
                        { value: 'short', label: 'Short' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'long', label: 'Long' },
                      ]}
                      onChange={(value) => {
                        if (!value) {
                          return;
                        }
                        setChatMaxTokens(RESPONSE_LENGTH_TOKENS[value as ResponseLengthPreset]);
                      }}
                    />
                  </Stack>
                </ElevatedCard>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="memory">
            <Accordion.Control icon={<IconBrain size={16} />}>
              <Text size="sm" fw={600}>
                Memory
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              {activeSession ? (
                <Stack gap="xs">
                  <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text size="xs" fw={600}>
                            Session Memory
                          </Text>
                          <Text size="xs" c="dimmed">
                            Refreshes the rolling summary and durable facts for this chat.
                          </Text>
                        </Stack>
                        <SwarmButton
                          tone="brand"
                          emphasis="soft"
                          size="xs"
                          onClick={() => void handleRefreshMemory()}
                          loading={activeSession.memoryStatus === 'updating'}
                          disabled={messages.length === 0}
                        >
                          Refresh
                        </SwarmButton>
                      </Group>

                      <Group gap="xs">
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: memoryStatusColor,
                            flexShrink: 0,
                            marginTop: 4,
                          }}
                        />
                        <Stack gap={2}>
                          <Text size="xs" fw={500}>
                            Status: {memoryStatusLabel}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Last updated: {memoryLastUpdatedText}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Turns since refresh: {activeSession.messagesSinceMemoryRefresh}
                          </Text>
                        </Stack>
                      </Group>

                      <Textarea
                        label="Rolling Summary"
                        value={activeSession.conversationSummary}
                        readOnly
                        minRows={4}
                        autosize
                      />
                      {activeSession.continuity.relationshipSummary ||
                      activeSession.continuity.currentLocation ||
                      activeSession.continuity.currentSituation ||
                      activeSession.continuity.openThreads.length > 0 ? (
                        <Stack gap="xs">
                          <Textarea
                            label="Relationship"
                            value={activeSession.continuity.relationshipSummary}
                            readOnly
                            minRows={2}
                            autosize
                          />
                          <Textarea
                            label="Current Location"
                            value={activeSession.continuity.currentLocation}
                            readOnly
                            minRows={2}
                            autosize
                          />
                          <Textarea
                            label="Current Situation"
                            value={activeSession.continuity.currentSituation}
                            readOnly
                            minRows={2}
                            autosize
                          />
                        </Stack>
                      ) : null}

                      {activeSession.continuity.openThreads.length > 0 ? (
                        <Stack gap="xs">
                          <Text size="xs" fw={600}>
                            Open Threads
                          </Text>
                          {activeSession.continuity.openThreads.map((thread, index) => (
                            <Group key={`${thread}-${index}`} wrap="nowrap" align="flex-start">
                              <Text
                                size="xs"
                                c="dimmed"
                                style={{ flex: 1, whiteSpace: 'pre-wrap' }}
                              >
                                {thread}
                              </Text>
                              <Group gap={4} wrap="nowrap">
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  disabled={index === 0}
                                  onClick={() =>
                                    activeSessionId &&
                                    moveContinuityThread(activeSessionId, index, -1)
                                  }
                                >
                                  ↑
                                </ActionIcon>
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  disabled={
                                    index === activeSession.continuity.openThreads.length - 1
                                  }
                                  onClick={() =>
                                    activeSessionId &&
                                    moveContinuityThread(activeSessionId, index, 1)
                                  }
                                >
                                  ↓
                                </ActionIcon>
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  size="sm"
                                  onClick={() =>
                                    activeSessionId &&
                                    removeContinuityThread(activeSessionId, index)
                                  }
                                >
                                  <IconTrash size={12} />
                                </ActionIcon>
                              </Group>
                            </Group>
                          ))}
                        </Stack>
                      ) : null}
                    </Stack>
                  </ElevatedCard>

                  <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="xs" fw={600}>
                          Remembered Facts
                        </Text>
                        <Text size="xs" c="dimmed">
                          {activeSession.memoryFacts.length} / {ROLEPLAY_MAX_MEMORY_FACTS}
                        </Text>
                      </Group>
                      <Group align="flex-end" wrap="nowrap">
                        <TextInput
                          style={{ flex: 1 }}
                          label="Add Fact"
                          value={newMemoryFactText}
                          onChange={(event) => setNewMemoryFactText(event.currentTarget.value)}
                          placeholder="Add a durable detail to remember"
                        />
                        <ActionIcon
                          variant="light"
                          color="blue"
                          size="md"
                          onClick={handleAddMemoryFact}
                          disabled={
                            !newMemoryFactText.trim() ||
                            activeSession.memoryFacts.length >= ROLEPLAY_MAX_MEMORY_FACTS
                          }
                        >
                          +
                        </ActionIcon>
                      </Group>
                      {activeSession.memoryFacts.map((fact) => (
                        <Group key={fact.id} align="flex-end" wrap="nowrap">
                          <Checkbox
                            checked={fact.pinned}
                            onChange={() =>
                              activeSessionId && toggleMemoryFactPinned(activeSessionId, fact.id)
                            }
                            label={<Text size="xs">Pinned</Text>}
                          />
                          <TextInput
                            style={{ flex: 1 }}
                            value={fact.text}
                            onChange={(event) =>
                              activeSessionId &&
                              updateMemoryFact(activeSessionId, fact.id, event.currentTarget.value)
                            }
                          />
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="md"
                            onClick={() =>
                              activeSessionId && removeMemoryFact(activeSessionId, fact.id)
                            }
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      ))}
                      {activeSession.memoryFacts.length === 0 ? (
                        <Text size="xs" c="dimmed">
                          No remembered facts yet.
                        </Text>
                      ) : null}
                    </Stack>
                  </ElevatedCard>
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Choose a chat session to inspect and refresh its memory.
                </Text>
              )}
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="library">
            <Accordion.Control icon={<IconBook2 size={16} />}>
              <Text size="sm" fw={600}>
                Library
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <ElevatedCard elevation="floor">
                  <Stack gap="xs">
                    <Text size="xs" fw={600}>
                      Import / Export
                    </Text>
                    <SwarmButton
                      tone="brand"
                      emphasis="soft"
                      size="xs"
                      leftSection={<IconDownload size={14} />}
                      onClick={handleExportBundle}
                    >
                      Export Roleplay Bundle
                    </SwarmButton>
                    <FileButton onChange={handleImportBundle} accept="application/json">
                      {(props) => (
                        <SwarmButton
                          {...props}
                          tone="secondary"
                          emphasis="ghost"
                          size="xs"
                          leftSection={<IconFileImport size={14} />}
                        >
                          Import Roleplay Bundle
                        </SwarmButton>
                      )}
                    </FileButton>
                    <Text size="xs" c="dimmed">
                      Bundles include characters, personas, lorebooks, and chat sessions.
                    </Text>
                  </Stack>
                </ElevatedCard>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>

      <PersonaManagerModal opened={personaModalOpen} onClose={() => setPersonaModalOpen(false)} />
      <LorebookManagerModal
        opened={lorebookModalOpen}
        onClose={() => setLorebookModalOpen(false)}
      />
      <PromptInspectorModal
        opened={promptInspectorOpen}
        onClose={() => setPromptInspectorOpen(false)}
        compiledPrompt={compiledPrompt}
      />
    </>
  );
}
