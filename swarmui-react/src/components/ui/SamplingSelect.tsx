import { memo, useMemo } from 'react';
import { Box, Select, Stack, Text, type SelectProps } from '@mantine/core';
import type { SamplerOption, SchedulerOption } from '../../data/samplerData';

type SamplingKind = 'sampler' | 'scheduler';
type SamplingOption = SamplerOption | SchedulerOption;

export interface SamplingSelectProps extends Omit<SelectProps, 'data' | 'renderOption'> {
    kind: SamplingKind;
    data: SamplingOption[];
    withSelectedDescription?: boolean;
    tooltipWidth?: number;
}

function SamplingTooltipContent({ option }: { option: SamplingOption }) {
    return (
        <Stack gap={6}>
            <Stack gap={2}>
                <Text size="sm" fw={700}>{option.label}</Text>
                <Text size="xs" c="dimmed">{option.description}</Text>
            </Stack>
            <Text size="xs">
                <Text span fw={700}>What it is:</Text> {option.whatItIs}
            </Text>
            <Text size="xs">
                <Text span fw={700}>Good at:</Text> {option.goodAt}
            </Text>
            <Text size="xs">
                <Text span fw={700}>Works best with:</Text> {option.bestWith}
            </Text>
            <Text size="xs">
                <Text span fw={700}>Recommended styles:</Text> {option.recommendedStyles}
            </Text>
            {option.notes ? (
                <Text size="xs">
                    <Text span fw={700}>Notes:</Text> {option.notes}
                </Text>
            ) : null}
        </Stack>
    );
}

export const SamplingSelect = memo(function SamplingSelect({
    kind,
    data,
    value,
    description,
    withSelectedDescription = true,
    tooltipWidth = 360,
    nothingFoundMessage,
    comboboxProps,
    ...props
}: SamplingSelectProps) {
    const optionMap = useMemo(
        () => new Map(data.map((option) => [option.value, option])),
        [data],
    );

    const selectedOption = typeof value === 'string' ? optionMap.get(value) : undefined;

    return (
        <Select
            {...props}
            value={value}
            data={data.map((option) => ({
                value: option.value,
                label: option.label,
            }))}
            description={description ?? (withSelectedDescription ? selectedOption?.description : undefined)}
            nothingFoundMessage={nothingFoundMessage ?? `No ${kind} options found`}
            comboboxProps={{
                withinPortal: false,
                ...comboboxProps,
            }}
            renderOption={({ option }) => {
                const detailedOption = optionMap.get(option.value);
                return (
                    <Box style={{ width: '100%', maxWidth: tooltipWidth }}>
                        {detailedOption ? (
                            <SamplingTooltipContent option={detailedOption} />
                        ) : (
                            <Text size="sm" fw={600}>{option.label}</Text>
                        )}
                    </Box>
                );
            }}
        />
    );
});
