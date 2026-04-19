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
import { SwarmButton, SwarmSwitch } from '../../../../components/ui';

type ControlNetFieldKey =
    | 'controlnetimageinput'
    | 'controlnetmodel'
    | 'controlnetstrength'
    | 'controlnetstart'
    | 'controlnetend'
    | 'controlnettwoimageinput'
    | 'controlnettwomodel'
    | 'controlnettwostrength'
    | 'controlnettwostart'
    | 'controlnettwoend'
    | 'controlnetthreeimageinput'
    | 'controlnetthreemodel'
    | 'controlnetthreestrength'
    | 'controlnetthreestart'
    | 'controlnetthreeend';

interface ControlNetSlotConfig {
    value: string;
    title: string;
    imageKey: ControlNetFieldKey;
    modelKey: ControlNetFieldKey;
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
        strengthKey: 'controlnetstrength',
        startKey: 'controlnetstart',
        endKey: 'controlnetend',
    },
    {
        value: 'controlnet-secondary',
        title: 'ControlNet Two',
        imageKey: 'controlnettwoimageinput',
        modelKey: 'controlnettwomodel',
        strengthKey: 'controlnettwostrength',
        startKey: 'controlnettwostart',
        endKey: 'controlnettwoend',
    },
    {
        value: 'controlnet-tertiary',
        title: 'ControlNet Three',
        imageKey: 'controlnetthreeimageinput',
        modelKey: 'controlnetthreemodel',
        strengthKey: 'controlnetthreestrength',
        startKey: 'controlnetthreestart',
        endKey: 'controlnetthreeend',
    },
];

export const PREPROCESSOR_OPTIONS = [
    { value: '', label: 'Auto (let backend choose)' },
    { value: 'None', label: 'None' },
    { value: 'Canny', label: 'Canny Edge' },
    { value: 'DepthMiDaS', label: 'Depth (MiDaS)' },
    { value: 'DepthZoe', label: 'Depth (ZoeDepth)' },
    { value: 'NormalBAE', label: 'Normal (BAE)' },
    { value: 'LineartCoarse', label: 'Lineart Coarse' },
    { value: 'LineartFine', label: 'Lineart Fine' },
    { value: 'LineartAnime', label: 'Lineart Anime' },
    { value: 'Scribble', label: 'Scribble' },
    { value: 'HED', label: 'HED Soft Edge' },
    { value: 'MLSD', label: 'MLSD Lines' },
    { value: 'Shuffle', label: 'Shuffle' },
    { value: 'SDPoseDrawKeypoints', label: 'Pose (Draw Keypoints)' },
    { value: 'SDPoseFaceBBoxes', label: 'Pose (Face BBoxes)' },
    { value: 'SDPoseKeypointExtractor', label: 'Pose (Keypoint Extractor)' },
    { value: 'CropByBBoxes', label: 'Crop by BBoxes' },
    { value: 'MediaPipeFace', label: 'MediaPipe Face' },
    { value: 'Segment', label: 'Segmentation' },
    { value: 'Recolor', label: 'Recolor' },
    { value: 'Reference', label: 'Reference' },
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
            <Accordion.Control>ControlNet</Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <SwarmSwitch
                        label="Enable ControlNet"
                        size="xs"
                        checked={enabled}
                        onChange={(e) => onToggle(e.currentTarget.checked)}
                    />

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

                                        <SliderWithInput
                                            label={`${slot.title} Strength`}
                                            value={(form.values[slot.strengthKey] as number | undefined) || 1}
                                            onChange={(value) => form.setFieldValue(slot.strengthKey, value)}
                                            min={0}
                                            max={2}
                                            step={0.05}
                                            decimalScale={2}
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
