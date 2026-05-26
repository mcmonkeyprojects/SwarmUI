import { memo } from 'react';
import {
    Stack,
    Group,
    Text,
    Paper,
    Select,
    Slider,
    Tooltip,
} from '@mantine/core';
import {
    IconSparkles,
    IconArrowsMaximize,
    IconWand,
    IconPhotoUp,
    IconTrash,
    IconPlayerPlay,
    IconChevronDown,
    IconChevronUp,
} from '@tabler/icons-react';
import { motion } from 'framer-motion';
import type { PipelineStageConfig, PipelineStageKind } from '../../../../types/pipeline';
import { SwarmSwitch } from '../../../../components/ui/SwarmSwitch';
import { SwarmButton as Button } from '../../../../components/ui';
import { SwarmBadge } from '../../../../components/ui/SwarmBadge';

const STAGE_ICONS: Record<PipelineStageKind, typeof IconSparkles> = {
    generate: IconSparkles,
    latent_upscale: IconArrowsMaximize,
    refine: IconWand,
    ai_upscale: IconPhotoUp,
};

const STAGE_TONES: Record<PipelineStageKind, string> = {
    generate: 'primary',
    latent_upscale: 'secondary',
    refine: 'warning',
    ai_upscale: 'success',
};

interface PipelineStageCardProps {
    stage: PipelineStageConfig;
    index: number;
    totalStages: number;
    isRunning: boolean;
    isCurrentStage: boolean;
    isCompleted: boolean;
    isExpanded: boolean;
    onToggleEnabled: () => void;
    onRemove: () => void;
    onExpandToggle: () => void;
    onRunStage: () => void;
    onUpdateSettings: (settings: Record<string, unknown>) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    modelOptions: { value: string; label: string }[];
    upscaleMethodOptions: { value: string; label: string }[];
}

export const PipelineStageCard = memo(function PipelineStageCard({
    stage,
    index,
    totalStages,
    isRunning,
    isCurrentStage,
    isCompleted,
    isExpanded,
    onToggleEnabled,
    onRemove,
    onExpandToggle,
    onRunStage,
    onUpdateSettings,
    onMoveUp,
    onMoveDown,
    modelOptions,
    upscaleMethodOptions,
}: PipelineStageCardProps) {
    const StageIcon = STAGE_ICONS[stage.kind];
    const tone = STAGE_TONES[stage.kind];
    const canMoveUp = index > 0;
    const canMoveDown = index < totalStages - 1;

    let statusBadge: React.ReactNode = null;
    if (isCurrentStage && isRunning) {
        statusBadge = <SwarmBadge tone="info" emphasis="solid">Running</SwarmBadge>;
    }
    else if (isCompleted) {
        statusBadge = <SwarmBadge tone="success" emphasis="soft">Complete</SwarmBadge>;
    }

    let settingsContent: React.ReactNode = null;
    if (isExpanded) {
        if (stage.kind === 'generate') {
            settingsContent = renderGenerateSettings(stage, onUpdateSettings, modelOptions);
        }
        else if (stage.kind === 'latent_upscale') {
            settingsContent = renderLatentUpscaleSettings(stage, onUpdateSettings, upscaleMethodOptions);
        }
        else if (stage.kind === 'refine') {
            settingsContent = renderRefineSettings(stage, onUpdateSettings, modelOptions);
        }
        else if (stage.kind === 'ai_upscale') {
            settingsContent = renderAIUpscaleSettings(stage, onUpdateSettings, upscaleMethodOptions);
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{
                opacity: stage.enabled ? 1 : 0.5,
                y: 0,
                scale: isCurrentStage ? 1.02 : 1,
            }}
            transition={{
                duration: 0.2,
                scale: { duration: 0.15, ease: 'easeOut' },
            }}
        >
            <motion.div
                animate={isCurrentStage ? {
                    boxShadow: ['0 0 0 0 rgba(59, 130, 246, 0)', '0 0 0 4px rgba(59, 130, 246, 0.3)', '0 0 0 0 rgba(59, 130, 246, 0)'],
                } : {}}
                transition={{
                    duration: 1.5,
                    repeat: isCurrentStage ? Infinity : 0,
                    ease: 'easeInOut',
                }}
            >
                <Paper
                p="sm"
                withBorder
                role="article"
                aria-label={`Pipeline stage: ${stage.label}`}
                style={{
                    borderColor: isCurrentStage
                        ? 'var(--mantine-color-blue-5)'
                        : isCompleted
                            ? 'var(--mantine-color-green-5)'
                            : 'var(--mantine-color-invokeGray-6)',
                    opacity: stage.enabled ? 1 : 0.5,
                }}
            >
                <Stack gap="xs">
                    <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap">
                            <SwarmSwitch
                                size="xs"
                                checked={stage.enabled}
                                onChange={onToggleEnabled}
                                disabled={isRunning}
                            />
                            <StageIcon size={18} />
                            <Text size="sm" fw={600}>{stage.label}</Text>
                            <SwarmBadge tone={tone as 'primary' | 'secondary' | 'warning' | 'success'} emphasis="soft" size="sm">
                                Step {index + 1}
                            </SwarmBadge>
                            {statusBadge}
                        </Group>
                        <Group gap={4}>
                            <Tooltip label="Move up">
                                <Button
                                    size="xs"
                                    tone="secondary"
                                    emphasis="ghost"
                                    onClick={onMoveUp}
                                    disabled={!canMoveUp || isRunning}
                                >
                                    <IconChevronUp size={14} />
                                </Button>
                            </Tooltip>
                            <Tooltip label="Move down">
                                <Button
                                    size="xs"
                                    tone="secondary"
                                    emphasis="ghost"
                                    onClick={onMoveDown}
                                    disabled={!canMoveDown || isRunning}
                                >
                                    <IconChevronDown size={14} />
                                </Button>
                            </Tooltip>
                            <Tooltip label="Run only this stage">
                                <Button
                                    size="xs"
                                    tone="primary"
                                    emphasis="soft"
                                    onClick={onRunStage}
                                    disabled={isRunning}
                                >
                                    <IconPlayerPlay size={14} />
                                </Button>
                            </Tooltip>
                            <Tooltip label={isExpanded ? 'Show less' : 'Show settings'}>
                                <Button
                                    size="xs"
                                    tone="secondary"
                                    emphasis="ghost"
                                    onClick={onExpandToggle}
                                    disabled={isRunning && isCurrentStage}
                                >
                                    <IconChevronDown
                                        size={14}
                                        style={{
                                            transform: isExpanded ? 'rotate(180deg)' : undefined,
                                            transition: 'transform 0.2s',
                                        }}
                                    />
                                </Button>
                            </Tooltip>
                            <Tooltip label="Remove stage">
                                <Button
                                    size="xs"
                                    tone="danger"
                                    emphasis="ghost"
                                    onClick={onRemove}
                                    disabled={isRunning || totalStages <= 1}
                                >
                                    <IconTrash size={14} />
                                </Button>
                            </Tooltip>
                        </Group>
                    </Group>

                    {!isExpanded && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                            {summarizeSettings(stage)}
                        </Text>
                    )}

                    {settingsContent}
                </Stack>
            </Paper>
            </motion.div>
        </motion.div>
    );
});

function summarizeSettings(stage: PipelineStageConfig): string {
    const s = stage.settings;
    if (stage.kind === 'generate') {
        const parts: string[] = [];
        if (s.steps) parts.push(`${s.steps} steps`);
        if (s.cfgscale) parts.push(`CFG ${s.cfgscale}`);
        return parts.length > 0 ? parts.join(' · ') : 'Default settings';
    }
    if (stage.kind === 'latent_upscale') {
        const parts: string[] = [];
        if (s.refinerupscale) parts.push(`${s.refinerupscale}x`);
        if (s.refinerupscalemethod) parts.push(formatMethodLabel(String(s.refinerupscalemethod)));
        return parts.length > 0 ? parts.join(' · ') : 'Default settings';
    }
    if (stage.kind === 'refine') {
        const parts: string[] = [];
        if (s.refinercontrolpercentage) parts.push(`Denoise ${Math.round(Number(s.refinercontrolpercentage) * 100)}%`);
        if (s.refinermodel) parts.push(formatModelLabel(String(s.refinermodel)));
        return parts.length > 0 ? parts.join(' · ') : 'Default settings';
    }
    if (stage.kind === 'ai_upscale') {
        const parts: string[] = [];
        if (s.refinerupscale) parts.push(`${s.refinerupscale}x`);
        if (s.refinerupscalemethod) parts.push(formatMethodLabel(String(s.refinerupscalemethod)));
        return parts.length > 0 ? parts.join(' · ') : 'Default settings';
    }
    return 'Default settings';
}

function formatMethodLabel(method: string): string {
    if (method.startsWith('pixel-')) return 'Pixel: ' + method.replace('pixel-', '');
    if (method.startsWith('latent-')) return 'Latent: ' + method.replace('latent-', '');
    if (method.startsWith('model-')) return 'Model: ' + method.replace('model-', '');
    if (method.startsWith('latentmodel-')) return 'Latent Model: ' + method.replace('latentmodel-', '');
    return method;
}

function formatModelLabel(model: string): string {
    const parts = model.split('/');
    return parts[parts.length - 1] || model;
}

function renderGenerateSettings(
    stage: PipelineStageConfig,
    onUpdate: (settings: Record<string, unknown>) => void,
    modelOptions: { value: string; label: string }[],
): React.ReactNode {
    return (
        <Stack gap="xs" pt="xs">
            <Select
                label="Model"
                size="xs"
                data={modelOptions}
                value={typeof stage.settings.model === 'string' ? stage.settings.model : ''}
                onChange={(value) => onUpdate({ model: value || '' })}
                searchable
                clearable
                nothingFoundMessage="No models found"
            />
            <Slider
                label="Steps"
                size="sm"
                min={1}
                max={200}
                value={typeof stage.settings.steps === 'number' ? stage.settings.steps : 20}
                onChange={(value) => onUpdate({ steps: value })}
                marks={[{ value: 20, label: '20' }, { value: 50, label: '50' }, { value: 100, label: '100' }]}
            />
            <Slider
                label="CFG Scale"
                size="sm"
                min={1}
                max={20}
                step={0.5}
                value={typeof stage.settings.cfgscale === 'number' ? stage.settings.cfgscale : 7}
                onChange={(value) => onUpdate({ cfgscale: value })}
                marks={[{ value: 7, label: '7' }, { value: 10, label: '10' }]}
            />
        </Stack>
    );
}

function renderLatentUpscaleSettings(
    stage: PipelineStageConfig,
    onUpdate: (settings: Record<string, unknown>) => void,
    upscaleMethodOptions: { value: string; label: string }[],
): React.ReactNode {
    const latentMethods = upscaleMethodOptions.filter(
        (o) => o.value.startsWith('latent-') || o.value.startsWith('latentmodel-')
    );
    return (
        <Stack gap="xs" pt="xs">
            <Slider
                label="Scale Factor"
                size="sm"
                min={1}
                max={4}
                step={0.25}
                value={typeof stage.settings.refinerupscale === 'number' ? stage.settings.refinerupscale : 2}
                onChange={(value) => onUpdate({ refinerupscale: value })}
                marks={[{ value: 1, label: '1x' }, { value: 2, label: '2x' }, { value: 3, label: '3x' }, { value: 4, label: '4x' }]}
            />
            <Select
                label="Upscale Method"
                size="xs"
                data={latentMethods.length > 0 ? latentMethods : upscaleMethodOptions}
                value={typeof stage.settings.refinerupscalemethod === 'string' ? stage.settings.refinerupscalemethod : ''}
                onChange={(value) => onUpdate({ refinerupscalemethod: value || '' })}
                searchable
            />
        </Stack>
    );
}

function renderRefineSettings(
    stage: PipelineStageConfig,
    onUpdate: (settings: Record<string, unknown>) => void,
    modelOptions: { value: string; label: string }[],
): React.ReactNode {
    return (
        <Stack gap="xs" pt="xs">
            <Slider
                label="Denoise Strength"
                size="sm"
                min={0.05}
                max={0.7}
                step={0.05}
                value={typeof stage.settings.refinercontrolpercentage === 'number' ? stage.settings.refinercontrolpercentage : 0.3}
                onChange={(value) => onUpdate({ refinercontrolpercentage: value })}
                marks={[{ value: 0.1, label: '0.1' }, { value: 0.3, label: '0.3' }, { value: 0.5, label: '0.5' }]}
            />
            <Slider
                label="Steps"
                size="sm"
                min={5}
                max={50}
                value={typeof stage.settings.refinersteps === 'number' ? stage.settings.refinersteps : 20}
                onChange={(value) => onUpdate({ refinersteps: value })}
                marks={[{ value: 10, label: '10' }, { value: 20, label: '20' }]}
            />
            <Select
                label="Refiner Model"
                size="xs"
                data={modelOptions}
                value={typeof stage.settings.refinermodel === 'string' ? stage.settings.refinermodel : ''}
                onChange={(value) => onUpdate({ refinermodel: value || '' })}
                searchable
                clearable
                nothingFoundMessage="Use base model"
            />
            <Slider
                label="CFG Scale"
                size="sm"
                min={1}
                max={15}
                step={0.5}
                value={typeof stage.settings.refinercfgscale === 'number' ? stage.settings.refinercfgscale : 7}
                onChange={(value) => onUpdate({ refinercfgscale: value })}
                marks={[{ value: 7, label: '7' }, { value: 10, label: '10' }]}
            />
        </Stack>
    );
}

function renderAIUpscaleSettings(
    stage: PipelineStageConfig,
    onUpdate: (settings: Record<string, unknown>) => void,
    upscaleMethodOptions: { value: string; label: string }[],
): React.ReactNode {
    return (
        <Stack gap="xs" pt="xs">
            <Slider
                label="Scale Factor"
                size="sm"
                min={1}
                max={4}
                step={0.25}
                value={typeof stage.settings.refinerupscale === 'number' ? stage.settings.refinerupscale : 2}
                onChange={(value) => onUpdate({ refinerupscale: value })}
                marks={[{ value: 1, label: '1x' }, { value: 2, label: '2x' }, { value: 3, label: '3x' }, { value: 4, label: '4x' }]}
            />
            <Select
                label="Upscaler Model"
                size="xs"
                data={upscaleMethodOptions}
                value={typeof stage.settings.refinerupscalemethod === 'string' ? stage.settings.refinerupscalemethod : ''}
                onChange={(value) => onUpdate({ refinerupscalemethod: value || '' })}
                searchable
            />
        </Stack>
    );
}
