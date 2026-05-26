import { useCallback, useMemo, useState } from 'react';
import { Alert, Card, Divider, Group, NumberInput, Select, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle, IconPhotoPlus } from '@tabler/icons-react';
import { queryClient, queryKeys } from '../../api/queryClient';
import { swarmClient } from '../../api/client';
import { useGenerationStore } from '../../store/generationStore';
import { SwarmButton } from '../../components/ui';
import { useInvokeAIStore } from './useInvokeAIStore';

const SCHEDULER_OPTIONS = [
    { value: 'euler', label: 'Euler' },
    { value: 'euler_a', label: 'Euler Ancestral' },
    { value: 'dpmpp_2m', label: 'DPM++ 2M' },
    { value: 'dpmpp_2m_k', label: 'DPM++ 2M Karras' },
    { value: 'ddim', label: 'DDIM' },
];

function toNumber(value: string | number, fallback: number): number {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
}

export function InvokeAIUtilityPanel() {
    const generationParams = useGenerationStore((state) => state.params);
    const addSessionImage = useGenerationStore((state) => state.addSessionImage);
    const connectionState = useInvokeAIStore((state) => state.connectionState);
    const selectedModelKey = useInvokeAIStore((state) => state.selectedModelKey);
    const models = useInvokeAIStore((state) => state.models);
    const isRunning = useInvokeAIStore((state) => state.isRunning);
    const activeMode = useInvokeAIStore((state) => state.activeMode);
    const runGeneration = useInvokeAIStore((state) => state.runGeneration);

    const [prompt, setPrompt] = useState(String(generationParams.prompt || ''));
    const [negativePrompt, setNegativePrompt] = useState(String(generationParams.negativeprompt || ''));
    const [width, setWidth] = useState(Number(generationParams.width || 512));
    const [height, setHeight] = useState(Number(generationParams.height || 512));
    const [steps, setSteps] = useState(Number(generationParams.steps || 20));
    const [cfgScale, setCfgScale] = useState(Number(generationParams.cfgscale || 7));
    const [seed, setSeed] = useState(Number(generationParams.seed ?? -1));
    const [scheduler, setScheduler] = useState(String(generationParams.scheduler || generationParams.sampler || 'euler'));

    const selectedModel = useMemo(() => {
        return models.find((model) => model.key === selectedModelKey) ?? null;
    }, [models, selectedModelKey]);

    const handleRun = useCallback(async () => {
        if (connectionState !== 'connected') {
            notifications.show({
                title: 'InvokeAI Not Connected',
                message: 'Check the InvokeAI connection before running utility generation.',
                color: 'yellow',
            });
            return;
        }
        if (!prompt.trim()) {
            notifications.show({
                title: 'Prompt Required',
                message: 'Enter a prompt for the InvokeAI utility generation.',
                color: 'yellow',
            });
            return;
        }

        try {
            const result = await runGeneration({
                mode: 'txt2img',
                prompt,
                negativePrompt,
                width,
                height,
                seed,
                steps,
                cfgScale,
                scheduler,
            });
            const historyResult = await swarmClient.addImageToHistory(result.imageDataUrl, {
                prompt,
                negativeprompt: negativePrompt,
                model: selectedModel ? `InvokeAI:${selectedModel.name}` : 'InvokeAI',
                width,
                height,
                seed,
                steps,
                cfgscale: cfgScale,
                scheduler,
                invokeai: true,
                invokeai_mode: 'txt2img',
                invokeai_image_name: result.imageName,
            });
            await queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
            const savedImage = historyResult.images?.[0]?.image ?? result.imageDataUrl;
            addSessionImage(savedImage);
            notifications.show({
                title: 'InvokeAI Image Saved',
                message: 'The utility result was added to the Swarm gallery.',
                color: 'green',
            });
        } catch (error) {
            notifications.show({
                title: 'InvokeAI Generation Failed',
                message: error instanceof Error ? error.message : 'InvokeAI failed to generate an image.',
                color: 'red',
            });
        }
    }, [
        addSessionImage,
        cfgScale,
        connectionState,
        height,
        negativePrompt,
        prompt,
        runGeneration,
        scheduler,
        seed,
        selectedModel,
        steps,
        width,
    ]);

    return (
        <Card withBorder padding="md" className="surface-glass swarm-resource-card">
            <Stack gap="md">
                <Stack gap={4}>
                    <Text fw={700}>InvokeAI Utility Txt2Img</Text>
                    <Text size="sm" c="dimmed">
                        A small InvokeAI text generation path for quick checks. Use the main Generate tab for normal Swarm batches and Comfy workflows.
                    </Text>
                </Stack>

                <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                    This panel only submits a single basic InvokeAI graph and saves the result back into Swarm history.
                </Alert>

                <Textarea
                    label="Prompt"
                    minRows={3}
                    autosize
                    value={prompt}
                    onChange={(event) => setPrompt(event.currentTarget.value)}
                />
                <Textarea
                    label="Negative Prompt"
                    minRows={2}
                    autosize
                    value={negativePrompt}
                    onChange={(event) => setNegativePrompt(event.currentTarget.value)}
                />

                <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
                    <NumberInput label="Width" min={64} step={64} value={width} onChange={(value) => setWidth(toNumber(value, 512))} />
                    <NumberInput label="Height" min={64} step={64} value={height} onChange={(value) => setHeight(toNumber(value, 512))} />
                    <NumberInput label="Steps" min={1} max={150} value={steps} onChange={(value) => setSteps(toNumber(value, 20))} />
                    <NumberInput label="CFG" min={0} max={30} decimalScale={2} value={cfgScale} onChange={(value) => setCfgScale(toNumber(value, 7))} />
                    <NumberInput label="Seed" value={seed} onChange={(value) => setSeed(toNumber(value, -1))} />
                    <Select
                        label="Scheduler"
                        data={SCHEDULER_OPTIONS}
                        value={scheduler}
                        onChange={(value) => setScheduler(value || 'euler')}
                    />
                </SimpleGrid>

                <Divider />

                <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                        Model: {selectedModel?.name ?? 'Select an InvokeAI model above'}
                    </Text>
                    <SwarmButton
                        tone="brand"
                        emphasis="solid"
                        leftSection={<IconPhotoPlus size={16} />}
                        disabled={connectionState !== 'connected' || !selectedModel}
                        loading={isRunning && activeMode === 'txt2img'}
                        onClick={() => void handleRun()}
                    >
                        Generate with InvokeAI
                    </SwarmButton>
                </Group>
            </Stack>
        </Card>
    );
}
