import { memo } from 'react';
import {
    Box,
    Group,
    Stack,
    Text,
    Paper,
    Image,
    Tooltip,
} from '@mantine/core';
import {
    IconDownload,
    IconEye,
} from '@tabler/icons-react';
import type { PipelineStageResult } from '../../../../types/pipeline';
import { PIPELINE_STAGE_LABELS } from '../../../../types/pipeline';
import { SwarmButton as Button } from '../../../../components/ui';
import { SwarmBadge } from '../../../../components/ui/SwarmBadge';

interface PipelineStageResultViewProps {
    results: PipelineStageResult[];
    onViewImage: (imageUrl: string) => void;
    onDownloadImage: (imageUrl: string) => void;
}

export const PipelineStageResultView = memo(function PipelineStageResultView({
    results,
    onViewImage,
    onDownloadImage,
}: PipelineStageResultViewProps) {
    if (results.length === 0) {
        return null;
    }

    return (
        <Stack gap="sm">
            <Text size="sm" fw={600}>Stage Outputs</Text>
            <Group gap="sm" wrap="wrap">
                {results.map((result) => {
                    const tone: 'success' | 'danger' = result.error ? 'danger' : 'success';
                    return (
                        <Paper
                            key={result.stageId}
                            p="xs"
                            withBorder
                            style={{
                                borderColor: result.error
                                    ? 'var(--mantine-color-red-5)'
                                    : 'var(--mantine-color-green-5)',
                                maxWidth: 220,
                            }}
                        >
                            <Stack gap="xs">
                                <Group gap={4}>
                                    <SwarmBadge
                                        tone={tone}
                                        emphasis="soft"
                                        size="sm"
                                    >
                                        {PIPELINE_STAGE_LABELS[result.kind]}
                                    </SwarmBadge>
                                </Group>
                                {result.outputImage ? (
                                    <Box style={{ position: 'relative' }}>
                                        <Image
                                            src={result.outputImage}
                                            alt={PIPELINE_STAGE_LABELS[result.kind]}
                                            radius="sm"
                                            fit="cover"
                                            height={120}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => onViewImage(result.outputImage)}
                                        />
                                        <Group
                                            gap={4}
                                            style={{
                                                position: 'absolute',
                                                top: 4,
                                                right: 4,
                                            }}
                                        >
                                            <Tooltip label="View full size">
                                                <Button
                                                    size="xs"
                                                    tone="secondary"
                                                    emphasis="solid"
                                                    onClick={() => onViewImage(result.outputImage)}
                                                >
                                                    <IconEye size={12} />
                                                </Button>
                                            </Tooltip>
                                            <Tooltip label="Download">
                                                <Button
                                                    size="xs"
                                                    tone="secondary"
                                                    emphasis="solid"
                                                    onClick={() => onDownloadImage(result.outputImage)}
                                                >
                                                    <IconDownload size={12} />
                                                </Button>
                                            </Tooltip>
                                        </Group>
                                    </Box>
                                ) : result.error ? (
                                    <Text size="xs" c="red">
                                        {result.error}
                                    </Text>
                                ) : null}
                            </Stack>
                        </Paper>
                    );
                })}
            </Group>
        </Stack>
    );
});
