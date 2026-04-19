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
  IconPlayerStop,
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

export function ChatPanel({ onRegenerateScene, onGenerateSceneWithPrompt }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [dismissedResumeRecapKeys, setDismissedResumeRecapKeys] = useState<string[]>([]);
  const [visibleResumeRecapKey, setVisibleResumeRecapKey] = useState<string | null>(null);
  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const RESUME_RECAP_MINUTES = 20;

  const {
    activeSessionId,
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
    deleteMessagesFrom,
    clearConversation,
    setStreamingChat,
    setStreamingContent,
    appendStreamingContent,
    dismissSuggestion,
    getActiveCharacter,
    getActiveSession,
    getActivePersona,
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
      deleteMessagesFrom: state.deleteMessagesFrom,
      clearConversation: state.clearConversation,
      setStreamingChat: state.setStreamingChat,
      setStreamingContent: state.setStreamingContent,
      appendStreamingContent: state.appendStreamingContent,
      dismissSuggestion: state.dismissSuggestion,
      getActiveCharacter: state.getActiveCharacter,
      getActiveSession: state.getActiveSession,
      getActivePersona: state.getActivePersona,
      setDetectedServerMode: state.setDetectedServerMode,
      setSessionMemoryStatus: state.setSessionMemoryStatus,
      incrementMessagesSinceMemoryRefresh: state.incrementMessagesSinceMemoryRefresh,
      applyGeneratedMemory: state.applyGeneratedMemory,
      addMemoryFact: state.addMemoryFact,
      addContinuityThread: state.addContinuityThread,
      markSessionVisited: state.markSessionVisited,
    }))
  );

  const activeCharacter = getActiveCharacter();
  const activeSession = getActiveSession();
  const activePersona = getActivePersona();
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

    const compiledPrompt = compileRoleplayPrompt({
      character: activeCharacter,
      session: activeSession,
      persona: activePersona,
      lorebooks,
      pendingMessages: baseMessages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
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
          timestamp: Date.now(),
          sceneImageUrl: null,
          suggestedImagePrompt: scenePrompt,
        };
        addMessage(activeSessionId, assistantMessage);
        incrementMessagesSinceMemoryRefresh(activeSessionId);
        const nextMessages = [...baseMessages, assistantMessage];
        const latestSession = useRoleplayStore
          .getState()
          .chatSessions.find((entry) => entry.id === activeSessionId);
        const messagesSinceRefresh =
          latestSession?.messagesSinceMemoryRefresh ?? activeSession.messagesSinceMemoryRefresh + 1;
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

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: rawInput.trim(),
      timestamp: (messages[messages.length - 1]?.timestamp ?? 0) + 1,
      sceneImageUrl: null,
      suggestedImagePrompt: null,
    };

    const replaceIndex = replaceFromMessageId
      ? messages.findIndex((message) => message.id === replaceFromMessageId)
      : -1;
    const baseMessages = replaceIndex >= 0 ? messages.slice(0, replaceIndex) : messages;

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
    setEditingUserMessageId(null);
    await sendUserText(nextInput, editingUserMessageId);
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
    const assistantIndex = messages.findIndex((message) => message.id === lastAssistantMessageId);
    if (assistantIndex === -1) {
      return;
    }

    const baseMessages = messages.slice(0, assistantIndex);
    deleteMessagesFrom(activeSessionId, lastAssistantMessageId);
    await streamAssistantReply(baseMessages);
  };

  const handleContinue = async () => {
    await streamAssistantReply(messages);
  };

  const handleRememberMessage = (message: ChatMessage) => {
    if (!activeSessionId) {
      return;
    }
    addMemoryFact(activeSessionId, message.content);
  };

  const handlePinThread = (message: ChatMessage) => {
    if (!activeSessionId) {
      return;
    }
    addContinuityThread(activeSessionId, message.content);
  };

  const handleStartGreeting = (greeting: string) => {
    if (!activeSessionId) {
      return;
    }
    const timestamp = (messages[messages.length - 1]?.timestamp ?? 0) + 1;
    addMessage(activeSessionId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: greeting,
      timestamp,
      sceneImageUrl: null,
      suggestedImagePrompt: null,
    });
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
              onRegenerateScene={message.sceneImageUrl ? onRegenerateScene : undefined}
              onGenerateSceneWithPrompt={onGenerateSceneWithPrompt}
              onDismissSuggestion={dismissSuggestion}
              onRememberMessage={handleRememberMessage}
              onPinThread={handlePinThread}
              onEditUserMessage={(targetMessage) => {
                setInput(targetMessage.content);
                setEditingUserMessageId(targetMessage.id);
              }}
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
            editingUserMessageId
              ? `Edit your last turn to resend it to ${activeCharacter.name}...`
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
        {editingUserMessageId ? (
          <SwarmButton
            tone="secondary"
            emphasis="ghost"
            size="sm"
            onClick={() => {
              setEditingUserMessageId(null);
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
            {editingUserMessageId ? 'Edit + Resend' : 'Send'}
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
  onEditUserMessage: (message: ChatMessage) => void;
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
  onEditUserMessage,
  onRegenerateReply,
  onContinue,
  isLatestAssistantMessage,
  isLatestUserMessage,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Stack gap={4} align="flex-end" style={{ maxWidth: '80%' }}>
          <ElevatedCard elevation="paper" tone="brand">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Text>
          </ElevatedCard>
          {isLatestUserMessage ? (
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="xs"
              leftSection={<IconEdit size={12} />}
              onClick={() => onEditUserMessage(message)}
            >
              Edit + Resend
            </SwarmButton>
          ) : null}
        </Stack>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <Group gap="xs" align="flex-start" wrap="nowrap">
        <div style={{ paddingTop: 4, flexShrink: 0 }}>
          <CharacterAvatar character={character} size={28} />
        </div>
        <Stack gap={4} style={{ maxWidth: '80%' }}>
          <ElevatedCard elevation="table" tone="neutral">
            <Stack gap={4}>
              <Text size="xs" fw={600} c="dimmed">
                {character.name}
              </Text>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {message.content}
              </Text>
              {message.sceneImageUrl ? (
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <img
                    src={message.sceneImageUrl}
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

          <Group gap={6} wrap="wrap">
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
              Rewrite Reply
            </SwarmButton>
          </Group>

          {message.suggestedImagePrompt && !message.sceneImageUrl ? (
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
                  {message.suggestedImagePrompt}
                </Text>
                <SwarmButton
                  tone="brand"
                  emphasis="solid"
                  size="xs"
                  leftSection={<IconSparkles size={12} />}
                  onClick={() => onGenerateSceneWithPrompt?.(message.suggestedImagePrompt!)}
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
