import { Group, Menu, Stack, Text } from '@mantine/core';
import {
    IconArrowsMaximize,
    IconBrain,
    IconBug,
    IconColumns,
    IconDotsVertical,
    IconKeyboard,
    IconLayoutGrid,
    IconRoute2,
} from '@tabler/icons-react';
import { QueueStatusBadge } from '../../../components/QueueStatusBadge';
import { SwarmActionIcon, SwarmBadge, SwarmButton } from '../../../components/ui';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';

interface GenerateStageHeaderProps {
    currentMode: GenerateWorkspaceMode;
    generating: boolean;
    selectedBackend: string;
    selectedModelName: string;
    generatedImageCount: number;
    stageHeaderCopy: string;
    isGalleryDrawer: boolean;
    usesAdvancedRail: boolean;
    showGalleryRail: boolean;
    focusMode: boolean;
    assistantPanelOpen: boolean;
    onOpenGalleryDrawer: () => void;
    onToggleGalleryPinned: () => void;
    onToggleFocusMode: () => void;
    onOpenComparison: () => void;
    onToggleAssistantPanel: () => void;
    onOpenDiagnostics: () => void;
    onOpenShortcuts: () => void;
    onPromoteToWorkflow: () => void;
}

export function GenerateStageHeader({
    currentMode,
    generating,
    selectedBackend,
    selectedModelName,
    generatedImageCount,
    stageHeaderCopy,
    isGalleryDrawer,
    usesAdvancedRail,
    showGalleryRail,
    focusMode,
    assistantPanelOpen,
    onOpenGalleryDrawer,
    onToggleGalleryPinned,
    onToggleFocusMode,
    onOpenComparison,
    onToggleAssistantPanel,
    onOpenDiagnostics,
    onOpenShortcuts,
    onPromoteToWorkflow,
}: GenerateStageHeaderProps) {
    const modeLabel = currentMode === 'quick' ? 'Quick'
        : currentMode === 'guided' ? 'Guided'
            : currentMode === 'video' ? 'Video'
                : currentMode === 'pipeline' ? 'Pipeline'
                    : 'Advanced';

    return (
        <>
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <Stack gap={2}>
                    <Group gap="xs" wrap="wrap">
                        <Text size="xs" fw={700} tt="uppercase" c="var(--theme-text-secondary)">
                            Stage
                        </Text>
                        <SwarmBadge tone="primary" emphasis="soft">
                            {modeLabel}
                        </SwarmBadge>
                        <SwarmBadge tone={generating ? 'info' : 'success'} emphasis="soft" contrast="strong">
                            {generating ? 'Generating' : 'Ready'}
                        </SwarmBadge>
                        {selectedBackend ? (
                            <SwarmBadge tone="secondary" emphasis="soft">
                                {selectedBackend}
                            </SwarmBadge>
                        ) : null}
                        {generatedImageCount > 0 ? (
                            <SwarmBadge tone="secondary" emphasis="soft">
                                {generatedImageCount} in session
                            </SwarmBadge>
                        ) : null}
                        <QueueStatusBadge compact />
                    </Group>
                    <Text size="sm" fw={600}>
                        {selectedModelName || 'No model selected yet'}
                    </Text>
                    {generating && (
                        <Text size="xs" c="var(--theme-text-secondary)">
                            {stageHeaderCopy}
                        </Text>
                    )}
                </Stack>

                <Group gap="xs" wrap="wrap">
                    {isGalleryDrawer ? (
                        <SwarmButton
                            tone="secondary"
                            emphasis="soft"
                            leftSection={<IconLayoutGrid size={14} />}
                            onClick={onOpenGalleryDrawer}
                        >
                            Session Gallery
                        </SwarmButton>
                    ) : usesAdvancedRail ? (
                        <SwarmButton
                            tone={showGalleryRail ? 'primary' : 'secondary'}
                            emphasis="soft"
                            leftSection={<IconLayoutGrid size={14} />}
                            onClick={onToggleGalleryPinned}
                        >
                            {showGalleryRail ? 'Hide Gallery' : 'Show Gallery'}
                        </SwarmButton>
                    ) : (
                        <SwarmButton
                            tone="secondary"
                            emphasis="soft"
                            leftSection={<IconLayoutGrid size={14} />}
                            onClick={onOpenGalleryDrawer}
                        >
                            Session Gallery
                        </SwarmButton>
                    )}
                    <SwarmActionIcon
                        tone={focusMode ? 'warning' : 'secondary'}
                        emphasis="soft"
                        label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
                        onClick={onToggleFocusMode}
                    >
                        <IconArrowsMaximize size={16} />
                    </SwarmActionIcon>
                    <SwarmActionIcon
                        tone="secondary"
                        emphasis="ghost"
                        label="Compare the two most recent outputs"
                        onClick={onOpenComparison}
                        disabled={generatedImageCount < 2}
                    >
                        <IconColumns size={16} />
                    </SwarmActionIcon>
                    <Menu shadow="md" position="bottom-end" withinPortal>
                        <Menu.Target>
                            <SwarmActionIcon
                                tone="secondary"
                                emphasis="ghost"
                                label="Open stage actions"
                            >
                                <IconDotsVertical size={16} />
                            </SwarmActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<IconBrain size={14} />}
                                onClick={onToggleAssistantPanel}
                            >
                                {assistantPanelOpen ? 'Close Prompt Assistant' : 'Open Prompt Assistant'}
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<IconBug size={14} />}
                                onClick={onOpenDiagnostics}
                            >
                                Show Diagnostics
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<IconKeyboard size={14} />}
                                onClick={onOpenShortcuts}
                            >
                                Keyboard Shortcuts
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={<IconRoute2 size={14} />}
                                onClick={onPromoteToWorkflow}
                            >
                                Send To Workflow
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Group>
        </>
    );
}
