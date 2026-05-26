import { memo, useMemo, useState } from 'react';
import {
    Accordion,
    Stack,
    Group,
    Text,
    Select,
    Divider,
    Collapse,
    Box,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams, Model } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray, SwarmCheckbox, SwarmSwitch } from '../../../../components/ui';

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
    onToggle,
    models = [],
    upscaleModels = [],
    vaeOptions = [],
}: RefinerAccordionProps) {
    const refinerUpscale = form.values.refinerupscale || 1;
    const refinerControl = typeof form.values.refinercontrolpercentage === 'number'
        ? form.values.refinercontrolpercentage
        : (typeof form.values.refinercontrol === 'number' ? form.values.refinercontrol : 0);
    const hasRefinerModel = typeof form.values.refinermodel === 'string' && form.values.refinermodel.trim().length > 0;
    const hiResFixEnabled = refinerControl > 0;
    const postUpscaleEnabled = refinerUpscale > 1;
    const diffusionRefineActive = hiResFixEnabled;

    // Toggleable override states
    const [stepsOverrideEnabled, setStepsOverrideEnabled] = useState(false);
    const [cfgOverrideEnabled, setCfgOverrideEnabled] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

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

    const setRefinerControlValue = (value: number) => {
        form.setFieldValue('refinercontrol', value);
        form.setFieldValue('refinercontrolpercentage', value);
        if (value > 0) {
            onToggle(true);
        } else if (!postUpscaleEnabled) {
            onToggle(false);
        }
    };

    const setHiResFixEnabled = (checked: boolean) => {
        if (checked) {
            setRefinerControlValue(refinerControl > 0 ? refinerControl : 0.2);
            return;
        }

        form.setFieldValue('refinercontrol', 0);
        form.setFieldValue('refinercontrolpercentage', 0);
        if (!postUpscaleEnabled) {
            onToggle(false);
        }
    };

    const setPostUpscaleEnabled = (checked: boolean) => {
        if (checked) {
            if (refinerUpscale <= 1) {
                form.setFieldValue('refinerupscale', 2);
            }
            onToggle(true);
            return;
        }

        form.setFieldValue('refinerupscale', 1);
        if (!hiResFixEnabled) {
            onToggle(false);
        }
    };

    const setRefinerUpscaleValue = (value: number) => {
        form.setFieldValue('refinerupscale', value);
        if (value > 1) {
            onToggle(true);
        } else if (!hiResFixEnabled) {
            onToggle(false);
        }
    };

    return (
        <Accordion.Item value="refiner">
            <Accordion.Control>
                <div className="generate-accordion-control">
                    <span className="generate-accordion-control__title">Refine / Upscale</span>
                    <span className="generate-accordion-control__summary">
                        {hiResFixEnabled ? `${Math.round(refinerControl * 100)}% refine` : 'Refine off'} | {postUpscaleEnabled ? `${refinerUpscale}x` : 'Upscale off'}
                    </span>
                </div>
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <Text size="xs" c="dimmed">
                        Hi-Res Fix and Post Upscale are independent frontend paths. They only share the backend refiner/upscale parameter group when one of them is enabled.
                    </Text>

                    <Divider label="Hi-Res Fix / Diffusion Refine" labelPosition="center" />

                    <ControlTray
                        title="Diffusion Refine"
                        subtitle="Runs a second diffusion phase after the base image."
                        status={hiResFixEnabled ? 'Armed' : 'Off'}
                        tone={hiResFixEnabled ? 'info' : 'secondary'}
                    >
                        <SwarmSwitch
                            label="Enable Hi-Res Fix / Diffusion Refine"
                            size="xs"
                            checked={hiResFixEnabled}
                            onChange={(event) => setHiResFixEnabled(event.currentTarget.checked)}
                            tone="info"
                        />
                    </ControlTray>

                    <Select
                        label="Diffusion Refiner Model"
                        placeholder="Use Base Model"
                        data={modelOptions}
                        searchable
                        clearable
                        value={form.values.refinermodel || ''}
                        onChange={(value) => {
                            form.setFieldValue('refinermodel', value || '');
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
                        description="Only affects the diffusion refiner pass when refiner control is above 0."
                    />

                    <SliderWithInput
                        label="Diffusion Refiner Control"
                        value={refinerControl}
                        onChange={setRefinerControlValue}
                        min={0}
                        max={1}
                        step={0.05}
                        decimalScale={2}
                        unit="%"
                        status={refinerControl > 0.55 ? 'caution' : refinerControl > 0 ? 'good' : 'neutral'}
                        marks={[
                            { value: 0, label: '0' },
                            { value: 0.2, label: '0.2' },
                            { value: 0.4, label: '0.4' },
                        ]}
                        description="Fraction of steps given to diffusion refinement. Set to 0 for upscale-only."
                    />

                    <Text size="xs" c={diffusionRefineActive ? 'dimmed' : 'orange'}>
                        {diffusionRefineActive
                            ? 'Diffusion refinement is active. Refiner model, method, steps, CFG, and VAE overrides can affect the final image.'
                            : 'Diffusion refinement is off. Refiner model, method, steps, CFG, and VAE overrides will not be sent.'}
                    </Text>

                    <Divider label="Post Upscale" labelPosition="center" />

                    <ControlTray
                        title="Post Upscale"
                        subtitle="Scales the image after the base pass; diffusion refine is optional."
                        status={postUpscaleEnabled ? `${refinerUpscale}x` : 'Off'}
                        tone={postUpscaleEnabled ? 'success' : 'secondary'}
                    >
                        <SwarmSwitch
                            label="Enable Post Upscale"
                            size="xs"
                            checked={postUpscaleEnabled}
                            onChange={(event) => setPostUpscaleEnabled(event.currentTarget.checked)}
                            tone="success"
                        />
                    </ControlTray>

                    <SliderWithInput
                        label="Upscale Scale"
                        value={refinerUpscale}
                        onChange={setRefinerUpscaleValue}
                        min={1}
                        max={4}
                        step={0.25}
                        decimalScale={2}
                        unit="x"
                        tone="success"
                        marks={[
                            { value: 1, label: '1x' },
                            { value: 1.5, label: '1.5x' },
                            { value: 2, label: '2x' },
                            { value: 4, label: '4x' },
                        ]}
                        description="Values above 1x enable the post-upscale path. This does not enable diffusion refinement."
                    />

                    {postUpscaleEnabled && (
                        <>
                            <Select
                                label="Upscale Method"
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
                                comboboxProps={{ withinPortal: false }}
                                renderOption={({ option }) => {
                                    const description = upscaleMethodDescriptionMap.get(option.value) || '';
                                    return (
                                        <Box style={{ width: '100%' }}>
                                            <Text size="sm">{option.label}</Text>
                                            {description ? (
                                                <Text size="xs" c="dimmed" lineClamp={2}>
                                                    {description}
                                                </Text>
                                            ) : null}
                                        </Box>
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
                                    comboboxProps={{ withinPortal: false }}
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
                                    {diffusionRefineActive && hasRefinerModel
                                        ? `Then refine with diffusion model ${selectedRefinerModelLabel}.`
                                        : diffusionRefineActive
                                            ? 'Then run diffusion refinement using the base model.'
                                            : 'No diffusion refinement pass will run.'}
                                </Text>
                            )}

                            <SwarmCheckbox
                                label="Refiner Tiling"
                                description="Only applies when diffusion refinement is active. It does not affect upscale-only model upscaling."
                                checked={form.values.refinerdotiling || false}
                                onChange={(e) => form.setFieldValue('refinerdotiling', e.currentTarget.checked)}
                                visual="squishy"
                            />
                        </>
                    )}

                    <Divider
                        label={
                            <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => setShowAdvanced(!showAdvanced)}>
                                <Text size="sm">Diffusion Refiner Overrides</Text>
                                <Text size="xs" c="dimmed">{showAdvanced ? 'v' : '>'}</Text>
                            </Group>
                        }
                        labelPosition="center"
                    />

                    <Collapse expanded={showAdvanced}>
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
                                        unit=" steps"
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
                                        status={(form.values.refinercfgscale || 7) >= 14 ? 'danger' : (form.values.refinercfgscale || 7) >= 10 ? 'caution' : 'neutral'}
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
