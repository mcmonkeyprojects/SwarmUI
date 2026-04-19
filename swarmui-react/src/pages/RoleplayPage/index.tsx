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

interface RoleplayPageProps {
    routeState?: RoleplayRouteState;
}

export function RoleplayPage({ routeState }: RoleplayPageProps) {
    const [controlsPanelOpen, setControlsPanelOpen] = useState(true);
    const [showCharacterPicker, setShowCharacterPicker] = useState(true);
    const generateSceneRef = useRef<(() => void) | null>(null);
    const generateSceneWithPromptRef = useRef<((prompt: string) => void) | null>(null);
    const navigateToRoleplay = useNavigationStore((state) => state.navigateToRoleplay);

    const {
        activeCharacterId,
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
        setActiveCharacter(routeState.characterId);
        setShowCharacterPicker(false);
    }, [activeCharacterId, routeState?.characterId, setActiveCharacter]);

    useEffect(() => {
        navigateToRoleplay({ characterId: activeCharacterId });
    }, [activeCharacterId, navigateToRoleplay]);

    const isShowingCharacterPicker = showCharacterPicker || !activeCharacterId;

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
            <div
                style={{
                    display: 'flex',
                    height: 'var(--app-content-height, calc(100vh - 140px))',
                    overflow: 'hidden',
                }}
            >
                {!isShowingCharacterPicker && (
                    <>
                        {/* Character Sidebar */}
                        <div style={{ width: sidebar.size, flexShrink: 0, overflow: 'hidden' }}>
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
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
                            style={{
                                width: 320,
                                flexShrink: 0,
                                overflow: 'hidden',
                                borderLeft: '1px solid var(--theme-gray-5)',
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
        </PageScaffold>
    );
}

export default RoleplayPage;
