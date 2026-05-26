import { memo, useState, useCallback } from 'react';
import {
    Box,
    Group,
    Stack,
    Text,
    SegmentedControl,
    Image,
} from '@mantine/core';
import {
    IconArrowsLeftRight,
} from '@tabler/icons-react';
import type { PipelineStageResult } from '../../../../types/pipeline';
import { PIPELINE_STAGE_LABELS } from '../../../../types/pipeline';

interface PipelineCompareProps {
    results: PipelineStageResult[];
}

export const PipelineCompare = memo(function PipelineCompare({
    results,
}: PipelineCompareProps) {
    const [mode, setMode] = useState<'side_by_side' | 'slider'>('side_by_side');
    const [leftIndex, setLeftIndex] = useState(0);
    const [rightIndex, setRightIndex] = useState(Math.min(1, results.length - 1));

    const handleLeftChange = useCallback((value: string) => {
        setLeftIndex(parseInt(value, 10));
    }, []);

    const handleRightChange = useCallback((value: string) => {
        setRightIndex(parseInt(value, 10));
    }, []);

    if (results.length < 2) {
        return null;
    }

    const leftResult = results[leftIndex];
    const rightResult = results[rightIndex];

    return (
        <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap">
                <Text size="sm" fw={600}>
                    <IconArrowsLeftRight size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Compare Stages
                </Text>
                <SegmentedControl
                    size="xs"
                    value={mode}
                    onChange={(value) => setMode(value as 'side_by_side' | 'slider')}
                    data={[
                        { value: 'side_by_side', label: 'Side by Side' },
                        { value: 'slider', label: 'Slider' },
                    ]}
                />
            </Group>

            <Group gap="xs" wrap="nowrap">
                <SegmentedControl
                    size="xs"
                    value={String(leftIndex)}
                    onChange={handleLeftChange}
                    data={results.map((r, i) => ({
                        value: String(i),
                        label: PIPELINE_STAGE_LABELS[r.kind],
                    }))}
                />
                <Text size="xs" c="dimmed">vs</Text>
                <SegmentedControl
                    size="xs"
                    value={String(rightIndex)}
                    onChange={handleRightChange}
                    data={results.map((r, i) => ({
                        value: String(i),
                        label: PIPELINE_STAGE_LABELS[r.kind],
                    }))}
                />
            </Group>

            {mode === 'side_by_side' ? (
                <Group gap="sm" grow wrap="nowrap">
                    <Box style={{ flex: 1 }}>
                        <Image
                            src={leftResult.outputImage}
                            alt={PIPELINE_STAGE_LABELS[leftResult.kind]}
                            radius="sm"
                            fit="contain"
                            style={{ maxHeight: 400 }}
                        />
                        <Text size="xs" c="dimmed" ta="center" mt={4}>
                            {PIPELINE_STAGE_LABELS[leftResult.kind]}
                        </Text>
                    </Box>
                    <Box style={{ flex: 1 }}>
                        <Image
                            src={rightResult.outputImage}
                            alt={PIPELINE_STAGE_LABELS[rightResult.kind]}
                            radius="sm"
                            fit="contain"
                            style={{ maxHeight: 400 }}
                        />
                        <Text size="xs" c="dimmed" ta="center" mt={4}>
                            {PIPELINE_STAGE_LABELS[rightResult.kind]}
                        </Text>
                    </Box>
                </Group>
            ) : (
                <Box style={{ position: 'relative', maxHeight: 400 }}>
                    <Image
                        src={leftResult.outputImage}
                        alt={PIPELINE_STAGE_LABELS[leftResult.kind]}
                        radius="sm"
                        fit="contain"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            maxHeight: 400,
                            clipPath: 'inset(0 50% 0 0)',
                        }}
                    />
                    <Image
                        src={rightResult.outputImage}
                        alt={PIPELINE_STAGE_LABELS[rightResult.kind]}
                        radius="sm"
                        fit="contain"
                        style={{ maxHeight: 400 }}
                    />
                    <Text size="xs" c="dimmed" ta="center" mt={4}>
                        {PIPELINE_STAGE_LABELS[leftResult.kind]} ← → {PIPELINE_STAGE_LABELS[rightResult.kind]}
                    </Text>
                </Box>
            )}
        </Stack>
    );
});
