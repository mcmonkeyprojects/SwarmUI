import { memo, useEffect, useMemo, useState } from 'react';
import {
    Accordion,
    Stack,
    Group,
    Text,
    Select,
    Checkbox,
    Divider,
    Collapse,
    Box,
    Tooltip,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams, Model } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { SwarmSwitch } from '../../../../components/ui';

export interface RefinerAccordionProps {
    form: UseFormReturnType<GenerateParams>;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    models: Model[];
    upscaleModels: Model[];
    vaeOptions: { value: string; label: string }[];
}

interface UpscaleMethodOption {
    value: string;
    label: string;
    description: string;
}

interface UpscaleMethodGroup {
    group: string;
    items: UpscaleMethodOption[];
}

const UPSCALE_METHOD_INFO: Record<string, { label: string; description: string; group: string }> = {
    'pixel-nearest-exact': {
        label: 'Nearest Exact',
        description: 'Fastest hard-edge scaling. Best for pixel art or exact edge preservation.',
        group: 'Pixel Methods',
    },
    'pixel-bilinear': {
        label: 'Bilinear',
        description: 'Fast smooth interpolation with soft detail. Good for quick previews.',
        group: 'Pixel Methods',
    },
    'pixel-bicubic': {
        label: 'Bicubic',
        description: 'Balanced sharpness and smoothness. Good general-purpose pixel upscaling.',
        group: 'Pixel Methods',
    },
    'pixel-lanczos': {
        label: 'Lanczos',
        description: 'Sharper pixel interpolation. Usually best default for non-AI pixel upscaling.',
        group: 'Pixel Methods',
    },
    'latent-nearest-exact': {
        label: 'Latent Nearest',
        description: 'Latent-space nearest scaling. Fast but can produce blockier structure.',
        group: 'Latent Methods',
    },
    'latent-bilinear': {
        label: 'Latent Bilinear',
        description: 'Latent-space smooth interpolation. Balanced speed and quality.',
        group: 'Latent Methods',
    },
    'latent-bicubic': {
        label: 'Latent Bicubic',
        description: 'Latent-space bicubic interpolation. Usually better structure retention.',
        group: 'Latent Methods',
    },
};

const STATIC_UPSCALE_METHOD_OPTIONS: UpscaleMethodGroup[] = [
    {
        group: 'Pixel Methods',
        items: [
            {
                value: 'pixel-nearest-exact',
                label: UPSCALE_METHOD_INFO['pixel-nearest-exact'].label,
                description: UPSCALE_METHOD_INFO['pixel-nearest-exact'].description,
            },
            {
                value: 'pixel-bilinear',
                label: UPSCALE_METHOD_INFO['pixel-bilinear'].label,
                description: UPSCALE_METHOD_INFO['pixel-bilinear'].description,
            },
            {
                value: 'pixel-bicubic',
                label: UPSCALE_METHOD_INFO['pixel-bicubic'].label,
                description: UPSCALE_METHOD_INFO['pixel-bicubic'].description,
            },
            {
                value: 'pixel-lanczos',
                label: UPSCALE_METHOD_INFO['pixel-lanczos'].label,
                description: UPSCALE_METHOD_INFO['pixel-lanczos'].description,
            },
        ],
    },
    {
        group: 'Latent Methods',
        items: [
            {
                value: 'latent-nearest-exact',
                label: UPSCALE_METHOD_INFO['latent-nearest-exact'].label,
                description: UPSCALE_METHOD_INFO['latent-nearest-exact'].description,
            },
            {
                value: 'latent-bilinear',
                label: UPSCALE_METHOD_INFO['latent-bilinear'].label,
                description: UPSCALE_METHOD_INFO['latent-bilinear'].description,
            },
            {
                value: 'latent-bicubic',
                label: UPSCALE_METHOD_INFO['latent-bicubic'].label,
                description: UPSCALE_METHOD_INFO['latent-bicubic'].description,
            },
        ],
    },
];

/**
 * Refiner / Upscale accordion section.
 * Secondary model for refinement and hi-res fix upscaling.
 * Full feature parity with SwarmUI backend refiner parameters.
 */
export const RefinerAccordion = memo(function RefinerAccordion({
    form,
    enabled,
    onToggle,
    models = [],
    upscaleModels = [],
    vaeOptions = [],
}: RefinerAccordionProps) {
    const refinerUpscale = form.values.refinerupscale || 1;
    const hasRefinerModel = typeof form.values.refinermodel === 'string' && form.values.refinermodel.trim().length > 0;

    // Toggleable override states
    const [stepsOverrideEnabled, setStepsOverrideEnabled] = useState(false);
    const [cfgOverrideEnabled, setCfgOverrideEnabled] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        if (!enabled && (refinerUpscale > 1 || hasRefinerModel)) {
            onToggle(true);
        }
    }, [enabled, hasRefinerModel, onToggle, refinerUpscale]);

    // Build model options - show all models and mark loaded for better UX
    const modelOptions = [
        { value: '', label: '(Use Base)' },
        ...models.map((model) => ({
            value: model.name,
            label: model.loaded
                ? `[Loaded] ${model.title || model.name}`
                : model.title || model.name,
        })),
    ];

    // Build grouped upscale methods from backend values so custom model methods appear.
    const upscaleMethodOptions = useMemo<UpscaleMethodGroup[]>(() => {
        if (upscaleModels.length === 0) {
            return STATIC_UPSCALE_METHOD_OPTIONS;
        }

        const groups: Record<string, UpscaleMethodOption[]> = {
            'Pixel Methods': [],
            'Model Methods': [],
            'Latent Methods': [],
            'Latent Model Methods': [],
        };
        const seen = new Set<string>();

        for (const method of upscaleModels) {
            const value = String(method.name || '').trim();
            if (!value || seen.has(value)) continue;
            seen.add(value);

            const knownInfo = UPSCALE_METHOD_INFO[value];
            const group = knownInfo?.group
                ?? (value.startsWith('model-')
                    ? 'Model Methods'
                    : value.startsWith('latentmodel-')
                        ? 'Latent Model Methods'
                        : value.startsWith('latent-')
                            ? 'Latent Methods'
                            : 'Pixel Methods');

            const cleanedTitle = String(method.title || method.name || value)
                .replace(/^Model:\s*/i, '')
                .replace(/^Latent Model:\s*/i, '');

            const label = knownInfo?.label || cleanedTitle;
            const description = knownInfo?.description
                || (typeof method.description === 'string' && method.description.trim())
                || `Use ${cleanedTitle} for upscaling.`;

            groups[group].push({
                value,
                label,
                description,
            });
        }

        const orderedGroups = [
            'Pixel Methods',
            'Model Methods',
            'Latent Methods',
            'Latent Model Methods',
        ];

        return orderedGroups
            .map((group) => ({
                group,
                items: groups[group].sort((a, b) => a.label.localeCompare(b.label)),
            }))
            .filter((group) => group.items.length > 0);
    }, [upscaleModels]);

    const upscaleMethodDescriptionMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const group of upscaleMethodOptions) {
            for (const item of group.items) {
                map.set(item.value, item.description);
            }
        }
        return map;
    }, [upscaleMethodOptions]);

    const legacyUpscaleModelValue = typeof form.values['upscalemodel'] === 'string'
        ? form.values['upscalemodel']
        : '';
    const selectedUpscaleMethodValue = legacyUpscaleModelValue || String(form.values.refinerupscalemethod || 'pixel-lanczos');
    const selectedUpscaleDescription = upscaleMethodDescriptionMap.get(
        selectedUpscaleMethodValue
    ) || 'Choose how to upscale before the refiner stage.';

    const upscaleModelOptions = useMemo(() => {
        const modelItems = upscaleMethodOptions
            .filter((group) => group.group === 'Model Methods' || group.group === 'Latent Model Methods')
            .flatMap((group) => group.items)
            .sort((a, b) => a.label.localeCompare(b.label));

        return [
            { value: '', label: 'None (Use selected method)' },
            ...modelItems.map((item) => ({ value: item.value, label: item.label })),
        ];
    }, [upscaleMethodOptions]);

    const selectedUpscaleModelValue = selectedUpscaleMethodValue.startsWith('model-')
        || selectedUpscaleMethodValue.startsWith('latentmodel-')
        ? selectedUpscaleMethodValue
        : '';
    const selectedUpscaleModelLabel = selectedUpscaleModelValue
        ? upscaleModelOptions.find((option) => option.value === selectedUpscaleModelValue)?.label || selectedUpscaleModelValue
        : '';
    const selectedRefinerModelLabel = hasRefinerModel
        ? modelOptions.find((option) => option.value === form.values.refinermodel)?.label || form.values.refinermodel
        : '';

    return (
        <Accordion.Item value="refiner">
            <Accordion.Control>Refiner / Upscale</Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <SwarmSwitch
                        label="Enable Refiner"
                        size="xs"
                        checked={enabled}
                        onChange={(e) => onToggle(e.currentTarget.checked)}
                    />
                    <Text size="xs" c="dimmed">
                        Hi-res fix lives inside Refiner / Upscale. Turning this off keeps all refiner and hi-res settings out of the generate request.
                    </Text>
                    <Select
                        label="Diffusion Refiner Model"
                        placeholder="Use Base Model"
                        data={modelOptions}
                        searchable
                        clearable
                        value={form.values.refinermodel || ''}
                        onChange={(value) => {
                            form.setFieldValue('refinermodel', value || '');
                            if (value && value.trim().length > 0 && !enabled) {
                                onToggle(true);
                            }
                        }}
                        description="Optional secondary diffusion checkpoint for refinement. This is separate from the upscaler model."
                    />

                    <Select
                        label="Refiner Method"
                        data={[
                            { value: 'PostApply', label: 'Post Apply (Normal)' },
                            { value: 'StepSwap', label: 'Step Swap (SDXL Refiner Original)' },
                            { value: 'StepSwapNoisy', label: 'Step Swap Noisy (Modified)' },
                        ]}
                        {...form.getInputProps('refinermethod')}
                        description="PostApply runs base then refiner; StepSwap swaps mid-generation"
                    />

                    <SliderWithInput
                        label="Refiner Control Percentage"
                        value={form.values.refinercontrolpercentage ?? form.values.refinercontrol ?? 0.2}
                        onChange={(value) => {
                            form.setFieldValue('refinercontrol', value);
                            form.setFieldValue('refinercontrolpercentage', value);
                        }}
                        min={0}
                        max={1}
                        step={0.05}
                        decimalScale={2}
                        marks={[
                            { value: 0, label: '0' },
                            { value: 0.2, label: '0.2' },
                            { value: 0.4, label: '0.4' },
                        ]}
                        description="Fraction of steps given to refiner (higher = refiner controls more). Set to 0 for upscale-only."
                    />

                    <Divider label="Upscale Settings" labelPosition="center" />

                    <SliderWithInput
                        label="Refiner Upscale (Hi-Res Fix)"
                        value={refinerUpscale}
                        onChange={(value) => {
                            form.setFieldValue('refinerupscale', value);
                            if (value > 1 && !enabled) {
                                onToggle(true);
                            }
                        }}
                        min={1}
                        max={4}
                        step={0.25}
                        decimalScale={2}
                        marks={[
                            { value: 1, label: '1x' },
                            { value: 1.5, label: '1.5x' },
                            { value: 2, label: '2x' },
                            { value: 4, label: '4x' },
                        ]}
                        description="Upscale image between base and refiner stages. Values above 1x will automatically enable Refiner / Upscale."
                    />

                    {refinerUpscale > 1 && (
                        <>
                            <Select
                                label="Upscale Method / Upscaler Model"
                                data={upscaleMethodOptions}
                                value={selectedUpscaleMethodValue}
                                onChange={(value) => {
                                    form.setFieldValue('refinerupscalemethod', value || 'pixel-lanczos');
                                    if (legacyUpscaleModelValue) {
                                        form.setFieldValue('upscalemodel', '');
                                    }
                                }}
                                description={selectedUpscaleDescription}
                                searchable
                                nothingFoundMessage="No upscale methods found"
                                renderOption={({ option }) => {
                                    const description = upscaleMethodDescriptionMap.get(option.value) || '';
                                    return (
                                        <Tooltip
                                            label={description}
                                            position="right"
                                            withArrow
                                            multiline
                                            w={320}
                                            disabled={!description}
                                        >
                                            <Box style={{ width: '100%' }}>
                                                <Text size="sm">{option.label}</Text>
                                            </Box>
                                        </Tooltip>
                                    );
                                }}
                            />

                            {upscaleModelOptions.length > 1 && (
                                <Select
                                    label="Upscale Model (from upscale_models)"
                                    placeholder="Select model upscaler"
                                    data={upscaleModelOptions}
                                    searchable
                                    clearable
                                    value={selectedUpscaleModelValue}
                                    onChange={(value) => {
                                        if (value) {
                                            form.setFieldValue('refinerupscalemethod', value);
                                            if (legacyUpscaleModelValue) {
                                                form.setFieldValue('upscalemodel', '');
                                            }
                                        }
                                    }}
                                    description="Choose a custom model from Models/upscale_models (or latent_upscale_models)."
                                />
                            )}

                            {(selectedUpscaleModelValue || hasRefinerModel) && (
                                <Text size="xs" c="dimmed">
                                    {selectedUpscaleModelValue
                                        ? `Upscale with ${selectedUpscaleModelLabel}. `
                                        : `Upscale with ${selectedUpscaleMethodValue}. `}
                                    {hasRefinerModel
                                        ? `Then refine with diffusion model ${selectedRefinerModelLabel}.`
                                        : 'No separate diffusion refiner model is selected.'}
                                </Text>
                            )}

                            <Checkbox
                                label="Refiner Tiling"
                                description="Enable tiled generation in refiner stage (fixes artifacts from scaling, may introduce seams)"
                                checked={form.values.refinerdotiling || false}
                                onChange={(e) => form.setFieldValue('refinerdotiling', e.currentTarget.checked)}
                            />
                        </>
                    )}

                    <Divider
                        label={
                            <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => setShowAdvanced(!showAdvanced)}>
                                <Text size="sm">Advanced Overrides</Text>
                                <Text size="xs" c="dimmed">{showAdvanced ? 'v' : '>'}</Text>
                            </Group>
                        }
                        labelPosition="center"
                    />

                    <Collapse in={showAdvanced}>
                        <Stack gap="md">
                            <Box>
                                <Group gap="xs" mb="xs">
                                    <SwarmSwitch
                                        size="xs"
                                        checked={stepsOverrideEnabled}
                                        onChange={(e) => setStepsOverrideEnabled(e.currentTarget.checked)}
                                    />
                                    <Text size="sm">Override Refiner Steps</Text>
                                </Group>
                                {stepsOverrideEnabled && (
                                    <SliderWithInput
                                        label="Refiner Steps"
                                        value={form.values.refinersteps || 40}
                                        onChange={(value) => form.setFieldValue('refinersteps', value)}
                                        min={1}
                                        max={200}
                                        step={1}
                                        marks={[
                                            { value: 20, label: '20' },
                                            { value: 40, label: '40' },
                                            { value: 60, label: '60' },
                                        ]}
                                        description="Alternate step count for refiner (e.g., 60 * 0.2 control = 12 actual steps)"
                                    />
                                )}
                            </Box>

                            <Box>
                                <Group gap="xs" mb="xs">
                                    <SwarmSwitch
                                        size="xs"
                                        checked={cfgOverrideEnabled}
                                        onChange={(e) => setCfgOverrideEnabled(e.currentTarget.checked)}
                                    />
                                    <Text size="sm">Override Refiner CFG Scale</Text>
                                </Group>
                                {cfgOverrideEnabled && (
                                    <SliderWithInput
                                        label="Refiner CFG Scale"
                                        value={form.values.refinercfgscale || 7}
                                        onChange={(value) => form.setFieldValue('refinercfgscale', value)}
                                        min={0}
                                        max={20}
                                        step={0.5}
                                        decimalScale={1}
                                        marks={[
                                            { value: 5, label: '5' },
                                            { value: 7, label: '7' },
                                            { value: 9, label: '9' },
                                        ]}
                                        description="CFG scale for refiner independently of base model"
                                    />
                                )}
                            </Box>

                            <Select
                                label="Refiner VAE"
                                placeholder="Use Base VAE"
                                data={[
                                    { value: 'None', label: 'None (Use Base)' },
                                    ...vaeOptions.filter((opt) => opt.value !== 'None'),
                                ]}
                                searchable
                                clearable
                                {...form.getInputProps('refinervae')}
                                description="Optional VAE replacement for refiner stage"
                            />
                        </Stack>
                    </Collapse>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
