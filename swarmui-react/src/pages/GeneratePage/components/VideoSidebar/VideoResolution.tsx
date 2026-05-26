import { Group, NumberInput, Stack, Text } from '@mantine/core';
import { SwarmButton } from '../../../../components/ui';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';

export interface ResolutionPreset {
    label: string;
    width: number;
    height: number;
}

/**
 * Returns the preset label matching the given dimensions, or 'Custom' if none match.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getActivePreset(
    width: number,
    height: number,
    presets: ResolutionPreset[],
): string {
    const match = presets.find((p) => p.width === width && p.height === height);
    return match ? match.label : 'Custom';
}

interface VideoResolutionProps {
    form: UseFormReturnType<GenerateParams>;
    presets: ResolutionPreset[];
    customOnly?: boolean;
}

export function VideoResolution({ form, presets, customOnly }: VideoResolutionProps) {
    const activePreset = getActivePreset(
        form.values.width ?? 0,
        form.values.height ?? 0,
        presets,
    );

    function applyPreset(preset: ResolutionPreset) {
        form.setFieldValue('width', preset.width);
        form.setFieldValue('height', preset.height);
    }

    return (
        <Stack gap="xs">
            <Text size="xs" fw={600} c="invokeGray.2" tt="uppercase">Resolution</Text>
            {!customOnly && presets.length > 0 && (
                <Group gap="xs" wrap="wrap">
                    {presets.map((preset) => (
                        <SwarmButton
                            key={preset.label}
                            size="xs"
                            tone={activePreset === preset.label ? 'primary' : 'secondary'}
                            emphasis={activePreset === preset.label ? 'solid' : 'soft'}
                            onClick={() => applyPreset(preset)}
                        >
                            {preset.label}
                        </SwarmButton>
                    ))}
                    {activePreset === 'Custom' && (
                        <Text size="xs" c="dimmed">Custom</Text>
                    )}
                </Group>
            )}
            {(customOnly || activePreset === 'Custom' || presets.length === 0) && (
                <Group gap="xs" align="center">
                    <NumberInput
                        label="Width"
                        size="sm"
                        style={{ flex: 1 }}
                        min={64}
                        max={2048}
                        step={64}
                        {...form.getInputProps('width')}
                    />
                    <Text size="sm" c="dimmed" mt={20}>x</Text>
                    <NumberInput
                        label="Height"
                        size="sm"
                        style={{ flex: 1 }}
                        min={64}
                        max={2048}
                        step={64}
                        {...form.getInputProps('height')}
                    />
                </Group>
            )}
        </Stack>
    );
}
