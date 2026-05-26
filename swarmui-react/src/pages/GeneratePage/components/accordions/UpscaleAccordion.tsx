import { memo, useMemo } from 'react';
import {
    Accordion,
    Stack,
    Text,
    Select,
    Box,
    Divider,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams, Model } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray, SwarmSwitch } from '../../../../components/ui';

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
    'pixel-nearest-exact': { label: 'Nearest Exact', description: 'Fastest hard-edge scaling.', group: 'Pixel Methods' },
    'pixel-bilinear': { label: 'Bilinear', description: 'Fast smooth interpolation.', group: 'Pixel Methods' },
    'pixel-bicubic': { label: 'Bicubic', description: 'Balanced sharpness and smoothness.', group: 'Pixel Methods' },
    'pixel-lanczos': { label: 'Lanczos', description: 'Sharper pixel interpolation.', group: 'Pixel Methods' },
    'latent-nearest-exact': { label: 'Latent Nearest', description: 'Latent-space nearest scaling.', group: 'Latent Methods' },
    'latent-bilinear': { label: 'Latent Bilinear', description: 'Latent-space smooth interpolation.', group: 'Latent Methods' },
    'latent-bicubic': { label: 'Latent Bicubic', description: 'Latent-space bicubic interpolation.', group: 'Latent Methods' },
};

const STATIC_UPSCALE_METHOD_OPTIONS: UpscaleMethodGroup[] = [
    {
        group: 'Pixel Methods',
        items: [
            { value: 'pixel-nearest-exact', label: UPSCALE_METHOD_INFO['pixel-nearest-exact'].label, description: UPSCALE_METHOD_INFO['pixel-nearest-exact'].description },
            { value: 'pixel-bilinear', label: UPSCALE_METHOD_INFO['pixel-bilinear'].label, description: UPSCALE_METHOD_INFO['pixel-bilinear'].description },
            { value: 'pixel-bicubic', label: UPSCALE_METHOD_INFO['pixel-bicubic'].label, description: UPSCALE_METHOD_INFO['pixel-bicubic'].description },
            { value: 'pixel-lanczos', label: UPSCALE_METHOD_INFO['pixel-lanczos'].label, description: UPSCALE_METHOD_INFO['pixel-lanczos'].description },
        ],
    },
    {
        group: 'Latent Methods',
        items: [
            { value: 'latent-nearest-exact', label: UPSCALE_METHOD_INFO['latent-nearest-exact'].label, description: UPSCALE_METHOD_INFO['latent-nearest-exact'].description },
            { value: 'latent-bilinear', label: UPSCALE_METHOD_INFO['latent-bilinear'].label, description: UPSCALE_METHOD_INFO['latent-bilinear'].description },
            { value: 'latent-bicubic', label: UPSCALE_METHOD_INFO['latent-bicubic'].label, description: UPSCALE_METHOD_INFO['latent-bicubic'].description },
        ],
    },
];

export interface UpscaleAccordionProps {
    form: UseFormReturnType<GenerateParams>;
    onToggle: (enabled: boolean) => void;
    upscaleModels: Model[];
    hiResFixEnabled: boolean;
    chainUpscaleEnabled: boolean;
    onToggleChainUpscale: (enabled: boolean) => void;
}

export const UpscaleAccordion = memo(function UpscaleAccordion({
    form,
    onToggle,
    upscaleModels = [],
    hiResFixEnabled,
    chainUpscaleEnabled,
    onToggleChainUpscale,
}: UpscaleAccordionProps) {
    const refinerUpscale = form.values.refinerupscale || 1;

    const legacyUpscaleModelValue = typeof form.values['upscalemodel'] === 'string'
        ? form.values['upscalemodel']
        : '';
    const selectedUpscaleMethodValue = legacyUpscaleModelValue || String(form.values.refinerupscalemethod || 'pixel-lanczos');

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

            groups[group].push({ value, label, description });
        }

        const orderedGroups = ['Pixel Methods', 'Model Methods', 'Latent Methods', 'Latent Model Methods'];

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
        }
        else if (!hiResFixEnabled) {
            onToggle(false);
        }
    };

    const selectedDescription = upscaleMethodDescriptionMap.get(selectedUpscaleMethodValue)
        || 'Choose how to upscale.';

    const chainUpscaleMethodValue = String(form.values.chainupscalemethod || 'model-remacri');
    const chainUpscaleScale = form.values.chainupscalescale ?? 1.5;

    const chainUpscaleMethodDescription = upscaleMethodDescriptionMap.get(chainUpscaleMethodValue)
        || 'Second pass AI upscale for additional refinement.';

    const setChainUpscaleEnabled = (checked: boolean) => {
        onToggleChainUpscale(checked);
        if (checked && refinerUpscale <= 1) {
            form.setFieldValue('refinerupscale', 2);
            onToggle(true);
        }
    };

    return (
        <Accordion.Item value="upscale">
            <Accordion.Control>
                <div className="generate-accordion-control">
                    <span className="generate-accordion-control__title">Upscale</span>
                    <span className="generate-accordion-control__summary">
                        {refinerUpscale > 1 ? `${refinerUpscale}x ${selectedUpscaleMethodValue}` : 'Off'}{chainUpscaleEnabled ? ' | chain' : ''}
                    </span>
                </div>
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <ControlTray
                        title="Post Upscale"
                        subtitle="Upscale after generation without automatically enabling diffusion refinement."
                        status={refinerUpscale > 1 ? `${refinerUpscale}x` : 'Off'}
                        tone={refinerUpscale > 1 ? 'success' : 'secondary'}
                    >
                        <SwarmSwitch
                            label="Enable Post Upscale"
                            size="xs"
                            checked={refinerUpscale > 1}
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
                        description="Values above 1x enable the post-upscale path."
                    />

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
                        description={selectedDescription}
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
                            label="AI Upscaler Model"
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
                            description="Choose a custom model from Models/upscale_models."
                        />
                    )}

                    {refinerUpscale > 1 && (
                        <Text size="xs" c="dimmed">
                            {selectedUpscaleModelValue
                                ? `Upscaling ${refinerUpscale}x with ${selectedUpscaleModelLabel}.`
                                : `Upscaling ${refinerUpscale}x with ${selectedUpscaleMethodValue}.`}
                            {hiResFixEnabled ? ' Then Hi-Res Fix will run.' : ' No diffusion refinement will run.'}
                        </Text>
                    )}

                    <Divider label="Chain Upscale (Second Pass)" labelPosition="center" />

                    <ControlTray
                        title="Chain Upscale"
                        subtitle="Optional second upscale pass after the post-upscale path."
                        status={chainUpscaleEnabled ? `${chainUpscaleScale}x` : 'Off'}
                        tone={chainUpscaleEnabled ? 'warning' : 'secondary'}
                    >
                        <SwarmSwitch
                            label="Enable Chain Upscale"
                            size="xs"
                            checked={chainUpscaleEnabled}
                            onChange={(event) => setChainUpscaleEnabled(event.currentTarget.checked)}
                            tone="warning"
                        />
                    </ControlTray>

                    {chainUpscaleEnabled && (
                        <>
                            <SliderWithInput
                                label="Chain Upscale Scale"
                                value={chainUpscaleScale}
                                onChange={(value) => form.setFieldValue('chainupscalescale', value)}
                                min={1}
                                max={4}
                                step={0.25}
                                decimalScale={2}
                                unit="x"
                                tone="warning"
                                marks={[
                                    { value: 1, label: '1x' },
                                    { value: 1.5, label: '1.5x' },
                                    { value: 2, label: '2x' },
                                    { value: 4, label: '4x' },
                                ]}
                                description="Additional scale factor for the second pass."
                            />

                            <Select
                                label="Chain Upscale Method"
                                data={upscaleMethodOptions}
                                value={chainUpscaleMethodValue}
                                onChange={(value) => form.setFieldValue('chainupscalemethod', value || 'model-remacri')}
                                description={chainUpscaleMethodDescription}
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

                            <Text size="xs" c="dimmed">
                                Second pass: {chainUpscaleScale}x with {chainUpscaleMethodValue.replace(/^model-/, '').replace(/^latentmodel-/, '').replace(/^pixel-/, '').replace(/^latent-/, '')}.
                                Total combined scale: {(refinerUpscale * chainUpscaleScale).toFixed(2)}x.
                            </Text>
                        </>
                    )}
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
