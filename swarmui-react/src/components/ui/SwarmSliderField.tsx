import { Stack, Text, Slider, type SliderProps } from '@mantine/core';

export interface SwarmSliderFieldProps extends SliderProps {
    label?: string;
    tooltip?: string;
    decimalScale?: number;
    description?: string;
}

export function SwarmSliderField({ label, tooltip: _tooltip, decimalScale: _decimalScale, description, ...props }: SwarmSliderFieldProps) {
    return (
        <Stack gap={4}>
            {label && <Text size="sm">{label}</Text>}
            {description && <Text size="xs" c="dimmed">{description}</Text>}
            <Slider {...props} />
        </Stack>
    );
}
