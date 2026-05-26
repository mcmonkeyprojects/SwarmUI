import { memo } from 'react';
import {
    Accordion,
    Stack,
    Group,
    Text,
    Badge,
    Card,
    Tooltip,
    Box,
} from '@mantine/core';
import { IconX, IconLayoutGrid } from '@tabler/icons-react';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams, LoRASelection } from '../../../../api/types';
import { SwarmActionIcon, SwarmButton, SwarmSlider } from '../../../../components/ui';

export interface ActiveLoRAsProps {
    /** Form instance */
    form: UseFormReturnType<GenerateParams>;
    /** Currently active LoRAs */
    activeLoras: LoRASelection[];
    /** Handler for updating LoRAs */
    onLoraChange: (loras: LoRASelection[]) => void;
    /** Handler for opening LoRA browser */
    onOpenLoraBrowser: () => void;
}

/**
 * Displays active LoRAs with weight sliders and remove buttons.
 * Always renders, showing an empty state when no LoRAs are active.
 */
export const ActiveLoRAs = memo(function ActiveLoRAs({
    form,
    activeLoras = [],
    onLoraChange,
    onOpenLoraBrowser,
}: ActiveLoRAsProps) {
    const handleRemoveLora = (index: number) => {
        const newLoras = activeLoras.filter((_, i) => i !== index);
        onLoraChange(newLoras);
        const loraNames = newLoras.map((l) => l.lora).join(',');
        const loraWeights = newLoras.map((l) => l.weight).join(',');
        form.setFieldValue('loras', loraNames);
        form.setFieldValue('loraweights', loraWeights);
    };

    const handleWeightChange = (index: number, weight: number) => {
        const newLoras = activeLoras.map((l, i) =>
            i === index ? { ...l, weight } : l
        );
        onLoraChange(newLoras);
        const loraWeights = newLoras.map((l) => l.weight).join(',');
        form.setFieldValue('loraweights', loraWeights);
    };

    return (
        <Accordion
            multiple
            variant="contained"
            defaultValue={['active-loras']}
            styles={{
                item: { backgroundColor: 'var(--mantine-color-invokeGray-9)', border: 'none', marginBottom: 8 },
                control: { padding: 'var(--mantine-spacing-sm)' },
                content: { padding: 'var(--mantine-spacing-sm)', paddingTop: 0 }
            }}
        >
            <Accordion.Item value="active-loras">
                <Accordion.Control>
                    <Group justify="space-between" style={{ flex: 1, paddingRight: 10 }}>
                        <Text
                            size="xs"
                            fw={700}
                            c="invokeGray.0"
                            tt="uppercase"
                            style={{ letterSpacing: '0.5px' }}
                        >
                            Active LoRAs
                        </Text>
                        <Badge size="xs" color="blue">
                            {activeLoras.length}
                        </Badge>
                    </Group>
                </Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="sm">

                        {activeLoras.length === 0 ? (
                            <Box
                                p="lg"
                                style={{
                                    border: '1px dashed var(--mantine-color-invokeGray-5)',
                                    borderRadius: 'var(--mantine-radius-md)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 'var(--mantine-spacing-sm)',
                                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                                }}
                            >
                                <Text size="sm" c="invokeGray.3" ta="center">
                                    No LoRAs active
                                </Text>
                                <SwarmButton
                                    variant="light"
                                    color="invokeBrand"
                                    size="xs"
                                    leftSection={<IconLayoutGrid size={14} />}
                                    onClick={onOpenLoraBrowser}
                                >
                                    Add LoRA
                                </SwarmButton>
                            </Box>
                        ) : (
                            <Stack gap={10}>
                                {activeLoras.map((lora, idx) => (
                                    <Card
                                        key={idx}
                                        p="xs"
                                        withBorder
                                        style={{ backgroundColor: 'var(--mantine-color-invokeGray-7)' }}
                                    >
                                        <Stack gap={4}>
                                            <Group justify="space-between" wrap="nowrap">
                                                <Tooltip label={lora.lora}>
                                                    <Text
                                                        size="xs"
                                                        fw={500}
                                                        c="invokeGray.1"
                                                        truncate
                                                        style={{ flex: 1 }}
                                                    >
                                                        {lora.lora.split('/').pop() || lora.lora}
                                                    </Text>
                                                </Tooltip>
                                                <SwarmActionIcon
                                                    size="xs"
                                                    color="red"
                                                    variant="subtle"
                                                    aria-label={`Remove ${lora.lora}`}
                                                    onClick={() => handleRemoveLora(idx)}
                                                >
                                                    <IconX size={12} />
                                                </SwarmActionIcon>
                                            </Group>
                                            <Group gap="xs" wrap="nowrap" style={{ width: '100%' }}>
                                                <SwarmSlider
                                                    value={lora.weight}
                                                    onChange={(value) => handleWeightChange(idx, value)}
                                                    min={-5}
                                                    max={5}
                                                    step={0.01}
                                                    status={Math.abs(lora.weight) > 2 ? 'caution' : 'neutral'}
                                                    style={{ flex: 1 }}
                                                    size="xs"
                                                    marks={[
                                                        { value: -5, label: '-5' },
                                                        { value: 0, label: '0' },
                                                        { value: 1, label: '1' },
                                                        { value: 5, label: '5' },
                                                    ]}
                                                />
                                                <Text
                                                    size="xs"
                                                    c="invokeBrand.5"
                                                    fw={600}
                                                    style={{ minWidth: 36, textAlign: 'right' }}
                                                >
                                                    {lora.weight.toFixed(2)}
                                                </Text>
                                            </Group>
                                        </Stack>
                                    </Card>
                                ))}
                            </Stack>
                        )}

                        {activeLoras.length > 0 && (
                            <SwarmButton
                                variant="light"
                                color="invokeBrand"
                                size="xs"
                                fullWidth
                                leftSection={<IconLayoutGrid size={14} />}
                                onClick={onOpenLoraBrowser}
                            >
                                Add More LoRAs
                            </SwarmButton>
                        )}
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    );
});
