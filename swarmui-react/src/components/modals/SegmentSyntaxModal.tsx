import React, { useState, useCallback, useMemo } from 'react';
import {
    Stack,
    TextInput,
    Group,
    Text,
    Select,
    Textarea,
    Divider,
    Alert,
} from '@mantine/core';
import { IconInfoCircle, IconExternalLink } from '@tabler/icons-react';
import { HeadlessDialog } from '../headless';
import { useT2IParams } from '../../hooks/useT2IParams';
import { buildSegmentTag, type BuilderSegmentModelType, type BuilderSegmentRule } from '../../features/promptBuilder';
import type { T2IParam } from '../../api/types';
import { SamplingSelect, SwarmButton, SwarmSlider, SwarmSwitch } from '../ui';

interface SegmentSyntaxModalProps {
    /** Whether the modal is open */
    opened: boolean;
    /** Callback to close the modal */
    onClose: () => void;
    /** Callback with the generated syntax string */
    onSubmit: (syntax: string) => void;
}

/**
 * Modal for configuring the <segment:> syntax with a user-friendly interface.
 * Supports automatic text matching and dynamic YOLO model selection from backend data.
 *
 * Uses HeadlessDialog (Radix UI) for built-in focus trapping and accessibility.
 */
export const SegmentSyntaxModal = React.memo(function SegmentSyntaxModal({
    opened,
    onClose,
    onSubmit,
}: SegmentSyntaxModalProps) {
    const { params, samplerOptions, schedulerOptions } = useT2IParams();

    // Form state
    const [modelType, setModelType] = useState<BuilderSegmentModelType>('auto');
    const [textMatch, setTextMatch] = useState('face');
    const [yoloModel, setYoloModel] = useState('');
    const [yoloId, setYoloId] = useState(0);
    const [yoloClassIds, setYoloClassIds] = useState('');
    const [creativity, setCreativity] = useState(0.6);
    const [threshold, setThreshold] = useState(0.5);
    const [invertMask, setInvertMask] = useState(false);
    const [sampler, setSampler] = useState('');
    const [scheduler, setScheduler] = useState('');
    const [genPrompt, setGenPrompt] = useState('');

    const yoloOptions = useMemo(() => {
        const yoloParam = params.find((param: T2IParam) => param.id === 'yolomodelinternal');
        if (!yoloParam?.values?.length) {
            return [] as { value: string; label: string }[];
        }
        return yoloParam.values.map((value) => ({
            value,
            label: value,
        }));
    }, [params]);

    // Reset form when modal opens
    const handleOpen = useCallback(() => {
        setModelType('auto');
        setTextMatch('face');
        setYoloModel(yoloOptions[0]?.value || '');
        setYoloId(0);
        setYoloClassIds('');
        setCreativity(0.6);
        setThreshold(0.5);
        setInvertMask(false);
        setSampler('');
        setScheduler('');
        setGenPrompt('');
    }, [yoloOptions]);

    React.useEffect(() => {
        if (opened) {
            handleOpen();
        }
    }, [opened, handleOpen]);

    const handleSubmit = useCallback(() => {
        const segmentRule: BuilderSegmentRule = {
            id: 'modal',
            modelType,
            textMatch,
            yoloModel,
            yoloId,
            yoloClassIds,
            creativity,
            threshold,
            invertMask,
            prompt: genPrompt,
            sampler,
            scheduler,
            enabled: true,
        };

        const syntax = buildSegmentTag(segmentRule);
        onSubmit(syntax);
        onClose();
    }, [
        modelType,
        textMatch,
        yoloModel,
        yoloId,
        yoloClassIds,
        creativity,
        threshold,
        invertMask,
        genPrompt,
        sampler,
        scheduler,
        onSubmit,
        onClose,
    ]);

    const canSubmit = modelType === 'yolo'
        ? !!yoloModel.trim()
        : !!textMatch.trim();

    return (
        <HeadlessDialog
            open={opened}
            onOpenChange={(open) => !open && onClose()}
            title="Auto Segment and Refine"
            size="md"
            description="Configure automatic segmentation and refinement for your image"
        >
            <Stack gap="md">
                <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                    <Text size="sm">
                        Automatically detect and refine parts of your image. Common use: refine faces (like ADetailer).
                    </Text>
                    <Text
                        size="xs"
                        c="blue"
                        component="a"
                        href="https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Features/Prompt%20Syntax.md#automatic-segmentation-and-refining"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}
                    >
                        Learn more <IconExternalLink size={12} />
                    </Text>
                </Alert>

                <Select
                    label="Segment Mode"
                    description="Auto keeps the normal segment syntax and lets the backend pick the strongest available detector."
                    data={[
                        { value: 'auto', label: 'Auto (Anatomy-aware)' },
                        { value: 'anatomy-auto', label: 'Anatomy Auto' },
                        { value: 'grounded-sam2', label: 'Grounded SAM2' },
                        { value: 'clip-seg', label: 'CLIP-Seg (Match by text)' },
                        { value: 'yolo', label: 'YOLOv8 (Model-based)' },
                    ]}
                    value={modelType}
                    onChange={(value) => setModelType((value as BuilderSegmentModelType) || 'auto')}
                    comboboxProps={{ withinPortal: false }}
                />

                {modelType !== 'yolo' ? (
                    <TextInput
                        label="Text Match"
                        description="Describe what to find and refine (e.g., face, hair, hands)."
                        placeholder="face"
                        value={textMatch}
                        onChange={(event) => setTextMatch(event.currentTarget.value)}
                    />
                ) : (
                    <Stack gap="xs">
                        <Select
                            label="YOLO Model"
                            description="Model list is loaded from backend yolomodelinternal parameter."
                            data={yoloOptions}
                            value={yoloModel}
                            onChange={(value) => setYoloModel(value || '')}
                            searchable
                            comboboxProps={{ withinPortal: false }}
                            placeholder={yoloOptions.length ? 'Select model' : 'No YOLO models reported'}
                        />
                        <Group grow>
                            <TextInput
                                type="number"
                                label="YOLO Match ID"
                                description="0 = all matches, 1 = first, 2 = second..."
                                value={`${yoloId}`}
                                onChange={(event) => {
                                    const parsed = Number.parseInt(event.currentTarget.value, 10);
                                    setYoloId(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
                                }}
                            />
                            <TextInput
                                label="YOLO Class IDs"
                                description="Optional, e.g. 0,apple,2"
                                value={yoloClassIds}
                                onChange={(event) => setYoloClassIds(event.currentTarget.value)}
                            />
                        </Group>
                    </Stack>
                )}

                {modelType === 'auto' || modelType === 'anatomy-auto' ? (
                    <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                        <Text size="sm">
                            Auto tries SAM3, Sapiens2 when installed, anatomy YOLO, pose/body boxes, GroundingDINO+SAM2, then CLIPSeg. Segment diagnostic previews show the detected mask before refinement.
                        </Text>
                    </Alert>
                ) : null}

                <div>
                    <Text size="sm" fw={500} mb={4}>Creativity: {creativity.toFixed(2)}</Text>
                    <Text size="xs" c="dimmed" mb={8}>
                        How much to change the matched area (0 = no change, 1 = full replace).
                    </Text>
                    <SwarmSlider
                        value={creativity}
                        onChange={setCreativity}
                        min={0}
                        max={1}
                        step={0.05}
                        marks={[
                            { value: 0, label: '0' },
                            { value: 0.5, label: '0.5' },
                            { value: 1, label: '1' },
                        ]}
                    />
                </div>

                <div>
                    <Text size="sm" fw={500} mb={4}>Threshold: {threshold.toFixed(2)}</Text>
                    <Text size="xs" c="dimmed" mb={8}>
                        Minimum match quality (lower = more inclusive).
                    </Text>
                    <SwarmSlider
                        value={threshold}
                        onChange={setThreshold}
                        min={0}
                        max={1}
                        step={0.05}
                        marks={[
                            { value: 0, label: '0' },
                            { value: 0.5, label: '0.5' },
                            { value: 1, label: '1' },
                        ]}
                    />
                </div>

                <SwarmSwitch
                    label="Invert Mask"
                    description="Select everything except what was matched."
                    checked={invertMask}
                    onChange={(event) => setInvertMask(event.currentTarget.checked)}
                />

                <Group grow>
                    <SamplingSelect
                        kind="sampler"
                        label="Sampler (Optional)"
                        data={samplerOptions}
                        withSelectedDescription={false}
                        value={sampler || null}
                        onChange={(value) => setSampler(value || '')}
                        clearable
                        searchable
                        comboboxProps={{ withinPortal: false }}
                    />
                    <SamplingSelect
                        kind="scheduler"
                        label="Scheduler (Optional)"
                        data={schedulerOptions}
                        withSelectedDescription={false}
                        value={scheduler || null}
                        onChange={(value) => setScheduler(value || '')}
                        clearable
                        searchable
                        comboboxProps={{ withinPortal: false }}
                    />
                </Group>

                <Divider />

                <Textarea
                    label="Generation Prompt (Optional)"
                    description="Prompt to use when regenerating the matched area."
                    placeholder="detailed face, sharp focus..."
                    value={genPrompt}
                    onChange={(event) => setGenPrompt(event.currentTarget.value)}
                    minRows={2}
                    maxRows={4}
                    autosize
                />

                <Group justify="flex-end" mt="md">
                    <SwarmButton emphasis="ghost" tone="secondary" onClick={onClose}>Cancel</SwarmButton>
                    <SwarmButton emphasis="solid" onClick={handleSubmit} disabled={!canSubmit}>Add to Prompt</SwarmButton>
                </Group>
            </Stack>
        </HeadlessDialog>
    );
});

SegmentSyntaxModal.displayName = 'SegmentSyntaxModal';
