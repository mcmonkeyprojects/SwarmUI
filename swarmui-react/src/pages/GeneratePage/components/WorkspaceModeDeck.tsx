import { memo } from 'react';
import {
    Badge,
    Box,
    Card,
    Divider,
    Group,
    ScrollArea,
    Select,
    SimpleGrid,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import {
    IconBlocks,
    IconDatabase,
    IconHistory,
    IconRoute2,
    IconSparkles,
    IconWand,
} from '@tabler/icons-react';
import type { UseFormReturnType } from '@mantine/form';
import type { BackendStatus, GenerateParams, Model } from '../../../api/types';
import type { GenerationIssue, GenerationRecipe } from '../../../features/generation/productTypes';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';
import type { ModelMediaCapabilities } from '../../../utils/modelCapabilities';
import { SwarmButton, SwarmSwitch } from '../../../components/ui';
import { DimensionControls } from './ParameterPanel/DimensionControls';
import { GenerateButton } from './ParameterPanel/GenerateButton';

interface WorkspaceModeDeckProps {
    mode: Extract<GenerateWorkspaceMode, 'quick' | 'guided'>;
    form: UseFormReturnType<GenerateParams>;
    onGenerate: (values: GenerateParams) => void;
    backends: BackendStatus[];
    backendOptions: { value: string; label: string; disabled?: boolean }[];
    selectedBackend: string;
    onBackendChange: (value: string) => void;
    loadingBackends: boolean;
    models: Model[];
    loadingModels: boolean;
    loadingModel: boolean;
    onModelSelect: (modelName: string | null) => void;
    generating: boolean;
    onStop: () => void;
    onOpenSchedule: () => void;
    onGenerateAndUpscale?: () => void;
    onOpenHistory: () => void;
    onOpenModelBrowser: () => void;
    onOpenLoraBrowser: () => void;
    onOpenEmbeddingBrowser: () => void;
    onPromoteWorkflow: () => void;
    enableRefiner: boolean;
    setEnableRefiner: (enabled: boolean) => void;
    enableInitImage: boolean;
    setEnableInitImage: (enabled: boolean) => void;
    enableVariation: boolean;
    setEnableVariation: (enabled: boolean) => void;
    enableControlNet: boolean;
    setEnableControlNet: (enabled: boolean) => void;
    enableVideo: boolean;
    setEnableVideo: (enabled: boolean) => void;
    modelMediaCapabilities: ModelMediaCapabilities;
    activeRecipe: GenerationRecipe | null;
    issues: GenerationIssue[];
    previewing?: boolean;
    onTogglePreviews?: () => void;
}

function ToggleCard({
    title,
    description,
    checked,
    onChange,
    disabled,
}: {
    title: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <Card withBorder radius="md" padding="md" className="generate-studio__toggle-card">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} style={{ flex: 1 }}>
                    <Text fw={600} size="sm">{title}</Text>
                    <Text size="xs" c="dimmed">{description}</Text>
                </Stack>
                <SwarmSwitch
                    checked={checked}
                    onChange={(event) => onChange(event.currentTarget.checked)}
                    disabled={disabled}
                />
            </Group>
        </Card>
    );
}

export const WorkspaceModeDeck = memo(function WorkspaceModeDeck({
    mode,
    form,
    onGenerate,
    backends,
    backendOptions,
    selectedBackend,
    onBackendChange,
    loadingBackends,
    models,
    loadingModels,
    loadingModel,
    onModelSelect,
    generating,
    onStop,
    onOpenSchedule,
    onGenerateAndUpscale,
    onOpenHistory,
    onOpenModelBrowser,
    onOpenLoraBrowser,
    onOpenEmbeddingBrowser,
    onPromoteWorkflow,
    enableRefiner,
    setEnableRefiner,
    enableInitImage,
    setEnableInitImage,
    enableVariation,
    setEnableVariation,
    enableControlNet,
    setEnableControlNet,
    enableVideo,
    setEnableVideo,
    modelMediaCapabilities,
    activeRecipe,
    issues,
    previewing,
    onTogglePreviews,
}: WorkspaceModeDeckProps) {
    const modelOptions = models.map((model) => ({
        value: model.name,
        label: model.title || model.name,
        disabled: !model.loaded,
    }));
    const selectedModel = models.find((model) => model.name === form.values.model) ?? null;
    const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
    const warningIssues = issues.filter((issue) => issue.severity === 'warning');

    if (mode === 'quick') {
        return (
            <Box className="generate-studio__sidebar">
                <ScrollArea h="100%" type="auto" offsetScrollbars>
                    <form onSubmit={form.onSubmit(onGenerate)} className="generate-studio__sidebar-form">
                        <Stack gap="sm" p="md">
                            <Card
                                withBorder
                                radius="lg"
                                padding="lg"
                                className="generate-studio__mode-hero"
                                style={{
                                    background: 'linear-gradient(160deg, color-mix(in srgb, var(--mantine-color-blue-8) 40%, transparent), transparent)',
                                }}
                            >
                                <Stack gap="sm">
                                    <Group justify="space-between" align="flex-start">
                                        <Stack gap={4}>
                                            <Group gap="xs">
                                                <IconSparkles size={16} />
                                                <Text fw={700}>Quick Workspace</Text>
                                                <Badge variant="light" color="blue">Minimal</Badge>
                                            </Group>
                                            <Text size="sm" c="dimmed">
                                                Prompt, model, framing, generate. Built to stay fast and out of the way.
                                            </Text>
                                        </Stack>
                                        {activeRecipe ? (
                                            <Badge variant="light" color="grape">
                                                {activeRecipe.name}
                                            </Badge>
                                        ) : null}
                                    </Group>

                                    <Group grow align="end">
                                        {backends.length > 0 ? (
                                            <Select
                                                label="Backend"
                                                placeholder={loadingBackends ? 'Loading backends...' : 'Select backend'}
                                                data={backendOptions}
                                                value={selectedBackend}
                                                onChange={(value) => onBackendChange(value || '')}
                                                clearable
                                            />
                                        ) : null}
                                        <Select
                                            label="Base Model"
                                            placeholder={loadingModels ? 'Loading models...' : 'Select a checkpoint'}
                                            data={modelOptions}
                                            value={form.values.model || null}
                                            onChange={onModelSelect}
                                            searchable
                                            disabled={loadingModel}
                                        />
                                    </Group>

                                    <Group gap="xs" wrap="wrap">
                                        <SwarmButton
                                            tone="secondary"
                                            emphasis="soft"
                                            leftSection={<IconDatabase size={14} />}
                                            onClick={onOpenModelBrowser}
                                        >
                                            Browse Models
                                        </SwarmButton>
                                        <SwarmButton
                                            tone="secondary"
                                            emphasis="soft"
                                            leftSection={<IconHistory size={14} />}
                                            onClick={onOpenHistory}
                                        >
                                            Reuse History
                                        </SwarmButton>
                                    </Group>
                                </Stack>
                            </Card>

                            <Card withBorder radius="lg" padding="lg" className="generate-studio__mode-card">
                                <Stack gap="sm">
                                    <Text fw={600}>Describe the result</Text>
                                    <Textarea
                                        label="Prompt"
                                        placeholder="A cinematic portrait in warm late-afternoon light..."
                                        value={form.values.prompt || ''}
                                        onChange={(event) => form.setFieldValue('prompt', event.currentTarget.value)}
                                        minRows={5}
                                        autosize
                                    />
                                    <Textarea
                                        label="Negative Prompt"
                                        placeholder="blurry, low detail, distorted hands..."
                                        value={form.values.negativeprompt || ''}
                                        onChange={(event) => form.setFieldValue('negativeprompt', event.currentTarget.value)}
                                        minRows={2}
                                        autosize
                                    />
                                </Stack>
                            </Card>

                            <Card withBorder radius="lg" padding="lg" className="generate-studio__mode-card">
                                <Stack gap="sm">
                                    <Text fw={600}>Choose framing</Text>
                                    <DimensionControls form={form} />
                                </Stack>
                            </Card>

                            {(blockingIssues.length > 0 || warningIssues.length > 0) ? (
                                <Card withBorder radius="lg" padding="md" className="generate-studio__mode-card">
                                    <Stack gap="xs">
                                        <Text fw={600}>Preflight</Text>
                                        {blockingIssues.map((issue) => (
                                            <Badge key={issue.id} color="red" variant="light" fullWidth>
                                                {issue.message}
                                            </Badge>
                                        ))}
                                        {warningIssues.map((issue) => (
                                            <Badge key={issue.id} color="yellow" variant="light" fullWidth>
                                                {issue.message}
                                            </Badge>
                                        ))}
                                    </Stack>
                                </Card>
                            ) : null}

                            <GenerateButton
                                generating={generating}
                                onStop={onStop}
                                onOpenSchedule={onOpenSchedule}
                                onGenerateAndUpscale={onGenerateAndUpscale}
                                currentValues={form.values}
                                selectedModel={selectedModel}
                                previewing={previewing}
                                onTogglePreviews={onTogglePreviews}
                                onInsertPromptSyntax={(text) => {
                                    form.setFieldValue('prompt', (form.values.prompt || '').trim() + ' ' + text.trim());
                                }}
                            />

                            <Group grow>
                                <SwarmButton
                                    tone="secondary"
                                    emphasis="soft"
                                    leftSection={<IconRoute2 size={14} />}
                                    onClick={onPromoteWorkflow}
                                >
                                    Send To Workflow
                                </SwarmButton>
                            </Group>

                            <Text size="xs" c="dimmed">
                                Need LoRAs, init image, ControlNet, or video tools? Use Guided or Advanced for the fuller studio.
                            </Text>
                        </Stack>
                    </form>
                </ScrollArea>
            </Box>
        );
    }

    return (
        <Box className="generate-studio__sidebar">
            <ScrollArea h="100%" type="auto" offsetScrollbars>
                <form onSubmit={form.onSubmit(onGenerate)} className="generate-studio__sidebar-form">
                    <Stack gap="sm" p="md">
                        <Card
                            withBorder
                            radius="lg"
                            padding="lg"
                            className="generate-studio__mode-hero"
                            style={{
                                background: 'linear-gradient(160deg, color-mix(in srgb, var(--mantine-color-teal-8) 32%, transparent), transparent)',
                            }}
                        >
                            <Stack gap="sm">
                                <Group justify="space-between" align="flex-start">
                                    <Stack gap={4}>
                                        <Group gap="xs">
                                            <IconWand size={16} />
                                            <Text fw={700}>Guided Workspace</Text>
                                            <Badge variant="light" color="teal">Curated</Badge>
                                        </Group>
                                        <Text size="sm" c="dimmed">
                                            A staged flow with recommendations and the controls most runs actually need.
                                        </Text>
                                    </Stack>
                                    <Stack gap={6} align="flex-end">
                                        <Badge variant="light" color="blue">1. Foundation</Badge>
                                        <Badge variant="light" color="grape">2. Intent</Badge>
                                        <Badge variant="light" color="teal">3. Guidance</Badge>
                                    </Stack>
                                </Group>
                                {activeRecipe ? (
                                    <Text size="sm" c="dimmed">
                                        Active recipe: <Text span fw={600} c="inherit">{activeRecipe.name}</Text>
                                    </Text>
                                ) : (
                                    <Text size="sm" c="dimmed">
                                        Apply a recipe above if you want this guided path to start from a proven setup.
                                    </Text>
                                )}
                            </Stack>
                        </Card>

                        <Card withBorder radius="lg" padding="lg" className="generate-studio__mode-card">
                            <Stack gap="md">
                                <Text fw={600}>1. Foundation</Text>
                                <Group grow align="end">
                                    {backends.length > 0 ? (
                                        <Select
                                            label="Backend"
                                            placeholder={loadingBackends ? 'Loading backends...' : 'Select backend'}
                                            data={backendOptions}
                                            value={selectedBackend}
                                            onChange={(value) => onBackendChange(value || '')}
                                            clearable
                                        />
                                    ) : null}
                                    <Select
                                        label="Base Model"
                                        placeholder={loadingModels ? 'Loading models...' : 'Select a checkpoint'}
                                        data={modelOptions}
                                        value={form.values.model || null}
                                        onChange={onModelSelect}
                                        searchable
                                        disabled={loadingModel}
                                    />
                                </Group>
                                <Group gap="xs" wrap="wrap">
                                    <SwarmButton
                                        tone="secondary"
                                        emphasis="soft"
                                        leftSection={<IconDatabase size={14} />}
                                        onClick={onOpenModelBrowser}
                                    >
                                        Browse Models
                                    </SwarmButton>
                                    <SwarmButton
                                        tone="secondary"
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
                            </Stack>
                        </Card>

                        <Card withBorder radius="lg" padding="lg" className="generate-studio__mode-card">
                            <Stack gap="md">
                                <Text fw={600}>2. Intent</Text>
                                <Textarea
                                    label="Prompt"
                                    placeholder="What should the image feel like, look like, and emphasize?"
                                    value={form.values.prompt || ''}
                                    onChange={(event) => form.setFieldValue('prompt', event.currentTarget.value)}
                                    minRows={5}
                                    autosize
                                />
                                <Textarea
                                    label="Negative Prompt"
                                    placeholder="What should the model avoid?"
                                    value={form.values.negativeprompt || ''}
                                    onChange={(event) => form.setFieldValue('negativeprompt', event.currentTarget.value)}
                                    minRows={2}
                                    autosize
                                />
                                <Divider />
                                <DimensionControls form={form} />
                            </Stack>
                        </Card>

                        <Card withBorder radius="lg" padding="lg" className="generate-studio__mode-card">
                            <Stack gap="md">
                                <Group justify="space-between" align="center">
                                    <Text fw={600}>3. Guidance</Text>
                                    <Badge variant="light" color="teal">Recommended controls</Badge>
                                </Group>
                                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                                    <ToggleCard
                                        title="Init Image"
                                        description="Start from an existing image or sketch when composition matters."
                                        checked={enableInitImage}
                                        onChange={setEnableInitImage}
                                    />
                                    <ToggleCard
                                        title="Hi-Res Refiner"
                                        description="Add a second pass for cleaner large outputs and upscale workflows."
                                        checked={enableRefiner}
                                        onChange={setEnableRefiner}
                                    />
                                    <ToggleCard
                                        title="Variation"
                                        description="Branch from a previous idea instead of starting from zero."
                                        checked={enableVariation}
                                        onChange={setEnableVariation}
                                    />
                                    <ToggleCard
                                        title="ControlNet"
                                        description="Use stricter pose, depth, or structure guidance when needed."
                                        checked={enableControlNet}
                                        onChange={setEnableControlNet}
                                    />
                                    <ToggleCard
                                        title="Video"
                                        description="Turn this run into motion output when the selected model supports it."
                                        checked={enableVideo}
                                        onChange={setEnableVideo}
                                        disabled={!modelMediaCapabilities.supportsVideo}
                                    />
                                </SimpleGrid>
                                {!modelMediaCapabilities.supportsVideo ? (
                                    <Text size="xs" c="dimmed">
                                        Video stays disabled until you choose a video-capable model.
                                    </Text>
                                ) : null}
                            </Stack>
                        </Card>

                        <Card withBorder radius="lg" padding="lg" className="generate-studio__mode-card">
                            <Stack gap="sm">
                                <Text fw={600}>Review And Reuse</Text>
                                <Group gap="xs" wrap="wrap">
                                    <SwarmButton
                                        tone="secondary"
                                        emphasis="soft"
                                        leftSection={<IconHistory size={14} />}
                                        onClick={onOpenHistory}
                                    >
                                        Open History
                                    </SwarmButton>
                                    <SwarmButton
                                        tone="secondary"
                                        emphasis="soft"
                                        leftSection={<IconRoute2 size={14} />}
                                        onClick={onPromoteWorkflow}
                                    >
                                        Send To Workflow
                                    </SwarmButton>
                                </Group>
                                <Text size="xs" c="dimmed">
                                    Guided mode keeps the common path here. For full sampling, assets, and inspector depth, switch to Advanced.
                                </Text>
                            </Stack>
                        </Card>

                        {(blockingIssues.length > 0 || warningIssues.length > 0) ? (
                            <Card withBorder radius="lg" padding="md" className="generate-studio__mode-card">
                                <Stack gap="xs">
                                    <Text fw={600}>Preflight</Text>
                                    {blockingIssues.map((issue) => (
                                        <Badge key={issue.id} color="red" variant="light" fullWidth>
                                            {issue.message}
                                        </Badge>
                                    ))}
                                    {warningIssues.map((issue) => (
                                        <Badge key={issue.id} color="yellow" variant="light" fullWidth>
                                            {issue.message}
                                        </Badge>
                                    ))}
                                </Stack>
                            </Card>
                        ) : null}

                        <GenerateButton
                            generating={generating}
                            onStop={onStop}
                            onOpenSchedule={onOpenSchedule}
                            onGenerateAndUpscale={onGenerateAndUpscale}
                            currentValues={form.values}
                            selectedModel={selectedModel}
                            previewing={previewing}
                            onTogglePreviews={onTogglePreviews}
                            onInsertPromptSyntax={(text) => {
                                form.setFieldValue('prompt', (form.values.prompt || '').trim() + ' ' + text.trim());
                            }}
                        />
                    </Stack>
                </form>
            </ScrollArea>
        </Box>
    );
});
