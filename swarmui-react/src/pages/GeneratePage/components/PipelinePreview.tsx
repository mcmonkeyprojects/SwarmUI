import { memo } from 'react';
import { Group, Text } from '@mantine/core';
import { motion } from 'framer-motion';
import {
    IconSparkles,
    IconWand,
    IconArrowsMaximize,
    IconPhotoUp,
} from '@tabler/icons-react';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';
import { SwarmBadge } from '../../../components/ui/SwarmBadge';

interface PipelinePreviewProps {
    enableHiResFix: boolean;
    enableUpscale: boolean;
    enableChainUpscale: boolean;
    refinerControl: number;
    refinerUpscale: number;
    refinerUpscaleMethod?: string;
    chainUpscaleScale: number;
    currentMode: GenerateWorkspaceMode;
    onSwitchToPipeline: () => void;
}

const STAGE_ICONS = {
    generate: IconSparkles,
    refine: IconWand,
    latent_upscale: IconArrowsMaximize,
    ai_upscale: IconPhotoUp,
};

const STAGE_TONES: Record<string, string> = {
    generate: 'primary',
    refine: 'warning',
    latent_upscale: 'secondary',
    ai_upscale: 'success',
};

export const PipelinePreview = memo(function PipelinePreview({
    enableHiResFix,
    enableUpscale,
    enableChainUpscale,
    refinerControl,
    refinerUpscale,
    refinerUpscaleMethod = '',
    chainUpscaleScale,
    currentMode,
    onSwitchToPipeline,
}: PipelinePreviewProps) {
    const stages = [];

    stages.push({ kind: 'generate', label: 'Generate', detail: '' });

    if (enableHiResFix && refinerControl > 0) {
        stages.push({
            kind: 'refine',
            label: 'Refine',
            detail: `${Math.round(refinerControl * 100)}%`,
        });
    }

    if (enableUpscale && refinerUpscale > 1) {
        const isLatent = refinerUpscaleMethod.startsWith('latent-') || refinerUpscaleMethod.startsWith('latentmodel-');
        stages.push({
            kind: isLatent ? 'latent_upscale' : 'ai_upscale',
            label: isLatent ? 'Latent Upscale' : 'AI Upscale',
            detail: `${refinerUpscale}x`,
        });
    }

    if (enableChainUpscale && chainUpscaleScale > 1) {
        stages.push({
            kind: 'ai_upscale',
            label: 'Chain Upscale',
            detail: `${chainUpscaleScale}x`,
        });
    }

    if (stages.length <= 1 && currentMode !== 'pipeline') {
        return null;
    }

    return (
        <Group gap="xs" wrap="nowrap" style={{ padding: '8px 0' }}>
            {stages.map((stage, index) => {
                const Icon = STAGE_ICONS[stage.kind as keyof typeof STAGE_ICONS];
                const tone = STAGE_TONES[stage.kind] as 'primary' | 'secondary' | 'warning' | 'success';

                return (
                    <motion.div
                        key={`${stage.kind}-${index}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                    >
                        <Group gap="xs" wrap="nowrap">
                            {index > 0 && (
                                <Text size="xs" c="dimmed">-&gt;</Text>
                            )}
                            <SwarmBadge
                                tone={tone}
                                emphasis="soft"
                                size="sm"
                                style={{ cursor: currentMode !== 'pipeline' ? 'pointer' : 'default' }}
                                onClick={currentMode !== 'pipeline' ? onSwitchToPipeline : undefined}
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <Icon size={12} />
                                    <Text size="xs" fw={500}>{stage.label}</Text>
                                    {stage.detail && (
                                        <Text size="xs" c="dimmed">{stage.detail}</Text>
                                    )}
                                </Group>
                            </SwarmBadge>
                        </Group>
                    </motion.div>
                );
            })}
        </Group>
    );
});
