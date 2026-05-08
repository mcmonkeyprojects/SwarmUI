import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ActionIcon,
  Badge,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconBrain,
  IconEdit,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconArrowUp,
  IconArrowDown,
  IconBookmark,
  IconGitBranch,
  IconGitCompare,
  IconPlayerStop,
  IconPhotoPlus,
  IconRefresh,
  IconSend,
  IconSparkles,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import { compileRoleplayPrompt } from '../../features/roleplay/roleplayPromptCompiler';
import {
  createRoleplayCompatibilityFromProfile,
  getRoleplayLocalModelProfile,
} from '../../data/roleplayLocalModelProfiles';
import {
  ROLEPLAY_MEMORY_REFRESH_THRESHOLD,
  formatMessagesForMemoryRefresh,
  getMessagesForMemoryRefresh,
  mergeGeneratedMemoryFacts,
} from '../../features/roleplay/roleplayMemory';
import {
  buildCharacterPersonalityBlock,
  getEffectiveSystemPrompt,
} from '../../features/roleplay/roleplayCharacterPrompting';
import {
  generateRoleplayMemory,
  parseSceneTag,
  streamRoleplayChat,
} from '../../services/roleplayChatService';
import {
  cancelScheduledLocalTextModelUnload,
  scheduleLocalTextModelUnload,
  type LocalTextModelResidency,
} from '../../services/localModelVramCoordinator';
import {
  getLastAssistantMessage,
  getLastUserMessage,
  getMessageContent,
  getMessageSceneImageUrl,
  getMessageSuggestedImagePrompt,
} from '../../features/roleplay/roleplayMessageUtils';
import { useRoleplayStore } from '../../stores/roleplayStore';
import { recordDebugTrace } from '../../utils/debugTrace';
import { logger } from '../../utils/logger';
import type {
  ChatMessage,
  CompiledRoleplayPrompt,
  RoleplayCharacter,
  RoleplayChatBranch,
  RoleplayChatCheckpoint,
  RoleplayChatSession,
  RoleplayGenerationMode,
  RoleplayMemoryFact,
} from '../../types/roleplay';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { CharacterAvatar } from './CharacterAvatar';

interface ChatPanelProps {
  onRegenerateScene?: () => void;
  onGenerateSceneWithPrompt?: (prompt: string) => void;
}

function getGreetingOptions(character: RoleplayCharacter): string[] {
  const greetings = [
    character.openingChatMessage,
    character.openingRoleplayMessage,
    ...character.alternateGreetings,
  ]
    .map((greeting) => greeting.trim())
    .filter((greeting) => greeting);

  return [...new Set(greetings)];
}

function getLatestSessionMessages(sessionId: string): ChatMessage[] {
  return (
    useRoleplayStore.getState().chatSessions.find((session) => session.id === sessionId)
      ?.messages ?? []
  );
}

function expandGreetingMacros(
  greeting: string,
  character: RoleplayCharacter,
  persona?: { name?: string; description?: string; notes?: string } | null
): string {
  return greeting
    .replaceAll('{{char}}', character.name)
    .replaceAll('{{user}}', persona?.name || 'User')
    .replaceAll('{{persona}}', persona?.description || persona?.notes || '')
    .replaceAll('{{scenario}}', character.scenario);
}

interface BranchTreeNode {
  branch: RoleplayChatBranch;
  depth: number;
  childCount: number;
}

const EMPTY_ROLEPLAY_CHAT_BRANCHES: RoleplayChatBranch[] = [];

function buildBranchTreeNodes(branches: RoleplayChatBranch[]): BranchTreeNode[] {
  const childrenByParentId = new Map<string | null, RoleplayChatBranch[]>();
  for (const branch of branches) {
    const parentId = branch.parentBranchId ?? null;
    const siblings = childrenByParentId.get(parentId);
    if (siblings) {
      siblings.push(branch);
    } else {
      childrenByParentId.set(parentId, [branch]);
    }
  }
  for (const children of childrenByParentId.values()) {
    children.sort((left, right) => left.createdAt - right.createdAt);
  }

  const visited = new Set<string>();
  const nodes: BranchTreeNode[] = [];
  const appendBranch = (branch: RoleplayChatBranch, depth: number) => {
    if (visited.has(branch.id)) {
      return;
    }
    visited.add(branch.id);
    const children = childrenByParentId.get(branch.id) ?? [];
    nodes.push({ branch, depth, childCount: children.length });
    for (const child of children) {
      appendBranch(child, depth + 1);
    }
  };

  for (const root of childrenByParentId.get(null) ?? []) {
    appendBranch(root, 0);
  }
  for (const branch of branches) {
    appendBranch(branch, 0);
  }
  return nodes;
}

function getBranchLineage(
  branches: RoleplayChatBranch[],
  activeBranchId: string
): RoleplayChatBranch[] {
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const lineage: RoleplayChatBranch[] = [];
  let current = branchById.get(activeBranchId) ?? null;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    lineage.unshift(current);
    current = current.parentBranchId ? (branchById.get(current.parentBranchId) ?? null) : null;
  }
  return lineage;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error) ?? 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}

function getErrorStack(error: unknown): string | null {
  return error instanceof Error && error.stack ? error.stack : null;
}

function truncateDiagnosticText(text: string, maxLength: number = 700): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function summarizeEndpoint(endpointUrl: string): string {
  try {
    const url = new URL(endpointUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return endpointUrl.trim() || '(empty endpoint)';
  }
}

function summarizeCompiledPrompt(compiledPrompt: CompiledRoleplayPrompt): Record<string, unknown> {
  return {
    promptTokenEstimate: compiledPrompt.tokenEstimate,
    promptBlockCount: compiledPrompt.promptBlocks.length,
    activePromptBlockCount: compiledPrompt.segments.length,
    apiMessageCount: compiledPrompt.apiMessages.length,
    apiMessageRoles: compiledPrompt.apiMessages.map((message) => message.role).join(','),
    includedHistoryMessages: compiledPrompt.contextBudget.includedHistoryMessages,
    droppedHistoryMessages: compiledPrompt.contextBudget.droppedHistoryMessages,
    truncatedHistoryMessages: compiledPrompt.contextBudget.truncatedHistoryMessages,
    promptBlockTokens: compiledPrompt.contextBudget.promptBlockTokens,
    historyTokens: compiledPrompt.contextBudget.historyTokens,
    reservedResponseTokens: compiledPrompt.contextBudget.reservedResponseTokens,
    promptBudgetMode: compiledPrompt.diagnostics.promptBudgetMode,
    memoryTokens: compiledPrompt.diagnostics.memoryTokens,
    loreTokens: compiledPrompt.diagnostics.loreTokens,
    droppedLoreEntries: compiledPrompt.diagnostics.droppedLoreEntries,
  };
}

function buildFailureMessage(errorMessage: string, context: Record<string, unknown>): string {
  return [
    'Roleplay chat failed before a response could be saved.',
    '',
    `Error ID: ${context.requestId ?? 'unknown'}`,
    `Stage: ${context.stage ?? 'unknown'}`,
    `Mode: ${context.generationMode ?? 'unknown'}`,
    `Server: ${context.serverMode ?? 'unknown'}`,
    `Model: ${context.modelId ?? 'unknown'}`,
    `Prompt tokens: ${context.promptTokenEstimate ?? 'unknown'}`,
    `API messages: ${context.apiMessageCount ?? 'unknown'}`,
    '',
    truncateDiagnosticText(errorMessage),
    '',
    'This diagnostic message is excluded from the prompt.',
  ].join('\n');
}

function recordRoleplayChatTelemetry(
  eventName: string,
  context: Record<string, unknown>,
  error?: unknown
) {
  const payload = {
    ...context,
    errorMessage: error ? truncateDiagnosticText(getErrorMessage(error), 2000) : undefined,
    errorStack: error ? getErrorStack(error) : undefined,
  };
  recordDebugTrace(`RoleplayChat:${eventName}`, payload);
  if (error) {
    logger.error(`[RoleplayChat] ${eventName}`, payload);
  }
}

export function ChatPanel({ onRegenerateScene, onGenerateSceneWithPrompt }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [dismissedResumeRecapKeys, setDismissedResumeRecapKeys] = useState<string[]>([]);
  const [visibleResumeRecapKey, setVisibleResumeRecapKey] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [checkpointName, setCheckpointName] = useState('');
  const [compareBranchId, setCompareBranchId] = useState<string | null>(null);
  const [branchNameDraft, setBranchNameDraft] = useState('');
  const [branchNavigatorOpen, setBranchNavigatorOpen] = useState(true);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const RESUME_RECAP_MINUTES = 20;

  const {
    activeSessionId,
    characters,
    chatSessions,
    personas,
    isStreamingChat,
    streamingContent,
    connectionStatus,
    chatProvider,
    chatApiKey,
    lmStudioEndpoint,
    selectedModelId,
    modelCompatibilityByModelId,
    detectedServerMode,
    chatTemperature,
    chatMaxTokens,
    lorebooks,
    addMessage,
    replaceMessageContent,
    deleteMessage,
    moveMessage,
    setMessageIncluded,
    addAssistantMessageVariant,
    selectMessageVariant,
    branchFromMessage,
    switchBranch,
    returnToParentBranch,
    renameBranch,
    createCheckpoint,
    restoreCheckpoint,
    removeCheckpoint,
    clearConversation,
    setStreamingChat,
    setStreamingContent,
    appendStreamingContent,
    dismissSuggestion,
    setDetectedServerMode,
    setSessionMemoryStatus,
    incrementMessagesSinceMemoryRefresh,
    applyGeneratedMemory,
    addMemoryFact,
    addContinuityThread,
    markSessionVisited,
  } = useRoleplayStore(
    useShallow((state) => ({
      activeSessionId: state.activeSessionId,
      characters: state.characters,
      chatSessions: state.chatSessions,
      personas: state.personas,
      isStreamingChat: state.isStreamingChat,
      streamingContent: state.streamingContent,
      connectionStatus: state.connectionStatus,
      chatProvider: state.chatProvider,
      chatApiKey: state.chatApiKey,
      lmStudioEndpoint: state.lmStudioEndpoint,
      selectedModelId: state.selectedModelId,
      modelCompatibilityByModelId: state.modelCompatibilityByModelId,
      detectedServerMode: state.detectedServerMode,
      chatTemperature: state.chatTemperature,
      chatMaxTokens: state.chatMaxTokens,
      lorebooks: state.lorebooks,
      addMessage: state.addMessage,
      replaceMessageContent: state.replaceMessageContent,
      deleteMessage: state.deleteMessage,
      moveMessage: state.moveMessage,
      setMessageIncluded: state.setMessageIncluded,
      addAssistantMessageVariant: state.addAssistantMessageVariant,
      selectMessageVariant: state.selectMessageVariant,
      branchFromMessage: state.branchFromMessage,
      switchBranch: state.switchBranch,
      returnToParentBranch: state.returnToParentBranch,
      renameBranch: state.renameBranch,
      createCheckpoint: state.createCheckpoint,
      restoreCheckpoint: state.restoreCheckpoint,
      removeCheckpoint: state.removeCheckpoint,
      clearConversation: state.clearConversation,
      setStreamingChat: state.setStreamingChat,
      setStreamingContent: state.setStreamingContent,
      appendStreamingContent: state.appendStreamingContent,
      dismissSuggestion: state.dismissSuggestion,
      setDetectedServerMode: state.setDetectedServerMode,
      setSessionMemoryStatus: state.setSessionMemoryStatus,
      incrementMessagesSinceMemoryRefresh: state.incrementMessagesSinceMemoryRefresh,
      applyGeneratedMemory: state.applyGeneratedMemory,
      addMemoryFact: state.addMemoryFact,
      addContinuityThread: state.addContinuityThread,
      markSessionVisited: state.markSessionVisited,
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
    [activeSession?.characterId, characterById]
  );
  const participantCharacters = useMemo(
    () =>
      activeSession?.participantCharacterIds
        .map((characterId) => characterById.get(characterId))
        .filter((character): character is RoleplayCharacter => Boolean(character)) ?? [],
    [activeSession?.participantCharacterIds, characterById]
  );
  const activeSpeakerCharacter = useMemo(
    () =>
      (activeSession?.activeSpeakerCharacterId
        ? characterById.get(activeSession.activeSpeakerCharacterId)
        : null) ??
      activeCharacter,
    [activeCharacter, activeSession?.activeSpeakerCharacterId, characterById]
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
    [activeSession?.activePersonaId, personaById]
  );
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession?.messages]);
  const activeBranches = activeSession?.branches ?? EMPTY_ROLEPLAY_CHAT_BRANCHES;
  const activeBranchId = activeSession?.activeBranchId ?? null;
  const activeBranch = useMemo(
    () => activeBranches.find((branch) => branch.id === activeBranchId) ?? null,
    [activeBranchId, activeBranches]
  );
  const branchOptions = useMemo(
    () =>
      activeBranches.map((branch) => ({
        value: branch.id,
        label: `${branch.name} (${branch.messages.length})`,
      })),
    [activeBranches]
  );
  const comparableBranchOptions = useMemo(
    () => branchOptions.filter((branch) => branch.value !== activeBranchId),
    [activeBranchId, branchOptions]
  );
  const branchTreeNodes = useMemo(
    () => buildBranchTreeNodes(activeBranches),
    [activeBranches]
  );
  const activeBranchLineage = useMemo(
    () => activeBranchId ? getBranchLineage(activeBranches, activeBranchId) : [],
    [activeBranchId, activeBranches]
  );
  const checkpointsByBranchId = useMemo(() => {
    const next = new Map<string, RoleplayChatCheckpoint[]>();
    for (const checkpoint of activeSession?.checkpoints ?? []) {
      const branchCheckpoints = next.get(checkpoint.branchId);
      if (branchCheckpoints) {
        branchCheckpoints.push(checkpoint);
      } else {
        next.set(checkpoint.branchId, [checkpoint]);
      }
    }
    for (const checkpoints of next.values()) {
      checkpoints.sort((left, right) => right.createdAt - left.createdAt);
    }
    return next;
  }, [activeSession?.checkpoints]);
  const parentBranch = useMemo(
    () =>
      activeBranch?.parentBranchId
        ? activeBranches.find((branch) => branch.id === activeBranch.parentBranchId) ?? null
        : null,
    [activeBranch, activeBranches]
  );
  const greetingOptions = useMemo(
    () => activeCharacter ? getGreetingOptions(activeCharacter) : [],
    [activeCharacter]
  );
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
  const lastAssistantMessageId = useMemo(
    () => getLastAssistantMessage(messages)?.id ?? null,
    [messages]
  );
  const lastUserMessageId = useMemo(
    () => getLastUserMessage(messages)?.id ?? null,
    [messages]
  );
  const comparedBranchPrompt = useMemo(() => {
    const comparedBranch = activeSession?.branches.find((branch) => branch.id === compareBranchId);
    if (!activeCharacter || !activeSession || !comparedBranch) {
      return null;
    }
    return compileRoleplayPrompt({
      character: activeCharacter,
      session: { ...activeSession, messages: comparedBranch.messages },
      persona: activePersona,
      groupCharacters: participantCharacters,
      lorebooks,
      maxHistoryMessages: selectedMaxHistoryMessages,
      maxContextTokens: selectedContextTokens,
      reservedResponseTokens: chatMaxTokens,
      promptBudgetMode: selectedPromptBudgetMode,
      loreEntryLimit: selectedLoreEntryLimit,
    });
  }, [
    activeCharacter,
    activePersona,
    activeSession,
    chatMaxTokens,
    compareBranchId,
    lorebooks,
    participantCharacters,
    selectedContextTokens,
    selectedLoreEntryLimit,
    selectedMaxHistoryMessages,
    selectedPromptBudgetMode,
  ]);
  const activeBranchPrompt = useMemo(
    () =>
      activeCharacter && activeSession
        ? compileRoleplayPrompt({
            character: activeCharacter,
            session: activeSession,
            persona: activePersona,
            groupCharacters: participantCharacters,
            lorebooks,
            maxHistoryMessages: selectedMaxHistoryMessages,
            maxContextTokens: selectedContextTokens,
            reservedResponseTokens: chatMaxTokens,
            promptBudgetMode: selectedPromptBudgetMode,
            loreEntryLimit: selectedLoreEntryLimit,
          })
        : null,
    [
      activeCharacter,
      activePersona,
      activeSession,
      chatMaxTokens,
      lorebooks,
      participantCharacters,
      selectedContextTokens,
      selectedLoreEntryLimit,
      selectedMaxHistoryMessages,
      selectedPromptBudgetMode,
    ]
  );
  const comparedPromptTokenDelta =
    comparedBranchPrompt && activeBranchPrompt
      ? comparedBranchPrompt.tokenEstimate - activeBranchPrompt.tokenEstimate
      : null;

  const refreshSessionMemory = useCallback(
    async (sessionId: string, conversationMessages: ChatMessage[]) => {
      let textModelResidency: LocalTextModelResidency | null = null;
      try {
        const state = useRoleplayStore.getState();
        const session = state.chatSessions.find((entry) => entry.id === sessionId);
        const character = state.characters.find((entry) => entry.id === session?.characterId);
        const triggerMessageId = conversationMessages[conversationMessages.length - 1]?.id ?? null;

        if (!session || !character) {
          return;
        }

        if (
          state.connectionStatus !== 'connected' ||
          !state.detectedServerMode ||
          !state.selectedModelId
        ) {
          setSessionMemoryStatus(sessionId, 'stale');
          return;
        }

        const sourceMessages = getMessagesForMemoryRefresh(conversationMessages);
        if (sourceMessages.length === 0) {
          return;
        }

        setSessionMemoryStatus(sessionId, 'updating');
        textModelResidency = {
          endpointUrl: state.lmStudioEndpoint,
          modelId: state.selectedModelId,
          serverMode: state.detectedServerMode,
        };
        cancelScheduledLocalTextModelUnload(textModelResidency);
        const memoryCompatibility = state.selectedModelId
          ? (state.modelCompatibilityByModelId[state.selectedModelId] ??
              createRoleplayCompatibilityFromProfile())
          : createRoleplayCompatibilityFromProfile();

        const result = await generateRoleplayMemory({
          endpointUrl: state.lmStudioEndpoint,
          serverMode: state.detectedServerMode,
          modelId: state.selectedModelId,
          character: {
            name: character.name,
            interactionStyle: character.interactionStyle,
            personality: buildCharacterPersonalityBlock(character) || character.personality,
            systemPrompt: getEffectiveSystemPrompt(character),
            conversationSummary: session.conversationSummary,
            continuity: session.continuity,
            memoryFacts: session.memoryFacts,
          },
          sourceMessages,
          conversationContext: formatMessagesForMemoryRefresh(sourceMessages),
          memoryBudgetMode:
            memoryCompatibility.memoryBudgetMode ??
            getRoleplayLocalModelProfile(memoryCompatibility.localProfileId).promptBudgetMode,
          compatibility: memoryCompatibility,
          requestConfig: {
            provider: state.chatProvider,
            apiKey: state.chatApiKey,
            title: 'SwarmUI Roleplay',
          },
        });

        if (result.correctedMode) {
          setDetectedServerMode(result.correctedMode);
        }

        if (!result.success) {
          setSessionMemoryStatus(
            sessionId,
            state.connectionStatus === 'connected' ? 'error' : 'stale'
          );
          notifications.show({
            title: 'Memory Refresh Failed',
            message: result.error ?? 'Could not update conversation memory.',
            color: 'orange',
          });
          return;
        }

        const latestSession = useRoleplayStore
          .getState()
          .chatSessions.find((entry) => entry.id === sessionId);
        if (
          !latestSession ||
          (triggerMessageId &&
            !latestSession.messages.some((message) => message.id === triggerMessageId))
        ) {
          return;
        }

        applyGeneratedMemory(
          sessionId,
          result.conversationSummary,
          result.continuity,
          mergeGeneratedMemoryFacts(
            latestSession.memoryFacts,
            result.memoryFacts.map((text): RoleplayMemoryFact => ({
              id: crypto.randomUUID(),
              text,
              pinned: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }))
          ),
          Date.now()
        );
      } catch (error) {
        const context = {
          requestId: crypto.randomUUID(),
          stage: 'memory-refresh',
          sessionId,
          sourceMessageCount: conversationMessages.length,
        };
        recordRoleplayChatTelemetry('memory-refresh-failed', context, error);
        setSessionMemoryStatus(sessionId, 'error');
        notifications.show({
          title: 'Memory Refresh Failed',
          message: getErrorMessage(error),
          color: 'orange',
        });
      } finally {
        if (textModelResidency) {
          scheduleLocalTextModelUnload(textModelResidency, {
            onError: (error) =>
              notifications.show({
                title: 'Text Model Still Loaded',
                message: error,
                color: 'yellow',
              }),
          });
        }
      }
    },
    [applyGeneratedMemory, setDetectedServerMode, setSessionMemoryStatus]
  );

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages.length, streamingContent]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    return () => {
      markSessionVisited(activeSessionId);
    };
  }, [activeSessionId, markSessionVisited]);

  useEffect(() => {
    queueMicrotask(() => {
      setBranchNameDraft(activeBranch?.name ?? '');
    });
  }, [activeBranch?.id, activeBranch?.name]);

  useEffect(() => {
    if (!compareBranchId) {
      return;
    }
    const stillComparable = comparableBranchOptions.some((branch) => branch.value === compareBranchId);
    if (!stillComparable) {
      queueMicrotask(() => setCompareBranchId(null));
    }
  }, [comparableBranchOptions, compareBranchId]);

  useEffect(() => {
    const resumeRecapKey =
      activeSessionId && activeSession?.lastVisitedAt
        ? `${activeSessionId}:${activeSession.lastVisitedAt}`
        : null;
    const hasContinuity =
      !!activeSession?.conversationSummary.trim() ||
      !!activeSession?.continuity.relationshipSummary.trim() ||
      !!activeSession?.continuity.currentLocation.trim() ||
      !!activeSession?.continuity.currentSituation.trim() ||
      (activeSession?.continuity.openThreads.length ?? 0) > 0 ||
      !!activeSession?.memoryFacts.some((fact) => fact.text.trim());
    const hasReturnGap =
      activeSession?.lastVisitedAt !== null &&
      activeSession?.lastVisitedAt !== undefined &&
      (Date.now() - activeSession.lastVisitedAt) / 60000 >= RESUME_RECAP_MINUTES;
    const shouldShow =
      !!resumeRecapKey &&
      messages.length > 0 &&
      hasContinuity &&
      hasReturnGap &&
      !dismissedResumeRecapKeys.includes(resumeRecapKey);

    queueMicrotask(() => {
      setVisibleResumeRecapKey(shouldShow ? resumeRecapKey : null);
    });
  }, [activeSession, activeSessionId, dismissedResumeRecapKeys, messages.length]);

  const streamAssistantReply = async (
    baseMessages: ChatMessage[],
    options?: {
      generationMode?: RoleplayGenerationMode;
      outputRole?: 'assistant' | 'user';
      appendToMessageId?: string;
      replaceMessageId?: string;
      targetVariantMessageId?: string;
      onDone?: (assistantMessage: ChatMessage) => void;
    }
  ) => {
    if (
      !activeCharacter ||
      !activeSession ||
      !selectedModelId ||
      !detectedServerMode ||
      !activeSessionId
    ) {
      return;
    }

    const requestId = crypto.randomUUID();
    const generationMode = options?.generationMode ?? 'normal';
    const baseTelemetry = {
      requestId,
      generationMode,
      outputRole: options?.outputRole ?? 'assistant',
      sessionId: activeSessionId,
      branchId: activeSession.activeBranchId,
      characterId: activeCharacter.id,
      modelId: selectedModelId,
      serverMode: detectedServerMode,
      endpoint: summarizeEndpoint(lmStudioEndpoint),
      provider: chatProvider,
      baseMessageCount: baseMessages.length,
      temperature: chatTemperature,
      maxTokens: chatMaxTokens,
      appendToMessageId: options?.appendToMessageId ?? null,
      replaceMessageId: options?.replaceMessageId ?? null,
      targetVariantMessageId: options?.targetVariantMessageId ?? null,
    };
    let controller: AbortController | null = null;
    let requestServerMode = detectedServerMode;
    const textModelResidency: LocalTextModelResidency = {
      endpointUrl: lmStudioEndpoint,
      modelId: selectedModelId,
      serverMode: detectedServerMode,
    };
    cancelScheduledLocalTextModelUnload(textModelResidency);

    const failChat = (stage: string, error: unknown, extra: Record<string, unknown> = {}) => {
      if (controller?.signal.aborted) {
        return;
      }

      const errorMessage = getErrorMessage(error);
      const context = {
        ...baseTelemetry,
        ...extra,
        stage,
      };
      recordRoleplayChatTelemetry('failed', context, error);

      try {
        notifications.show({
          title: 'Roleplay Chat Failed',
          message: truncateDiagnosticText(errorMessage, 180),
          color: 'red',
        });
      } catch (notificationError) {
        recordRoleplayChatTelemetry('failure-notification-failed', context, notificationError);
      }

      try {
        addMessage(activeSessionId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: buildFailureMessage(errorMessage, context),
          includedInPrompt: false,
          variants: [],
          activeVariantId: null,
          timestamp: Date.now(),
          sceneImageUrl: null,
          suggestedImagePrompt: null,
        });
      } catch (messageError) {
        recordRoleplayChatTelemetry('failure-message-failed', context, messageError);
      } finally {
        setStreamingChat(false);
        setStreamingContent('');
        abortRef.current = null;
      }
    };

    try {
      const latestState = useRoleplayStore.getState();
      const promptSession =
        latestState.chatSessions.find((session) => session.id === activeSessionId) ?? activeSession;
      const latestCharacterById = new Map(
        latestState.characters.map((character) => [character.id, character])
      );
      const promptCharacter =
        latestCharacterById.get(promptSession.characterId) ?? activeCharacter;
      const promptPersona =
        latestState.personas.find((persona) => persona.id === promptSession.activePersonaId) ??
        activePersona;
      const promptGroupCharacters = promptSession.participantCharacterIds
        .map((characterId) => latestCharacterById.get(characterId))
        .filter((character): character is RoleplayCharacter => Boolean(character));

      const compiledPrompt = compileRoleplayPrompt({
        character: promptCharacter,
        session: promptSession,
        persona: promptPersona,
        groupCharacters: promptGroupCharacters,
        lorebooks,
        pendingMessages: baseMessages
          .filter(
            (message) =>
              (message.role === 'user' || message.role === 'assistant') &&
              message.includedInPrompt !== false
          )
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: getMessageContent(message),
          })),
        generationMode,
        maxHistoryMessages: selectedMaxHistoryMessages,
        maxContextTokens: selectedContextTokens,
        reservedResponseTokens: chatMaxTokens,
        promptBudgetMode: selectedPromptBudgetMode,
        loreEntryLimit: selectedLoreEntryLimit,
      });
      const promptTelemetry = summarizeCompiledPrompt(compiledPrompt);

      recordRoleplayChatTelemetry('started', {
        ...baseTelemetry,
        ...promptTelemetry,
        stage: 'stream-request',
      });

      setStreamingChat(true);
      setStreamingContent('');

      controller = new AbortController();
      abortRef.current = controller;

      await streamRoleplayChat({
        endpointUrl: lmStudioEndpoint,
        serverMode: detectedServerMode,
        modelId: selectedModelId,
        messages: compiledPrompt.apiMessages,
        temperature: chatTemperature,
        maxTokens: chatMaxTokens,
        compatibility: selectedModelCompatibility,
        requestConfig: {
          provider: chatProvider,
          apiKey: chatApiKey,
          title: 'SwarmUI Roleplay',
        },
        signal: controller.signal,
        onToken: appendStreamingContent,
        onServerModeCorrection: (correctedMode) => {
          requestServerMode = correctedMode;
          recordRoleplayChatTelemetry('server-mode-corrected', {
            ...baseTelemetry,
            ...promptTelemetry,
            stage: 'server-mode-correction',
            correctedMode,
          });
          setDetectedServerMode(correctedMode);
        },
        onDone: (fullText) => {
          try {
            const { cleanText, scenePrompt } = parseSceneTag(fullText);
            const outputRole = options?.outputRole ?? 'assistant';
            const assistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: outputRole,
              content: cleanText,
              includedInPrompt: true,
              variants: [],
              activeVariantId: null,
              timestamp: Date.now(),
              sceneImageUrl: null,
              suggestedImagePrompt: scenePrompt,
            };
            if (options?.appendToMessageId) {
              const latestTarget = getLatestSessionMessages(activeSessionId).find(
                (message) => message.id === options.appendToMessageId
              );
              const previousContent = latestTarget ? getMessageContent(latestTarget).trimEnd() : '';
              replaceMessageContent(
                activeSessionId,
                options.appendToMessageId,
                [previousContent, cleanText.trim()].filter(Boolean).join('\n')
              );
            } else if (options?.replaceMessageId) {
              replaceMessageContent(activeSessionId, options.replaceMessageId, cleanText);
            } else if (options?.targetVariantMessageId) {
              addAssistantMessageVariant(activeSessionId, options.targetVariantMessageId, {
                content: cleanText,
                sceneImageUrl: null,
                suggestedImagePrompt: scenePrompt,
              });
            } else {
              addMessage(activeSessionId, assistantMessage);
            }
            incrementMessagesSinceMemoryRefresh(activeSessionId);
            const nextMessages =
              options?.appendToMessageId || options?.replaceMessageId
                ? getLatestSessionMessages(activeSessionId)
                : [...baseMessages, assistantMessage];
            const latestSession = useRoleplayStore
              .getState()
              .chatSessions.find((entry) => entry.id === activeSessionId);
            const messagesSinceRefresh =
              latestSession?.messagesSinceMemoryRefresh ?? promptSession.messagesSinceMemoryRefresh + 1;
            if (messagesSinceRefresh >= ROLEPLAY_MEMORY_REFRESH_THRESHOLD) {
              void refreshSessionMemory(activeSessionId, nextMessages);
            }
            options?.onDone?.(assistantMessage);
            recordRoleplayChatTelemetry('completed', {
              ...baseTelemetry,
              ...promptTelemetry,
              stage: 'stream-complete',
              responseCharacterCount: fullText.length,
              cleanResponseCharacterCount: cleanText.length,
              scenePromptSuggested: Boolean(scenePrompt),
            });
            setStreamingChat(false);
            setStreamingContent('');
            abortRef.current = null;
          } catch (error) {
            failChat('stream-completion', error, promptTelemetry);
          }
        },
        onError: (error) => {
          failChat('stream-error', error, promptTelemetry);
        },
      });
    } catch (error) {
      failChat('preflight', error);
    } finally {
      scheduleLocalTextModelUnload(
        {
          ...textModelResidency,
          serverMode: requestServerMode,
        },
        {
          onError: (error) =>
            notifications.show({
              title: 'Text Model Still Loaded',
              message: error,
              color: 'yellow',
            }),
        }
      );
    }
  };

  const sendUserText = async (rawInput: string, replaceFromMessageId?: string | null) => {
    if (!rawInput.trim() || !activeSessionId || !activeCharacter || !activeSession) {
      return;
    }
    if (connectionStatus !== 'connected' || !detectedServerMode || !selectedModelId) {
      notifications.show({
        title: 'Not Connected',
        message: 'Connect to a chat provider first via the settings sidebar.',
        color: 'orange',
      });
      return;
    }

    const currentMessages = getLatestSessionMessages(activeSessionId);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: rawInput.trim(),
      includedInPrompt: true,
      variants: [],
      activeVariantId: null,
      timestamp: (currentMessages[currentMessages.length - 1]?.timestamp ?? 0) + 1,
      sceneImageUrl: null,
      suggestedImagePrompt: null,
    };

    const replaceIndex = replaceFromMessageId
      ? currentMessages.findIndex((message) => message.id === replaceFromMessageId)
      : -1;
    const baseMessages = replaceIndex >= 0 ? currentMessages.slice(0, replaceIndex) : currentMessages;

    if (replaceFromMessageId && replaceIndex >= 0) {
      branchFromMessage(activeSessionId, replaceFromMessageId, {
        name: `Edit from turn ${replaceIndex + 1}`,
        replacementMessage: userMessage,
      });
      const nextMessages = [...baseMessages, userMessage];
      await streamAssistantReply(nextMessages, { generationMode: 'normal' });
      return;
    }

    addMessage(activeSessionId, userMessage);
    const nextMessages = [...baseMessages, userMessage];
    await streamAssistantReply(nextMessages, { generationMode: 'normal' });
  };

  const handleSend = async () => {
    const nextInput = input;
    setInput('');
    const currentMessages = activeSessionId ? getLatestSessionMessages(activeSessionId) : messages;
    const targetMessage = editingMessageId
      ? currentMessages.find((message) => message.id === editingMessageId) ?? null
      : null;
    setEditingMessageId(null);
    if (targetMessage && activeSessionId && targetMessage.role === 'assistant') {
      replaceMessageContent(activeSessionId, targetMessage.id, nextInput.trim());
      return;
    }
    await sendUserText(nextInput, targetMessage?.role === 'user' ? targetMessage.id : null);
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingChat(false);
    setStreamingContent('');
  };

  const handleRegenerateReply = async () => {
    if (!activeSessionId || !lastAssistantMessageId) {
      return;
    }
    const currentMessages = getLatestSessionMessages(activeSessionId);
    const assistantIndex = currentMessages.findIndex(
      (message) => message.id === lastAssistantMessageId
    );
    if (assistantIndex === -1) {
      return;
    }

    const baseMessages = currentMessages.slice(0, assistantIndex);
    await streamAssistantReply(baseMessages, {
      generationMode: 'regenerate',
      replaceMessageId: lastAssistantMessageId,
    });
  };

  const handleNewSwipe = async () => {
    if (!activeSessionId || !lastAssistantMessageId) {
      return;
    }
    const currentMessages = getLatestSessionMessages(activeSessionId);
    const assistantIndex = currentMessages.findIndex(
      (message) => message.id === lastAssistantMessageId
    );
    if (assistantIndex === -1) {
      return;
    }

    const baseMessages = currentMessages.slice(0, assistantIndex);
    await streamAssistantReply(baseMessages, {
      generationMode: 'swipe',
      targetVariantMessageId: lastAssistantMessageId,
    });
  };

  const handleContinue = async () => {
    if (!activeSessionId || !lastAssistantMessageId) {
      return;
    }
    await streamAssistantReply(getLatestSessionMessages(activeSessionId), {
      generationMode: 'continue',
      appendToMessageId: lastAssistantMessageId,
    });
  };

  const handleImpersonate = async () => {
    if (!activeSessionId) {
      return;
    }
    await streamAssistantReply(getLatestSessionMessages(activeSessionId), {
      generationMode: 'impersonate',
      outputRole: 'user',
    });
  };

  const handleQuietRefresh = async () => {
    if (!activeSessionId) {
      return;
    }

    const currentMessages = getLatestSessionMessages(activeSessionId);
    if (currentMessages.length === 0) {
      notifications.show({
        title: 'Nothing To Refresh',
        message: 'This session has no messages yet.',
        color: 'orange',
      });
      return;
    }

    await refreshSessionMemory(activeSessionId, currentMessages);
    notifications.show({
      title: 'Quiet Refresh Queued',
      message: 'Memory and lore context were refreshed without adding a chat turn.',
      color: 'green',
    });
  };

  const handleRememberMessage = (message: ChatMessage) => {
    if (!activeSessionId) {
      return;
    }
    addMemoryFact(activeSessionId, getMessageContent(message));
  };

  const handlePinThread = (message: ChatMessage) => {
    if (!activeSessionId) {
      return;
    }
    addContinuityThread(activeSessionId, getMessageContent(message));
  };

  const handleStartGreeting = (greeting: string) => {
    if (!activeSessionId) {
      return;
    }
    if (!activeCharacter) {
      return;
    }
    const currentMessages = getLatestSessionMessages(activeSessionId);
    const timestamp = (currentMessages[currentMessages.length - 1]?.timestamp ?? 0) + 1;
    addMessage(activeSessionId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: expandGreetingMacros(greeting, activeCharacter, activePersona),
      includedInPrompt: true,
      variants: [],
      activeVariantId: null,
      timestamp,
      sceneImageUrl: null,
      suggestedImagePrompt: null,
    });
  };

  const handleCopyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(getMessageContent(message));
      notifications.show({
        title: 'Copied',
        message: 'Message copied to clipboard.',
        color: 'green',
      });
    } catch {
      notifications.show({
        title: 'Copy Failed',
        message: 'Clipboard access was not available.',
        color: 'orange',
      });
    }
  };

  const handleEditMessage = (message: ChatMessage) => {
    setInput(getMessageContent(message));
    setEditingMessageId(message.id);
  };

  const handleDeleteMessage = (message: ChatMessage) => {
    if (!activeSessionId) {
      return;
    }
    deleteMessage(activeSessionId, message.id);
  };

  const handleMoveMessage = (message: ChatMessage, direction: -1 | 1) => {
    if (!activeSessionId) {
      return;
    }
    moveMessage(activeSessionId, message.id, direction);
  };

  const handleToggleMessageIncluded = (message: ChatMessage) => {
    if (!activeSessionId) {
      return;
    }
    setMessageIncluded(activeSessionId, message.id, message.includedInPrompt === false);
  };

  const handleSelectVariant = (message: ChatMessage, variantId: string | null) => {
    if (!activeSessionId) {
      return;
    }
    selectMessageVariant(activeSessionId, message.id, variantId);
  };

  const handleBranchFromMessage = (message: ChatMessage) => {
    if (!activeSessionId) {
      return;
    }
    const messageIndex = messages.findIndex((entry) => entry.id === message.id);
    branchFromMessage(activeSessionId, message.id, {
      name: `Branch from turn ${messageIndex >= 0 ? messageIndex + 1 : messages.length}`,
    });
  };

  const handleCreateCheckpoint = () => {
    if (!activeSessionId) {
      return;
    }
    createCheckpoint(activeSessionId, checkpointName);
    setCheckpointName('');
  };

  const handleRestoreCheckpoint = (checkpointId: string) => {
    if (!activeSessionId) {
      return;
    }
    restoreCheckpoint(activeSessionId, checkpointId);
  };

  const handleRemoveCheckpoint = (checkpointId: string) => {
    if (!activeSessionId) {
      return;
    }
    removeCheckpoint(activeSessionId, checkpointId);
  };

  const handleRenameActiveBranch = () => {
    if (!activeSessionId || !activeBranch) {
      return;
    }
    renameBranch(activeSessionId, activeBranch.id, branchNameDraft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  if (!activeCharacter || !activeSession) {
    return (
      <Stack h="100%" justify="center" align="center">
        <Text size="sm" c="dimmed">
          Choose a character to begin chatting.
        </Text>
      </Stack>
    );
  }

  const showResumeRecap = visibleResumeRecapKey !== null;
  const displaySpeakerCharacter = activeSpeakerCharacter ?? activeCharacter;

  return (
    <Stack h="100%" gap={0}>
      <Group
        justify="space-between"
        p="xs"
        style={{ borderBottom: '1px solid var(--theme-gray-5)' }}
      >
        <div>
          <Text size="sm" fw={600}>
            {activeSession.title}
          </Text>
          <Text size="xs" c="dimmed">
            {[
              activePersona ? `Persona: ${activePersona.name}` : 'No persona selected',
              participantCharacters.length > 1
                ? `Group: ${participantCharacters.map((character) => character.name).join(', ')}`
                : '',
            ]
              .filter(Boolean)
              .join(' | ')}
          </Text>
        </div>
        <Group gap="xs">
          <SwarmButton
            tone="secondary"
            emphasis="ghost"
            size="xs"
            onClick={() => activeSessionId && clearConversation(activeSessionId)}
            leftSection={<IconTrash size={14} />}
            disabled={messages.length === 0}
          >
            Clear
          </SwarmButton>
          <SwarmButton
            tone="brand"
            emphasis="ghost"
            size="xs"
            onClick={() => void handleRegenerateReply()}
            leftSection={<IconRefresh size={14} />}
            disabled={!lastAssistantMessageId || isStreamingChat}
          >
            Regenerate
          </SwarmButton>
          <SwarmButton
            tone="secondary"
            emphasis="ghost"
            size="xs"
            onClick={() => void handleImpersonate()}
            leftSection={<IconEdit size={14} />}
            disabled={messages.length === 0 || isStreamingChat}
          >
            Impersonate
          </SwarmButton>
          <SwarmButton
            tone="secondary"
            emphasis="ghost"
            size="xs"
            onClick={() => void handleQuietRefresh()}
            leftSection={<IconBrain size={14} />}
            disabled={messages.length === 0 || isStreamingChat}
          >
            Quiet
          </SwarmButton>
        </Group>
      </Group>

      <BranchNavigator
        activeSessionId={activeSessionId}
        activeSession={activeSession}
        activeBranch={activeBranch}
        parentBranch={parentBranch}
        branchTreeNodes={branchTreeNodes}
        activeBranchLineage={activeBranchLineage}
        checkpointsByBranchId={checkpointsByBranchId}
        branchNameDraft={branchNameDraft}
        checkpointName={checkpointName}
        compareBranchId={compareBranchId}
        comparableBranchOptions={comparableBranchOptions}
        activeBranchPromptTokens={activeBranchPrompt?.tokenEstimate ?? null}
        comparedBranchPromptTokens={comparedBranchPrompt?.tokenEstimate ?? null}
        comparedPromptTokenDelta={comparedPromptTokenDelta}
        comparedPromptBlockCount={comparedBranchPrompt?.promptBlocks.length ?? null}
        activePromptBlockCount={activeBranchPrompt?.promptBlocks.length ?? null}
        comparedPromptApiCount={comparedBranchPrompt?.apiMessages.length ?? null}
        activePromptApiCount={activeBranchPrompt?.apiMessages.length ?? null}
        messagesLength={messages.length}
        collapsed={!branchNavigatorOpen}
        onToggleCollapsed={() => setBranchNavigatorOpen((value) => !value)}
        onBranchNameDraftChange={setBranchNameDraft}
        onCheckpointNameChange={setCheckpointName}
        onCompareBranchChange={setCompareBranchId}
        onSwitchBranch={switchBranch}
        onReturnToParentBranch={returnToParentBranch}
        onBranchFromLatest={() => {
          const latestMessageId = messages[messages.length - 1]?.id;
          if (activeSessionId && latestMessageId) {
            branchFromMessage(activeSessionId, latestMessageId);
          }
        }}
        onRenameActiveBranch={handleRenameActiveBranch}
        onCreateCheckpoint={handleCreateCheckpoint}
        onRestoreCheckpoint={handleRestoreCheckpoint}
        onRemoveCheckpoint={handleRemoveCheckpoint}
      />

      <ScrollArea
        style={{
          flex: 1,
          backgroundImage: activeSession.chatBackgroundImage
            ? `linear-gradient(rgba(0, 0, 0, 0.36), rgba(0, 0, 0, 0.36)), url("${activeSession.chatBackgroundImage}")`
            : undefined,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
        viewportRef={viewportRef}
      >
        <Stack gap="sm" p="md">
          {messages.length === 0 && greetingOptions.length > 0 ? (
            <ElevatedCard elevation="floor" tone="brand">
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Start With A Greeting
                </Text>
                <Text size="xs" c="dimmed">
                  Pick an opening line to seed this chat session.
                </Text>
                {greetingOptions.map((greeting, index) => (
                  <SwarmButton
                    key={`${index}-${greeting}`}
                    tone="secondary"
                    emphasis="ghost"
                    size="xs"
                    onClick={() => handleStartGreeting(greeting)}
                  >
                    {greeting.length > 120 ? `${greeting.slice(0, 117)}...` : greeting}
                  </SwarmButton>
                ))}
              </Stack>
            </ElevatedCard>
          ) : null}

          {showResumeRecap ? (
            <ElevatedCard elevation="floor" tone="neutral">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap="xs" style={{ flex: 1 }}>
                  <Text size="sm" fw={600}>
                    Resume Recap
                  </Text>
                  {activeSession.continuity.relationshipSummary.trim() ? (
                    <div>
                      <Text size="xs" fw={600}>
                        Relationship
                      </Text>
                      <Text size="sm" c="dimmed">
                        {activeSession.continuity.relationshipSummary}
                      </Text>
                    </div>
                  ) : null}
                  {activeSession.continuity.currentLocation.trim() ||
                  activeSession.continuity.currentSituation.trim() ? (
                    <div>
                      <Text size="xs" fw={600}>
                        Current Scene
                      </Text>
                      <Text size="sm" c="dimmed">
                        {[
                          activeSession.continuity.currentLocation.trim()
                            ? `Location: ${activeSession.continuity.currentLocation.trim()}`
                            : '',
                          activeSession.continuity.currentSituation.trim()
                            ? `Situation: ${activeSession.continuity.currentSituation.trim()}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' | ')}
                      </Text>
                    </div>
                  ) : null}
                  {activeSession.continuity.openThreads.length > 0 ? (
                    <div>
                      <Text size="xs" fw={600}>
                        Open Threads
                      </Text>
                      <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                        {activeSession.continuity.openThreads
                          .map((thread) => `• ${thread}`)
                          .join('\n')}
                      </Text>
                    </div>
                  ) : null}
                  {activeSession.conversationSummary.trim() ? (
                    <div>
                      <Text size="xs" fw={600}>
                        Quick Summary
                      </Text>
                      <Text size="sm" c="dimmed">
                        {activeSession.conversationSummary}
                      </Text>
                    </div>
                  ) : null}
                </Stack>
                <ActionIcon
                  variant="subtle"
                  onClick={() => {
                    if (visibleResumeRecapKey) {
                      setDismissedResumeRecapKeys((current) => [...current, visibleResumeRecapKey]);
                    }
                    setVisibleResumeRecapKey(null);
                  }}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            </ElevatedCard>
          ) : null}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              character={message.role === 'assistant' ? displaySpeakerCharacter : activeCharacter}
              activeSessionId={activeSessionId}
              onRegenerateScene={getMessageSceneImageUrl(message) ? onRegenerateScene : undefined}
              onGenerateSceneWithPrompt={onGenerateSceneWithPrompt}
              onDismissSuggestion={dismissSuggestion}
              onRememberMessage={handleRememberMessage}
              onPinThread={handlePinThread}
              onEditMessage={handleEditMessage}
              onCopyMessage={(targetMessage) => void handleCopyMessage(targetMessage)}
              onDeleteMessage={handleDeleteMessage}
              onMoveMessage={handleMoveMessage}
              onToggleIncluded={handleToggleMessageIncluded}
              onSelectVariant={handleSelectVariant}
              onBranchFromMessage={handleBranchFromMessage}
              onRegenerateReply={() => void handleNewSwipe()}
              onContinue={() => void handleContinue()}
              isLatestAssistantMessage={message.id === lastAssistantMessageId}
              isLatestUserMessage={message.id === lastUserMessageId}
            />
          ))}

          {isStreamingChat && streamingContent ? (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Group gap="xs" align="flex-start" wrap="nowrap">
                <div style={{ paddingTop: 4, flexShrink: 0 }}>
                  <CharacterAvatar character={displaySpeakerCharacter} size={28} />
                </div>
                <ElevatedCard elevation="table" tone="neutral" style={{ maxWidth: '80%' }}>
                  <Stack gap={4}>
                    <Text size="xs" fw={600} c="dimmed">
                      {displaySpeakerCharacter.name}
                    </Text>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {streamingContent}
                    </Text>
                  </Stack>
                </ElevatedCard>
              </Group>
            </div>
          ) : null}

          {isStreamingChat && !streamingContent ? (
            <Group gap="xs" p="xs">
              <CharacterAvatar character={displaySpeakerCharacter} size={24} />
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                {displaySpeakerCharacter.name} is thinking...
              </Text>
            </Group>
          ) : null}
        </Stack>
      </ScrollArea>

      <Group
        gap="xs"
        p="xs"
        align="flex-end"
        style={{ borderTop: '1px solid var(--theme-gray-5)' }}
      >
        <Textarea
          flex={1}
          placeholder={
            editingMessageId
              ? 'Edit the selected turn...'
              : `Message ${activeCharacter.name}... (Shift+Enter for new line)`
          }
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autosize
          minRows={1}
          maxRows={4}
          disabled={isStreamingChat}
          size="sm"
        />
        {editingMessageId ? (
          <SwarmButton
            tone="secondary"
            emphasis="ghost"
            size="sm"
            onClick={() => {
              setEditingMessageId(null);
              setInput('');
            }}
          >
            Cancel Edit
          </SwarmButton>
        ) : null}
        {isStreamingChat ? (
          <SwarmButton
            tone="danger"
            emphasis="solid"
            size="sm"
            onClick={handleAbort}
            leftSection={<IconPlayerStop size={16} />}
          >
            Stop
          </SwarmButton>
        ) : (
          <SwarmButton
            tone="brand"
            emphasis="solid"
            size="sm"
            onClick={() => void handleSend()}
            disabled={!input.trim() || connectionStatus !== 'connected'}
            leftSection={<IconSend size={16} />}
          >
            {editingMessageId ? 'Save Edit' : 'Send'}
          </SwarmButton>
        )}
      </Group>
    </Stack>
  );
}

interface BranchNavigatorProps {
  activeSessionId: string | null;
  activeSession: RoleplayChatSession;
  activeBranch: RoleplayChatBranch | null;
  parentBranch: RoleplayChatBranch | null;
  branchTreeNodes: BranchTreeNode[];
  activeBranchLineage: RoleplayChatBranch[];
  checkpointsByBranchId: Map<string, RoleplayChatCheckpoint[]>;
  branchNameDraft: string;
  checkpointName: string;
  compareBranchId: string | null;
  comparableBranchOptions: Array<{ value: string; label: string }>;
  activeBranchPromptTokens: number | null;
  comparedBranchPromptTokens: number | null;
  comparedPromptTokenDelta: number | null;
  activePromptBlockCount: number | null;
  comparedPromptBlockCount: number | null;
  activePromptApiCount: number | null;
  comparedPromptApiCount: number | null;
  messagesLength: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onBranchNameDraftChange: (name: string) => void;
  onCheckpointNameChange: (name: string) => void;
  onCompareBranchChange: (branchId: string | null) => void;
  onSwitchBranch: (sessionId: string, branchId: string) => void;
  onReturnToParentBranch: (sessionId: string) => void;
  onBranchFromLatest: () => void;
  onRenameActiveBranch: () => void;
  onCreateCheckpoint: () => void;
  onRestoreCheckpoint: (checkpointId: string) => void;
  onRemoveCheckpoint: (checkpointId: string) => void;
}

function BranchNavigator({
  activeSessionId,
  activeSession,
  activeBranch,
  parentBranch,
  branchTreeNodes,
  activeBranchLineage,
  checkpointsByBranchId,
  branchNameDraft,
  checkpointName,
  compareBranchId,
  comparableBranchOptions,
  activeBranchPromptTokens,
  comparedBranchPromptTokens,
  comparedPromptTokenDelta,
  activePromptBlockCount,
  comparedPromptBlockCount,
  activePromptApiCount,
  comparedPromptApiCount,
  messagesLength,
  collapsed,
  onToggleCollapsed,
  onBranchNameDraftChange,
  onCheckpointNameChange,
  onCompareBranchChange,
  onSwitchBranch,
  onReturnToParentBranch,
  onBranchFromLatest,
  onRenameActiveBranch,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  onRemoveCheckpoint,
}: BranchNavigatorProps) {
  const activeBranchId = activeSession.activeBranchId;

  if (collapsed) {
    return (
      <div className="roleplay-branch-navigator roleplay-branch-navigator-collapsed">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconGitBranch size={15} />
            <Text size="xs" fw={700} truncate>
              {activeBranch?.name ?? 'Branch Tree'}
            </Text>
            <Badge size="xs" variant="light">
              {activeSession.branches.length} branches
            </Badge>
            <Badge size="xs" variant="outline">
              {messagesLength} turns
            </Badge>
          </Group>
          <ActionIcon variant="subtle" size="sm" onClick={onToggleCollapsed}>
            <IconChevronDown size={14} />
          </ActionIcon>
        </Group>
      </div>
    );
  }

  return (
    <div className="roleplay-branch-navigator">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" gap="xs">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={6}>
              <IconGitBranch size={15} />
              <Text size="sm" fw={700}>
                Branch Tree
              </Text>
              <Badge size="xs" variant="light">
                {activeSession.branches.length}
              </Badge>
            </Group>
            <Group gap={4}>
              {activeBranchLineage.map((branch, index) => (
                <Group key={branch.id} gap={4} wrap="nowrap">
                  {index > 0 ? (
                    <Text size="xs" c="dimmed">
                      /
                    </Text>
                  ) : null}
                  <Text
                    size="xs"
                    fw={branch.id === activeBranchId ? 700 : 500}
                    c={branch.id === activeBranchId ? undefined : 'dimmed'}
                    truncate
                  >
                    {branch.name}
                  </Text>
                </Group>
              ))}
            </Group>
          </Stack>
          <Group gap="xs" align="flex-end">
            <ActionIcon variant="subtle" size="sm" onClick={onToggleCollapsed}>
              <IconChevronUp size={14} />
            </ActionIcon>
            <TextInput
              label="Active Branch Name"
              size="xs"
              value={branchNameDraft}
              onChange={(event) => onBranchNameDraftChange(event.currentTarget.value)}
              style={{ width: 190 }}
            />
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              onClick={onRenameActiveBranch}
              disabled={!activeBranch || !branchNameDraft.trim() || branchNameDraft === activeBranch.name}
            >
              Rename
            </SwarmButton>
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              onClick={onBranchFromLatest}
              disabled={messagesLength === 0}
              leftSection={<IconGitBranch size={14} />}
            >
              Branch Current
            </SwarmButton>
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              onClick={() => activeSessionId && onReturnToParentBranch(activeSessionId)}
              disabled={!parentBranch}
            >
              Parent{parentBranch ? `: ${parentBranch.name}` : ''}
            </SwarmButton>
          </Group>
        </Group>

        <ScrollArea h={170} type="auto">
          <Stack gap={4} pr="xs">
            {branchTreeNodes.map(({ branch, depth, childCount }) => {
              const branchCheckpoints = checkpointsByBranchId.get(branch.id) ?? [];
              const isActive = branch.id === activeBranchId;
              const isCompared = branch.id === compareBranchId;
              return (
                <div key={branch.id} className="roleplay-branch-tree-row-wrap">
                  <Group
                    className={`roleplay-branch-tree-row${isActive ? ' roleplay-branch-tree-row-active' : ''}`}
                    gap="xs"
                    wrap="nowrap"
                    style={{ paddingLeft: 8 + depth * 22 }}
                  >
                    <span className="roleplay-branch-tree-line" />
                    <Stack gap={1} style={{ minWidth: 0, flex: 1 }}>
                      <Group gap={5} wrap="nowrap">
                        <Text size="xs" fw={isActive ? 700 : 600} truncate>
                          {branch.name}
                        </Text>
                        {isActive ? (
                          <Badge size="xs" color="green" variant="light">
                            active
                          </Badge>
                        ) : null}
                        {isCompared ? (
                          <Badge size="xs" color="blue" variant="light">
                            compare
                          </Badge>
                        ) : null}
                      </Group>
                      <Text size="xs" c="dimmed" truncate>
                        {branch.messages.length} turns · {childCount} child
                        {childCount === 1 ? '' : 'ren'} · fork{' '}
                        {branch.forkMessageId ? branch.forkMessageId.slice(0, 8) : 'root'}
                      </Text>
                    </Stack>
                    <Group gap={2} wrap="nowrap">
                      <SwarmButton
                        tone="secondary"
                        emphasis={isActive ? 'soft' : 'ghost'}
                        size="xs"
                        onClick={() => activeSessionId && onSwitchBranch(activeSessionId, branch.id)}
                        disabled={isActive}
                      >
                        Open
                      </SwarmButton>
                      <SwarmButton
                        tone="secondary"
                        emphasis={isCompared ? 'soft' : 'ghost'}
                        size="xs"
                        onClick={() => onCompareBranchChange(isCompared ? null : branch.id)}
                        disabled={isActive}
                      >
                        Compare
                      </SwarmButton>
                    </Group>
                  </Group>
                  {branchCheckpoints.length > 0 ? (
                    <Group
                      gap={4}
                      wrap="wrap"
                      className="roleplay-branch-checkpoint-row"
                      style={{ paddingLeft: 30 + depth * 22 }}
                    >
                      {branchCheckpoints.map((checkpoint) => (
                        <Group key={checkpoint.id} gap={2} wrap="nowrap">
                          <SwarmButton
                            tone="secondary"
                            emphasis="ghost"
                            size="xs"
                            leftSection={<IconBookmark size={12} />}
                            onClick={() => onRestoreCheckpoint(checkpoint.id)}
                          >
                            {checkpoint.name}
                          </SwarmButton>
                          <Tooltip label="Delete checkpoint">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="xs"
                              onClick={() => onRemoveCheckpoint(checkpoint.id)}
                            >
                              <IconX size={10} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      ))}
                    </Group>
                  ) : null}
                </div>
              );
            })}
          </Stack>
        </ScrollArea>

        <Group gap="xs" align="flex-end" wrap="wrap">
          <TextInput
            label="Checkpoint"
            size="xs"
            placeholder="Name this state"
            value={checkpointName}
            onChange={(event) => onCheckpointNameChange(event.currentTarget.value)}
            style={{ minWidth: 180 }}
          />
          <SwarmButton
            tone="secondary"
            emphasis="ghost"
            size="xs"
            leftSection={<IconBookmark size={14} />}
            onClick={onCreateCheckpoint}
            disabled={messagesLength === 0}
          >
            Save Checkpoint
          </SwarmButton>
          <Select
            label="Compare Branch"
            size="xs"
            placeholder="Prompt trace"
            data={comparableBranchOptions}
            value={compareBranchId}
            onChange={onCompareBranchChange}
            clearable
            leftSection={<IconGitCompare size={14} />}
            disabled={comparableBranchOptions.length === 0}
            style={{ minWidth: 210 }}
          />
          <Badge size="sm" variant="light">
            Active {activeBranch?.messages.length ?? messagesLength} turns
          </Badge>
          <Badge size="sm" variant="light">
            Checkpoints {activeSession.checkpoints.length}
          </Badge>
          {activeBranchPromptTokens !== null ? (
            <Badge size="sm" variant="outline">
              Active prompt ~{activeBranchPromptTokens}
            </Badge>
          ) : null}
          {comparedBranchPromptTokens !== null ? (
            <>
              <Badge size="sm" color="blue" variant="outline">
                Compare prompt ~{comparedBranchPromptTokens}
              </Badge>
              {comparedPromptTokenDelta !== null ? (
                <Badge size="sm" color="blue" variant="light">
                  Delta {comparedPromptTokenDelta >= 0 ? '+' : ''}
                  {comparedPromptTokenDelta}
                </Badge>
              ) : null}
              <Badge size="sm" color="blue" variant="light">
                Blocks {activePromptBlockCount ?? 0} / {comparedPromptBlockCount ?? 0}
              </Badge>
              <Badge size="sm" color="blue" variant="light">
                API {activePromptApiCount ?? 0} / {comparedPromptApiCount ?? 0}
              </Badge>
            </>
          ) : null}
        </Group>
      </Stack>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  character: RoleplayCharacter;
  activeSessionId: string | null;
  onRegenerateScene?: () => void;
  onGenerateSceneWithPrompt?: (prompt: string) => void;
  onDismissSuggestion: (sessionId: string, messageId: string) => void;
  onRememberMessage: (message: ChatMessage) => void;
  onPinThread: (message: ChatMessage) => void;
  onEditMessage: (message: ChatMessage) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  onMoveMessage: (message: ChatMessage, direction: -1 | 1) => void;
  onToggleIncluded: (message: ChatMessage) => void;
  onSelectVariant: (message: ChatMessage, variantId: string | null) => void;
  onBranchFromMessage: (message: ChatMessage) => void;
  onRegenerateReply: () => void;
  onContinue: () => void;
  isLatestAssistantMessage: boolean;
  isLatestUserMessage: boolean;
}

function MessageBubble({
  message,
  character,
  activeSessionId,
  onRegenerateScene,
  onGenerateSceneWithPrompt,
  onDismissSuggestion,
  onRememberMessage,
  onPinThread,
  onEditMessage,
  onCopyMessage,
  onDeleteMessage,
  onMoveMessage,
  onToggleIncluded,
  onSelectVariant,
  onBranchFromMessage,
  onRegenerateReply,
  onContinue,
  isLatestAssistantMessage,
  isLatestUserMessage,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const content = getMessageContent(message);
  const sceneImageUrl = getMessageSceneImageUrl(message);
  const suggestedImagePrompt = getMessageSuggestedImagePrompt(message);
  const variantIds = [null, ...message.variants.map((variant) => variant.id)];
  const activeVariantIndex = Math.max(0, variantIds.indexOf(message.activeVariantId));
  const canSwipe = message.role === 'assistant' && variantIds.length > 1;
  const alignmentClass = isUser ? 'roleplay-message-row-user' : 'roleplay-message-row-assistant';
  const handleVariantStep = (direction: -1 | 1) => {
    if (!canSwipe) {
      return;
    }
    const nextIndex = (activeVariantIndex + direction + variantIds.length) % variantIds.length;
    onSelectVariant(message, variantIds[nextIndex] ?? null);
  };

  if (isUser) {
    return (
      <div className={`roleplay-message-row ${alignmentClass}`}>
        <Stack gap={4} align="flex-end" className="roleplay-message-stack">
          <ElevatedCard elevation="paper" tone="brand">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {content}
            </Text>
          </ElevatedCard>
          <Group gap={4} wrap="wrap" justify="flex-end" className="roleplay-message-toolbar">
            <Tooltip label={message.includedInPrompt === false ? 'Include in prompt' : 'Exclude from prompt'}>
              <ActionIcon variant="subtle" size="xs" onClick={() => onToggleIncluded(message)}>
                {message.includedInPrompt === false ? <IconEyeOff size={12} /> : <IconEye size={12} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Copy">
              <ActionIcon variant="subtle" size="xs" onClick={() => onCopyMessage(message)}>
                <IconCopy size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={isLatestUserMessage ? 'Edit and resend' : 'Edit'}>
              <ActionIcon variant="subtle" size="xs" onClick={() => onEditMessage(message)}>
                <IconEdit size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Branch from here">
              <ActionIcon variant="subtle" size="xs" onClick={() => onBranchFromMessage(message)}>
                <IconGitBranch size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Move up">
              <ActionIcon variant="subtle" size="xs" onClick={() => onMoveMessage(message, -1)}>
                <IconArrowUp size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Move down">
              <ActionIcon variant="subtle" size="xs" onClick={() => onMoveMessage(message, 1)}>
                <IconArrowDown size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon variant="subtle" color="red" size="xs" onClick={() => onDeleteMessage(message)}>
                <IconTrash size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {message.includedInPrompt === false ? (
            <Text size="xs" c="dimmed">
              Excluded from compiled prompt
            </Text>
          ) : null}
        </Stack>
      </div>
    );
  }

  return (
    <div className={`roleplay-message-row ${alignmentClass}`}>
      <Group gap="xs" align="flex-start" wrap="nowrap">
        <div style={{ paddingTop: 4, flexShrink: 0 }}>
          <CharacterAvatar character={character} size={28} />
        </div>
        <Stack gap={4} className="roleplay-message-stack">
          <ElevatedCard elevation="table" tone="neutral">
            <Stack gap={4}>
              <Text size="xs" fw={600} c="dimmed">
                {character.name}
              </Text>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {content}
              </Text>
              {sceneImageUrl ? (
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <img
                    src={sceneImageUrl}
                    alt="Scene"
                    style={{
                      maxWidth: '100%',
                      borderRadius: 'calc(6px * var(--theme-radius-multiplier))',
                      display: 'block',
                    }}
                  />
                  {onRegenerateScene ? (
                    <Tooltip label="Regenerate scene">
                      <ActionIcon
                        variant="filled"
                        color="dark"
                        size="sm"
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          opacity: 0.8,
                        }}
                        onClick={onRegenerateScene}
                      >
                        <IconRefresh size={12} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                </div>
              ) : null}
            </Stack>
          </ElevatedCard>

          {canSwipe ? (
            <Group gap={4} className="roleplay-swipe-controls">
              <Tooltip label="Previous swipe">
                <ActionIcon variant="subtle" size="xs" onClick={() => handleVariantStep(-1)}>
                  <IconChevronLeft size={12} />
                </ActionIcon>
              </Tooltip>
              <Text size="xs" c="dimmed">
                Swipe {activeVariantIndex + 1} / {variantIds.length}
              </Text>
              <Tooltip label="Next swipe">
                <ActionIcon variant="subtle" size="xs" onClick={() => handleVariantStep(1)}>
                  <IconChevronRight size={12} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ) : null}

          <Group gap={4} wrap="wrap" className="roleplay-message-toolbar">
            <Tooltip label={message.includedInPrompt === false ? 'Include in prompt' : 'Exclude from prompt'}>
              <ActionIcon variant="subtle" size="xs" onClick={() => onToggleIncluded(message)}>
                {message.includedInPrompt === false ? <IconEyeOff size={12} /> : <IconEye size={12} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Copy">
              <ActionIcon variant="subtle" size="xs" onClick={() => onCopyMessage(message)}>
                <IconCopy size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Edit">
              <ActionIcon variant="subtle" size="xs" onClick={() => onEditMessage(message)}>
                <IconEdit size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Branch from here">
              <ActionIcon variant="subtle" size="xs" onClick={() => onBranchFromMessage(message)}>
                <IconGitBranch size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Move up">
              <ActionIcon variant="subtle" size="xs" onClick={() => onMoveMessage(message, -1)}>
                <IconArrowUp size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Move down">
              <ActionIcon variant="subtle" size="xs" onClick={() => onMoveMessage(message, 1)}>
                <IconArrowDown size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon variant="subtle" color="red" size="xs" onClick={() => onDeleteMessage(message)}>
                <IconTrash size={12} />
              </ActionIcon>
            </Tooltip>
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              onClick={() => onRememberMessage(message)}
            >
              Remember
            </SwarmButton>
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              onClick={() => onPinThread(message)}
            >
              Pin Thread
            </SwarmButton>
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              leftSection={<IconPhotoPlus size={12} />}
              onClick={() => onGenerateSceneWithPrompt?.(suggestedImagePrompt || content)}
              disabled={!onGenerateSceneWithPrompt}
            >
              Image
            </SwarmButton>
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              onClick={onContinue}
              disabled={!isLatestAssistantMessage}
            >
              Continue
            </SwarmButton>
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              onClick={onRegenerateReply}
              disabled={!isLatestAssistantMessage}
            >
              New Swipe
            </SwarmButton>
          </Group>

          {message.includedInPrompt === false ? (
            <Text size="xs" c="dimmed">
              Excluded from compiled prompt
            </Text>
          ) : null}

          {suggestedImagePrompt && !sceneImageUrl ? (
            <ElevatedCard elevation="table" tone="brand">
              <Stack gap={6}>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap={4}>
                    <IconSparkles size={12} color="var(--theme-brand)" />
                    <Text size="xs" fw={600}>
                      Scene suggested
                    </Text>
                  </Group>
                  <Tooltip label="Dismiss">
                    <ActionIcon
                      variant="subtle"
                      size="xs"
                      color="gray"
                      onClick={() =>
                        activeSessionId && onDismissSuggestion(activeSessionId, message.id)
                      }
                    >
                      <IconX size={10} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {suggestedImagePrompt}
                </Text>
                <SwarmButton
                  tone="brand"
                  emphasis="solid"
                  size="xs"
                  leftSection={<IconSparkles size={12} />}
                  onClick={() => onGenerateSceneWithPrompt?.(suggestedImagePrompt)}
                  disabled={!onGenerateSceneWithPrompt}
                >
                  Generate This Scene
                </SwarmButton>
              </Stack>
            </ElevatedCard>
          ) : null}
        </Stack>
      </Group>
    </div>
  );
}
