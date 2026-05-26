import { memo, useCallback, useState, useEffect } from 'react';
import {
    Box,
    Stack,
    Group,
    Text,
    TextInput,
} from '@mantine/core';
import {
    IconPlayerPlay,
    IconPlayerStop,
} from '@tabler/icons-react';
import type { GenerateParams } from '../../../../api/types';
import type { PipelineStageKind, PipelineStageConfig } from '../../../../types/pipeline';
import { usePipelineStore } from '../../../../stores/pipelineStore';
import { PipelineStageCard } from './PipelineStageCard';
import { PipelineFlow } from './PipelineFlow';
import { PipelinePresets } from './PipelinePresets';
import { PipelineProgress } from './PipelineProgress';
import { PipelineStageResultView } from './PipelineStageResultView';
import { PipelineCompare } from './PipelineCompare';
import { SwarmButton as Button } from '../../../../components/ui';

interface PipelineBuilderProps {
    modelOptions: { value: string; label: string }[];
    upscaleMethodOptions: { value: string; label: string }[];
    onRunPipeline: (baseParams: Partial<GenerateParams>) => void;
    onStopPipeline: () => void;
    isRunning: boolean;
    baseParams: Partial<GenerateParams>;
}

export const PipelineBuilder = memo(function PipelineBuilder({
    modelOptions,
    upscaleMethodOptions,
    onRunPipeline,
    onStopPipeline,
    isRunning,
    baseParams,
}: PipelineBuilderProps) {
    const stages = usePipelineStore((state) => state.stages);
    const pipelineName = usePipelineStore((state) => state.pipelineName);
    const currentStageIndex = usePipelineStore((state) => state.currentStageIndex);
    const currentRun = usePipelineStore((state) => state.currentRun);
    const stageResults = usePipelineStore((state) => state.stageResults);
    const setPipelineName = usePipelineStore((state) => state.setPipelineName);
    const addStage = usePipelineStore((state) => state.addStage);
    const removeStage = usePipelineStore((state) => state.removeStage);
    const toggleStage = usePipelineStore((state) => state.toggleStage);
    const reorderStages = usePipelineStore((state) => state.reorderStages);
    const updateStageSettings = usePipelineStore((state) => state.updateStageSettings);
    const savePreset = usePipelineStore((state) => state.savePreset);
    const userPresets = usePipelineStore((state) => state.userPresets);
    const deletePreset = usePipelineStore((state) => state.deletePreset);

    const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
    const [showCompare, setShowCompare] = useState(false);

    const toggleExpand = useCallback((stageId: string) => {
        setExpandedStages((prev) => {
            const next = new Set(prev);
            if (next.has(stageId)) {
                next.delete(stageId);
            }
            else {
                next.add(stageId);
            }
            return next;
        });
    }, []);

    const handleAddStage = useCallback((kind: PipelineStageKind) => {
        addStage(kind);
    }, [addStage]);

    const handleRemoveStage = useCallback((stageId: string) => {
        removeStage(stageId);
        setExpandedStages((prev) => {
            const next = new Set(prev);
            next.delete(stageId);
            return next;
        });
    }, [removeStage]);

    const handleMoveUp = useCallback((index: number) => {
        if (index > 0) {
            reorderStages(index, index - 1);
        }
    }, [reorderStages]);

    const handleMoveDown = useCallback((index: number) => {
        if (index < stages.length - 1) {
            reorderStages(index, index + 1);
        }
    }, [reorderStages, stages.length]);

    const handleUpdateSettings = useCallback((stageId: string, settings: Record<string, unknown>) => {
        updateStageSettings(stageId, settings);
    }, [updateStageSettings]);

    const handleLoadPreset = useCallback((presetStages: PipelineStageConfig[]) => {
        const nextStages = presetStages.map((s) => ({
            ...s,
            id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        }));
        usePipelineStore.setState({
            stages: nextStages,
            activePresetId: null,
            currentRun: null,
            currentStageIndex: 0,
            stageResults: {},
            isRunning: false,
        });
    }, []);

    const handleSavePreset = useCallback((name: string, description: string) => {
        const preset = savePreset(name, description);
        const existing = usePipelineStore.getState().stages;
        usePipelineStore.setState({
            stages: existing.map((s) => ({ ...s })),
            activePresetId: preset.id,
        });
    }, [savePreset]);

    const handleRunPipeline = useCallback(() => {
        onRunPipeline(baseParams);
    }, [onRunPipeline, baseParams]);

    const handleRunStage = useCallback((stageId: string) => {
        const state = usePipelineStore.getState();
        const stageIndex = state.stages.findIndex((s) => s.id === stageId);
        if (stageIndex < 0) {
            return;
        }
        usePipelineStore.setState({
            currentRun: {
                id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                pipelineId: state.pipelineId,
                pipelineName: state.pipelineName,
                stages: state.stages,
                startedAt: Date.now(),
                stagesCompleted: 0,
                stagesTotal: 1,
                status: 'running',
            },
            currentStageIndex: stageIndex,
            stageResults: {},
            isRunning: true,
        });
        onRunPipeline(baseParams);
    }, [onRunPipeline, baseParams]);

    const handleViewImage = useCallback((imageUrl: string) => {
        window.open(imageUrl, '_blank');
    }, []);

    const handleDownloadImage = useCallback((imageUrl: string) => {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = imageUrl.split('/').pop() || 'image';
        link.click();
    }, []);

    const enabledStages = stages.filter((s) => s.enabled);
    const resultValues = Object.values(stageResults);
    const hasResults = resultValues.length > 0;
    const hasMultipleResults = resultValues.length >= 2;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'Enter' && !isRunning && enabledStages.length > 0) {
                e.preventDefault();
                handleRunPipeline();
            }
            else if (e.key === 'Escape' && isRunning) {
                e.preventDefault();
                onStopPipeline();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isRunning, enabledStages.length, handleRunPipeline, onStopPipeline]);

    let runButton: React.ReactNode;
    if (isRunning) {
        runButton = (
            <Button
                size="sm"
                tone="danger"
                emphasis="solid"
                leftSection={<IconPlayerStop size={16} />}
                onClick={onStopPipeline}
            >
                Stop Pipeline
            </Button>
        );
    }
    else {
        runButton = (
            <Button
                size="sm"
                tone="primary"
                emphasis="solid"
                leftSection={<IconPlayerPlay size={16} />}
                onClick={handleRunPipeline}
                disabled={enabledStages.length === 0}
            >
                Run Pipeline
            </Button>
        );
    }

    return (
        <Stack gap="md" role="region" aria-label="Pipeline Builder">
            <Group justify="space-between" wrap="nowrap">
                <TextInput
                    size="sm"
                    placeholder="Pipeline name"
                    value={pipelineName}
                    onChange={(e) => setPipelineName(e.currentTarget.value)}
                    disabled={isRunning}
                    style={{ flex: 1, maxWidth: 300 }}
                    aria-label="Pipeline name"
                />
                <Group gap="xs" wrap="nowrap">
                    <PipelinePresets
                        userPresets={userPresets}
                        onLoadPreset={handleLoadPreset}
                        onSavePreset={handleSavePreset}
                        onDeletePreset={deletePreset}
                        disabled={isRunning}
                    />
                    {runButton}
                </Group>
            </Group>

            <PipelineProgress
                stages={stages}
                currentStageIndex={currentStageIndex}
                stageResults={stageResults}
                isRunning={isRunning}
                pipelineError={currentRun?.error}
                aria-live="polite"
            />

            <PipelineFlow
                onAddStage={handleAddStage}
                disabled={isRunning}
            >
                {stages.map((stage, index) => (
                    <PipelineStageCard
                        key={stage.id}
                        stage={stage}
                        index={index}
                        totalStages={stages.length}
                        isRunning={isRunning}
                        isCurrentStage={isRunning && currentStageIndex === index}
                        isCompleted={isRunning && currentStageIndex > index}
                        isExpanded={expandedStages.has(stage.id)}
                        onToggleEnabled={() => toggleStage(stage.id)}
                        onRemove={() => handleRemoveStage(stage.id)}
                        onExpandToggle={() => toggleExpand(stage.id)}
                        onRunStage={() => handleRunStage(stage.id)}
                        onUpdateSettings={(settings) => handleUpdateSettings(stage.id, settings)}
                        onMoveUp={() => handleMoveUp(index)}
                        onMoveDown={() => handleMoveDown(index)}
                        modelOptions={modelOptions}
                        upscaleMethodOptions={upscaleMethodOptions}
                    />
                ))}
            </PipelineFlow>

            {hasResults && (
                <PipelineStageResultView
                    results={resultValues}
                    onViewImage={handleViewImage}
                    onDownloadImage={handleDownloadImage}
                />
            )}

            {hasMultipleResults && (
                <Box>
                    <Group justify="space-between" mb={8}>
                        <Text size="sm" fw={600}>Stage Comparison</Text>
                        <Button
                            size="xs"
                            tone="secondary"
                            emphasis="ghost"
                            onClick={() => setShowCompare(!showCompare)}
                        >
                            {showCompare ? 'Hide' : 'Show'} Compare
                        </Button>
                    </Group>
                    {showCompare && (
                        <PipelineCompare results={resultValues} />
                    )}
                </Box>
            )}
        </Stack>
    );
});

export { PipelineStageCard, PipelineFlow, PipelinePresets };
