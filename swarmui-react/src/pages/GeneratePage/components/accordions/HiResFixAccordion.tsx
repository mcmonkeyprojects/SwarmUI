import { memo, useState } from 'react';
import {
    Accordion,
    Stack,
    Group,
    Text,
    Select,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams, Model } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { SwarmCheckbox, SwarmSwitch } from '../../../../components/ui';

export interface HiResFixAccordionProps {
    form: UseFormReturnType<GenerateParams>;
    onToggle: (enabled: boolean) => void;
    models: Model[];
    vaeOptions: { value: string; label: string }[];
    upscaleEnabled: boolean;
}

export const HiResFixAccordion = memo(function HiResFixAccordion({
    form,
    onToggle,
    models = [],
    vaeOptions = [],
    upscaleEnabled,
}: HiResFixAccordionProps) {
    const refinerControl = typeof form.values.refinercontrolpercentage === 'number'
        ? form.values.refinercontrolpercentage
        : (typeof form.values.refinercontrol === 'number' ? form.values.refinercontrol : 0);
    const hasRefinerModel = typeof form.values.refinermodel === 'string' && form.values.refinermodel.trim().length > 0;

    const [stepsOverrideEnabled, setStepsOverrideEnabled] = useState(false);
    const [cfgOverrideEnabled, setCfgOverrideEnabled] = useState(false);

    const modelOptions = [
        { value: '', label: '(Use Base)' },
        ...models.map((model) => ({
            value: model.name,
            label: model.loaded
                ? `[Loaded] ${model.title || model.name}`
                : model.title || model.name,
        })),
    ];

    const setRefinerControlValue = (value: number) => {
        form.setFieldValue('refinercontrol', value);
        form.setFieldValue('refinercontrolpercentage', value);
        if (value > 0) {
            onToggle(true);
        }
        else if (!upscaleEnabled) {
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
        if (!upscaleEnabled) {
            onToggle(false);
        }
    };

    const selectedRefinerModelLabel = hasRefinerModel
        ? modelOptions.find((option) => option.value === form.values.refinermodel)?.label || form.values.refinermodel
        : '';

    return (
        <Accordion.Item value="hiresfix">
            <Accordion.Control>Hi-Res Fix</Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <SwarmSwitch
                        label="Enable Hi-Res Fix / Diffusion Refine"
                        size="xs"
                        checked={refinerControl > 0}
                        onChange={(event) => setHiResFixEnabled(event.currentTarget.checked)}
                    />

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
                        description="Optional secondary diffusion checkpoint for refinement."
                    />

                    <Select
                        label="Refiner Method"
                        data={[
                            { value: 'PostApply', label: 'Post Apply (Normal)' },
                            { value: 'StepSwap', label: 'Step Swap (SDXL Refiner Original)' },
                            { value: 'StepSwapNoisy', label: 'Step Swap Noisy (Modified)' },
                        ]}
                        {...form.getInputProps('refinermethod')}
                        description="How the refiner pass is applied."
                    />

                    <SliderWithInput
                        label="Diffusion Refiner Control"
                        value={refinerControl}
                        onChange={setRefinerControlValue}
                        min={0}
                        max={1}
                        step={0.05}
                        decimalScale={2}
                        marks={[
                            { value: 0, label: '0' },
                            { value: 0.2, label: '0.2' },
                            { value: 0.4, label: '0.4' },
                        ]}
                        description="Fraction of steps given to diffusion refinement."
                    />

                    <Text size="xs" c={refinerControl > 0 ? 'dimmed' : 'orange'}>
                        {refinerControl > 0
                            ? 'Diffusion refinement is active.'
                            : 'Diffusion refinement is off. Refiner settings will not be sent.'}
                    </Text>

                    <Stack gap="xs">
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
                            />
                        )}
                    </Stack>

                    <Stack gap="xs">
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
                            />
                        )}
                    </Stack>

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
                        description="Optional VAE replacement for refiner stage."
                    />

                    <SwarmCheckbox
                        label="Refiner Tiling"
                        description="Enable tiling for the refiner pass."
                        checked={form.values.refinerdotiling || false}
                        onChange={(e) => form.setFieldValue('refinerdotiling', e.currentTarget.checked)}
                        visual="squishy"
                    />

                    {refinerControl > 0 && (
                        <Text size="xs" c="dimmed">
                            {hasRefinerModel
                                ? `Refining with model: ${selectedRefinerModelLabel}.`
                                : 'Refining with base model.'}
                        </Text>
                    )}
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
