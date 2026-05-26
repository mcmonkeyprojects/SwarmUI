import { memo } from 'react';
import {
    Box,
    Stack,
    Menu,
} from '@mantine/core';
import {
    IconPlus,
    IconSparkles,
    IconArrowsMaximize,
    IconWand,
    IconPhotoUp,
    IconChevronDown,
} from '@tabler/icons-react';
import type { PipelineStageKind } from '../../../../types/pipeline';
import { PIPELINE_STAGE_LABELS } from '../../../../types/pipeline';
import { SwarmButton as Button } from '../../../../components/ui';

interface PipelineFlowProps {
    children: React.ReactNode;
    onAddStage: (kind: PipelineStageKind) => void;
    disabled: boolean;
}

export const PipelineFlow = memo(function PipelineFlow({
    children,
    onAddStage,
    disabled,
}: PipelineFlowProps) {
    return (
        <Stack gap={0}>
            {children}
            <Box style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                <Menu shadow="md" width={200} position="bottom-start">
                    <Menu.Target>
                        <Button
                            size="xs"
                            tone="secondary"
                            emphasis="soft"
                            leftSection={<IconPlus size={14} />}
                            rightSection={<IconChevronDown size={12} />}
                            disabled={disabled}
                        >
                            Add Stage
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Add pipeline stage</Menu.Label>
                        <Menu.Item
                            leftSection={<IconSparkles size={16} />}
                            onClick={() => onAddStage('generate')}
                        >
                            {PIPELINE_STAGE_LABELS.generate}
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<IconArrowsMaximize size={16} />}
                            onClick={() => onAddStage('latent_upscale')}
                        >
                            {PIPELINE_STAGE_LABELS.latent_upscale}
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<IconWand size={16} />}
                            onClick={() => onAddStage('refine')}
                        >
                            {PIPELINE_STAGE_LABELS.refine}
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<IconPhotoUp size={16} />}
                            onClick={() => onAddStage('ai_upscale')}
                        >
                            {PIPELINE_STAGE_LABELS.ai_upscale}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Box>
        </Stack>
    );
});
