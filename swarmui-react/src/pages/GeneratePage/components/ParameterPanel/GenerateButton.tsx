import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Box, Group, Popover, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconPlayerPlay, IconPlayerPause, IconPlus, IconSparkles, IconStack2, IconUpload } from '@tabler/icons-react';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '../../../../components/ContextMenu';
import { SwarmActionIcon, SwarmButton } from '../../../../components/ui';
import { PromptSyntaxButton } from '../../../../components/PromptSyntaxButton';
import { SegmentSyntaxModal } from '../../../../components/modals/SegmentSyntaxModal';
import { RegionSyntaxModal } from '../../../../components/modals/RegionSyntaxModal';
import type { GenerateParams, Model } from '../../../../api/types';
import type { QualityCoachAnalysis, QualityCoachSeverity } from '../../utils/qualityCoach';

const QualityCoachLearningPanel = lazy(() => import('./QualityCoachLearningPanel').then((module) => ({ default: module.QualityCoachLearningPanel })));

export interface GenerateButtonProps {
    generating: boolean;
    onStop: () => void;
    onOpenSchedule: () => void;
    onGenerateVariations?: (count: number) => void;
    onGenerateAndUpscale?: () => void;
    qualityCoach?: QualityCoachAnalysis;
    onApplyQualityCoachFixes?: (overrides: Partial<GenerateParams>) => void;
    currentValues?: Partial<GenerateParams>;
    selectedModel?: Model | null;
    disabled?: boolean;
    disabledReason?: string;
    onInsertPromptSyntax?: (text: string) => void;
    previewing?: boolean;
    onTogglePreviews?: () => void;
}

function getSeverityColor(severity: QualityCoachSeverity): string {
    if (severity === 'high-risk') return 'red';
    if (severity === 'caution') return 'yellow';
    return 'green';
}

function getSeveritySurface(severity: QualityCoachSeverity): { border: string; background: string } {
    if (severity === 'high-risk') {
        return {
            border: '1px solid color-mix(in srgb, var(--mantine-color-red-6) 38%, transparent)',
            background: 'color-mix(in srgb, var(--mantine-color-red-9) 15%, transparent)',
        };
    }
    if (severity === 'caution') {
        return {
            border: '1px solid color-mix(in srgb, var(--mantine-color-yellow-6) 38%, transparent)',
            background: 'color-mix(in srgb, var(--mantine-color-yellow-9) 18%, transparent)',
        };
    }
    return {
        border: '1px solid color-mix(in srgb, var(--mantine-color-green-6) 32%, transparent)',
        background: 'color-mix(in srgb, var(--mantine-color-green-9) 16%, transparent)',
    };
}

export const GenerateButton = memo(function GenerateButton({
    generating,
    onStop,
    onOpenSchedule,
    onGenerateVariations,
    onGenerateAndUpscale,
    qualityCoach,
    onApplyQualityCoachFixes,
    currentValues,
    selectedModel,
    disabled,
    disabledReason,
    onInsertPromptSyntax,
    previewing,
}: GenerateButtonProps) {
    const contextMenu = useContextMenu();
    const [coachOpened, setCoachOpened] = useState(false);
    const [segmentModalOpen, setSegmentModalOpen] = useState(false);
    const [regionModalOpen, setRegionModalOpen] = useState(false);
    const [resolvedQualityCoach, setResolvedQualityCoach] = useState<QualityCoachAnalysis | null>(qualityCoach ?? null);
    const [coachLoading, setCoachLoading] = useState(false);
    const deferredCurrentValues = useDeferredValue(currentValues);
    const analyzeRef = useRef<((values: Partial<GenerateParams>, model: Model | null) => QualityCoachAnalysis) | null>(null);

    const generateMenuItems: ContextMenuItem[] = [
        {
            id: 'generate',
            label: 'Generate',
            icon: <IconPlayerPlay size={16} />,
            onClick: () => {
                const form = document.querySelector('form');
                if (form) form.requestSubmit();
            },
        },
        {
            id: 'generate-4',
            label: 'Generate 4 Variations',
            icon: <IconStack2 size={16} />,
            onClick: () => onGenerateVariations?.(4),
            disabled: !onGenerateVariations,
        },
        { id: 'divider-1', label: '', divider: true, onClick: () => { } },
        {
            id: 'add-queue',
            label: 'Add to Queue',
            icon: <IconPlus size={16} />,
            shortcut: 'Shift+Enter',
            onClick: onOpenSchedule,
        },
        {
            id: 'generate-upscale',
            label: 'Generate & Auto-Upscale',
            icon: <IconUpload size={16} />,
            onClick: () => onGenerateAndUpscale?.(),
            disabled: !onGenerateAndUpscale,
        },
    ];

    useEffect(() => {
        if (qualityCoach) {
            setResolvedQualityCoach(qualityCoach);
        }
    }, [qualityCoach]);

    useEffect(() => {
        if (!analyzeRef.current || qualityCoach) {
            return;
        }
        setResolvedQualityCoach(analyzeRef.current(deferredCurrentValues ?? {}, selectedModel ?? null));
    }, [deferredCurrentValues, qualityCoach, selectedModel]);

    const ensureQualityCoach = useCallback(async () => {
        if (qualityCoach) {
            setResolvedQualityCoach(qualityCoach);
            return qualityCoach;
        }
        if (analyzeRef.current) {
            const nextCoach = analyzeRef.current(deferredCurrentValues ?? {}, selectedModel ?? null);
            setResolvedQualityCoach(nextCoach);
            return nextCoach;
        }

        setCoachLoading(true);
        try {
            const module = await import('../../utils/qualityCoach');
            analyzeRef.current = module.analyzeGenerateQuality;
            const nextCoach = module.analyzeGenerateQuality(deferredCurrentValues ?? {}, selectedModel ?? null);
            setResolvedQualityCoach(nextCoach);
            return nextCoach;
        } finally {
            setCoachLoading(false);
        }
    }, [deferredCurrentValues, qualityCoach, selectedModel]);

    const leadingHealthBadges = useMemo(
        () => resolvedQualityCoach?.parameterHealth.filter(item => item.severity !== 'balanced') ?? [],
        [resolvedQualityCoach]
    );

    if (generating) {
        return (
            <SwarmButton
                tone="danger"
                emphasis="solid"
                size="lg"
                fullWidth
                className="gradient-button-danger"
                leftSection={<IconPlayerPause size={18} />}
                onClick={onStop}
            >
                Stop Generation
            </SwarmButton>
        );
    }

    const overallSeverity = resolvedQualityCoach?.overallSeverity ?? 'balanced';
    const severityColor = getSeverityColor(overallSeverity);
    const summarySurface = getSeveritySurface(overallSeverity);

    return (
        <>
            <style>{`
                .segmented-group-container {
                    gap: 0 !important;
                }
                .segmented-group-container > button:first-of-type {
                    border-top-left-radius: calc(12px * var(--theme-radius-multiplier)) !important;
                    border-bottom-left-radius: calc(12px * var(--theme-radius-multiplier)) !important;
                    border-top-right-radius: 0 !important;
                    border-bottom-right-radius: 0 !important;
                    height: auto !important;
                    align-self: stretch !important;
                }
                .segmented-group-container > .gradient-button {
                    border-top-left-radius: 0 !important;
                    border-bottom-left-radius: 0 !important;
                    border-top-right-radius: 0 !important;
                    border-bottom-right-radius: 0 !important;
                }
                .segmented-group-container.no-left-button > .gradient-button {
                    border-top-left-radius: calc(12px * var(--theme-radius-multiplier)) !important;
                    border-bottom-left-radius: calc(12px * var(--theme-radius-multiplier)) !important;
                    border-top-right-radius: 0 !important;
                    border-bottom-right-radius: 0 !important;
                }
                .segmented-group-container > button:last-of-type {
                    border-top-left-radius: 0 !important;
                    border-bottom-left-radius: 0 !important;
                    border-top-right-radius: calc(12px * var(--theme-radius-multiplier)) !important;
                    border-bottom-right-radius: calc(12px * var(--theme-radius-multiplier)) !important;
                    height: auto !important;
                    align-self: stretch !important;
                }
            `}</style>
            <Stack gap="xs">
                <Group align="stretch" gap={0} wrap="nowrap" className={`segmented-group-container ${onInsertPromptSyntax ? '' : 'no-left-button'}`}>
                    {onInsertPromptSyntax && (
                        <PromptSyntaxButton
                            size="lg"
                            onInsert={onInsertPromptSyntax}
                            onOpenModal={(id) => {
                                if (id === 'segment') {
                                    setSegmentModalOpen(true);
                                } else if (id === 'region' || id === 'object') {
                                    setRegionModalOpen(true);
                                }
                            }}
                            style={{
                                alignSelf: 'stretch',
                                minWidth: 48,
                                height: 'auto',
                                borderTopLeftRadius: 'calc(12px * var(--theme-radius-multiplier))',
                                borderBottomLeftRadius: 'calc(12px * var(--theme-radius-multiplier))',
                                borderTopRightRadius: 0,
                                borderBottomRightRadius: 0,
                            }}
                            disabled={generating || previewing || disabled}
                        />
                    )}
                    <Tooltip
                        label={disabledReason ?? 'Cannot generate'}
                        disabled={!disabled}
                        withArrow
                    >
                        <SwarmButton
                            type="submit"
                            size="lg"
                            fullWidth
                            tone="primary"
                            emphasis="solid"
                            className="gradient-button with-glow"
                            leftSection={<IconPlayerPlay size={18} />}
                            onContextMenu={disabled ? undefined : contextMenu.open}
                            style={{
                                flex: '1 1 auto',
                                opacity: disabled ? 0.5 : 1,
                                pointerEvents: disabled ? 'none' : undefined,
                                borderTopLeftRadius: onInsertPromptSyntax ? 0 : 'calc(12px * var(--theme-radius-multiplier))',
                                borderBottomLeftRadius: onInsertPromptSyntax ? 0 : 'calc(12px * var(--theme-radius-multiplier))',
                                borderTopRightRadius: 0,
                                borderBottomRightRadius: 0,
                            }}
                            disabled={disabled}
                        >
                            Generate
                        </SwarmButton>
                    </Tooltip>

                    <Popover
                        opened={coachOpened}
                        onChange={(opened) => {
                            setCoachOpened(opened);
                            if (opened) {
                                void ensureQualityCoach();
                            }
                        }}
                        width={760}
                        position="top-end"
                        withArrow
                        shadow="md"
                        withinPortal
                    >
                        <Popover.Target>
                            <Tooltip label="Open Quality Coach — live parameter diagnostics and suggestions.">
                                <SwarmActionIcon
                                    size="lg"
                                    tone={resolvedQualityCoach?.overallSeverity === 'high-risk' ? 'danger' : resolvedQualityCoach?.overallSeverity === 'caution' ? 'warning' : 'info'}
                                    emphasis={resolvedQualityCoach?.overallSeverity !== 'balanced' ? 'solid' : 'soft'}
                                    onClick={() => {
                                        setCoachOpened((opened) => !opened);
                                        void ensureQualityCoach();
                                    }}
                                    onMouseEnter={() => {
                                        void ensureQualityCoach();
                                    }}
                                    aria-label="Open Quality Coach"
                                    style={{
                                        alignSelf: 'stretch',
                                        minWidth: 48,
                                        height: 'auto',
                                        borderTopLeftRadius: 0,
                                        borderBottomLeftRadius: 0,
                                        borderTopRightRadius: 'calc(12px * var(--theme-radius-multiplier))',
                                        borderBottomRightRadius: 'calc(12px * var(--theme-radius-multiplier))',
                                    }}
                                >
                                    <IconSparkles size={18} />
                                </SwarmActionIcon>
                            </Tooltip>
                        </Popover.Target>
                        <Popover.Dropdown>
                            {resolvedQualityCoach ? (
                                <Suspense fallback={<Text size="sm" c="dimmed">Loading quality coach...</Text>}>
                                    <QualityCoachLearningPanel
                                        qualityCoach={resolvedQualityCoach}
                                        currentValues={currentValues}
                                        onApplyValues={onApplyQualityCoachFixes}
                                        onClose={() => setCoachOpened(false)}
                                    />
                                </Suspense>
                            ) : (
                                <Text size="sm" c="dimmed">
                                    {coachLoading ? 'Loading quality coach...' : 'Open the coach to load diagnostics and learning tools.'}
                                </Text>
                            )}
                        </Popover.Dropdown>
                    </Popover>
                </Group>

                <UnstyledButton
                    onClick={() => {
                        setCoachOpened(true);
                        void ensureQualityCoach();
                    }}
                    onMouseEnter={() => {
                        void ensureQualityCoach();
                    }}
                    style={{ width: '100%' }}
                >
                    <Box
                        px="sm"
                        py={8}
                        style={{
                            borderRadius: 8,
                            cursor: 'pointer',
                            transition: 'opacity 120ms ease',
                            ...summarySurface,
                        }}
                    >
                        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                            <Group gap={6} align="center" wrap="nowrap" style={{ flex: '1 1 auto', minWidth: 0 }}>
                                <Badge color={severityColor} variant="light" size="sm" style={{ flexShrink: 0 }}>
                                    {resolvedQualityCoach?.overallLabel ?? (coachLoading ? '...' : 'Ready')}
                                </Badge>
                                <Text size="xs" c="dimmed" truncate style={{ flex: '1 1 auto', minWidth: 0 }}>
                                    {resolvedQualityCoach?.summary ?? 'Open coach for live diagnostics'}
                                </Text>
                            </Group>
                            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                                {leadingHealthBadges.map((item) => (
                                    <Badge
                                        key={item.key}
                                        color={getSeverityColor(item.severity)}
                                        variant={item.severity === 'balanced' ? 'outline' : 'light'}
                                        size="xs"
                                    >
                                        {item.label}: {item.severity === 'balanced' ? 'OK' : item.severity === 'caution' ? '!' : '!!'}
                                    </Badge>
                                ))}
                            </Group>
                        </Group>
                    </Box>
                </UnstyledButton>
            </Stack>

            <ContextMenu
                position={contextMenu.position}
                items={generateMenuItems}
                onClose={contextMenu.close}
            />

            <SegmentSyntaxModal
                opened={segmentModalOpen}
                onClose={() => setSegmentModalOpen(false)}
                onSubmit={onInsertPromptSyntax ?? (() => undefined)}
            />
            <RegionSyntaxModal
                opened={regionModalOpen}
                onClose={() => setRegionModalOpen(false)}
                onSubmit={onInsertPromptSyntax ?? (() => undefined)}
            />
        </>
    );
});
