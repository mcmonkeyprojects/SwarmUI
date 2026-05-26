import { memo } from 'react';
import {
    Accordion,
    Stack,
    Text,
    Select,
    FileButton,
    Group,
    Badge,
    Image,
} from '@mantine/core';
import { IconUpload, IconX } from '@tabler/icons-react';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray, SwarmButton, SwarmSwitch } from '../../../../components/ui';
import { PREPROCESSOR_OPTIONS } from './controlNetOptions';

type ControlNetFieldKey =
    | 'controlnetimageinput'
    | 'controlnetmodel'
    | 'controlnetpreprocessor'
    | 'controlnetstrength'
    | 'controlnetstart'
    | 'controlnetend'
    | 'controlnettwoimageinput'
    | 'controlnettwomodel'
    | 'controlnettwopreprocessor'
    | 'controlnettwostrength'
    | 'controlnettwostart'
    | 'controlnettwoend'
    | 'controlnetthreeimageinput'
    | 'controlnetthreemodel'
    | 'controlnetthreepreprocessor'
    | 'controlnetthreestrength'
    | 'controlnetthreestart'
    | 'controlnetthreeend';

interface ControlNetSlotConfig {
    value: string;
    title: string;
    imageKey: ControlNetFieldKey;
    modelKey: ControlNetFieldKey;
    preprocessorKey: ControlNetFieldKey;
    strengthKey: ControlNetFieldKey;
    startKey: ControlNetFieldKey;
    endKey: ControlNetFieldKey;
}

const CONTROL_NET_SLOTS: ControlNetSlotConfig[] = [
    {
        value: 'controlnet-primary',
        title: 'ControlNet',
        imageKey: 'controlnetimageinput',
        modelKey: 'controlnetmodel',
        preprocessorKey: 'controlnetpreprocessor',
        strengthKey: 'controlnetstrength',
        startKey: 'controlnetstart',
        endKey: 'controlnetend',
    },
    {
        value: 'controlnet-secondary',
        title: 'ControlNet Two',
        imageKey: 'controlnettwoimageinput',
        modelKey: 'controlnettwomodel',
        preprocessorKey: 'controlnettwopreprocessor',
        strengthKey: 'controlnettwostrength',
        startKey: 'controlnettwostart',
        endKey: 'controlnettwoend',
    },
    {
        value: 'controlnet-tertiary',
        title: 'ControlNet Three',
        imageKey: 'controlnetthreeimageinput',
        modelKey: 'controlnetthreemodel',
        preprocessorKey: 'controlnetthreepreprocessor',
        strengthKey: 'controlnetthreestrength',
        startKey: 'controlnetthreestart',
        endKey: 'controlnetthreeend',
    },
];

export interface ControlNetAccordionProps {
    form: UseFormReturnType<GenerateParams>;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    controlNetOptions: { value: string; label: string }[];
    loadingControlNets: boolean;
    onRefreshModels?: () => void;
}

/**
 * ControlNet accordion section.
 * Use structural input to guide generation.
 */
export const ControlNetAccordion = memo(function ControlNetAccordion({
    form,
    enabled,
    onToggle,
    controlNetOptions = [],
    loadingControlNets,
}: ControlNetAccordionProps) {
    const activeSlotCount = CONTROL_NET_SLOTS.filter((slot) => Boolean(form.values[slot.imageKey] || form.values[slot.modelKey])).length;

    const handleImageUpload = (key: ControlNetFieldKey, file: File | null) => {
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                form.setFieldValue(key, e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleClearImage = (key: ControlNetFieldKey) => {
        form.setFieldValue(key, '');
    };

    return (
        <Accordion.Item value="controlnet">
            <Accordion.Control>
                <div className="generate-accordion-control">
                    <span className="generate-accordion-control__title">ControlNet</span>
                    <span className="generate-accordion-control__summary">
                        {enabled ? `${activeSlotCount || 1} layer${activeSlotCount === 1 ? '' : 's'}` : 'Off'}
                    </span>
                </div>
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <ControlTray
                        title="Structural Guidance"
                        subtitle="Enable the ControlNet stack, then configure each active layer."
                        status={enabled ? 'Armed' : 'Off'}
                        tone={enabled ? 'info' : 'secondary'}
                    >
                        <SwarmSwitch
                            label="Enable ControlNet"
                            size="xs"
                            checked={enabled}
                            onChange={(e) => onToggle(e.currentTarget.checked)}
                            tone="info"
                        />
                    </ControlTray>

                    <Text size="xs" c="invokeGray.3">
                        Use up to three ControlNet layers to guide generation with structural input.
                    </Text>

                    <Accordion multiple defaultValue={['controlnet-primary']}>
                        {CONTROL_NET_SLOTS.map((slot) => (
                            <Accordion.Item key={slot.value} value={slot.value}>
                                <Accordion.Control>{slot.title}</Accordion.Control>
                                <Accordion.Panel>
                                    <Stack gap="md">
                                        <div>
                                            <FileButton
                                                onChange={(file) => handleImageUpload(slot.imageKey, file)}
                                                accept="image/*"
                                            >
                                                {(props) => (
                                                    <SwarmButton
                                                        {...props}
                                                        leftSection={<IconUpload size={16} />}
                                                        tone="secondary"
                                                        emphasis="soft"
                                                        fullWidth
                                                        size="xs"
                                                    >
                                                        Upload {slot.title} Image
                                                    </SwarmButton>
                                                )}
                                            </FileButton>

                                            {form.values[slot.imageKey] && (
                                                <Stack gap="xs" mt="sm">
                                                    <Group justify="space-between" align="flex-start">
                                                        <Badge size="sm" variant="dot">
                                                            Image Uploaded
                                                        </Badge>
                                                        <SwarmButton
                                                            size="xs"
                                                            tone="danger"
                                                            emphasis="ghost"
                                                            leftSection={<IconX size={14} />}
                                                            onClick={() => handleClearImage(slot.imageKey)}
                                                        >
                                                            Clear
                                                        </SwarmButton>
                                                    </Group>
                                                    <Image
                                                        src={form.values[slot.imageKey] as string}
                                                        alt="ControlNet input"
                                                        radius="md"
                                                        fit="contain"
                                                        height={150}
                                                    />
                                                </Stack>
                                            )}
                                        </div>

                                        <Select
                                            label={`${slot.title} Model`}
                                            placeholder={
                                                loadingControlNets
                                                    ? 'Loading ControlNets...'
                                                    : 'Select ControlNet model'
                                            }
                                            data={controlNetOptions}
                                            {...form.getInputProps(slot.modelKey)}
                                            searchable
                                            clearable
                                            description={`Model for ${slot.title.toLowerCase()} guidance`}
                                        />

                                        <Select
                                            label={`${slot.title} Preprocessor`}
                                            placeholder="Auto"
                                            data={PREPROCESSOR_OPTIONS}
                                            value={(form.values[slot.preprocessorKey] as string | undefined) || ''}
                                            onChange={(value) => form.setFieldValue(slot.preprocessorKey, value || '')}
                                            searchable
                                            clearable
                                            description="Optional structural preprocessor for this ControlNet layer"
                                        />

                                        <SliderWithInput
                                            label={`${slot.title} Strength`}
                                            value={(form.values[slot.strengthKey] as number | undefined) || 1}
                                            onChange={(value) => form.setFieldValue(slot.strengthKey, value)}
                                            min={0}
                                            max={2}
                                            step={0.05}
                                            decimalScale={2}
                                            status={((form.values[slot.strengthKey] as number | undefined) || 1) > 1.4 ? 'caution' : 'neutral'}
                                            marks={[
                                                { value: 0, label: '0' },
                                                { value: 1, label: '1' },
                                                { value: 2, label: '2' },
                                            ]}
                                        />

                                        <Group grow>
                                            <SliderWithInput
                                                label="Start Step"
                                                value={(form.values[slot.startKey] as number | undefined) || 0}
                                                onChange={(value) => form.setFieldValue(slot.startKey, value)}
                                                min={0}
                                                max={1}
                                                step={0.05}
                                                decimalScale={2}
                                                unit="%"
                                                description="When to start applying"
                                            />
                                            <SliderWithInput
                                                label="End Step"
                                                value={(form.values[slot.endKey] as number | undefined) || 1}
                                                onChange={(value) => form.setFieldValue(slot.endKey, value)}
                                                min={0}
                                                max={1}
                                                step={0.05}
                                                decimalScale={2}
                                                unit="%"
                                                description="When to stop applying"
                                            />
                                        </Group>
                                    </Stack>
                                </Accordion.Panel>
                            </Accordion.Item>
                        ))}
                    </Accordion>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
