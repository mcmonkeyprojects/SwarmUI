import { memo, type ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
    Accordion,
    Box,
    Divider,
    FileButton,
    Group,
    Image,
    MultiSelect,
    ScrollArea,
    Select,
    Stack,
    Text,
    Textarea,
    Tooltip,
} from '@mantine/core';
import {
    IconAdjustments,
    IconArrowWaveRightUp,
    IconBlocks,
    IconClockHour4,
    IconDatabase,
    IconHistory,
    IconLayersIntersect,
    IconRefresh,
    IconSparkles,
    IconUpload,
    IconX,
} from '@tabler/icons-react';
import type { UseFormReturnType } from '@mantine/form';
import type {
    BackendStatus,
    GenerateParams,
    LoRASelection,
    Model,
} from '../../../api/types';
import type { Preset } from '../../../stores/presets';
import type { QuickModuleKey } from '../../../stores/layoutStore';
import { useT2IParams } from '../../../hooks/useT2IParams';
import { QueueStatusBadge } from '../../../components/QueueStatusBadge';
import { SeedInput } from '../../../components/SeedInput';
import { SliderWithInput } from '../../../components/SliderWithInput';
import {
    ElevatedCard,
    SamplingSelect,
    SectionHero,
    SwarmActionIcon,
    SwarmBadge,
    SwarmButton,
    SwarmSlider,
    SwarmSwitch,
} from '../../../components/ui';
import { PromptSection } from './ParameterPanel/PromptSection';
import { DimensionControls } from './ParameterPanel/DimensionControls';
import { PresetControls } from './ParameterPanel/PresetControls';
import { GenerateButton } from './ParameterPanel/GenerateButton';
import {
    InitImageAccordion,
    ModelAddonsAccordion,
    OptionsAccordion,
    SamplerAccordion,
    VariationAccordion,
} from './accordions';
import type { ModelMediaCapabilities } from '../../../utils/modelCapabilities';
import {
    VAE_ALTERNATIVE_EMPTY_MESSAGE,
    getVaeAlternativeDisplayOptions,
    getVaeAlternativeOptionDescription,
    isVaeAlternativeValue,
    splitVaeOptions,
} from '../../../utils/vaeAlternativeStack';

const ControlNetAccordion = lazy(() =>
    import('./accordions/ControlNetAccordion').then((module) => ({ default: module.ControlNetAccordion }))
);
const RefinerAccordion = lazy(() =>
    import('./accordions/RefinerAccordion').then((module) => ({ default: module.RefinerAccordion }))
);
const VideoAccordion = lazy(() =>
    import('./accordions/VideoAccordion').then((module) => ({ default: module.VideoAccordion }))
);

interface WorkspaceSidebarProps {
    form: UseFormReturnType<GenerateParams>;
    onGenerate: (values: GenerateParams) => void;
    onResetWorkspace: () => void;
    presets: Preset[];
    onLoadPreset: (presetId: string) => void;
    onOpenSaveModal: () => void;
    onDeletePreset?: (presetId: string) => void;
    onDuplicatePreset?: (presetId: string) => void;
    onOpenHistory: () => void;
    backends: BackendStatus[];
    backendOptions: { value: string; label: string; disabled?: boolean }[];
    selectedBackend: string;
    onBackendChange: (value: string) => void;
    loadingBackends: boolean;
    activeLoras: LoRASelection[];
    onLoraChange: (loras: LoRASelection[]) => void;
    onOpenLoraBrowser: () => void;
    onOpenEmbeddingBrowser: () => void;
    onOpenModelBrowser: () => void;
    generating: boolean;
    onStop: () => void;
    onOpenSchedule: () => void;
    onGenerateAndUpscale?: () => void;
    enableRefiner: boolean;
    setEnableRefiner: (enabled: boolean) => void;
    enableInitImage: boolean;
    setEnableInitImage: (enabled: boolean) => void;
    initImagePreview: string | null;
    onInitImageUpload: (file: File | null) => void;
    onClearInitImage: () => void;
    enableVariation: boolean;
    setEnableVariation: (enabled: boolean) => void;
    enableControlNet: boolean;
    setEnableControlNet: (enabled: boolean) => void;
    enableVideo: boolean;
    setEnableVideo: (enabled: boolean) => void;
    modelMediaCapabilities: ModelMediaCapabilities;
    models: Model[];
    loadingModels: boolean;
    loadingModel: boolean;
    onModelSelect: (modelName: string | null) => void;
    vaeOptions: { value: string; label: string }[];
    loadingVAEs: boolean;
    controlNetOptions: { value: string; label: string }[];
    loadingControlNets: boolean;
    onRefreshControlNets?: () => void;
    upscaleModels: Model[];
    embeddingOptions: { value: string; label: string }[];
    wildcardOptions: { value: string; label: string }[];
    wildcardText: string;
    onWildcardTextChange: (text: string) => void;
    quickModules: QuickModuleKey[];
    onQuickModulesChange: (sections: QuickModuleKey[]) => void;
    inspectorSections: string[];
    onInspectorSectionsChange: (sections: string[]) => void;
    lastInspectorJumpTarget: string | null;
    onLastInspectorJumpTargetChange: (target: string | null) => void;
    uxRefresh?: boolean;
    previewing?: boolean;
    onTogglePreviews?: () => void;
}

const QUICK_IMAGE_PREP: QuickModuleKey = 'image-prep';
const QUICK_HI_RES_FIX: QuickModuleKey = 'hi-res-fix';
const QUICK_MODEL_STACK: QuickModuleKey = 'model-stack';
const QUICK_SAMPLING: QuickModuleKey = 'sampling';

const REFINER_METHOD_LABELS: Record<string, string> = {
    PostApply: 'Post Apply',
    StepSwap: 'Step Swap',
    StepSwapNoisy: 'Step Swap Noisy',
};

const DEFAULT_UPSCALE_METHOD = 'pixel-lanczos';

function updateLoRAWeight(activeLoras: LoRASelection[], index: number, weight: number): LoRASelection[] {
    return activeLoras.map((lora, currentIndex) => (
        currentIndex === index ? { ...lora, weight } : lora
    ));
}

function removeLoRA(activeLoras: LoRASelection[], index: number): LoRASelection[] {
    return activeLoras.filter((_, currentIndex) => currentIndex !== index);
}

function humanizeToken(value: string): string {
    return value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatUpscaleMethodLabel(model: Model): string {
    const value = model.name || '';
    const title = model.title || '';
    if (title && title !== value) {
        return title;
    }
    if (value.startsWith('model-')) {
        return `Model: ${value.slice('model-'.length)}`;
    }
    if (value.startsWith('latentmodel-')) {
        return `Latent Model: ${value.slice('latentmodel-'.length)}`;
    }
    if (value.startsWith('pixel-')) {
        return `Pixel: ${humanizeToken(value.slice('pixel-'.length))}`;
    }
    if (value.startsWith('latent-')) {
        return `Latent: ${humanizeToken(value.slice('latent-'.length))}`;
    }
    return humanizeToken(value);
}

function mergeUniqueItems<T extends string>(items: readonly T[], additions: readonly T[]): T[] {
    return Array.from(new Set([...items, ...additions]));
}

function ShellControlSummary({
    title,
    description,
    badge,
}: {
    title: string;
    description: string;
    badge: ReactNode;
}) {
    return (
        <Group justify="space-between" align="center" wrap="nowrap" className="generate-studio__section-shell-summary">
            <Stack gap={2} style={{ flex: 1 }} className="generate-studio__section-shell-summary-copy">
                <Text size="sm" fw={600} className="generate-studio__section-shell-title">
                    {title}
                </Text>
                <Text size="xs" c="var(--theme-text-secondary)" className="generate-studio__section-shell-description">
                    {description}
                </Text>
            </Stack>
            {badge}
        </Group>
    );
}

function SectionBodyHeader({
    eyebrow,
    title,
    description,
    badge,
}: {
    eyebrow: string;
    title: string;
    description: string;
    badge?: ReactNode;
}) {
    return (
        <Group justify="space-between" align="flex-start" className="generate-studio__section-body-header">
            <Stack gap={2} className="generate-studio__section-body-copy">
                <Text size="xs" tt="uppercase" fw={700} c="var(--theme-text-secondary)" className="generate-studio__section-body-eyebrow">
                    {eyebrow}
                </Text>
                <Text size="sm" fw={600} className="generate-studio__section-body-title">
                    {title}
                </Text>
                <Text size="sm" c="var(--theme-text-secondary)" className="generate-studio__section-body-description">
                    {description}
                </Text>
            </Stack>
            {badge}
        </Group>
    );
}

function SectionItemLabel({
    icon,
    title,
    description,
    aside,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    aside?: ReactNode;
}) {
    return (
        <Group justify="space-between" align="center" wrap="nowrap" className="generate-studio__section-item-label">
            <Group gap="xs" wrap="nowrap" className="generate-studio__section-item-copy">
                <Box className="generate-studio__section-item-icon">
                    {icon}
                </Box>
                <Stack gap={0} className="generate-studio__section-item-text">
                    <Text size="sm" fw={600} className="generate-studio__section-item-title">{title}</Text>
                    <Text size="xs" c="var(--theme-text-secondary)" className="generate-studio__section-item-description">
                        {description}
                    </Text>
                </Stack>
            </Group>
            {aside}
        </Group>
    );
}

function AccordionLoader() {
    return (
        <ElevatedCard elevation="paper" tone="neutral" className="generate-studio__empty-panel generate-studio__empty-panel--compact">
            <Stack gap={4} align="center" py="sm">
                <Text size="xs" c="var(--theme-text-secondary)">
                    Loading controls...
                </Text>
            </Stack>
        </ElevatedCard>
    );
}

export const WorkspaceSidebar = memo(function WorkspaceSidebar({
    form,
    onGenerate,
    onResetWorkspace,
    presets,
    onLoadPreset,
    onOpenSaveModal,
    onDeletePreset,
    onDuplicatePreset,
    onOpenHistory,
    activeLoras,
    onLoraChange,
    onOpenLoraBrowser,
    onOpenEmbeddingBrowser,
    onOpenModelBrowser,
    generating,
    onStop,
    onOpenSchedule,
    onGenerateAndUpscale,
    enableRefiner,
    setEnableRefiner,
    enableInitImage,
    setEnableInitImage,
    initImagePreview,
    onInitImageUpload,
    onClearInitImage,
    enableVariation,
    setEnableVariation,
    enableControlNet,
    setEnableControlNet,
    enableVideo,
    setEnableVideo,
    modelMediaCapabilities,
    models,
    loadingModels,
    loadingModel,
    onModelSelect,
    vaeOptions,
    loadingVAEs,
    controlNetOptions,
    loadingControlNets,
    onRefreshControlNets,
    upscaleModels,
    embeddingOptions,
    wildcardOptions,
    wildcardText,
    onWildcardTextChange,
    quickModules,
    onQuickModulesChange,
    inspectorSections,
    onInspectorSectionsChange,
    lastInspectorJumpTarget,
    onLastInspectorJumpTargetChange,
    uxRefresh = false,
    previewing,
    onTogglePreviews,
}: WorkspaceSidebarProps) {
    const { paramRanges, paramDefaults, samplerOptions, schedulerOptions } = useT2IParams();
    const [sidebarSections, setSidebarSections] = useState<string[]>(() => (
        uxRefresh ? [] : ['quick-access-shell', 'inspector-shell']
    ));
    const inspectorCardRef = useRef<HTMLDivElement | null>(null);
    const assetsSectionRef = useRef<HTMLDivElement | null>(null);
    const imageSetupSectionRef = useRef<HTMLDivElement | null>(null);
    const samplingSectionRef = useRef<HTMLDivElement | null>(null);
    const outputSectionRef = useRef<HTMLDivElement | null>(null);
    const previousAutoOpenStateRef = useRef({
        imagePrepActive: false,
        hiResFixActive: false,
        modelStackActive: false,
        samplingActive: false,
    });

    const selectedModel = models.find((model) => model.name === form.values.model);
    const selectedRefinerModel = models.find((model) => model.name === form.values.refinermodel);
    const [manualImageSetupSections, setManualImageSetupSections] = useState<string[]>([]);
    const previousVideoSupportRef = useRef(false);
    const handleRemoveLora = (index: number) => onLoraChange(removeLoRA(activeLoras, index));
    const handleUpdateLoraWeight = (index: number, weight: number) => onLoraChange(updateLoRAWeight(activeLoras, index, weight));

    const activeEmbeddings = Array.isArray(form.values['embeddings'])
        ? form.values['embeddings'] as string[]
        : [];

    const activeWildcards = Array.isArray(form.values['active_wildcards'])
        ? form.values['active_wildcards'] as string[]
        : [];

    const defaultSampler = typeof paramDefaults.sampler === 'string' ? paramDefaults.sampler : 'euler';
    const defaultScheduler = typeof paramDefaults.scheduler === 'string' ? paramDefaults.scheduler : 'normal';
    const defaultClipStop = typeof paramDefaults.clipstopatlayer === 'number'
        ? paramDefaults.clipstopatlayer
        : -1;

    const quickInitImagePreview = initImagePreview || (typeof form.values.initimage === 'string' ? form.values.initimage : null);
    const { standardOptions: standardVaeOptions, alternativeOptions: vaeAlternativeOptions } = splitVaeOptions(vaeOptions);
    const vaeAlternativeDisplayOptions = useMemo(
        () => getVaeAlternativeDisplayOptions(vaeAlternativeOptions),
        [vaeAlternativeOptions]
    );
    const alternativeVaeValue = isVaeAlternativeValue(form.values.vae, vaeOptions)
        ? String(form.values.vae)
        : '';
    const hasVaeOverride = typeof form.values.vae === 'string'
        && form.values.vae !== ''
        && form.values.vae !== 'Automatic';
    const refinerUpscale = typeof form.values.refinerupscale === 'number' ? form.values.refinerupscale : 1;
    const refinerControl = typeof form.values.refinercontrolpercentage === 'number'
        ? form.values.refinercontrolpercentage
        : (typeof form.values.refinercontrol === 'number' ? form.values.refinercontrol : 0);

    const imagePrepActive = Boolean(
        enableInitImage
        || quickInitImagePreview
        || modelMediaCapabilities.supportsVideo
        || enableVideo
    );

    const hiResFixActive = Boolean(
        enableRefiner
        || (typeof form.values.refinermodel === 'string' && form.values.refinermodel.trim())
        || refinerUpscale > 1
        || refinerControl > 0
    );

    const modelStackActive = Boolean(
        activeLoras.length > 0
        || activeEmbeddings.length > 0
        || hasVaeOverride
    );

    const currentSampler = typeof form.values.sampler === 'string' ? form.values.sampler : defaultSampler;
    const currentScheduler = typeof form.values.scheduler === 'string' ? form.values.scheduler : defaultScheduler;
    const currentClipStop = typeof form.values.clipstopatlayer === 'number'
        ? form.values.clipstopatlayer
        : defaultClipStop;

    const samplingActive = Boolean(
        currentSampler !== defaultSampler
        || currentScheduler !== defaultScheduler
        || currentClipStop !== defaultClipStop
    );

    const refinerMethodLabel = REFINER_METHOD_LABELS[form.values.refinermethod as string]
        || humanizeToken(String(form.values.refinermethod || 'PostApply'));

    const selectedUpscaleMethod = String(form.values.refinerupscalemethod || DEFAULT_UPSCALE_METHOD);

    const upscaleMethodLabel = useMemo(() => {
        const matchingModel = upscaleModels.find((model) => model.name === selectedUpscaleMethod);
        return matchingModel ? formatUpscaleMethodLabel(matchingModel) : humanizeToken(selectedUpscaleMethod);
    }, [selectedUpscaleMethod, upscaleModels]);

    const quickUpscaleMethodOptions = useMemo(() => {
        const seen = new Set<string>();
        const options: { value: string; label: string }[] = [];
        const pushOption = (value: string, label: string) => {
            if (!value || seen.has(value)) {
                return;
            }
            seen.add(value);
            options.push({ value, label });
        };

        pushOption(DEFAULT_UPSCALE_METHOD, 'Pixel: Lanczos');
        for (const model of upscaleModels) {
            pushOption(model.name, formatUpscaleMethodLabel(model));
        }
        pushOption(selectedUpscaleMethod, humanizeToken(selectedUpscaleMethod));
        return options;
    }, [selectedUpscaleMethod, upscaleModels]);

    const refinerModelOptions = useMemo(() => [
        { value: '', label: 'Use Base Model' },
        ...models.map((model) => ({
            value: model.name,
            label: model.title || model.name,
        })),
    ], [models]);
    const forcedImageSetupSections = useMemo(
        () => [
            ...(enableInitImage ? ['initimage'] : []),
            ...(enableRefiner ? ['refiner'] : []),
            ...(enableVariation ? ['variation'] : []),
            ...(enableControlNet ? ['controlnet'] : []),
            ...(modelMediaCapabilities.supportsVideo ? ['video'] : []),
        ],
        [
            enableControlNet,
            enableInitImage,
            enableRefiner,
            enableVariation,
            modelMediaCapabilities.supportsVideo,
        ]
    );
    const imageSetupSections = useMemo(
        () => mergeUniqueItems(manualImageSetupSections, forcedImageSetupSections),
        [forcedImageSetupSections, manualImageSetupSections]
    );
    const imageSetupExpanded = inspectorSections.includes('image-setup');

    useEffect(() => {
        if (modelMediaCapabilities.supportsVideo && !previousVideoSupportRef.current) {
            onInspectorSectionsChange(mergeUniqueItems(inspectorSections, ['image-setup']));
        }

        previousVideoSupportRef.current = modelMediaCapabilities.supportsVideo;
    }, [inspectorSections, modelMediaCapabilities.supportsVideo, onInspectorSectionsChange]);

    useEffect(() => {
        const nextQuickModules = [...quickModules];
        let changed = false;

        if (
            imagePrepActive
            && !previousAutoOpenStateRef.current.imagePrepActive
            && !nextQuickModules.includes(QUICK_IMAGE_PREP)
        ) {
            nextQuickModules.push(QUICK_IMAGE_PREP);
            changed = true;
        }

        if (
            hiResFixActive
            && !previousAutoOpenStateRef.current.hiResFixActive
            && !nextQuickModules.includes(QUICK_HI_RES_FIX)
        ) {
            nextQuickModules.push(QUICK_HI_RES_FIX);
            changed = true;
        }

        if (
            modelStackActive
            && !previousAutoOpenStateRef.current.modelStackActive
            && !nextQuickModules.includes(QUICK_MODEL_STACK)
        ) {
            nextQuickModules.push(QUICK_MODEL_STACK);
            changed = true;
        }

        if (
            samplingActive
            && !previousAutoOpenStateRef.current.samplingActive
            && !nextQuickModules.includes(QUICK_SAMPLING)
        ) {
            nextQuickModules.push(QUICK_SAMPLING);
            changed = true;
        }

        previousAutoOpenStateRef.current = {
            imagePrepActive,
            hiResFixActive,
            modelStackActive,
            samplingActive,
        };

        if (changed) {
            onQuickModulesChange(nextQuickModules);
        }
    }, [
        imagePrepActive,
        hiResFixActive,
        modelStackActive,
        onQuickModulesChange,
        quickModules,
        samplingActive,
    ]);

    useEffect(() => {
        if (!lastInspectorJumpTarget) {
            return;
        }

        const target = (() => {
            switch (lastInspectorJumpTarget) {
            case 'assets':
                return assetsSectionRef.current;
            case 'image-setup':
                return imageSetupSectionRef.current;
            case 'sampling':
                return samplingSectionRef.current;
            case 'output':
                return outputSectionRef.current;
            default:
                return inspectorCardRef.current;
            }
        })();

        if (!target || typeof window === 'undefined') {
            onLastInspectorJumpTargetChange(null);
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            onLastInspectorJumpTargetChange(null);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [lastInspectorJumpTarget, onLastInspectorJumpTargetChange]);

    const handleJumpToInspector = (section: string) => {
        onInspectorSectionsChange(mergeUniqueItems(inspectorSections, [section]));
        onLastInspectorJumpTargetChange(section);
    };

    const loraCards = activeLoras.length > 0 ? (
        <Stack gap="xs">
            {activeLoras.map((lora, index) => (
                <ElevatedCard
                    key={`${lora.lora}-${index}`}
                    elevation="paper"
                    tone="brand"
                    className="generate-studio__lora-card"
                    style={{ padding: 10 }}
                >
                    <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap">
                            <Tooltip label={lora.lora}>
                                <Text size="sm" fw={600} truncate style={{ flex: 1 }}>
                                    {lora.lora.split('/').pop() || lora.lora}
                                </Text>
                            </Tooltip>
                            <Group gap="xs" wrap="nowrap">
                                <SwarmBadge tone="info" emphasis="soft">
                                    {lora.weight.toFixed(2)}
                                </SwarmBadge>
                                <SwarmActionIcon
                                    tone="danger"
                                    emphasis="ghost"
                                    label={`Remove ${lora.lora}`}
                                    onClick={() => handleRemoveLora(index)}
                                >
                                    <IconX size={14} />
                                </SwarmActionIcon>
                            </Group>
                        </Group>
                        <SwarmSlider
                            value={lora.weight}
                            onChange={(value) => handleUpdateLoraWeight(index, value)}
                            min={-5}
                            max={5}
                            step={0.01}
                        />
                    </Stack>
                </ElevatedCard>
            ))}
        </Stack>
    ) : null;
    const heroTitle = uxRefresh ? 'Create Image' : 'Generate Setup';
    const heroSubtitle = uxRefresh ? 'Model, prompt, size, generate.' : 'Model, prompt, size, then generate.';
    const quickAccessDescription = uxRefresh
        ? 'Sampling, image prep, and model stack.'
        : 'Prep, model stack, and sampling controls kept close to generate.';
    const inspectorDescription = uxRefresh
        ? 'Full controls for assets, setup, sampling, and output.'
        : 'Assets, setup, sampling, and output utilities in one full workspace.';
    const coreGenerationDescription = uxRefresh
        ? 'Set canvas shape, steps, seed, and hi-res.'
        : 'Set the canvas shape here, then tune sampling strength and seed for the run.';

    return (
        <Box className="generate-studio__sidebar">
            <ScrollArea h="100%" type="auto" offsetScrollbars>
                <form onSubmit={form.onSubmit(onGenerate)} className="generate-studio__sidebar-form">
                    <Stack gap="sm" className="generate-studio__advanced-rail">
                        <Box className="generate-studio__sidebar-sticky">
                            <SectionHero
                                className="generate-studio__sidebar-hero"
                                title={heroTitle}
                                subtitle={heroSubtitle}
                                icon={<IconSparkles size={18} color="var(--theme-brand)" />}
                                badges={[
                                    {
                                        label: generating ? 'Generating' : 'Ready',
                                        tone: generating ? 'info' : 'success',
                                        emphasis: 'soft',
                                        contrast: 'strong',
                                    },
                                    {
                                        label: enableRefiner ? 'Hi-Res On' : 'Hi-Res Off',
                                        tone: enableRefiner ? 'warning' : 'secondary',
                                        emphasis: 'soft',
                                        contrast: 'strong',
                                    },
                                ]}
                                rightSection={
                                    <Group gap="xs" wrap="nowrap">
                                        <QueueStatusBadge compact />
                                        <Tooltip label="Open generation history">
                                            <SwarmActionIcon tone="secondary" emphasis="ghost" label="Open generation history" onClick={onOpenHistory}>
                                                <IconHistory size={16} />
                                            </SwarmActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Reset workspace parameters">
                                            <SwarmActionIcon tone="warning" emphasis="ghost" label="Reset workspace parameters" onClick={onResetWorkspace}>
                                                <IconRefresh size={16} />
                                            </SwarmActionIcon>
                                        </Tooltip>
                                    </Group>
                                }
                            />
                        </Box>

                        <ElevatedCard elevation="table" tone="neutral" className="generate-studio__essentials" style={{ padding: 14 }}>
                            <Stack gap="md">
                                <PresetControls
                                    presets={presets}
                                    onLoadPreset={onLoadPreset}
                                    onOpenSaveModal={onOpenSaveModal}
                                    onOpenHistory={onOpenHistory}
                                    onDeletePreset={onDeletePreset}
                                    onDuplicatePreset={onDuplicatePreset}
                                />

                                <Box className="generate-studio__run-status-strip">
                                    <Box className="generate-studio__run-status-item" data-ready={selectedModel ? 'true' : undefined}>
                                        <Text size="xs" fw={700} c="var(--theme-text-secondary)">Model</Text>
                                        <Text size="xs" fw={600} truncate>
                                            {selectedModel?.title || selectedModel?.name || 'Choose one'}
                                        </Text>
                                    </Box>
                                    <Box className="generate-studio__run-status-item" data-ready={String(form.values.prompt || '').trim() ? 'true' : undefined}>
                                        <Text size="xs" fw={700} c="var(--theme-text-secondary)">Prompt</Text>
                                        <Text size="xs" fw={600}>
                                            {String(form.values.prompt || '').trim() ? 'Ready' : 'Empty'}
                                        </Text>
                                    </Box>
                                    <Box className="generate-studio__run-status-item" data-ready="true">
                                        <Text size="xs" fw={700} c="var(--theme-text-secondary)">Canvas</Text>
                                        <Text size="xs" fw={600}>
                                            {form.values.width || 1024} x {form.values.height || 1024}
                                        </Text>
                                    </Box>
                                </Box>

                                <ElevatedCard elevation="paper" tone="brand" className="generate-studio__model-card">
                                    <Stack gap="xs">
                                        <Group justify="space-between" align="flex-start">
                                            <Stack gap={2}>
                                                <Text size="xs" tt="uppercase" fw={700} c="var(--theme-text-secondary)">
                                                    Base Model
                                                </Text>
                                                <Text size="sm" fw={600}>
                                                    {selectedModel?.title || selectedModel?.name || 'Select a model'}
                                                </Text>
                                            </Stack>
                                            <SwarmButton size="xs" tone="secondary" emphasis="ghost" leftSection={<IconDatabase size={12} />} onClick={onOpenModelBrowser}>
                                                Browse
                                            </SwarmButton>
                                        </Group>
                                            <Select
                                                placeholder={loadingModels ? 'Loading models...' : 'Select a checkpoint'}
                                            data={models.map((model) => ({
                                                value: model.name,
                                                label: model.title || model.name,
                                                disabled: !model.loaded,
                                            }))}
                                            searchable
                                            maxDropdownHeight={320}
                                            {...form.getInputProps('model')}
                                                onChange={onModelSelect}
                                                disabled={loadingModel}
                                            />
                                            {modelMediaCapabilities.supportsVideo && (
                                                <Group gap="xs" wrap="wrap">
                                            <SwarmBadge tone="info" emphasis="soft">
                                                Video Ready
                                            </SwarmBadge>
                                            {modelMediaCapabilities.supportsTextToVideo && (
                                                <SwarmBadge tone="primary" emphasis="soft">
                                                    Text-to-Video
                                                </SwarmBadge>
                                            )}
                                                    {modelMediaCapabilities.supportsImageToVideo && (
                                                        <SwarmBadge tone="warning" emphasis="soft">
                                                            Image-to-Video
                                                        </SwarmBadge>
                                                    )}
                                                </Group>
                                            )}
                                        </Stack>
                                    </ElevatedCard>

                                <PromptSection
                                    form={form}
                                />

                                <ElevatedCard elevation="paper" tone="accent" className="generate-studio__core-generation-card">
                                    <Stack gap="sm">
                                        <SectionBodyHeader
                                            eyebrow="Size & Generation"
                                            title={uxRefresh ? 'Canvas and sampling' : 'Framing and core tuning'}
                                            description={coreGenerationDescription}
                                            badge={(
                                                <Stack gap={4} align="flex-end" className="generate-studio__core-generation-toggle">
                                                    <Text size="xs" fw={700} c="var(--theme-text-secondary)">
                                                        Hi-Res Fix
                                                    </Text>
                                                    <SwarmSwitch
                                                        size="sm"
                                                        checked={enableRefiner}
                                                        onChange={(event) => setEnableRefiner(event.currentTarget.checked)}
                                                    />
                                                </Stack>
                                            )}
                                        />
                                        <DimensionControls form={form} embedded />
                                        <Group grow align="flex-start">
                                            <SliderWithInput
                                                label="Steps"
                                                value={form.values.steps || 20}
                                                onChange={(value) => form.setFieldValue('steps', value)}
                                                min={paramRanges.steps?.min ?? 1}
                                                max={paramRanges.steps?.viewMax ?? paramRanges.steps?.max ?? 150}
                                                step={paramRanges.steps?.step ?? 1}
                                            />
                                            <SliderWithInput
                                                label="CFG Scale"
                                                value={form.values.cfgscale || 7}
                                                onChange={(value) => form.setFieldValue('cfgscale', value)}
                                                min={paramRanges.cfgscale?.min ?? 1}
                                                max={paramRanges.cfgscale?.viewMax ?? paramRanges.cfgscale?.max ?? 30}
                                                step={paramRanges.cfgscale?.step ?? 0.5}
                                                decimalScale={1}
                                            />
                                        </Group>
                                        <SeedInput
                                            value={form.values.seed ?? -1}
                                            onChange={(value) => form.setFieldValue('seed', value)}
                                        />
                                        <Group justify="space-between" align="center" wrap="wrap">
                                            <Text size="xs" c="var(--theme-text-secondary)">
                                                {uxRefresh
                                                    ? 'Batch and save options are in Output.'
                                                    : 'Images, batch size, and save behavior live in Output & Utilities.'}
                                            </Text>
                                            <SwarmButton
                                                size="xs"
                                                tone="secondary"
                                                emphasis="soft"
                                                leftSection={<IconArrowWaveRightUp size={12} />}
                                                onClick={() => handleJumpToInspector('output')}
                                            >
                                                Open Output &amp; Utilities
                                            </SwarmButton>
                                        </Group>
                                    </Stack>
                                </ElevatedCard>

                                <GenerateButton
                                    generating={generating}
                                    onStop={onStop}
                                    onOpenSchedule={onOpenSchedule}
                                    onGenerateAndUpscale={onGenerateAndUpscale}
                                    selectedModel={selectedModel ?? null}
                                    currentValues={form.values}
                                    onApplyQualityCoachFixes={(overrides) => {
                                        form.setValues({
                                            ...form.values,
                                            ...overrides,
                                        });
                                    }}
                                    previewing={previewing}
                                    onTogglePreviews={onTogglePreviews}
                                    onInsertPromptSyntax={(text) => {
                                        form.setFieldValue('prompt', (form.values.prompt || '').trim() + ' ' + text.trim());
                                    }}
                                />
                            </Stack>
                        </ElevatedCard>

                        <Accordion
                            multiple
                            value={sidebarSections}
                            onChange={setSidebarSections}
                            className="generate-studio__sidebar-sections"
                        >
                            <Accordion.Item value="quick-access-shell">
                                <Accordion.Control className="generate-studio__section-shell-control">
                                    <ShellControlSummary
                                        title="Quick Access"
                                        description={quickAccessDescription}
                                        badge={(
                                            <SwarmBadge tone="info" emphasis="soft">
                                                {uxRefresh
                                                    ? (quickModules.length > 0 ? `${quickModules.length} Open` : 'Collapsed')
                                                    : 'Fast Panels'}
                                            </SwarmBadge>
                                        )}
                                    />
                                </Accordion.Control>
                                <Accordion.Panel className="generate-studio__section-shell-panel">
                                    <ElevatedCard
                                        elevation="table"
                                        tone="neutral"
                                        className={[
                                            'generate-studio__quick-access-card',
                                            uxRefresh ? 'generate-studio__quick-access-card--quiet' : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        {!uxRefresh && (
                                            <Box className="generate-studio__quick-access-header">
                                                <SectionBodyHeader
                                                    eyebrow="Quick Access"
                                                    title="Fast reach controls"
                                                    description="Sampling, prep, hi-res fix, and model stack are grouped here so you can iterate without bouncing into the full inspector."
                                                    badge={(
                                                        <SwarmBadge tone="info" emphasis="soft">
                                                            {quickModules.length > 0 ? `${quickModules.length} Open` : 'Ready'}
                                                        </SwarmBadge>
                                                    )}
                                                />
                                            </Box>
                                        )}
                                        <Accordion
                                            multiple
                                            value={quickModules}
                                            onChange={(value) => onQuickModulesChange(value as QuickModuleKey[])}
                                            className="generate-studio__quick-access"
                                        >
                                    <Accordion.Item value={QUICK_SAMPLING}>
                                        <Accordion.Control>
                                            <SectionItemLabel
                                                icon={<IconAdjustments size={16} />}
                                                title="Sampling"
                                                description={uxRefresh ? 'Sampler, scheduler, clip skip' : 'Sampler, scheduler, and clip skip close to the generate button'}
                                            />
                                        </Accordion.Control>
                                        <Accordion.Panel>
                                            <Stack gap="md">
                                                <SamplingSelect
                                                    kind="sampler"
                                                    label="Sampler"
                                                    data={samplerOptions}
                                                    searchable
                                                    withSelectedDescription={false}
                                                    {...form.getInputProps('sampler')}
                                                />

                                                <SamplingSelect
                                                    kind="scheduler"
                                                    label="Scheduler"
                                                    data={schedulerOptions}
                                                    searchable
                                                    withSelectedDescription={false}
                                                    {...form.getInputProps('scheduler')}
                                                />

                                                <SliderWithInput
                                                    label="CLIP Stop At Layer"
                                                    value={currentClipStop}
                                                    onChange={(value) => form.setFieldValue('clipstopatlayer', value)}
                                                    min={paramRanges.clipstopatlayer?.min ?? -24}
                                                    max={paramRanges.clipstopatlayer?.max ?? -1}
                                                />

                                                <Group justify="space-between" align="center" wrap="wrap">
                                                    <Text size="xs" c="var(--theme-text-secondary)">
                                                        Default stack: {humanizeToken(defaultSampler)} + {humanizeToken(defaultScheduler)}.
                                                    </Text>
                                                    <SwarmButton
                                                        size="xs"
                                                        tone="secondary"
                                                        emphasis="soft"
                                                        leftSection={<IconArrowWaveRightUp size={12} />}
                                                        onClick={() => handleJumpToInspector('sampling')}
                                                    >
                                                        Open Sampling &amp; Quality
                                                    </SwarmButton>
                                                </Group>
                                            </Stack>
                                        </Accordion.Panel>
                                    </Accordion.Item>
                                    <Accordion.Item value={QUICK_IMAGE_PREP}>
                                        <Accordion.Control>
                                            <SectionItemLabel
                                                icon={<IconLayersIntersect size={16} />}
                                                title="Image Prep"
                                                description={uxRefresh ? 'Init image and starting controls' : 'Init image, creativity, and canvas-driven starting controls'}
                                                aside={(
                                                    <Group gap="xs" wrap="nowrap">
                                                        {quickInitImagePreview ? (
                                                            <SwarmBadge tone="info" emphasis="soft">Init</SwarmBadge>
                                                        ) : null}
                                                        {enableVideo ? (
                                                            <SwarmBadge tone="warning" emphasis="soft">Video</SwarmBadge>
                                                        ) : null}
                                                    </Group>
                                                )}
                                            />
                                        </Accordion.Control>
                                        <Accordion.Panel>
                                            <Stack gap="md">
                                                <Group justify="space-between" align="center" wrap="wrap">
                                                    <SwarmSwitch
                                                        label="Use Init Image"
                                                        size="sm"
                                                        checked={enableInitImage}
                                                        onChange={(event) => setEnableInitImage(event.currentTarget.checked)}
                                                    />
                                                    <FileButton
                                                        onChange={onInitImageUpload}
                                                        accept="image/png,image/jpeg,image/webp"
                                                    >
                                                        {(props) => (
                                                            <SwarmButton
                                                                {...props}
                                                                size="xs"
                                                                tone="secondary"
                                                                emphasis="soft"
                                                                leftSection={<IconUpload size={12} />}
                                                            >
                                                                {quickInitImagePreview ? 'Replace Image' : 'Upload Image'}
                                                            </SwarmButton>
                                                        )}
                                                    </FileButton>
                                                </Group>

                                                {quickInitImagePreview ? (
                                                    <ElevatedCard elevation="paper" tone="accent" className="generate-studio__quick-preview-card">
                                                        <Group align="flex-start" gap="sm" wrap="nowrap">
                                                            <Image
                                                                src={quickInitImagePreview}
                                                                alt="Init image preview"
                                                                radius="sm"
                                                                w={88}
                                                                h={88}
                                                                fit="cover"
                                                            />
                                                            <Stack gap={6} style={{ flex: 1 }}>
                                                                <Text size="sm" fw={600}>Init image loaded</Text>
                                                                <Text size="xs" c="var(--theme-text-secondary)">
                                                                    Reuse this image as the starting point for img2img or canvas refinement.
                                                                </Text>
                                                                <Group gap="xs">
                                                                    <SwarmButton
                                                                        size="xs"
                                                                        tone="danger"
                                                                        emphasis="ghost"
                                                                        onClick={onClearInitImage}
                                                                    >
                                                                        Clear
                                                                    </SwarmButton>
                                                                </Group>
                                                            </Stack>
                                                        </Group>
                                                    </ElevatedCard>
                                                ) : null}

                                                <SliderWithInput
                                                    label="Creativity"
                                                    tooltip="How much to change from the original image."
                                                    value={form.values.initimagecreativity ?? 0.6}
                                                    onChange={(value) => form.setFieldValue('initimagecreativity', value)}
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    decimalScale={2}
                                                />

                                                <Group justify="space-between" align="center" wrap="wrap">
                                                    <Text size="xs" c="var(--theme-text-secondary)">
                                                        Variation, ControlNet, masking, and video tools stay in the inspector.
                                                    </Text>
                                                    <SwarmButton
                                                        size="xs"
                                                        tone="secondary"
                                                        emphasis="soft"
                                                        leftSection={<IconArrowWaveRightUp size={12} />}
                                                        onClick={() => handleJumpToInspector('image-setup')}
                                                    >
                                                        Open Image Setup
                                                    </SwarmButton>
                                                </Group>
                                            </Stack>
                                        </Accordion.Panel>
                                    </Accordion.Item>
                                    <Accordion.Item value={QUICK_HI_RES_FIX}>
                                        <Accordion.Control>
                                            <SectionItemLabel
                                                icon={<IconSparkles size={16} />}
                                                title="Hi-Res Fix"
                                                description={uxRefresh ? 'Refiner, upscale, method' : 'Refiner model, upscale amount, and hi-res method controls'}
                                                aside={(
                                                    <Group gap="xs" wrap="nowrap">
                                                        {enableRefiner ? (
                                                            <SwarmBadge tone="warning" emphasis="soft">{refinerUpscale.toFixed(2)}x</SwarmBadge>
                                                        ) : null}
                                                        <SwarmBadge tone="secondary" emphasis="soft">
                                                            {refinerMethodLabel}
                                                        </SwarmBadge>
                                                    </Group>
                                                )}
                                            />
                                        </Accordion.Control>
                                        <Accordion.Panel>
                                            <Stack gap="md">
                                                <Group justify="space-between" align="center" wrap="wrap">
                                                    <SwarmSwitch
                                                        label="Enable Refiner"
                                                        size="sm"
                                                        checked={enableRefiner}
                                                        onChange={(event) => {
                                                            const checked = event.currentTarget.checked;
                                                            setEnableRefiner(checked);
                                                            if (checked && refinerUpscale <= 1 && refinerControl <= 0 && !form.values.refinermodel) {
                                                                form.setFieldValue('refinerupscale', 2);
                                                            }
                                                        }}
                                                    />
                                                    <SwarmBadge tone={enableRefiner ? 'warning' : 'secondary'} emphasis="soft">
                                                        {enableRefiner ? 'Active' : 'Optional'}
                                                    </SwarmBadge>
                                                </Group>

                                                <Select
                                                    label="Diffusion Refiner Model"
                                                    placeholder="Use Base Model"
                                                    data={refinerModelOptions}
                                                    searchable
                                                    clearable
                                                    value={form.values.refinermodel || ''}
                                                    onChange={(value) => {
                                                        form.setFieldValue('refinermodel', value || '');
                                                        if (value && value.trim().length > 0 && !enableRefiner) {
                                                            setEnableRefiner(true);
                                                        }
                                                    }}
                                                />

                                                <SliderWithInput
                                                    label="Hi-Res Upscale"
                                                    value={refinerUpscale}
                                                    onChange={(value) => {
                                                        form.setFieldValue('refinerupscale', value);
                                                        if (value > 1 && !enableRefiner) {
                                                            setEnableRefiner(true);
                                                        }
                                                    }}
                                                    min={1}
                                                    max={4}
                                                    step={0.25}
                                                    decimalScale={2}
                                                />

                                                <Select
                                                    label="Upscale Method / Upscaler Model"
                                                    placeholder="Select upscale method"
                                                    data={quickUpscaleMethodOptions}
                                                    value={selectedUpscaleMethod}
                                                    onChange={(value) => {
                                                        const nextValue = value || DEFAULT_UPSCALE_METHOD;
                                                        form.setFieldValue('refinerupscalemethod', nextValue);
                                                        if (!enableRefiner) {
                                                            setEnableRefiner(true);
                                                        }
                                                        if (refinerUpscale <= 1) {
                                                            form.setFieldValue('refinerupscale', 2);
                                                        }
                                                    }}
                                                    searchable
                                                    nothingFoundMessage="No upscale methods found"
                                                />

                                                <SliderWithInput
                                                    label="Refiner Control"
                                                    value={refinerControl}
                                                    onChange={(value) => {
                                                        form.setFieldValue('refinercontrol', value);
                                                        form.setFieldValue('refinercontrolpercentage', value);
                                                        if (value > 0 && !enableRefiner) {
                                                            setEnableRefiner(true);
                                                        }
                                                    }}
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    decimalScale={2}
                                                />

                                                <Group justify="space-between" align="center" wrap="wrap">
                                                    <Text size="xs" c="var(--theme-text-secondary)">
                                                        {selectedRefinerModel?.title || selectedRefinerModel?.name || 'Base model'} with {upscaleMethodLabel}
                                                        {' '}at {(refinerControl * 100).toFixed(0)}% control.
                                                    </Text>
                                                    <SwarmButton
                                                        size="xs"
                                                        tone="secondary"
                                                        emphasis="soft"
                                                        leftSection={<IconArrowWaveRightUp size={12} />}
                                                        onClick={() => handleJumpToInspector('image-setup')}
                                                    >
                                                        Open Full Refiner Settings
                                                    </SwarmButton>
                                                </Group>
                                            </Stack>
                                        </Accordion.Panel>
                                    </Accordion.Item>
                                    <Accordion.Item value={QUICK_MODEL_STACK}>
                                        <Accordion.Control>
                                            <SectionItemLabel
                                                icon={<IconBlocks size={16} />}
                                                title="Model Stack"
                                                description={uxRefresh ? 'VAE, LoRAs, embeddings' : 'VAE, LoRAs, and embeddings without opening the full asset inspector'}
                                                aside={(
                                                    <Group gap="xs" wrap="nowrap">
                                                        {activeLoras.length > 0 ? (
                                                            <SwarmBadge tone="primary" emphasis="soft">{activeLoras.length} LoRA</SwarmBadge>
                                                        ) : null}
                                                        {activeEmbeddings.length > 0 ? (
                                                            <SwarmBadge tone="info" emphasis="soft">{activeEmbeddings.length} Embed</SwarmBadge>
                                                        ) : null}
                                                    </Group>
                                                )}
                                            />
                                        </Accordion.Control>
                                        <Accordion.Panel>
                                            <Stack gap="md">
                                                <Select
                                                    label="VAE Alternative Stack"
                                                    placeholder={loadingVAEs ? 'Loading VAEs...' : 'Use standard VAE path'}
                                                    data={vaeAlternativeDisplayOptions}
                                                    searchable
                                                    clearable
                                                    value={alternativeVaeValue}
                                                    disabled={loadingVAEs}
                                                    onChange={(value) => form.setFieldValue('vae', value || '')}
                                                    description="Overrides the standard VAE selection when selected."
                                                    nothingFoundMessage={VAE_ALTERNATIVE_EMPTY_MESSAGE}
                                                    renderOption={({ option }) => {
                                                        const description = getVaeAlternativeOptionDescription(option.value);
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

                                                <Select
                                                    label="VAE"
                                                    placeholder={loadingVAEs ? 'Loading VAEs...' : 'Select VAE'}
                                                    data={standardVaeOptions}
                                                    searchable
                                                    clearable
                                                    value={alternativeVaeValue ? '' : String(form.values.vae || '')}
                                                    disabled={Boolean(alternativeVaeValue)}
                                                    onChange={(value) => form.setFieldValue('vae', value || '')}
                                                    description={alternativeVaeValue ? 'Disabled while a VAE alternative is active.' : undefined}
                                                />

                                                <Group grow>
                                                    <SwarmButton
                                                        tone="primary"
                                                        emphasis="soft"
                                                        leftSection={<IconBlocks size={14} />}
                                                        onClick={onOpenLoraBrowser}
                                                    >
                                                        Browse LoRAs
                                                    </SwarmButton>
                                                    <SwarmButton
                                                        tone="secondary"
                                                        emphasis="soft"
                                                        leftSection={<IconSparkles size={14} />}
                                                        onClick={onOpenEmbeddingBrowser}
                                                    >
                                                        Browse Embeddings
                                                    </SwarmButton>
                                                </Group>

                                                {loraCards || (
                                                    <ElevatedCard elevation="paper" tone="neutral" className="generate-studio__empty-panel generate-studio__empty-panel--compact">
                                                        <Stack gap={4} align="center">
                                                            <Text size="sm" fw={600}>
                                                                No LoRAs loaded
                                                            </Text>
                                                            <Text size="xs" c="var(--theme-text-secondary)" ta="center">
                                                                Load style stacks here and keep weights within reach while you iterate.
                                                            </Text>
                                                        </Stack>
                                                    </ElevatedCard>
                                                )}

                                                <MultiSelect
                                                    label="Embeddings"
                                                    placeholder="Select embeddings"
                                                    data={embeddingOptions}
                                                    searchable
                                                    clearable
                                                    {...form.getInputProps('embeddings')}
                                                />

                                                <Group justify="space-between" align="center" wrap="wrap">
                                                    <Text size="xs" c="var(--theme-text-secondary)">
                                                        {alternativeVaeValue
                                                            ? `VAE alternative: ${alternativeVaeValue}.`
                                                            : `Current VAE: ${hasVaeOverride ? form.values.vae : 'Automatic'}.`}
                                                    </Text>
                                                    <SwarmButton
                                                        size="xs"
                                                        tone="secondary"
                                                        emphasis="ghost"
                                                        onClick={() => handleJumpToInspector('sampling')}
                                                    >
                                                        VAE Details
                                                    </SwarmButton>
                                                </Group>
                                            </Stack>
                                        </Accordion.Panel>
                                    </Accordion.Item>
                                        </Accordion>
                                    </ElevatedCard>
                                </Accordion.Panel>
                            </Accordion.Item>

                            <Accordion.Item value="inspector-shell">
                                <Accordion.Control className="generate-studio__section-shell-control">
                                    <ShellControlSummary
                                        title="Inspector"
                                        description={inspectorDescription}
                                        badge={(
                                            <SwarmBadge tone="primary" emphasis="soft">
                                                {inspectorSections.length > 0 ? `${inspectorSections.length} Open` : uxRefresh ? 'Collapsed' : 'Full Controls'}
                                            </SwarmBadge>
                                        )}
                                    />
                                </Accordion.Control>
                                <Accordion.Panel className="generate-studio__section-shell-panel">
                                    <ElevatedCard
                                        ref={inspectorCardRef}
                                        elevation="table"
                                        tone="neutral"
                                        className={[
                                            'generate-studio__inspector-card',
                                            uxRefresh ? 'generate-studio__inspector-card--quiet' : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        {!uxRefresh && (
                                            <Box className="generate-studio__inspector-header">
                                                <SectionBodyHeader
                                                    eyebrow="Inspector"
                                                    title="Full advanced workspace"
                                                    description="Assets, image setup, sampling depth, and output utilities stay visible here when you need the whole stack."
                                                    badge={(
                                                        <SwarmBadge tone="primary" emphasis="soft">
                                                            {inspectorSections.length > 0 ? `${inspectorSections.length} Open` : 'Full Controls'}
                                                        </SwarmBadge>
                                                    )}
                                                />
                                            </Box>
                                        )}

                                        <Accordion
                                            multiple
                                            value={inspectorSections}
                                            onChange={onInspectorSectionsChange}
                                            className="generate-studio__inspector"
                                        >
                                    <Box ref={assetsSectionRef} className="generate-studio__inspector-anchor">
                                        <Accordion.Item value="assets">
                                            <Accordion.Control>
                                                <SectionItemLabel
                                                    icon={<IconBlocks size={16} />}
                                                    title="Assets"
                                                    description={uxRefresh ? 'Wildcards and prompt assets' : 'Wildcard sets and advanced prompt asset helpers'}
                                                />
                                            </Accordion.Control>
                                            <Accordion.Panel>
                                                <Stack gap="md">
                                                    <MultiSelect
                                                        label="Active Wildcards"
                                                        placeholder="Select wildcards"
                                                        data={wildcardOptions}
                                                        searchable
                                                        clearable
                                                        {...form.getInputProps('active_wildcards')}
                                                    />

                                                    <Textarea
                                                        label="Wildcard Syntax"
                                                        placeholder="e.g. {color|amber|jade|copper}"
                                                        minRows={3}
                                                        value={wildcardText}
                                                        onChange={(event) => onWildcardTextChange(event.currentTarget.value)}
                                                        description={activeWildcards.length > 0 ? `${activeWildcards.length} wildcard group${activeWildcards.length === 1 ? '' : 's'} selected` : undefined}
                                                    />

                                                    <Text size="xs" c="var(--theme-text-secondary)">
                                                        LoRAs and embeddings now live in Quick Access so they stay closer to your main generate loop.
                                                    </Text>
                                                </Stack>
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    </Box>

                                    <Box ref={imageSetupSectionRef} className="generate-studio__inspector-anchor">
                                        <Accordion.Item value="image-setup">
                                            <Accordion.Control>
                                                <SectionItemLabel
                                                    icon={<IconLayersIntersect size={16} />}
                                                    title="Image Setup"
                                                    description={uxRefresh ? 'Init, variation, ControlNet, video' : 'Init image, variation, ControlNet, refiner, and video'}
                                                />
                                            </Accordion.Control>
                                            <Accordion.Panel>
                                                {imageSetupExpanded ? (
                                                    <Accordion
                                                        multiple
                                                        value={imageSetupSections}
                                                        onChange={(value) => setManualImageSetupSections(value)}
                                                    >
                                                        <InitImageAccordion
                                                            form={form}
                                                            enabled={enableInitImage}
                                                            onToggle={setEnableInitImage}
                                                            initImagePreview={quickInitImagePreview}
                                                            onUpload={onInitImageUpload}
                                                            onClear={onClearInitImage}
                                                        />
                                                        <VariationAccordion
                                                            form={form}
                                                            enabled={enableVariation}
                                                            onToggle={setEnableVariation}
                                                        />
                                                        <Suspense fallback={<AccordionLoader />}>
                                                            <ControlNetAccordion
                                                                form={form}
                                                                enabled={enableControlNet}
                                                                onToggle={setEnableControlNet}
                                                                controlNetOptions={controlNetOptions}
                                                                loadingControlNets={loadingControlNets}
                                                                onRefreshModels={onRefreshControlNets}
                                                            />
                                                            <RefinerAccordion
                                                                form={form}
                                                                enabled={enableRefiner}
                                                                onToggle={setEnableRefiner}
                                                                models={models}
                                                                upscaleModels={upscaleModels}
                                                                vaeOptions={vaeOptions}
                                                            />
                                                            <VideoAccordion
                                                                form={form}
                                                                enabled={enableVideo}
                                                                onToggle={setEnableVideo}
                                                                capabilities={modelMediaCapabilities}
                                                                modelLabel={selectedModel?.title || selectedModel?.name || form.values.model || undefined}
                                                            />
                                                        </Suspense>
                                                    </Accordion>
                                                ) : null}
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    </Box>

                                    <Box ref={samplingSectionRef} className="generate-studio__inspector-anchor">
                                        <Accordion.Item value="sampling">
                                            <Accordion.Control>
                                                <SectionItemLabel
                                                    icon={<IconAdjustments size={16} />}
                                                    title="Sampling &amp; Quality"
                                                    description={uxRefresh ? 'Scheduler, CLIP, add-ons' : 'Scheduler depth, CLIP tuning, and model add-ons'}
                                                />
                                            </Accordion.Control>
                                            <Accordion.Panel>
                                                <Accordion multiple defaultValue={['sampler', ...(hasVaeOverride ? ['modeladdons'] : [])]}>
                                                    <SamplerAccordion form={form} />
                                                    <ModelAddonsAccordion
                                                        form={form}
                                                        vaeOptions={vaeOptions}
                                                        loadingVAEs={loadingVAEs}
                                                    />
                                                </Accordion>
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    </Box>

                                    <Box ref={outputSectionRef} className="generate-studio__inspector-anchor">
                                        <Accordion.Item value="output">
                                            <Accordion.Control>
                                                <SectionItemLabel
                                                    icon={<IconArrowWaveRightUp size={16} />}
                                                    title="Output &amp; Utilities"
                                                    description={uxRefresh ? 'Save, output, workflow shortcuts' : 'Save behavior, output flags, and workflow shortcuts'}
                                                />
                                            </Accordion.Control>
                                            <Accordion.Panel>
                                                <Stack gap="md">
                                                <OptionsAccordion form={form} />
                                                    <ElevatedCard elevation="paper" tone="neutral">
                                                        <Stack gap="xs">
                                                            <Group justify="space-between" align="center">
                                                                <Text size="sm" fw={600}>
                                                                    Workflow Shortcuts
                                                                </Text>
                                                                <IconClockHour4 size={16} color="var(--theme-text-secondary)" />
                                                            </Group>
                                                            <Divider />
                                                            <Group grow>
                                                                <SwarmButton
                                                                    tone="secondary"
                                                                    emphasis="soft"
                                                                    leftSection={<IconHistory size={14} />}
                                                                    onClick={onOpenHistory}
                                                                >
                                                                    Reuse History
                                                                </SwarmButton>
                                                                <SwarmButton
                                                                    tone="secondary"
                                                                    emphasis="soft"
                                                                    leftSection={<IconDatabase size={14} />}
                                                                    onClick={onOpenSaveModal}
                                                                >
                                                                    Save Preset
                                                                </SwarmButton>
                                                            </Group>
                                                        </Stack>
                                                    </ElevatedCard>
                                                </Stack>
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    </Box>
                                        </Accordion>
                                    </ElevatedCard>
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Accordion>
                    </Stack>
                </form>
            </ScrollArea>
        </Box>
    );
});
