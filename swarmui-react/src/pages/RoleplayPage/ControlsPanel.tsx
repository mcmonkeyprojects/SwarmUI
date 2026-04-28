import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  Checkbox,
  FileButton,
  Group,
  MultiSelect,
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
  IconBook2,
  IconBrain,
  IconCircleCheck,
  IconCircleX,
  IconDownload,
  IconFileImport,
  IconPhotoSpark,
  IconPlugConnected,
  IconSparkles,
  IconTrash,
  IconUserCircle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import { swarmClient } from '../../api/client';
import { resolveAssetUrl, resolveRuntimeEndpoints } from '../../config/runtimeEndpoints';
import { getRoleplayInteractionStyleConfig } from '../../data/roleplayInteractionStyles';
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
import { useModelLoading } from '../../hooks/useModelLoading';
import { useModels } from '../../hooks/useModels';
import {
  generateRoleplayMemory,
  generateSceneDescription,
} from '../../services/roleplayChatService';
import { useRoleplayStore } from '../../stores/roleplayStore';
import type { RoleplayMemoryFact } from '../../types/roleplay';
import { useGenerationStore } from '../../store/generationStore';
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
const RESPONSE_LENGTH_TOKENS = {
  short: 512,
  medium: 768,
  long: 1024,
} as const;

type ResponseLengthPreset = keyof typeof RESPONSE_LENGTH_TOKENS;

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
  const [newMemoryFactText, setNewMemoryFactText] = useState('');
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [lorebookModalOpen, setLorebookModalOpen] = useState(false);
  const [promptInspectorOpen, setPromptInspectorOpen] = useState(false);
  const [activeDirectorTab, setActiveDirectorTab] = useState<string | null>('roleplay');
  const [openSections, setOpenSections] = useState<string[]>([
    'connection',
    'roleplay',
    'generation',
    'memory',
  ]);

  const {
    personas,
    lorebooks,
    chatSessions,
    activeSessionId,
    connectionStatus,
    connectionMessage,
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
    getActiveCharacter,
    getActiveSession,
    getActivePersona,
    setSessionActivePersona,
    updateSessionPromptStack,
    setSessionBoundLorebooks,
    attachSceneImageToLastMessage,
    setSessionMemoryStatus,
    applyGeneratedMemory,
    addMemoryFact,
    updateMemoryFact,
    removeMemoryFact,
    toggleMemoryFactPinned,
    removeContinuityThread,
    moveContinuityThread,
    importBundle,
  } = useRoleplayStore(
    useShallow((state) => ({
      personas: state.personas,
      lorebooks: state.lorebooks,
      chatSessions: state.chatSessions,
      activeSessionId: state.activeSessionId,
      connectionStatus: state.connectionStatus,
      connectionMessage: state.connectionMessage,
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
      getActiveCharacter: state.getActiveCharacter,
      getActiveSession: state.getActiveSession,
      getActivePersona: state.getActivePersona,
      setSessionActivePersona: state.setSessionActivePersona,
      updateSessionPromptStack: state.updateSessionPromptStack,
      setSessionBoundLorebooks: state.setSessionBoundLorebooks,
      attachSceneImageToLastMessage: state.attachSceneImageToLastMessage,
      setSessionMemoryStatus: state.setSessionMemoryStatus,
      applyGeneratedMemory: state.applyGeneratedMemory,
      addMemoryFact: state.addMemoryFact,
      updateMemoryFact: state.updateMemoryFact,
      removeMemoryFact: state.removeMemoryFact,
      toggleMemoryFactPinned: state.toggleMemoryFactPinned,
      removeContinuityThread: state.removeContinuityThread,
      moveContinuityThread: state.moveContinuityThread,
      importBundle: state.importBundle,
    }))
  );

  const generatePageModel = useGenerationStore((state) => state.selectedModel);
  const activeCharacter = getActiveCharacter();
  const activeSession = getActiveSession();
  const activePersona = getActivePersona();
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession?.messages]);
  const effectiveModel = activeCharacter?.imageModelId || imageModelId || generatePageModel;
  const responseLengthPreset = getResponseLengthPreset(chatMaxTokens);
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
  const compiledPrompt = useMemo(
    () =>
      activeCharacter && activeSession
        ? compileRoleplayPrompt({
            character: activeCharacter,
            session: activeSession,
            persona: activePersona,
            lorebooks,
          })
        : null,
    [activeCharacter, activePersona, activeSession, lorebooks]
  );
  const compiledPromptSegments = compiledPrompt?.segments ?? [];

  const { data: sdModels, isLoading: loadingModels } = useModels('Stable-Diffusion');
  const { isLoading: isLoadingModel, progress: modelLoadProgress, loadModel } = useModelLoading();
  const swarmBaseUrl = useMemo(
    () => resolveRuntimeEndpoints().apiBaseUrl || window.location.origin,
    []
  );

  useEffect(() => {
    setClipOverride(imageClipStopAtLayer !== null);
  }, [imageClipStopAtLayer]);

  const generateImageWithPrompt = useCallback(
    (prompt: string) => {
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

      const ipAdapterParams =
        activeCharacter.ipAdapterEnabled && activeCharacter.avatar
          ? {
              useipadapterforrevision: activeCharacter.ipAdapterModel ?? 'faceid plus v2',
              ipadapterweight: activeCharacter.ipAdapterWeight ?? 1.0,
              ipadapterstart: 0.0,
              ipadapterend: 1.0,
              ipadapterweighttype: 'standard',
              promptimages: activeCharacter.avatar,
            }
          : {};

      swarmClient.generateImage(
        {
          prompt: trimmedPrompt,
          ...(effectiveModel ? { model: effectiveModel } : {}),
          width: imageWidth,
          height: imageHeight,
          images: 1,
          steps: imageSteps,
          cfgscale: imageCfgScale,
          ...(imageClipStopAtLayer !== null ? { clipstopatlayer: imageClipStopAtLayer } : {}),
          ...(activeCharacter.characterLora
            ? {
                loras: activeCharacter.characterLora,
                loraweights: String(activeCharacter.characterLoraWeight ?? 0.8),
              }
            : {}),
          ...ipAdapterParams,
        },
        {
          onImage: (data: { image?: string }) => {
            if (!data.image) {
              return;
            }

            const normalizedPath = data.image.startsWith('/') ? data.image : `/${data.image}`;
            attachSceneImageToLastMessage(activeSession.id, resolveAssetUrl(normalizedPath));
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
    },
    [
      activeCharacter,
      activeSession,
      attachSceneImageToLastMessage,
      effectiveModel,
      imageCfgScale,
      imageClipStopAtLayer,
      imageHeight,
      imageSteps,
      imageWidth,
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

      setIsGeneratingImage(true);
      const contextStr = messages
        .slice(-6)
        .map((message) => `${message.role === 'user' ? 'User' : 'Character'}: ${message.content}`)
        .join('\n');
      const sceneSuggestionPrompt =
        manualPrompt?.trim() ||
        activeCharacter.sceneSuggestionPrompt ||
        getRoleplayInteractionStyleConfig(activeCharacter.interactionStyle).sceneSuggestionPrompt;
      const sceneResult = await generateSceneDescription({
        endpointUrl: lmStudioEndpoint,
        serverMode: detectedServerMode,
        modelId: selectedModelId,
        conversationContext: contextStr,
        sceneSuggestionPrompt,
        compatibility: selectedModelCompatibility,
      });

      if (sceneResult.correctedMode) {
        setDetectedServerMode(sceneResult.correctedMode);
      }

      if (!sceneResult.success) {
        notifications.show({
          title: 'Scene Description Failed',
          message: sceneResult.error ?? 'Could not generate a scene description.',
          color: 'red',
        });
        setIsGeneratingImage(false);
        return;
      }

      const appearancePrefix = activeCharacter.appearancePrompt
        ? `${activeCharacter.appearancePrompt}, `
        : '';
      generateImageWithPrompt(`${appearancePrefix}${sceneResult.description}`);
    },
    [
      activeCharacter,
      activeSession,
      connectionStatus,
      detectedServerMode,
      generateImageWithPrompt,
      lmStudioEndpoint,
      messages,
      selectedModelCompatibility,
      selectedModelId,
      setDetectedServerMode,
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
      compatibility: selectedModelCompatibility,
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
    connectionStatus,
    detectedServerMode,
    lmStudioEndpoint,
    messages,
    selectedModelCompatibility,
    selectedModelId,
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

  const handleExportBundle = () => {
    const activeChar = getActiveCharacter();
    if (!activeChar) return;
    const bundle = createRoleplayBundle(activeChar, chatSessions, lorebooks);
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
      const appearancePrefix = activeCharacter?.appearancePrompt
        ? `${activeCharacter.appearancePrompt}, `
        : '';
      generateImageWithPrompt(`${appearancePrefix}${prompt}`);
    });
  }, [activeCharacter?.appearancePrompt, generateImageWithPrompt, onRegisterGenerateWithPrompt]);

  const handleLoadModel = () => {
    if (effectiveModel) {
      loadModel(effectiveModel);
    }
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
                    <TextInput
                      label="LM Studio Endpoint"
                      value={lmStudioEndpoint}
                      onChange={(event) => setLmStudioEndpoint(event.currentTarget.value)}
                    />
                    <SwarmButton
                      tone="brand"
                      emphasis="solid"
                      size="xs"
                      leftSection={<IconPlugConnected size={14} />}
                      onClick={onProbeConnection}
                    >
                      Probe Connection
                    </SwarmButton>
                    <Text size="xs" c="dimmed">
                      {connectionMessage || 'Connect to a local OpenAI-compatible endpoint.'}
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
                      <Text size="xs" fw={600}>
                        Prompt Stack
                      </Text>
                      <Stack gap={6} className="roleplay-prompt-block-list">
                        {compiledPromptSegments.slice(0, 8).map((segment) => (
                          <Group key={segment.key} justify="space-between" wrap="nowrap">
                            <Text size="xs" c="dimmed" truncate>
                              {segment.label}
                            </Text>
                            <Text size="xs" c="dimmed">
                              ~{Math.ceil(segment.content.length / 4)}
                            </Text>
                          </Group>
                        ))}
                        {compiledPromptSegments.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            No active prompt blocks.
                          </Text>
                        ) : null}
                      </Stack>
                      <Textarea
                        label="Main Prompt Override"
                        description="Leave blank to use the character's active system prompt."
                        value={activeSession.promptStack.mainPromptOverride}
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
                        value={activeSession.promptStack.authorNote}
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
                        value={activeSession.promptStack.postHistoryNote}
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
                          checked={activeSession.promptStack.includePersona}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includePersona: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Character"
                          checked={activeSession.promptStack.includeCharacterDefinition}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeCharacterDefinition: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Scenario"
                          checked={activeSession.promptStack.includeScenario}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeScenario: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Examples"
                          checked={activeSession.promptStack.includeExampleMessages}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeExampleMessages: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Memory"
                          checked={activeSession.promptStack.includeMemory}
                          onChange={(event) =>
                            activeSessionId &&
                            updateSessionPromptStack(activeSessionId, {
                              includeMemory: event.currentTarget.checked,
                            })
                          }
                        />
                        <Checkbox
                          label="Include Lore"
                          checked={activeSession.promptStack.includeLore}
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
                    {isLoadingModel ? <Progress value={modelLoadProgress * 100} size="sm" /> : null}
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
