import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { Group } from '@mantine/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
    IconLayoutSidebarRightCollapse,
    IconLayoutSidebarRightExpand,
    IconTheater,
} from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { PageScaffold } from '../../components/layout/PageScaffold';
import { SectionHero } from '../../components/ui/SectionHero';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { ResizeHandle } from '../../components/ui/ResizeHandle';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { useRoleplayStore } from '../../stores/roleplayStore';
import { probeAssistantConnection } from '../../services/roleplayChatService';
import { useNavigationStore, type RoleplayRouteState } from '../../stores/navigationStore';
import { CharacterSidebar } from './CharacterSidebar';
import { CharacterSelectionPanel } from './CharacterSelectionPanel';
import { ChatPanel } from './ChatPanel';
import { ControlsPanel } from './ControlsPanel';
import './roleplay.css';

interface RoleplayPageProps {
    routeState?: RoleplayRouteState;
}

export function RoleplayPage({ routeState }: RoleplayPageProps) {
    const [controlsPanelOpen, setControlsPanelOpen] = useState(false);
    const [deckPanelOpen, setDeckPanelOpen] = useState(true);
    const [showCharacterPicker, setShowCharacterPicker] = useState(true);
    const generateSceneRef = useRef<(() => void) | null>(null);
    const generateSceneWithPromptRef = useRef<((prompt: string) => void) | null>(null);
    const appliedRouteCharacterIdRef = useRef<string | null>(null);
    const navigateToRoleplay = useNavigationStore((state) => state.navigateToRoleplay);

    const {
        activeCharacterId,
        activeSessionId,
        characters,
        chatSessions,
        connectionStatus,
        selectedModelId,
        chatProvider,
        chatApiKey,
        lmStudioEndpoint,
        setConnectionStatus,
        setConnectionMessage,
        setDetectedServerMode,
        setAvailableModels,
        setSelectedModelId,
        setActiveCharacter,
    } = useRoleplayStore(
        useShallow((s) => ({
            activeCharacterId: s.activeCharacterId,
            activeSessionId: s.activeSessionId,
            characters: s.characters,
            chatSessions: s.chatSessions,
            connectionStatus: s.connectionStatus,
            selectedModelId: s.selectedModelId,
            chatProvider: s.chatProvider,
            chatApiKey: s.chatApiKey,
            lmStudioEndpoint: s.lmStudioEndpoint,
            setConnectionStatus: s.setConnectionStatus,
            setConnectionMessage: s.setConnectionMessage,
            setDetectedServerMode: s.setDetectedServerMode,
            setAvailableModels: s.setAvailableModels,
            setSelectedModelId: s.setSelectedModelId,
            setActiveCharacter: s.setActiveCharacter,
        }))
    );

    const sidebar = useResizablePanel({
        initialSize: 236,
        minSize: 184,
        maxSize: 340,
        direction: 'horizontal',
    });

    const probeConnection = useCallback(async () => {
        setConnectionStatus('connecting');
        setConnectionMessage('Connecting...');

        const result = await probeAssistantConnection(lmStudioEndpoint, {
            provider: chatProvider,
            apiKey: chatApiKey,
            title: 'SwarmUI Roleplay',
        });

        if (result.ok) {
            setConnectionStatus('connected');
            setConnectionMessage(result.connection.message);
            setDetectedServerMode(result.connection.serverMode);
            setAvailableModels(result.connection.models);
            const currentSelectedModelId = useRoleplayStore.getState().selectedModelId;
            if (!currentSelectedModelId && result.connection.models.length > 0) {
                setSelectedModelId(result.connection.models[0].id);
            }
        } else {
            setConnectionStatus('error');
            setConnectionMessage(result.connection.message);
            setDetectedServerMode(null);
            setAvailableModels([]);
        }
    }, [
        lmStudioEndpoint,
        chatProvider,
        chatApiKey,
        setConnectionStatus,
        setConnectionMessage,
        setDetectedServerMode,
        setAvailableModels,
        setSelectedModelId,
    ]);

    useEffect(() => {
        probeConnection();
    }, [probeConnection]);

    const routeCharacterId = routeState?.characterId ?? null;
    const characterById = useMemo(
        () => new Map(characters.map((character) => [character.id, character])),
        [characters]
    );
    const sessionById = useMemo(
        () => new Map(chatSessions.map((session) => [session.id, session])),
        [chatSessions]
    );
    const routeCharacterExists = routeCharacterId ? characterById.has(routeCharacterId) : false;

    useEffect(() => {
        if (!routeCharacterId || !routeCharacterExists) {
            return;
        }
        if (showCharacterPicker) {
            queueMicrotask(() => {
                setShowCharacterPicker(false);
            });
        }
        if (
            routeCharacterId === appliedRouteCharacterIdRef.current ||
            routeCharacterId === activeCharacterId
        ) {
            return;
        }
        appliedRouteCharacterIdRef.current = routeCharacterId;
        setActiveCharacter(routeCharacterId);
    }, [
        activeCharacterId,
        routeCharacterExists,
        routeCharacterId,
        setActiveCharacter,
        showCharacterPicker,
    ]);

    useEffect(() => {
        if (routeCharacterId === activeCharacterId) {
            return;
        }
        if (routeCharacterId && routeCharacterExists) {
            return;
        }
        navigateToRoleplay({ characterId: activeCharacterId });
    }, [activeCharacterId, navigateToRoleplay, routeCharacterExists, routeCharacterId]);

    const handleSelectCharacterFromLanding = useCallback(
        (characterId: string) => {
            appliedRouteCharacterIdRef.current = characterId;
            navigateToRoleplay({ characterId });
            setShowCharacterPicker(false);
        },
        [navigateToRoleplay]
    );

    const isShowingCharacterPicker = showCharacterPicker || !activeCharacterId;
    const activeCharacter = activeCharacterId ? (characterById.get(activeCharacterId) ?? null) : null;
    const activeSession = activeSessionId ? (sessionById.get(activeSessionId) ?? null) : null;

    return (
        <PageScaffold
            density="compact"
            header={
                <SectionHero
                    title="Roleplay"
                    subtitle="AI-powered character chat with scene generation"
                    icon={<IconTheater size={24} />}
                    rightSection={
                        <Group gap="xs">
                            {activeCharacterId ? (
                                <SwarmButton
                                    tone="brand"
                                    emphasis={isShowingCharacterPicker ? 'solid' : 'ghost'}
                                    size="xs"
                                    onClick={() => setShowCharacterPicker((value) => !value)}
                                >
                                    {isShowingCharacterPicker ? 'Back To Chat' : 'Choose Character'}
                                </SwarmButton>
                            ) : null}
                            {!isShowingCharacterPicker ? (
                                <SwarmButton
                                    tone="brand"
                                    emphasis="ghost"
                                    size="xs"
                                    onClick={() => setControlsPanelOpen(!controlsPanelOpen)}
                                >
                                    {controlsPanelOpen ? 'Hide Director' : 'Show Director'}
                                </SwarmButton>
                            ) : null}
                        </Group>
                    }
                />
            }
        >
            <div className="roleplay-workspace-shell">
                <Group className="roleplay-status-bar" justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                        <span className={`roleplay-status-dot roleplay-status-${connectionStatus}`} />
                        <span>{connectionStatus === 'connected' ? 'Connected' : 'Local assistant link'}</span>
                        <span className="roleplay-status-divider" />
                        <span>{selectedModelId || 'No chat model selected'}</span>
                    </Group>
                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                        <span>{activeCharacter?.name ?? 'No character'}</span>
                        <span className="roleplay-status-divider" />
                        <span>{activeSession?.title ?? 'No session'}</span>
                    </Group>
                </Group>
            <div className="roleplay-workspace">
                {!isShowingCharacterPicker && (
                    <>
                        {/* Character Sidebar */}
                        {deckPanelOpen ? (
                            <>
                                <div className="roleplay-deck-panel" style={{ width: sidebar.size }}>
                                    <div className="roleplay-panel-collapse-bar">
                                        <SwarmButton
                                            tone="secondary"
                                            emphasis="ghost"
                                            size="xs"
                                            leftSection={<IconLayoutSidebarLeftCollapse size={14} />}
                                            onClick={() => setDeckPanelOpen(false)}
                                        >
                                            Collapse Deck
                                        </SwarmButton>
                                    </div>
                                    <CharacterSidebar />
                                </div>

                                <ResizeHandle
                                    direction="horizontal"
                                    onPointerDown={sidebar.handlePointerDown}
                                    onNudge={sidebar.nudgeSize}
                                    isResizing={sidebar.isResizing}
                                />
                            </>
                        ) : (
                            <div className="roleplay-panel-rail roleplay-panel-rail-left">
                                <SwarmButton
                                    tone="secondary"
                                    emphasis="ghost"
                                    size="xs"
                                    onClick={() => setDeckPanelOpen(true)}
                                >
                                    <IconLayoutSidebarLeftExpand size={16} />
                                </SwarmButton>
                                <span>Deck</span>
                            </div>
                        )}
                    </>
                )}

                {/* Main Panel */}
                <div className="roleplay-stage-panel">
                    {isShowingCharacterPicker ? (
                        <CharacterSelectionPanel onSelectCharacter={handleSelectCharacterFromLanding} />
                    ) : (
                        <ChatPanel
                            onRegenerateScene={() => generateSceneRef.current?.()}
                            onGenerateSceneWithPrompt={(prompt) => generateSceneWithPromptRef.current?.(prompt)}
                            onOpenDirector={() => setControlsPanelOpen(true)}
                        />
                    )}
                </div>

                {/* Controls Panel */}
                {!isShowingCharacterPicker && (
                    <>
                        {controlsPanelOpen ? (
                            <div
                                className="roleplay-director-panel"
                                style={{
                                    width: 320,
                                }}
                            >
                                <div className="roleplay-panel-collapse-bar roleplay-panel-collapse-bar-right">
                                    <SwarmButton
                                        tone="secondary"
                                        emphasis="ghost"
                                        size="xs"
                                        leftSection={<IconLayoutSidebarRightCollapse size={14} />}
                                        onClick={() => setControlsPanelOpen(false)}
                                    >
                                        Collapse Director
                                    </SwarmButton>
                                </div>
                                <ControlsPanel
                                    onProbeConnection={probeConnection}
                                    onRegisterGenerate={(fn) => { generateSceneRef.current = fn; }}
                                    onRegisterGenerateWithPrompt={(fn) => { generateSceneWithPromptRef.current = fn; }}
                                />
                            </div>
                        ) : (
                            <div className="roleplay-panel-rail roleplay-panel-rail-right">
                                <SwarmButton
                                    tone="secondary"
                                    emphasis="ghost"
                                    size="xs"
                                    onClick={() => setControlsPanelOpen(true)}
                                >
                                    <IconLayoutSidebarRightExpand size={16} />
                                </SwarmButton>
                                <span>Director</span>
                            </div>
                        )}
                    </>
                )}
            </div>
            </div>
        </PageScaffold>
    );
}

export default RoleplayPage;
