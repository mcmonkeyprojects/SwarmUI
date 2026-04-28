import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ActionIcon,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconEdit,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconChevronLeft,
  IconChevronRight,
  IconArrowUp,
  IconArrowDown,
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
  getMessageContent,
  getMessageSceneImageUrl,
  getMessageSuggestedImagePrompt,
} from '../../features/roleplay/roleplayMessageUtils';
import { useRoleplayStore } from '../../stores/roleplayStore';
import type { ChatMessage, RoleplayCharacter, RoleplayMemoryFact } from '../../types/roleplay';
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

export function ChatPanel({ onRegenerateScene, onGenerateSceneWithPrompt }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [dismissedResumeRecapKeys, setDismissedResumeRecapKeys] = useState<string[]>([]);
  const [visibleResumeRecapKey, setVisibleResumeRecapKey] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
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
    deleteMessagesFrom,
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
      deleteMessagesFrom: state.deleteMessagesFrom,
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
  const activeCharacter = useMemo(
    () => characters.find((character) => character.id === activeSession?.characterId) ?? null,
    [activeSession?.characterId, characters]
  );
  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === activeSession?.activePersonaId) ?? null,
    [activeSession?.activePersonaId, personas]
  );
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession?.messages]);
  const greetingOptions = activeCharacter ? getGreetingOptions(activeCharacter) : [];
  const selectedModelCompatibility = useMemo(
    () =>
      selectedModelId
        ? (modelCompatibilityByModelId[selectedModelId] ?? {
            forceFinalUserTurn: false,
            inlineSystemPrompt: false,
          })
        : {
            forceFinalUserTurn: false,
            inlineSystemPrompt: false,
          },
    [modelCompatibilityByModelId, selectedModelId]
  );
  const lastAssistantMessageId =
    [...messages].reverse().find((message) => message.role === 'assistant')?.id ?? null;
  const lastUserMessageId =
    [...messages].reverse().find((message) => message.role === 'user')?.id ?? null;

  const refreshSessionMemory = useCallback(
    async (sessionId: string, conversationMessages: ChatMessage[]) => {
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
        compatibility: state.selectedModelId
          ? (state.modelCompatibilityByModelId[state.selectedModelId] ?? {
              forceFinalUserTurn: false,
              inlineSystemPrompt: false,
            })
          : {
              forceFinalUserTurn: false,
              inlineSystemPrompt: false,
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
        mergeGeneratedMemoryFacts(latestSession.memoryFacts, result.memoryFacts.map((text): RoleplayMemoryFact => ({
          id: crypto.randomUUID(), text, pinned: false, createdAt: Date.now(), updatedAt: Date.now(),
        }))),
        Date.now()
      );
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

    const latestState = useRoleplayStore.getState();
    const promptSession =
      latestState.chatSessions.find((session) => session.id === activeSessionId) ?? activeSession;
    const promptCharacter =
      latestState.characters.find((character) => character.id === promptSession.characterId) ??
      activeCharacter;
    const promptPersona =
      latestState.personas.find((persona) => persona.id === promptSession.activePersonaId) ??
      activePersona;

    const compiledPrompt = compileRoleplayPrompt({
      character: promptCharacter,
      session: promptSession,
      persona: promptPersona,
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
    });

    setStreamingChat(true);
    setStreamingContent('');

    const controller = new AbortController();
    abortRef.current = controller;

    await streamRoleplayChat({
      endpointUrl: lmStudioEndpoint,
      serverMode: detectedServerMode,
      modelId: selectedModelId,
      messages: compiledPrompt.apiMessages,
      temperature: chatTemperature,
      maxTokens: chatMaxTokens,
      compatibility: selectedModelCompatibility,
      signal: controller.signal,
      onToken: appendStreamingContent,
      onServerModeCorrection: (correctedMode) => {
        setDetectedServerMode(correctedMode);
      },
      onDone: (fullText) => {
        const { cleanText, scenePrompt } = parseSceneTag(fullText);
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: cleanText,
          includedInPrompt: true,
          variants: [],
          activeVariantId: null,
          timestamp: Date.now(),
          sceneImageUrl: null,
          suggestedImagePrompt: scenePrompt,
        };
        if (options?.targetVariantMessageId) {
          addAssistantMessageVariant(activeSessionId, options.targetVariantMessageId, {
            content: cleanText,
            sceneImageUrl: null,
            suggestedImagePrompt: scenePrompt,
          });
        } else {
          addMessage(activeSessionId, assistantMessage);
        }
        incrementMessagesSinceMemoryRefresh(activeSessionId);
        const nextMessages = [...baseMessages, assistantMessage];
        const latestSession = useRoleplayStore
          .getState()
          .chatSessions.find((entry) => entry.id === activeSessionId);
        const messagesSinceRefresh =
          latestSession?.messagesSinceMemoryRefresh ?? promptSession.messagesSinceMemoryRefresh + 1;
        if (messagesSinceRefresh >= ROLEPLAY_MEMORY_REFRESH_THRESHOLD) {
          void refreshSessionMemory(activeSessionId, nextMessages);
        }
        options?.onDone?.(assistantMessage);
        setStreamingChat(false);
        setStreamingContent('');
        abortRef.current = null;
      },
      onError: (error) => {
        if (controller.signal.aborted) {
          return;
        }
        notifications.show({
          title: 'Chat Error',
          message: error,
          color: 'red',
        });
        setStreamingChat(false);
        setStreamingContent('');
        abortRef.current = null;
      },
    });
  };

  const sendUserText = async (rawInput: string, replaceFromMessageId?: string | null) => {
    if (!rawInput.trim() || !activeSessionId || !activeCharacter || !activeSession) {
      return;
    }
    if (connectionStatus !== 'connected' || !detectedServerMode || !selectedModelId) {
      notifications.show({
        title: 'Not Connected',
        message: 'Connect to LM Studio first via the settings sidebar.',
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
      deleteMessagesFrom(activeSessionId, replaceFromMessageId);
    }

    addMessage(activeSessionId, userMessage);
    const nextMessages = [...baseMessages, userMessage];
    await streamAssistantReply(nextMessages);
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
    await streamAssistantReply(baseMessages, { targetVariantMessageId: lastAssistantMessageId });
  };

  const handleContinue = async () => {
    if (!activeSessionId) {
      return;
    }
    await streamAssistantReply(getLatestSessionMessages(activeSessionId));
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
            {activePersona ? `Persona: ${activePersona.name}` : 'No persona selected'}
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
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1 }} viewportRef={viewportRef}>
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
              character={activeCharacter}
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
              onRegenerateReply={() => void handleRegenerateReply()}
              onContinue={() => void handleContinue()}
              isLatestAssistantMessage={message.id === lastAssistantMessageId}
              isLatestUserMessage={message.id === lastUserMessageId}
            />
          ))}

          {isStreamingChat && streamingContent ? (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Group gap="xs" align="flex-start" wrap="nowrap">
                <div style={{ paddingTop: 4, flexShrink: 0 }}>
                  <CharacterAvatar character={activeCharacter} size={28} />
                </div>
                <ElevatedCard elevation="table" tone="neutral" style={{ maxWidth: '80%' }}>
                  <Stack gap={4}>
                    <Text size="xs" fw={600} c="dimmed">
                      {activeCharacter.name}
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
              <CharacterAvatar character={activeCharacter} size={24} />
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                {activeCharacter.name} is thinking...
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
