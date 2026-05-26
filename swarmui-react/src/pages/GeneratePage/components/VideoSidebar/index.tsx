import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    Accordion,
    Alert,
    Box,
    Divider,
    FileButton,
    Image,
    ScrollArea,
    Select,
    Stack,
    Switch,
    Text,
    Textarea,
} from '@mantine/core';
import { IconAlertTriangle, IconHistory, IconUpload, IconX } from '@tabler/icons-react';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams, LoRASelection, Model } from '../../../../api/types';
import type { ModelMediaCapabilities } from '../../../../utils/modelCapabilities';
import { SectionHero } from '../../../../components/ui';
import { SwarmActionIcon, SwarmButton } from '../../../../components/ui';
import { GenerateButton } from '../ParameterPanel/GenerateButton';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { SeedInput } from '../../../../components/SeedInput';
import { SamplingSelect } from '../../../../components/ui';
import { ActiveLoRAs } from '../ParameterPanel/ActiveLoRAs';
import { VideoWorkflowToggle, resolveInitialWorkflow } from './VideoWorkflowToggle';
import { VideoResolution } from './VideoResolution';
import { QualityPreset } from './QualityPreset';
import { PreflightCheck } from './PreflightCheck';
import { useVideoProfile, resolveProfileDefaults } from './useVideoProfile';
import type { VideoWorkflow, QualityTier } from './videoModelProfiles';
import { useWorkflowWorkspaceStore } from '../../../../stores/workflowWorkspaceStore';
import { useNavigationStore } from '../../../../stores/navigationStore';
import { useT2IParams } from '../../../../hooks/useT2IParams';

const FORMAT_OPTIONS = [
    { value: 'h264-mp4', label: 'H.264 MP4' },
    { value: 'h265-mp4', label: 'H.265 MP4' },
    { value: 'webm', label: 'WebM' },
    { value: 'webp', label: 'WebP' },
    { value: 'gif', label: 'GIF' },
];

export interface VideoSidebarProps {
    // Form
    form: UseFormReturnType<GenerateParams>;
    onGenerate: (values: GenerateParams) => void;

    // Models
    models: Model[];
    loadingModels: boolean;
    loadingModel: boolean;
    onModelSelect: (modelName: string | null) => void;
    modelMediaCapabilities: ModelMediaCapabilities;

    // Generation control
    generating: boolean;
    onStop: () => void;
    onOpenSchedule: () => void;
    previewing?: boolean;
    onTogglePreviews?: () => void;

    // History
    onOpenHistory: () => void;

    // Init image (I2V)
    initImagePreview: string | null;
    onInitImageUpload: (file: File | null) => void;
    onClearInitImage: () => void;

    // LoRAs
    activeLoras: LoRASelection[];
    onLoraChange: (loras: LoRASelection[]) => void;
    onOpenLoraBrowser: () => void;
}

export const VideoSidebar = memo(function VideoSidebar({
    form,
    onGenerate,
    models,
    loadingModels,
    loadingModel,
    onModelSelect,
    modelMediaCapabilities: _modelMediaCapabilities,
    generating,
    onStop,
    onOpenSchedule,
    onOpenHistory,
    initImagePreview,
    onInitImageUpload,
    onClearInitImage,
    activeLoras,
    onLoraChange,
    onOpenLoraBrowser,
    previewing,
    onTogglePreviews,
}: VideoSidebarProps) {
    const { samplerOptions, schedulerOptions } = useT2IParams();
    const setHandoff = useWorkflowWorkspaceStore((s) => s.setHandoff);
    const navigateToWorkflows = useNavigationStore((s) => s.navigateToWorkflows);

    // --- Local state ---
    const [workflow, setWorkflow] = useState<VideoWorkflow>(
        () => resolveInitialWorkflow(initImagePreview),
    );
    const [qualityTier, setQualityTier] = useState<QualityTier | null>('standard');
    const [preflightReady, setPreflightReady] = useState(true);

    // --- Refs for tracking previous values (parameter cascading) ---
    const prevModelRef = useRef<string | null>(form.values.model ?? null);
    const prevQualityRef = useRef<QualityTier | null>('standard');
    const prevWorkflowRef = useRef<VideoWorkflow>(workflow);

    // --- Resolve profile from current model + quality + workflow ---
    const effectiveQuality = qualityTier ?? 'standard';
    const resolved = useVideoProfile(form.values.model ?? '', effectiveQuality, workflow);

    // --- Re-sync workflow toggle if init image changes externally ---
    useEffect(() => {
        setWorkflow(resolveInitialWorkflow(initImagePreview));
    }, [initImagePreview]);

    // --- Parameter cascading on model / quality / workflow change ---
    useEffect(() => {
        const currentModel = form.values.model ?? null;
        const modelChanged = currentModel !== prevModelRef.current;
        const qualityChanged = qualityTier !== prevQualityRef.current;
        const workflowChanged = workflow !== prevWorkflowRef.current;

        if (modelChanged && currentModel) {
            // Full reset: apply all profile defaults
            const defaults = resolveProfileDefaults(currentModel, effectiveQuality, workflow);
            form.setFieldValue('steps', defaults.steps);
            form.setFieldValue('cfgscale', defaults.cfg);
            form.setFieldValue('sampler', defaults.sampler);
            form.setFieldValue('scheduler', defaults.scheduler);
            form.setFieldValue('width', defaults.width);
            form.setFieldValue('height', defaults.height);

            // Set workflow-aware video param fields
            if (workflow === 'i2v') {
                form.setFieldValue('videoframes', defaults.frames);
                form.setFieldValue('videofps', defaults.fps);
                form.setFieldValue('videocfg', defaults.cfg);
            } else {
                form.setFieldValue('text2videoframes', defaults.frames);
                form.setFieldValue('text2videofps', defaults.fps);
            }

            // Reset quality to standard on model change
            setQualityTier('standard');
        } else if (qualityChanged && qualityTier !== null) {
            // Quality preset changed: update steps/CFG/frames only
            form.setFieldValue('steps', resolved.steps);
            form.setFieldValue('cfgscale', resolved.cfg);

            if (workflow === 'i2v') {
                form.setFieldValue('videoframes', resolved.frames);
                form.setFieldValue('videocfg', resolved.cfg);
            } else {
                form.setFieldValue('text2videoframes', resolved.frames);
            }
        } else if (workflowChanged) {
            // Workflow changed: update scheduler only (per spec)
            form.setFieldValue('scheduler', resolved.scheduler);
        }

        prevModelRef.current = currentModel;
        prevQualityRef.current = qualityTier;
        prevWorkflowRef.current = workflow;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.values.model, qualityTier, workflow]);

    // --- Detect manual override of steps/CFG -> set quality to custom ---
    const stepsRef = useRef(form.values.steps);
    const cfgRef = useRef(form.values.cfgscale);

    useEffect(() => {
        if (qualityTier === null) return; // already custom

        const stepsChanged = form.values.steps !== stepsRef.current;
        const cfgChanged = form.values.cfgscale !== cfgRef.current;

        if (stepsChanged || cfgChanged) {
            // Check if user value differs from the current profile tier
            const expectedSteps = resolved.steps;
            const expectedCfg = resolved.cfg;

            if (form.values.steps !== expectedSteps || form.values.cfgscale !== expectedCfg) {
                setQualityTier(null);
            }
        }

        stepsRef.current = form.values.steps;
        cfgRef.current = form.values.cfgscale;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.values.steps, form.values.cfgscale]);

    // --- Handlers ---
    function handleWorkflowChange(next: VideoWorkflow) {
        if (next === 't2v') {
            onClearInitImage();
        }
        setWorkflow(next);
    }

    function handleQualityChange(tier: QualityTier) {
        setQualityTier(tier);
    }

    const handlePreflightStatus = useCallback((allReady: boolean) => {
        setPreflightReady(allReady);
    }, []);

    function handleOpenInComfyUI() {
        setHandoff({
            source: 'generate',
            templateId: resolved.workflowId || null,
            params: { ...form.values },
        });
        navigateToWorkflows({ mode: 'comfy' });
    }

    const modelOptions = models.map((m) => ({
        value: m.name,
        label: m.title || m.name,
    }));

    const isI2V = workflow === 'i2v';
    const framesKey = isI2V ? 'videoframes' : 'text2videoframes';
    const fpsKey = isI2V ? 'videofps' : 'text2videofps';
    const formatKey = isI2V ? 'videoformat' : 'text2videoformat';

    const generateDisabled = !preflightReady;
    const generateDisabledReason = !preflightReady
        ? 'Required components are missing. Download them above before generating.'
        : undefined;

    return (
        <Box
            className="surface-table panel-gradient-subtle"
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* Sticky header */}
            <Box p="sm" style={{ borderBottom: 'var(--elevation-border)', flexShrink: 0 }}>
                <SectionHero
                    title="Video Studio"
                    rightSection={
                        <SwarmActionIcon
                            tone="secondary"
                            emphasis="ghost"
                            size="sm"
                            title="History"
                            onClick={onOpenHistory}
                        >
                            <IconHistory size={14} />
                        </SwarmActionIcon>
                    }
                />
            </Box>

            {/* Scrollable body */}
            <ScrollArea style={{ flex: 1 }} p="sm">
                <form onSubmit={form.onSubmit(onGenerate)}>
                    <Stack gap="md">
                        {/* ---- PRIMARY CONTROLS ---- */}

                        {/* Model selector */}
                        <Select
                            label="Model"
                            placeholder={loadingModels ? 'Loading...' : 'Select a model'}
                            data={modelOptions}
                            searchable
                            size="sm"
                            disabled={loadingModel}
                            value={form.values.model ?? null}
                            onChange={onModelSelect}
                        />

                        {/* Preflight check */}
                        <PreflightCheck
                            requiredComponents={resolved.requiredComponents}
                            onStatusChange={handlePreflightStatus}
                        />

                        {/* Unknown model info alert */}
                        {resolved.isGenericFallback && form.values.model && (
                            <Alert
                                color="blue"
                                variant="light"
                                icon={<IconAlertTriangle size={16} />}
                                title="Unknown Model"
                            >
                                <Text size="sm">
                                    This model is not in our profile database. Using generic defaults
                                    — you may need to adjust parameters manually in Advanced.
                                </Text>
                            </Alert>
                        )}

                        <Divider />

                        {/* Workflow toggle */}
                        <VideoWorkflowToggle
                            workflow={workflow}
                            onChange={handleWorkflowChange}
                        />

                        {/* Init image (I2V only) */}
                        {isI2V && (
                            <Stack gap="xs">
                                {initImagePreview ? (
                                    <Box style={{ position: 'relative', display: 'inline-block' }}>
                                        <Image
                                            src={initImagePreview}
                                            mah={180}
                                            fit="contain"
                                            radius="sm"
                                        />
                                        <SwarmActionIcon
                                            tone="danger"
                                            emphasis="soft"
                                            size="xs"
                                            title="Clear init image"
                                            style={{ position: 'absolute', top: 4, right: 4 }}
                                            onClick={onClearInitImage}
                                        >
                                            <IconX size={10} />
                                        </SwarmActionIcon>
                                    </Box>
                                ) : (
                                    <FileButton
                                        onChange={(file) => file && onInitImageUpload(file)}
                                        accept="image/*"
                                    >
                                        {(props) => (
                                            <SwarmButton
                                                {...props}
                                                tone="secondary"
                                                emphasis="soft"
                                                leftSection={<IconUpload size={14} />}
                                            >
                                                Upload Init Image
                                            </SwarmButton>
                                        )}
                                    </FileButton>
                                )}
                            </Stack>
                        )}

                        <Divider />

                        {/* Prompt */}
                        <Textarea
                            label="Prompt"
                            placeholder="Describe the video..."
                            minRows={3}
                            autosize
                            size="sm"
                            {...form.getInputProps('prompt')}
                        />

                        <Divider />

                        {/* Quality preset */}
                        <QualityPreset
                            value={qualityTier}
                            onChange={handleQualityChange}
                        />

                        {/* Resolution presets (model-aware) */}
                        <VideoResolution
                            form={form}
                            presets={resolved.resolutionPresets}
                        />

                        <Divider />

                        {/* Generate button */}
                        <GenerateButton
                            generating={generating}
                            onStop={onStop}
                            onOpenSchedule={onOpenSchedule}
                            previewing={previewing}
                            onTogglePreviews={onTogglePreviews}
                            currentValues={form.values}
                            disabled={generateDisabled}
                            disabledReason={generateDisabledReason}
                            onInsertPromptSyntax={(text) => {
                                form.setFieldValue('prompt', (form.values.prompt || '').trim() + ' ' + text.trim());
                            }}
                        />

                        {/* ---- ADVANCED SECTION ---- */}
                        <Accordion variant="contained" radius="sm">
                            <Accordion.Item value="advanced">
                                <Accordion.Control>
                                    <Text size="sm" fw={600}>Advanced</Text>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    <Stack gap="sm">
                                        {/* Negative prompt */}
                                        <Textarea
                                            label="Negative Prompt"
                                            placeholder="What to avoid..."
                                            minRows={2}
                                            autosize
                                            size="sm"
                                            {...form.getInputProps('negativeprompt')}
                                        />

                                        {/* Frames */}
                                        <SliderWithInput
                                            label="Frames"
                                            value={(form.values[framesKey] as number | undefined) ?? resolved.frames}
                                            onChange={(value) => form.setFieldValue(framesKey, value)}
                                            min={1}
                                            max={257}
                                            marks={[
                                                { value: 25, label: '25' },
                                                { value: 97, label: '97' },
                                            ]}
                                        />

                                        {/* FPS */}
                                        <SliderWithInput
                                            label="FPS"
                                            value={(form.values[fpsKey] as number | undefined) ?? resolved.fps}
                                            onChange={(value) => form.setFieldValue(fpsKey, value)}
                                            min={1}
                                            max={60}
                                            marks={[{ value: 24, label: '24' }]}
                                        />

                                        {/* Steps */}
                                        <SliderWithInput
                                            label="Steps"
                                            value={form.values.steps ?? resolved.steps}
                                            onChange={(value) => form.setFieldValue('steps', value)}
                                            min={1}
                                            max={150}
                                            marks={[
                                                { value: 20, label: '20' },
                                                { value: 50, label: '50' },
                                            ]}
                                        />

                                        {/* CFG Scale */}
                                        <SliderWithInput
                                            label="CFG Scale"
                                            value={form.values.cfgscale ?? resolved.cfg}
                                            onChange={(value) => form.setFieldValue('cfgscale', value)}
                                            min={1}
                                            max={20}
                                            step={0.5}
                                            decimalScale={1}
                                            marks={[
                                                { value: 3.5, label: '3.5' },
                                                { value: 7, label: '7' },
                                            ]}
                                        />

                                        {/* Seed */}
                                        <SeedInput
                                            value={form.values.seed ?? -1}
                                            onChange={(value) => form.setFieldValue('seed', value)}
                                        />

                                        {/* Sampler */}
                                        <SamplingSelect
                                            kind="sampler"
                                            label="Sampler"
                                            data={samplerOptions}
                                            size="sm"
                                            {...form.getInputProps('sampler')}
                                        />

                                        {/* Scheduler */}
                                        <SamplingSelect
                                            kind="scheduler"
                                            label="Scheduler"
                                            data={schedulerOptions}
                                            size="sm"
                                            {...form.getInputProps('scheduler')}
                                        />

                                        {/* Video format */}
                                        <Select
                                            label="Format"
                                            size="sm"
                                            data={FORMAT_OPTIONS}
                                            {...form.getInputProps(formatKey)}
                                        />

                                        {/* Boomerang (I2V only) */}
                                        {isI2V && (
                                            <Switch
                                                label="Boomerang (loop back and forth)"
                                                size="xs"
                                                {...form.getInputProps('videoboomerang', { type: 'checkbox' })}
                                            />
                                        )}

                                        {/* Custom resolution inputs */}
                                        <VideoResolution
                                            form={form}
                                            presets={resolved.resolutionPresets}
                                            customOnly
                                        />

                                        <Divider />

                                        {/* LoRAs */}
                                        <SwarmButton
                                            size="xs"
                                            tone="secondary"
                                            emphasis="soft"
                                            onClick={onOpenLoraBrowser}
                                        >
                                            Browse LoRAs
                                        </SwarmButton>
                                        <ActiveLoRAs
                                            form={form}
                                            activeLoras={activeLoras}
                                            onLoraChange={onLoraChange}
                                            onOpenLoraBrowser={onOpenLoraBrowser}
                                        />

                                        <Divider />

                                        {/* Open in ComfyUI */}
                                        <SwarmButton
                                            size="xs"
                                            tone="secondary"
                                            emphasis="soft"
                                            onClick={handleOpenInComfyUI}
                                        >
                                            Open in ComfyUI
                                        </SwarmButton>
                                    </Stack>
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Accordion>
                    </Stack>
                </form>
            </ScrollArea>
        </Box>
    );
});
