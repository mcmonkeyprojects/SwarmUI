import { memo, useState, useEffect, useCallback } from 'react';
import { Group, NumberInput, Text, Stack, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { SwarmActionIcon as ActionIcon } from './ui';

interface SeedInputProps {
    /** Current seed value */
    value: number;
    /** Callback when seed value changes */
    onChange: (value: number) => void;
    /** Optional label override */
    label?: string;
}

/**
 * Specialized seed input component with:
 * - NumberInput (handles large seed values up to 999,999,999)
 * - Reset button to set seed back to -1 (random)
 * - Tooltip explaining the functionality
 * 
 * Replaces SliderWithInput for seed since sliders are not suitable for
 * values with many digits.
 */
export const SeedInput = memo(function SeedInput({
    value,
    onChange,
    label = 'Seed',
}: SeedInputProps) {
    // Local state for smooth input
    const [localValue, setLocalValue] = useState(value);

    // Sync local value when prop changes
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Handle input change
    const handleChange = useCallback((val: string | number) => {
        if (typeof val === 'number') {
            setLocalValue(val);
            onChange(val);
        }
    }, [onChange]);

    // Handle reset to random (-1)
    const handleReset = useCallback(() => {
        setLocalValue(-1);
        onChange(-1);
    }, [onChange]);

    return (
        <Stack gap="xs">
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Tooltip
                    label="Random seed (-1) generates a unique result each time. Set a specific value to reproduce the exact same image."
                    multiline
                    w={280}
                    withArrow
                >
                    <Text
                        size="sm"
                        fw={500}
                        style={{ whiteSpace: 'nowrap', cursor: 'help', color: 'var(--theme-gray-0)' }}
                    >
                        {label}
                    </Text>
                </Tooltip>
                <Group gap="xs" wrap="nowrap">
                    <NumberInput
                        value={localValue}
                        onChange={handleChange}
                        min={-1}
                        max={999999999}
                        step={1}
                        hideControls
                        size="xs"
                        styles={{
                            input: {
                                width: 110,
                                textAlign: 'right',
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: localValue === -1
                                    ? 'var(--mantine-color-invokeGray-3)'
                                    : 'var(--mantine-color-invokeBrand-6)',
                                backgroundColor: 'var(--mantine-color-invokeGray-7)',
                                borderRadius: 4,
                                fontFamily: 'monospace',
                            },
                        }}
                        placeholder="-1 (Random)"
                    />
                    <Tooltip label="Reset to random (-1)" withArrow>
                        <ActionIcon
                            size="sm"
                            tone="primary"
                            emphasis="ghost"
                            onClick={handleReset}
                            aria-label="Reset seed to random"
                        >
                            <IconRefresh size={14} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
            <Text size="xs" c="invokeGray.4">
                {localValue === -1 ? 'Random seed each generation' : `Fixed seed: ${localValue.toLocaleString()}`}
            </Text>
        </Stack>
    );
});

SeedInput.displayName = 'SeedInput';
