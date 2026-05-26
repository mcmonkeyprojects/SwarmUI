import { memo } from 'react';
import {
    Accordion,
    Stack,
    Text,
    Select,
    Divider,
    Alert,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray, SwarmSwitch } from '../../../../components/ui';
import type { ModelMediaCapabilities } from '../../../../utils/modelCapabilities';

export interface VideoAccordionProps {
    form: UseFormReturnType<GenerateParams>;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    capabilities: ModelMediaCapabilities;
    modelLabel?: string;
}

/**
 * Video accordion section.
 * Combines Image to Video (SVD, LTXV, Cosmos) and Text to Video (Mochi, Hunyuan) settings.
 */
export const VideoAccordion = memo(function VideoAccordion({
    form,
    enabled,
    onToggle,
    capabilities,
    modelLabel,
}: VideoAccordionProps) {
    const hasVideoSupport = capabilities.supportsVideo;
    const showImageToVideo = capabilities.supportsImageToVideo;
    const showTextToVideo = capabilities.supportsTextToVideo;
    const selectedLabel = modelLabel || 'selected model';

    return (
        <Accordion.Item value="video">
            <Accordion.Control>
                <div className="generate-accordion-control">
                    <span className="generate-accordion-control__title">Video</span>
                    <span className="generate-accordion-control__summary">
                        {enabled ? `${form.values.videoframes || form.values.text2videoframes || 25} frames` : 'Off'}
                    </span>
                </div>
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <ControlTray
                        title="Video Mode"
                        subtitle={hasVideoSupport ? `${selectedLabel} can expose video controls here.` : 'Select a video-capable model to arm this mode.'}
                        status={enabled ? 'Armed' : 'Off'}
                        tone={enabled ? 'warning' : 'secondary'}
                    >
                        <SwarmSwitch
                            label="Enable Video Generation"
                            size="xs"
                            checked={enabled}
                            onChange={(e) => onToggle(e.currentTarget.checked)}
                            disabled={!hasVideoSupport}
                            tone="warning"
                        />
                    </ControlTray>

                    {!hasVideoSupport ? (
                        <Alert color="gray" variant="light">
                            <Text size="sm" fw={600}>No video capability detected</Text>
                            <Text size="xs" c="dimmed">
                                Select a video-capable model to unlock image-to-video or text-to-video settings.
                            </Text>
                        </Alert>
                    ) : (
                        <>
                            <Text size="xs" c="invokeGray.3">
                                {selectedLabel} supports
                                {showTextToVideo && showImageToVideo
                                    ? ' text-to-video and image-to-video workflows.'
                                    : showTextToVideo
                                        ? ' text-to-video generation.'
                                        : ' image-to-video generation.'}
                            </Text>

                            {showImageToVideo && (
                                <>
                                    <Text size="xs" fw={600} c="invokeGray.2" tt="uppercase">
                                        Image to Video
                                    </Text>
                                    <Text size="xs" c="invokeGray.3">
                                        Generate videos from an init image. Keep an input image loaded for this mode.
                                    </Text>

                                    <SliderWithInput
                                        label="Video Frames"
                                        value={form.values.videoframes || 25}
                                        onChange={(value) => form.setFieldValue('videoframes', value)}
                                        min={1}
                                        max={257}
                                        unit=" frames"
                                        tone="warning"
                                        marks={[
                                            { value: 14, label: '14 (SVD)' },
                                            { value: 25, label: '25 (SVD-XT)' },
                                            { value: 121, label: '121 (Cosmos)' },
                                        ]}
                                    />

                                    <SliderWithInput
                                        label="Video Steps"
                                        value={form.values.videosteps || 20}
                                        onChange={(value) => form.setFieldValue('videosteps', value)}
                                        min={1}
                                        max={100}
                                        unit=" steps"
                                        status={(form.values.videosteps || 20) > 60 ? 'caution' : 'neutral'}
                                    />

                                    <SliderWithInput
                                        label="Video CFG Scale"
                                        value={form.values.videocfg ?? 3.5}
                                        onChange={(value) => form.setFieldValue('videocfg', value)}
                                        min={1}
                                        max={20}
                                        step={0.5}
                                        decimalScale={1}
                                        status={(form.values.videocfg ?? 3.5) > 12 ? 'caution' : 'neutral'}
                                        marks={[
                                            { value: 2.5, label: '2.5 (SVD)' },
                                            { value: 7, label: '7' },
                                        ]}
                                    />

                                    <SliderWithInput
                                        label="Video FPS"
                                        value={form.values.videofps || 24}
                                        onChange={(value) => form.setFieldValue('videofps', value)}
                                        min={1}
                                        max={60}
                                        unit=" fps"
                                        marks={[
                                            { value: 6, label: '6 (SVD)' },
                                            { value: 24, label: '24 (LTXV)' },
                                        ]}
                                    />

                                    <Select
                                        label="Video Format"
                                        data={[
                                            { value: 'h264-mp4', label: 'H.264 MP4' },
                                            { value: 'h265-mp4', label: 'H.265 MP4' },
                                            { value: 'webm', label: 'WebM' },
                                            { value: 'webp', label: 'WebP' },
                                            { value: 'gif', label: 'GIF' },
                                        ]}
                                        {...form.getInputProps('videoformat')}
                                    />

                                    <SwarmSwitch
                                        label="Boomerang (Loop back and forth)"
                                        size="xs"
                                        {...form.getInputProps('videoboomerang', { type: 'checkbox' })}
                                    />
                                </>
                            )}

                            {showImageToVideo && showTextToVideo && (
                                <Divider
                                    label={
                                        <Text size="xs" fw={600} c="invokeGray.2" tt="uppercase">
                                            Text to Video
                                        </Text>
                                    }
                                    labelPosition="left"
                                />
                            )}

                            {showTextToVideo && (
                                <>
                                    {!showImageToVideo && (
                                        <Text size="xs" fw={600} c="invokeGray.2" tt="uppercase">
                                            Text to Video
                                        </Text>
                                    )}
                                    <Text size="xs" c="invokeGray.3">
                                        Generate videos directly from prompt text. No init image is required for this mode.
                                    </Text>

                                    <SliderWithInput
                                        label="Text2Video Frames"
                                        value={form.values.text2videoframes ?? 97}
                                        onChange={(value) => form.setFieldValue('text2videoframes', value)}
                                        min={1}
                                        max={257}
                                        unit=" frames"
                                        tone="warning"
                                        marks={[
                                            { value: 25, label: '25 (Mochi)' },
                                            { value: 73, label: '73 (Hunyuan)' },
                                            { value: 97, label: '97 (LTXV)' },
                                        ]}
                                    />

                                    <SliderWithInput
                                        label="Text2Video FPS"
                                        value={form.values.text2videofps || 24}
                                        onChange={(value) => form.setFieldValue('text2videofps', value)}
                                        min={1}
                                        max={60}
                                        unit=" fps"
                                    />

                                    <Select
                                        label="Text2Video Format"
                                        data={[
                                            { value: 'h264-mp4', label: 'H.264 MP4' },
                                            { value: 'h265-mp4', label: 'H.265 MP4' },
                                            { value: 'webm', label: 'WebM' },
                                            { value: 'webp', label: 'WebP' },
                                            { value: 'gif', label: 'GIF' },
                                        ]}
                                        {...form.getInputProps('text2videoformat')}
                                    />
                                </>
                            )}
                        </>
                    )}
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
