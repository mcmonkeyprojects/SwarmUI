import { useEffect, useCallback, useRef, useState } from 'react';
import { Group } from '@mantine/core';
import { IconTheater } from '@tabler/icons-react';
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
    const [controlsPanelOpen, setControlsPanelOpen] = useState(true);
    const [showCharacterPicker, setShowCharacterPicker] = useState(
        () => !useRoleplayStore.getState().activeCharacterId
    );
    const generateSceneRef = useRef<(() => void) | null>(null);
    const generateSceneWithPromptRef = useRef<((prompt: string) => void) | null>(null);
    const navigateToRoleplay = useNavigationStore((state) => state.navigateToRoleplay);

    const {
        activeCharacterId,
        activeSessionId,
        characters,
        chatSessions,
        connectionStatus,
        selectedModelId,
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
        initialSize: 260,
        minSize: 200,
        maxSize: 400,
        direction: 'horizontal',
    });

    const probeConnection = useCallback(async () => {
        setConnectionStatus('connecting');
        setConnectionMessage('Connecting...');

        const result = await probeAssistantConnection(lmStudioEndpoint);

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
        setConnectionStatus,
        setConnectionMessage,
        setDetectedServerMode,
        setAvailableModels,
        setSelectedModelId,
    ]);

    useEffect(() => {
        probeConnection();
    }, [probeConnection]);

    useEffect(() => {
        if (!routeState?.characterId || routeState.characterId === activeCharacterId) {
            return;
        }
        if (!characters.some((character) => character.id === routeState.characterId)) {
            return;
        }
        setActiveCharacter(routeState.characterId);
        queueMicrotask(() =>
            setShowCharacterPicker((current) => (current ? false : current))
        );
    }, [activeCharacterId, characters, routeState?.characterId, setActiveCharacter]);

    useEffect(() => {
        const routeCharacterId = routeState?.characterId ?? null;
        if (routeCharacterId === activeCharacterId) {
            return;
        }
        navigateToRoleplay({ characterId: activeCharacterId });
    }, [activeCharacterId, navigateToRoleplay, routeState?.characterId]);

    const isShowingCharacterPicker = showCharacterPicker || !activeCharacterId;
    const activeCharacter = characters.find((character) => character.id === activeCharacterId) ?? null;
    const activeSession = chatSessions.find((session) => session.id === activeSessionId) ?? null;

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
                            <SwarmButton
                                tone="brand"
                                emphasis={isShowingCharacterPicker ? 'solid' : 'ghost'}
                                size="xs"
                                onClick={() => setShowCharacterPicker((value) => !value)}
                            >
                                {isShowingCharacterPicker ? 'Back To Chat' : 'Choose Character'}
                            </SwarmButton>
                            <SwarmButton
                                tone="brand"
                                emphasis="ghost"
                                size="xs"
                                onClick={() => setControlsPanelOpen(!controlsPanelOpen)}
                            >
                                {controlsPanelOpen ? 'Hide Controls' : 'Show Controls'}
                            </SwarmButton>
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
                        <div className="roleplay-deck-panel" style={{ width: sidebar.size }}>
                            <CharacterSidebar />
                        </div>

                        <ResizeHandle
                            direction="horizontal"
                            onPointerDown={sidebar.handlePointerDown}
                            onNudge={sidebar.nudgeSize}
                            isResizing={sidebar.isResizing}
                        />
                    </>
                )}

                {/* Main Panel */}
                <div className="roleplay-stage-panel">
                    {isShowingCharacterPicker ? (
                        <CharacterSelectionPanel onSelectCharacter={() => setShowCharacterPicker(false)} />
                    ) : (
                        <ChatPanel
                            onRegenerateScene={() => generateSceneRef.current?.()}
                            onGenerateSceneWithPrompt={(prompt) => generateSceneWithPromptRef.current?.(prompt)}
                        />
                    )}
                </div>

                {/* Controls Panel */}
                {controlsPanelOpen && (
                    <>
                        <div
                            className="roleplay-director-panel"
                            style={{
                                width: 320,
                            }}
                        >
                            <ControlsPanel
                                onProbeConnection={probeConnection}
                                onRegisterGenerate={(fn) => { generateSceneRef.current = fn; }}
                                onRegisterGenerateWithPrompt={(fn) => { generateSceneWithPromptRef.current = fn; }}
                            />
                        </div>
                    </>
                )}
            </div>
            </div>
        </PageScaffold>
    );
}

export default RoleplayPage;
