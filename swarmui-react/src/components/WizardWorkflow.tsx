import { useEffect, useMemo, useState } from 'react';
import {
    Badge,
    Box,
    Card,
    Divider,
    FileButton,
    Grid,
    Group,
    Image,
    NumberInput,
    Paper,
    Select,
    SegmentedControl,
    Slider,
    Stack,
    Text,
    Textarea,
    ThemeIcon,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconArrowRight,
    IconPhoto,
    IconPlayerPlay,
    IconRotate2,
    IconSettings,
    IconSparkles,
    IconTargetArrow,
    IconUpload,
    IconWand,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { GenerateParams } from '../api/types';
import { useUpscalers } from '../hooks/useModels';
import { useT2IParams } from '../hooks/useT2IParams';
import { useGenerationStore } from '../store/generationStore';
import { useQueueStore } from '../stores/queue';
import { useWorkflowWorkspaceStore } from '../stores/workflowWorkspaceStore';
import { ElevatedCard, SamplingSelect, StatusTimeline, SwarmBadge, SwarmButton as Button } from './ui';
import type { StatusTimelineStep } from './ui';

type WizardTemplateId = 'text-to-image' | 'image-to-image' | 'upscale';
type WizardStepId = 'upload' | 'model' | 'prompt' | 'size' | 'sampler' | 'strength' | 'scale' | 'review';

interface WizardTemplate {
    id: WizardTemplateId;
    name: string;
    description: string;
    icon: typeof IconWand;
    group: 'create' | 'transform' | 'finish';
    bestFor: string;
    steps: WizardStepId[];
    queueLabel: string;
}

interface WizardTemplateGroup {
    id: WizardTemplate['group'];
    title: string;
    description: string;
}

const TEMPLATE_GROUPS: WizardTemplateGroup[] = [
    {
        id: 'create',
        title: 'Create From Text',
        description: 'Start fresh with a prompt-driven image workflow.',
    },
    {
        id: 'transform',
        title: 'Transform An Image',
        description: 'Use an uploaded image as the composition anchor.',
    },
    {
        id: 'finish',
        title: 'Enhance And Finish',
        description: 'Upscale a source image through the standard queue flow.',
    },
];

const WIZARD_TEMPLATES: WizardTemplate[] = [
    {
        id: 'text-to-image',
        name: 'Text to Image',
        description: 'Generate a new image from a prompt and model settings.',
        icon: IconWand,
        group: 'create',
        bestFor: 'Concepting scenes, styles, and prompt ideas quickly.',
        steps: ['model', 'prompt', 'size', 'sampler', 'review'],
        queueLabel: 'Queue Text To Image',
    },
    {
        id: 'image-to-image',
        name: 'Image to Image',
        description: 'Guide a new image from an uploaded source plus prompt.',
        icon: IconPhoto,
        group: 'transform',
        bestFor: 'Preserving composition while changing subject, mood, or detail.',
        steps: ['upload', 'model', 'prompt', 'strength', 'review'],
        queueLabel: 'Queue Image To Image',
    },
    {
        id: 'upscale',
        name: 'Upscale',
        description: 'Increase image size and detail using the queue pipeline.',
        icon: IconSettings,
        group: 'finish',
        bestFor: 'Finishing a promising image without rebuilding the prompt flow.',
        steps: ['upload', 'scale', 'model', 'review'],
        queueLabel: 'Queue Upscale',
    },
];

const ASPECT_RATIOS = [
    { value: '1:1', label: '1:1 Square', width: 1024, height: 1024 },
    { value: '4:3', label: '4:3 Landscape', width: 1152, height: 896 },
    { value: '3:4', label: '3:4 Portrait', width: 896, height: 1152 },
    { value: '16:9', label: '16:9 Wide', width: 1344, height: 768 },
    { value: '9:16', label: '9:16 Tall', width: 768, height: 1344 },
];

const STEP_COPY: Record<WizardStepId, { label: string; title: string; description: string }> = {
    upload: {
        label: 'Source Image',
        title: 'Choose A Source Image',
        description: 'Load the image that should guide this workflow.',
    },
    model: {
        label: 'Model',
        title: 'Confirm The Active Model',
        description: 'The wizard uses the model selected in the Generate workspace.',
    },
    prompt: {
        label: 'Prompt',
        title: 'Describe The Outcome',
        description: 'Capture the subject, style, and constraints for this run.',
    },
    size: {
        label: 'Output Size',
        title: 'Choose The Output Shape',
        description: 'Pick the aspect ratio that matches where the image will be used.',
    },
    sampler: {
        label: 'Sampling',
        title: 'Tune Generation Settings',
        description: 'Adjust the core diffusion settings before queueing the run.',
    },
    strength: {
        label: 'Creativity',
        title: 'Set Transformation Strength',
        description: 'Balance how much the uploaded image should change.',
    },
    scale: {
        label: 'Upscale',
        title: 'Choose Upscale Settings',
        description: 'Set the scale factor and upscaling method.',
    },
    review: {
        label: 'Review',
        title: 'Review Before Queueing',
        description: 'Double-check the model, image source, and output plan.',
    },
};

interface WizardWorkflowProps {
    onGenerate?: (params: GenerateParams) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getWizardTemplateMeta(templateId: string | null) {
    return WIZARD_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function WizardWorkflow({ onGenerate }: WizardWorkflowProps) {
    const [selectedTemplate, setSelectedTemplate] = useState<WizardTemplateId | null>(null);
    const [activeStep, setActiveStep] = useState(0);
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [steps, setSteps] = useState(20);
    const [cfgScale, setCfgScale] = useState(7);
    const [sampler, setSampler] = useState('euler');
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [initImageCreativity, setInitImageCreativity] = useState(0.6);
    const [upscaleFactor, setUpscaleFactor] = useState(2);
    const [upscaleMethod, setUpscaleMethod] = useState('pixel-lanczos');

    const { selectedModel } = useGenerationStore();
    const { addJob } = useQueueStore();
    const upscalersQuery = useUpscalers();
    const { samplerOptions } = useT2IParams();
    const { lastWizardTemplate, setLastWizardTemplate, handoff, setHandoff } = useWorkflowWorkspaceStore();

    const selectedTemplateData = selectedTemplate ? getWizardTemplateMeta(selectedTemplate) : null;
    const currentStep = selectedTemplateData?.steps[activeStep];
    const selectedAspect = ASPECT_RATIOS.find((ratio) => ratio.value === aspectRatio);
    const requiresUploadedImage = selectedTemplate === 'image-to-image' || selectedTemplate === 'upscale';
    const isReviewStep = currentStep === 'review';

    const upscaleOptions = [
        { value: 'pixel-lanczos', label: 'Pixel Lanczos' },
        { value: 'pixel-bicubic', label: 'Pixel Bicubic' },
        { value: 'pixel-nearest', label: 'Pixel Nearest' },
        ...(upscalersQuery.data ?? []).map((model) => ({
            value: model.name,
            label: model.title || model.name,
        })),
    ];

    const canAdvance = currentStep !== 'upload' || Boolean(uploadedImage);
    const canQueue = (() => {
        if (!selectedTemplateData) {
            return false;
        }
        if (requiresUploadedImage && !uploadedImage) {
            return false;
        }
        if (selectedTemplate === 'upscale') {
            return true;
        }
        return Boolean(prompt.trim());
    })();

    const queueStatus = useMemo(() => {
        if (!selectedTemplateData) {
            return 'Pick a workflow template to begin.';
        }
        if (requiresUploadedImage && !uploadedImage) {
            return 'Upload a source image before this workflow can be queued.';
        }
        if (selectedTemplate !== 'upscale' && !prompt.trim()) {
            return 'Add a prompt before sending this run to the queue.';
        }
        if (!isReviewStep) {
            return 'Finish the remaining steps, then review before queueing.';
        }
        return 'Ready to add this workflow to the queue.';
    }, [isReviewStep, prompt, requiresUploadedImage, selectedTemplate, selectedTemplateData, uploadedImage]);

    const timelineSteps: StatusTimelineStep[] = selectedTemplateData?.steps.map((step, index) => ({
        label: STEP_COPY[step].label,
        state: index < activeStep ? 'complete' : index === activeStep ? 'active' : 'pending',
    })) ?? [];

    const resetWizard = () => {
        setSelectedTemplate(null);
        setActiveStep(0);
        setPrompt('');
        setNegativePrompt('');
        setAspectRatio('1:1');
        setSteps(20);
        setCfgScale(7);
        setSampler('euler');
        setUploadedImage(null);
        setInitImageCreativity(0.6);
        setUpscaleFactor(2);
        setUpscaleMethod('pixel-lanczos');
    };

    useEffect(() => {
        if (!handoff) {
            return;
        }

        const inferredTemplate: WizardTemplateId = handoff.templateId === 'upscale'
            ? 'upscale'
            : handoff.imageSrc || handoff.params.initimage
                ? 'image-to-image'
                : 'text-to-image';

        queueMicrotask(() => {
            setSelectedTemplate(inferredTemplate);
            setActiveStep(0);
            setPrompt(String(handoff.params.prompt || ''));
            setNegativePrompt(String(handoff.params.negativeprompt || ''));
            setAspectRatio(
                handoff.params.width && handoff.params.height
                    ? `${handoff.params.width}:${handoff.params.height}`
                    : '1:1'
            );
            setSteps(typeof handoff.params.steps === 'number' ? handoff.params.steps : 20);
            setCfgScale(typeof handoff.params.cfgscale === 'number' ? handoff.params.cfgscale : 7);
            setSampler(typeof handoff.params.sampler === 'string' ? handoff.params.sampler : 'euler');
            setUploadedImage(String(handoff.imageSrc || handoff.params.initimage || '') || null);
            if (typeof handoff.params.initimagecreativity === 'number') {
                setInitImageCreativity(handoff.params.initimagecreativity);
            }
            if (typeof handoff.params.refinerupscale === 'number' && handoff.params.refinerupscale > 1) {
                setUpscaleFactor(handoff.params.refinerupscale);
            }
            if (typeof handoff.params.refinerupscalemethod === 'string' && handoff.params.refinerupscalemethod) {
                setUpscaleMethod(handoff.params.refinerupscalemethod);
            }
            setLastWizardTemplate(inferredTemplate);
            setHandoff(null);
        });
    }, [handoff, setHandoff, setLastWizardTemplate]);

    const chooseTemplate = (templateId: WizardTemplateId) => {
        setSelectedTemplate(templateId);
        setActiveStep(0);
        setLastWizardTemplate(templateId);
    };

    const handleNext = () => {
        if (selectedTemplateData && canAdvance && activeStep < selectedTemplateData.steps.length - 1) {
            setActiveStep((current) => current + 1);
        }
    };

    const handleBack = () => {
        if (activeStep > 0) {
            setActiveStep((current) => current - 1);
        }
    };

    const handleUploadChange = (file: File | null) => {
        if (!file) {
            setUploadedImage(null);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            setUploadedImage((event.target?.result as string) || null);
        };
        reader.readAsDataURL(file);
    };

    const handleGenerate = () => {
        if (!selectedTemplateData || !currentStep || !canQueue) {
            return;
        }

        const sharedParams: GenerateParams = {
            prompt: selectedTemplate === 'upscale'
                ? (prompt.trim() || 'high detail, sharp focus')
                : prompt,
            negativeprompt: negativePrompt,
            model: selectedModel || '',
            width: selectedAspect?.width || 1024,
            height: selectedAspect?.height || 1024,
            steps,
            cfgscale: cfgScale,
            sampler,
            seed: -1,
            images: 1,
        };

        let generationParams = sharedParams;

        if (selectedTemplate === 'image-to-image' && uploadedImage) {
            generationParams = {
                ...sharedParams,
                initimage: uploadedImage,
                initimagecreativity: initImageCreativity,
            };
        }

        if (selectedTemplate === 'upscale' && uploadedImage) {
            generationParams = {
                ...sharedParams,
                initimage: uploadedImage,
                refinerupscale: upscaleFactor,
                refinerupscalemethod: upscaleMethod,
                refinermethod: 'PostApply',
                refinercontrol: 0,
                refinercontrolpercentage: 0,
            };
        }

        if (onGenerate) {
            onGenerate(generationParams);
        } else {
            addJob(generationParams, {
                name: `Wizard: ${selectedTemplateData.name}`,
                priority: 'normal',
                provenance: {
                    source: 'workflow',
                    workflowMode: 'wizard',
                },
            });
            notifications.show({
                title: 'Added to Queue',
                message: 'Workflow has been added to the generation queue.',
                color: 'green',
            });
        }

        resetWizard();
    };

    const renderStepContent = () => {
        if (!currentStep) {
            return null;
        }

        const copy = STEP_COPY[currentStep];

        switch (currentStep) {
            case 'model':
                return (
                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text size="lg" fw={600}>{copy.title}</Text>
                            <Text size="sm" c="dimmed">{copy.description}</Text>
                        </Stack>
                        <Paper withBorder p="md" radius="md">
                            <Stack gap="sm">
                                <Text size="sm" c="dimmed">Current model</Text>
                                <Badge size="lg" variant="light">
                                    {selectedModel || 'No model selected'}
                                </Badge>
                                <Text size="xs" c="dimmed">
                                    Change the active model in the Generate workspace if you want this wizard run to use something different.
                                </Text>
                            </Stack>
                        </Paper>
                    </Stack>
                );
            case 'prompt':
                return (
                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text size="lg" fw={600}>{copy.title}</Text>
                            <Text size="sm" c="dimmed">{copy.description}</Text>
                        </Stack>
                        <Textarea
                            label="Prompt"
                            placeholder="A cinematic landscape at golden hour with layered clouds and detailed foreground rocks..."
                            value={prompt}
                            onChange={(event) => setPrompt(event.currentTarget.value)}
                            minRows={5}
                            autosize
                        />
                        <Textarea
                            label="Negative Prompt (optional)"
                            placeholder="blurry, low quality, distorted anatomy..."
                            value={negativePrompt}
                            onChange={(event) => setNegativePrompt(event.currentTarget.value)}
                            minRows={3}
                            autosize
                        />
                    </Stack>
                );
            case 'size':
                return (
                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text size="lg" fw={600}>{copy.title}</Text>
                            <Text size="sm" c="dimmed">{copy.description}</Text>
                        </Stack>
                        <SegmentedControl
                            fullWidth
                            value={aspectRatio}
                            onChange={setAspectRatio}
                            data={ASPECT_RATIOS.map((ratio) => ({
                                value: ratio.value,
                                label: ratio.label,
                            }))}
                        />
                        <Paper withBorder p="md" radius="md">
                            <Text size="sm" c="dimmed">Selected size</Text>
                            <Text size="lg" fw={600}>
                                {selectedAspect?.width} x {selectedAspect?.height}
                            </Text>
                        </Paper>
                    </Stack>
                );
            case 'sampler':
                return (
                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text size="lg" fw={600}>{copy.title}</Text>
                            <Text size="sm" c="dimmed">{copy.description}</Text>
                        </Stack>
                        <Grid gap="md">
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <NumberInput
                                    label="Steps"
                                    value={steps}
                                    onChange={(value) => setSteps(Number(value) || 20)}
                                    min={1}
                                    max={150}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <NumberInput
                                    label="CFG Scale"
                                    value={cfgScale}
                                    onChange={(value) => setCfgScale(Number(value) || 7)}
                                    min={1}
                                    max={30}
                                    decimalScale={1}
                                />
                            </Grid.Col>
                        </Grid>
                        <SamplingSelect
                            kind="sampler"
                            label="Sampler"
                            withSelectedDescription={false}
                            value={sampler}
                            onChange={(value) => setSampler(value || 'euler')}
                            data={samplerOptions.filter((option) => [
                                'euler',
                                'euler_ancestral',
                                'dpmpp_2m',
                                'dpmpp_2m_sde',
                                'dpmpp_3m_sde',
                            ].includes(option.value))}
                            searchable
                        />
                    </Stack>
                );
            case 'review':
                return (
                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text size="lg" fw={600}>{copy.title}</Text>
                            <Text size="sm" c="dimmed">{copy.description}</Text>
                        </Stack>
                        <Paper withBorder p="md" radius="md">
                            <Stack gap="sm">
                                <Group justify="space-between">
                                    <Text c="dimmed">Template</Text>
                                    <Badge>{selectedTemplateData?.name}</Badge>
                                </Group>
                                <Divider />
                                <Group justify="space-between">
                                    <Text c="dimmed">Model</Text>
                                    <Text size="sm" fw={500}>{selectedModel || 'Default'}</Text>
                                </Group>
                                {uploadedImage && (
                                    <Group justify="space-between">
                                        <Text c="dimmed">Source image</Text>
                                        <Text size="sm" fw={500}>Loaded</Text>
                                    </Group>
                                )}
                                {selectedTemplate !== 'upscale' && (
                                    <>
                                        <Group justify="space-between">
                                            <Text c="dimmed">Output size</Text>
                                            <Text size="sm" fw={500}>
                                                {selectedAspect?.width} x {selectedAspect?.height}
                                            </Text>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text c="dimmed">Steps</Text>
                                            <Text size="sm" fw={500}>{steps}</Text>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text c="dimmed">CFG Scale</Text>
                                            <Text size="sm" fw={500}>{cfgScale}</Text>
                                        </Group>
                                    </>
                                )}
                                {selectedTemplate === 'image-to-image' && (
                                    <Group justify="space-between">
                                        <Text c="dimmed">Creativity</Text>
                                        <Text size="sm" fw={500}>{initImageCreativity.toFixed(2)}</Text>
                                    </Group>
                                )}
                                {selectedTemplate === 'upscale' && (
                                    <>
                                        <Group justify="space-between">
                                            <Text c="dimmed">Upscale factor</Text>
                                            <Text size="sm" fw={500}>{upscaleFactor.toFixed(2)}x</Text>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text c="dimmed">Upscale method</Text>
                                            <Text size="sm" fw={500}>
                                                {upscaleOptions.find((option) => option.value === upscaleMethod)?.label || upscaleMethod}
                                            </Text>
                                        </Group>
                                    </>
                                )}
                                <Divider />
                                <Text c="dimmed" size="sm">Prompt</Text>
                                <Text size="sm" lineClamp={4}>
                                    {selectedTemplate === 'upscale'
                                        ? prompt || '(using default upscale prompt)'
                                        : prompt || '(no prompt)'}
                                </Text>
                            </Stack>
                        </Paper>
                    </Stack>
                );
            case 'upload':
                return (
                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text size="lg" fw={600}>{copy.title}</Text>
                            <Text size="sm" c="dimmed">{copy.description}</Text>
                        </Stack>
                        <Group justify="space-between" align="center">
                            <FileButton
                                onChange={handleUploadChange}
                                accept="image/png,image/jpeg,image/webp"
                            >
                                {(props) => (
                                    <Button {...props} leftSection={<IconUpload size={16} />}>
                                        {uploadedImage ? 'Replace Image' : 'Upload Image'}
                                    </Button>
                                )}
                            </FileButton>
                            {uploadedImage && (
                                <Button variant="subtle" color="red" onClick={() => setUploadedImage(null)}>
                                    Clear
                                </Button>
                            )}
                        </Group>
                        {uploadedImage ? (
                            <Image
                                src={uploadedImage}
                                alt="Workflow source"
                                radius="md"
                                mah={320}
                                fit="contain"
                            />
                        ) : (
                            <Paper withBorder p="xl" radius="md">
                                <Stack align="center" gap="xs">
                                    <IconPhoto size={42} stroke={1.5} />
                                    <Text size="sm" c="dimmed">
                                        Upload a source image to continue.
                                    </Text>
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                );
            case 'strength':
                return (
                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text size="lg" fw={600}>{copy.title}</Text>
                            <Text size="sm" c="dimmed">{copy.description}</Text>
                        </Stack>
                        <Slider
                            value={initImageCreativity}
                            onChange={setInitImageCreativity}
                            min={0}
                            max={1}
                            step={0.05}
                            marks={[
                                { value: 0.25, label: 'Subtle' },
                                { value: 0.6, label: 'Balanced' },
                                { value: 0.9, label: 'Bold' },
                            ]}
                        />
                        <Paper withBorder p="md" radius="md">
                            <Text size="sm" fw={500}>
                                Creativity: {initImageCreativity.toFixed(2)}
                            </Text>
                            <Text size="xs" c="dimmed">
                                Lower values preserve composition. Higher values allow stronger reinterpretation.
                            </Text>
                        </Paper>
                    </Stack>
                );
            case 'scale':
                return (
                    <Stack gap="md">
                        <Stack gap={4}>
                            <Text size="lg" fw={600}>{copy.title}</Text>
                            <Text size="sm" c="dimmed">{copy.description}</Text>
                        </Stack>
                        <Grid gap="md">
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <NumberInput
                                    label="Upscale Factor"
                                    value={upscaleFactor}
                                    onChange={(value) => setUpscaleFactor(Number(value) || 2)}
                                    min={1}
                                    max={4}
                                    step={0.25}
                                    decimalScale={2}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <Select
                                    label="Upscale Method"
                                    value={upscaleMethod}
                                    onChange={(value) => setUpscaleMethod(value || 'pixel-lanczos')}
                                    data={upscaleOptions}
                                />
                            </Grid.Col>
                        </Grid>
                        <Paper withBorder p="md" radius="md">
                            <Text size="sm" fw={500}>
                                Output: {upscaleFactor.toFixed(2)}x with {upscaleOptions.find((option) => option.value === upscaleMethod)?.label || upscaleMethod}
                            </Text>
                            <Text size="xs" c="dimmed">
                                Uses the current base model plus the selected upscale method through the standard queue flow.
                            </Text>
                        </Paper>
                    </Stack>
                );
            default:
                return <Text>Unknown step</Text>;
        }
    };

    if (!selectedTemplateData) {
        const groupedTemplates = TEMPLATE_GROUPS.map((group) => ({
            ...group,
            templates: WIZARD_TEMPLATES.filter((template) => template.group === group.id),
        }));

        return (
            <Stack gap="lg">
                <ElevatedCard elevation="paper" tone="brand" withBorder>
                    <Stack gap="sm">
                        <Group justify="space-between" align="flex-start" wrap="wrap">
                            <Stack gap={4}>
                                <Group gap="xs">
                                    <ThemeIcon size={36} radius="xl" variant="light" color="orange">
                                        <IconSparkles size={18} />
                                    </ThemeIcon>
                                    <Text size="lg" fw={700}>Guided Wizard</Text>
                                </Group>
                                <Text size="sm" c="var(--theme-text-secondary)">
                                    Pick a workflow by goal, then move through a focused queue-ready setup.
                                </Text>
                            </Stack>
                            {lastWizardTemplate && getWizardTemplateMeta(lastWizardTemplate) && (
                                <Button
                                    variant="light"
                                    color="invokeBrand"
                                    rightSection={<IconArrowRight size={16} />}
                                    onClick={() => chooseTemplate(lastWizardTemplate as WizardTemplateId)}
                                >
                                    Continue {getWizardTemplateMeta(lastWizardTemplate)?.name}
                                </Button>
                            )}
                        </Group>
                        <Text size="sm" c="var(--theme-text-secondary)">
                            Best for: fast starts, fewer decisions up front, and reliable handoff to the queue.
                        </Text>
                    </Stack>
                </ElevatedCard>

                {groupedTemplates.map((group) => (
                    <Stack key={group.id} gap="sm">
                        <Stack gap={2}>
                            <Text size="md" fw={700}>{group.title}</Text>
                            <Text size="sm" c="var(--theme-text-secondary)">{group.description}</Text>
                        </Stack>
                        <Grid gap="md">
                            {group.templates.map((template) => {
                                const TemplateIcon = template.icon;
                                const isRecent = lastWizardTemplate === template.id;
                                return (
                                    <Grid.Col key={template.id} span={{ base: 12, md: 6, xl: 4 }}>
                                        <ElevatedCard
                                            elevation={isRecent ? 'raised' : 'paper'}
                                            tone={isRecent ? 'brand' : 'neutral'}
                                            interactive
                                            withBorder
                                            style={{ height: '100%' }}
                                        >
                                            <Stack gap="md" style={{ height: '100%' }}>
                                                <Group justify="space-between" align="flex-start">
                                                    <ThemeIcon size={42} radius="xl" variant="light" color="orange">
                                                        <TemplateIcon size={20} />
                                                    </ThemeIcon>
                                                    <Group gap="xs">
                                                        <SwarmBadge tone="neutral" size="sm">
                                                            {template.steps.length} steps
                                                        </SwarmBadge>
                                                        {isRecent && (
                                                            <SwarmBadge tone="brand" size="sm">
                                                                Last Used
                                                            </SwarmBadge>
                                                        )}
                                                    </Group>
                                                </Group>
                                                <Stack gap={4} style={{ flex: 1 }}>
                                                    <Text size="lg" fw={700}>{template.name}</Text>
                                                    <Text size="sm" c="var(--theme-text-secondary)">
                                                        {template.description}
                                                    </Text>
                                                    <Text size="xs" c="var(--theme-text-secondary)">
                                                        {template.bestFor}
                                                    </Text>
                                                </Stack>
                                                <Button
                                                    variant={isRecent ? 'filled' : 'light'}
                                                    color="invokeBrand"
                                                    rightSection={<IconArrowRight size={16} />}
                                                    onClick={() => chooseTemplate(template.id)}
                                                >
                                                    {isRecent ? 'Continue Setup' : 'Start Workflow'}
                                                </Button>
                                            </Stack>
                                        </ElevatedCard>
                                    </Grid.Col>
                                );
                            })}
                        </Grid>
                    </Stack>
                ))}
            </Stack>
        );
    }

    const currentCopy = currentStep ? STEP_COPY[currentStep] : null;

    return (
        <Grid gap="md" align="flex-start">
            <Grid.Col span={{ base: 12, lg: 8 }}>
                <Stack gap="md">
                    <ElevatedCard elevation="paper" tone="brand" withBorder>
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start" wrap="wrap">
                                <Stack gap={4}>
                                    <Group gap="xs">
                                        <Button
                                            variant="subtle"
                                            leftSection={<IconArrowLeft size={16} />}
                                            onClick={resetWizard}
                                        >
                                            Change Template
                                        </Button>
                                        <Badge size="lg">{selectedTemplateData.name}</Badge>
                                    </Group>
                                    <Text size="sm" c="var(--theme-text-secondary)">
                                        {selectedTemplateData.bestFor}
                                    </Text>
                                </Stack>
                                <Button
                                    variant="subtle"
                                    leftSection={<IconRotate2 size={16} />}
                                    onClick={resetWizard}
                                >
                                    Reset Wizard
                                </Button>
                            </Group>
                            <StatusTimeline steps={timelineSteps} />
                        </Stack>
                    </ElevatedCard>

                    <ElevatedCard elevation="paper" tone="neutral" withBorder>
                        <Stack gap="md">
                            {currentCopy && (
                                <Stack gap={4}>
                                    <Text size="lg" fw={700}>{currentCopy.title}</Text>
                                    <Text size="sm" c="var(--theme-text-secondary)">
                                        {currentCopy.description}
                                    </Text>
                                </Stack>
                            )}

                            <Card withBorder padding="lg" radius="md" mih={320}>
                                {renderStepContent()}
                            </Card>

                            <Box
                                style={{
                                    position: 'sticky',
                                    bottom: 0,
                                    paddingTop: 8,
                                    background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--theme-gray-8) 88%, transparent) 28%)',
                                }}
                            >
                                <Paper withBorder p="md" radius="md">
                                    <Group justify="space-between" wrap="wrap" align="center">
                                        <Group gap="sm">
                                            <Button
                                                variant="subtle"
                                                leftSection={<IconArrowLeft size={16} />}
                                                onClick={handleBack}
                                                disabled={activeStep === 0}
                                            >
                                                Previous
                                            </Button>
                                            <Button
                                                variant="subtle"
                                                color="gray"
                                                leftSection={<IconRotate2 size={16} />}
                                                onClick={resetWizard}
                                            >
                                                Start Over
                                            </Button>
                                        </Group>

                                        {isReviewStep ? (
                                            <Button
                                                color="green"
                                                leftSection={<IconPlayerPlay size={16} />}
                                                onClick={handleGenerate}
                                                disabled={!canQueue}
                                            >
                                                {selectedTemplateData.queueLabel}
                                            </Button>
                                        ) : (
                                            <Button
                                                rightSection={<IconArrowRight size={16} />}
                                                onClick={handleNext}
                                                disabled={!canAdvance}
                                            >
                                                Next Step
                                            </Button>
                                        )}
                                    </Group>
                                </Paper>
                            </Box>
                        </Stack>
                    </ElevatedCard>
                </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: 4 }}>
                <Stack gap="md" style={{ position: 'sticky', top: 12 }}>
                    <ElevatedCard elevation="raised" tone="accent" withBorder>
                        <Stack gap="sm">
                            <Group justify="space-between" align="center">
                                <Text fw={700}>Run Summary</Text>
                                <SwarmBadge tone={canQueue ? 'success' : 'warning'} size="sm">
                                    {canQueue ? 'Queue Ready' : 'Needs Attention'}
                                </SwarmBadge>
                            </Group>
                            <Divider />
                            <Group justify="space-between">
                                <Text size="sm" c="var(--theme-text-secondary)">Workflow</Text>
                                <Text size="sm" fw={600}>{selectedTemplateData.name}</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="var(--theme-text-secondary)">Model</Text>
                                <Text size="sm" fw={600}>{selectedModel || 'Not selected'}</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="var(--theme-text-secondary)">Source image</Text>
                                <Text size="sm" fw={600}>
                                    {requiresUploadedImage ? (uploadedImage ? 'Loaded' : 'Required') : 'Not needed'}
                                </Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="var(--theme-text-secondary)">Output</Text>
                                <Text size="sm" fw={600}>
                                    {selectedTemplate === 'upscale'
                                        ? `${upscaleFactor.toFixed(2)}x`
                                        : `${selectedAspect?.width} x ${selectedAspect?.height}`}
                                </Text>
                            </Group>
                            {selectedTemplate === 'image-to-image' && (
                                <Group justify="space-between">
                                    <Text size="sm" c="var(--theme-text-secondary)">Creativity</Text>
                                    <Text size="sm" fw={600}>{initImageCreativity.toFixed(2)}</Text>
                                </Group>
                            )}
                            <Paper withBorder p="sm" radius="md">
                                <Text size="xs" c="var(--theme-text-secondary)">
                                    {queueStatus}
                                </Text>
                            </Paper>
                            <Button
                                color="green"
                                leftSection={<IconPlayerPlay size={16} />}
                                onClick={handleGenerate}
                                disabled={!canQueue || !isReviewStep}
                            >
                                {selectedTemplateData.queueLabel}
                            </Button>
                        </Stack>
                    </ElevatedCard>

                    <ElevatedCard elevation="paper" tone="neutral" withBorder>
                        <Stack gap="sm">
                            <Group gap="xs">
                                <ThemeIcon size={34} radius="xl" variant="light" color="orange">
                                    <IconTargetArrow size={16} />
                                </ThemeIcon>
                                <Text fw={700}>Current Focus</Text>
                            </Group>
                            <Text size="sm">{currentCopy?.label}</Text>
                            <Text size="sm" c="var(--theme-text-secondary)">
                                {currentCopy?.description}
                            </Text>
                        </Stack>
                    </ElevatedCard>
                </Stack>
            </Grid.Col>
        </Grid>
    );
}
