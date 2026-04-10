import { useState, useEffect, useRef } from 'react';
import {
    Box,
    Stack,
    Group,
    Alert,
    SimpleGrid,
    TextInput,
    Modal,
    Paper,
    Text,
    ScrollArea,
    Card,
    Badge,
    Tooltip,
    Loader,
    Center,
    Textarea,
    Select,
    ThemeIcon,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconArrowRight,
    IconBook2,
    IconBolt,
    IconBrandPython,
    IconDeviceFloppy,
    IconFolderOpen,
    IconDownload,
    IconRefresh,
    IconX,
    IconCheck,
    IconPlayerPlay,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../api/client';
import type { ComfyWorkflowInfo } from '../api/types';
import type { GenerateParams } from '../api/types';
import { useGenerationStore } from '../store/generationStore';
import { ElevatedCard, SwarmActionIcon as ActionIcon, SwarmBadge, SwarmButton as Button } from './ui';
import { useWorkflowWorkspaceStore } from '../stores/workflowWorkspaceStore';

type ComfyRoutingMode = 'none' | 'all' | 'queue' | 'reserve';

const COMFY_ROUTING_COOKIE = 'comfy_domulti';

const ROUTING_OPTIONS: { value: ComfyRoutingMode; label: string; description: string }[] = [
    {
        value: 'none',
        label: 'Single backend',
        description: 'Send runs to one ComfyUI backend with the simplest execution path.',
    },
    {
        value: 'all',
        label: 'All backends',
        description: 'Fan work out across every available backend for broad throughput.',
    },
    {
        value: 'queue',
        label: 'Swarm queue',
        description: 'Route the workflow through Swarm scheduling instead of direct execution.',
    },
    {
        value: 'reserve',
        label: 'Reserved backend',
        description: 'Hold a dedicated backend for this session when isolation matters.',
    },
];

interface ComfyGraphToPromptResult {
    workflow: unknown;
    output: unknown;
}

interface ComfyAppHandle {
    graphToPrompt?: () => Promise<ComfyGraphToPromptResult>;
    loadGraphData?: (workflow: unknown) => Promise<unknown> | unknown;
    loadApiJson?: (workflow: unknown) => Promise<unknown> | unknown;
}

interface ComfyIframeWindow extends Window {
    app?: ComfyAppHandle;
    LiteGraph?: {
        cloneObject?: (payload: unknown) => unknown;
    };
}

function getCookie(name: string): string | null {
    const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number = 365): void {
    const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expiry}; path=/`;
}

function deleteCookie(name: string): void {
    document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function readRoutingMode(): ComfyRoutingMode {
    const cookieVal = getCookie(COMFY_ROUTING_COOKIE);
    if (cookieVal === 'true') {
        return 'all';
    }
    if (cookieVal === 'queue' || cookieVal === 'reserve') {
        return cookieVal;
    }
    return 'none';
}

function writeRoutingMode(mode: ComfyRoutingMode): void {
    if (mode === 'all') {
        setCookie(COMFY_ROUTING_COOKIE, 'true');
        return;
    }
    if (mode === 'queue' || mode === 'reserve') {
        setCookie(COMFY_ROUTING_COOKIE, mode);
        return;
    }
    deleteCookie(COMFY_ROUTING_COOKIE);
}

function parseWorkflowPayload(workflow: unknown): unknown {
    if (typeof workflow === 'string') {
        return JSON.parse(workflow);
    }
    return workflow;
}

function cloneForComfy(iframeWindow: Window | null, payload: unknown): unknown {
    const liteGraphClone = (iframeWindow as ComfyIframeWindow | null)?.LiteGraph?.cloneObject;
    if (typeof liteGraphClone === 'function') {
        return liteGraphClone(payload);
    }

    if (typeof payload === 'object' && payload !== null) {
        try {
            return JSON.parse(JSON.stringify(payload));
        } catch {
            return payload;
        }
    }

    return payload;
}

export function ComfyUIView() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [loadErrorMessage, setLoadErrorMessage] = useState('The ComfyUI backend may not be running or is still starting up.');
    const [routingMode, setRoutingMode] = useState<ComfyRoutingMode>(readRoutingMode);
    const [iframeSrc, setIframeSrc] = useState(swarmClient.getComfyBackendDirectUrl());

    // Modal states
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [loadModalOpen, setLoadModalOpen] = useState(false);
    const [workflowName, setWorkflowName] = useState('');
    const [workflowDescription, setWorkflowDescription] = useState('');

    // Workflows list
    const [workflows, setWorkflows] = useState<ComfyWorkflowInfo[]>([]);
    const [loadingWorkflows, setLoadingWorkflows] = useState(false);

    // Get current generation params for Import from Generate
    const { params } = useGenerationStore();
    const { hasSeenComfyIntro, setHasSeenComfyIntro } = useWorkflowWorkspaceStore();
    const routingDetails = ROUTING_OPTIONS.find((option) => option.value === routingMode) ?? ROUTING_OPTIONS[0];
    const recentWorkflows = workflows.slice(0, 3);

    const reloadComfyIframe = () => {
        const base = swarmClient.getComfyBackendDirectUrl();
        const separator = base.includes('?') ? '&' : '?';
        setIframeSrc(`${base}${separator}_ts=${Date.now()}`);
    };

    // Load workflows list
    const loadWorkflowsList = async () => {
        setLoadingWorkflows(true);
        try {
            const list = await swarmClient.listComfyWorkflows();
            setWorkflows(list);
        } catch (error) {
            console.error('Failed to load workflows:', error);
            setLoadErrorMessage('Saved workflows could not be loaded. The backend may still be starting.');
        } finally {
            setLoadingWorkflows(false);
        }
    };

    useEffect(() => {
        loadWorkflowsList();
    }, []);

    useEffect(() => {
        if (loadModalOpen) {
            loadWorkflowsList();
        }
    }, [loadModalOpen]);

    // Handle iframe load
    const handleIframeLoad = () => {
        setIsLoading(false);
        setLoadError(false);
        setLoadErrorMessage('The ComfyUI backend may not be running or is still starting up.');
        // Check if ComfyUI loaded successfully
        try {
            const iframe = iframeRef.current;
            if (iframe?.contentWindow?.document?.body) {
                const failedElements = iframe.contentWindow.document.getElementsByClassName('comfy-failed-to-load');
                if (failedElements.length > 0) {
                    setLoadError(true);
                    setLoadErrorMessage('ComfyUI reported a startup failure. Check that the backend is available and fully loaded.');
                }
            }
        } catch {
            // Cross-origin restrictions may prevent access
        }
    };

    // Handle iframe error
    const handleIframeError = () => {
        setIsLoading(false);
        setLoadError(true);
        setLoadErrorMessage('The embedded ComfyUI workspace could not be reached. Confirm the Comfy backend is running and then reload.');
    };

    // Save current workflow
    const handleSave = async () => {
        if (!workflowName.trim()) {
            notifications.show({
                title: 'Error',
                message: 'Please enter a workflow name',
                color: 'red',
            });
            return;
        }

        try {
            setHasSeenComfyIntro(true);
            // Get workflow from ComfyUI iframe
            const iframe = iframeRef.current;
            if (!iframe?.contentWindow) {
                throw new Error('ComfyUI not loaded');
            }

            // Access ComfyUI app
            const comfyApp = (iframe.contentWindow as ComfyIframeWindow | null)?.app;
            if (!comfyApp?.graphToPrompt) {
                throw new Error('ComfyUI app not accessible');
            }

            const result = await comfyApp.graphToPrompt();

            const saveSucceeded = await swarmClient.saveComfyWorkflow({
                name: workflowName,
                workflow: JSON.stringify(result.workflow),
                prompt: JSON.stringify(result.output),
                custom_params: '{}',
                param_values: '{}',
                image: '',
                description: workflowDescription,
            });
            if (!saveSucceeded) {
                throw new Error('Workflow save was rejected by backend');
            }

            notifications.show({
                title: 'Workflow Saved',
                message: `"${workflowName}" has been saved`,
                color: 'green',
            });

            setSaveModalOpen(false);
            setWorkflowName('');
            setWorkflowDescription('');
        } catch (error) {
            console.error('Failed to save workflow:', error);
            notifications.show({
                title: 'Save Failed',
                message: 'Could not save workflow. Make sure ComfyUI is loaded.',
                color: 'red',
            });
        }
    };

    // Load a saved workflow
    const handleLoadWorkflow = async (name: string) => {
        try {
            setHasSeenComfyIntro(true);
            const workflowData = await swarmClient.getComfyWorkflow(name);
            if (!workflowData) {
                throw new Error('Workflow not found');
            }

            const iframe = iframeRef.current;
            if (!iframe?.contentWindow) {
                throw new Error('ComfyUI not loaded');
            }

            const comfyApp = (iframe.contentWindow as ComfyIframeWindow | null)?.app;
            if (!comfyApp?.loadGraphData) {
                throw new Error('ComfyUI app not accessible');
            }

            // Load workflow into ComfyUI
            const parsedWorkflow = parseWorkflowPayload(workflowData.workflow);
            const clonedWorkflow = cloneForComfy(iframe.contentWindow, parsedWorkflow);
            await comfyApp.loadGraphData(clonedWorkflow);

            notifications.show({
                title: 'Workflow Loaded',
                message: `"${name}" has been loaded`,
                color: 'green',
            });

            setLoadModalOpen(false);
        } catch (error) {
            console.error('Failed to load workflow:', error);
            notifications.show({
                title: 'Load Failed',
                message: 'Could not load workflow',
                color: 'red',
            });
        }
    };

    // Import from Generate tab
    const handleImportFromGenerate = async () => {
        try {
            setHasSeenComfyIntro(true);
            const generatedWorkflow = await swarmClient.getGeneratedWorkflow(params as GenerateParams);
            if (!generatedWorkflow) {
                throw new Error('Failed to generate workflow');
            }

            const iframe = iframeRef.current;
            if (!iframe?.contentWindow) {
                throw new Error('ComfyUI not loaded');
            }

            const comfyApp = (iframe.contentWindow as ComfyIframeWindow | null)?.app;
            if (!comfyApp) {
                throw new Error('ComfyUI app not accessible');
            }

            // Parse and load the generated workflow
            const workflowData = JSON.parse(generatedWorkflow);
            const clonedWorkflow = cloneForComfy(iframe.contentWindow, workflowData);
            if (typeof comfyApp.loadApiJson === 'function') {
                await comfyApp.loadApiJson(clonedWorkflow);
            } else if (typeof comfyApp.loadGraphData === 'function') {
                await comfyApp.loadGraphData(clonedWorkflow);
            } else {
                throw new Error('ComfyUI app cannot load workflows');
            }

            notifications.show({
                title: 'Workflow Imported',
                message: 'Current generation parameters imported as ComfyUI workflow',
                color: 'green',
            });
        } catch (error) {
            console.error('Failed to import workflow:', error);
            notifications.show({
                title: 'Import Failed',
                message: 'Could not import from Generate tab. Make sure you have a model selected.',
                color: 'red',
            });
        }
    };

    // Refresh ComfyUI iframe
    const handleRefresh = () => {
        setIsLoading(true);
        setLoadError(false);
        setLoadErrorMessage('The ComfyUI backend may not be running or is still starting up.');
        reloadComfyIframe();
    };

    const handleRoutingModeChange = (value: string | null) => {
        const nextMode = (value as ComfyRoutingMode) || 'none';
        setRoutingMode(nextMode);
        writeRoutingMode(nextMode);
        setIsLoading(true);
        setLoadError(false);
        setLoadErrorMessage('The ComfyUI backend may not be running or is still starting up.');
        reloadComfyIframe();
    };

    return (
        <Box style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!hasSeenComfyIntro && (
                <Alert
                    variant="light"
                    color="cyan"
                    icon={<IconBook2 size={18} />}
                    title="ComfyUI Editor"
                    withCloseButton
                    onClose={() => setHasSeenComfyIntro(true)}
                >
                    Save or load node graphs, import your current Generate settings, and choose how this editor should route work across backends.
                </Alert>
            )}

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                <ElevatedCard elevation="paper" tone="accent" withBorder>
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Group gap="xs">
                                <ThemeIcon size={34} radius="xl" variant="light" color="cyan">
                                    <IconBrandPython size={18} />
                                </ThemeIcon>
                                <Text fw={700}>Start Here</Text>
                            </Group>
                            <SwarmBadge tone="accent" size="sm">Advanced</SwarmBadge>
                        </Group>
                        <Text size="sm" c="var(--theme-text-secondary)">
                            Open a saved graph, import your Generate settings, or start directly in the embedded editor.
                        </Text>
                        <Group gap="xs" wrap="wrap">
                            <Button variant="light" leftSection={<IconFolderOpen size={16} />} onClick={() => setLoadModalOpen(true)}>
                                Load Saved
                            </Button>
                            <Button variant="light" color="cyan" leftSection={<IconDownload size={16} />} onClick={handleImportFromGenerate}>
                                Import Generate
                            </Button>
                        </Group>
                    </Stack>
                </ElevatedCard>

                <ElevatedCard elevation="paper" tone="neutral" withBorder>
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={700}>Saved Workflows</Text>
                            <SwarmBadge tone="neutral" size="sm">{workflows.length}</SwarmBadge>
                        </Group>
                        {loadingWorkflows ? (
                            <Text size="sm" c="var(--theme-text-secondary)">Loading saved workflows...</Text>
                        ) : recentWorkflows.length > 0 ? (
                            recentWorkflows.map((workflow) => (
                                <Button
                                    key={workflow.name}
                                    variant="subtle"
                                    justify="space-between"
                                    rightSection={<IconArrowRight size={14} />}
                                    onClick={() => handleLoadWorkflow(workflow.name)}
                                >
                                    {workflow.name}
                                </Button>
                            ))
                        ) : (
                            <Text size="sm" c="var(--theme-text-secondary)">
                                No saved workflows yet. Save your current graph to reuse it here.
                            </Text>
                        )}
                    </Stack>
                </ElevatedCard>

                <ElevatedCard elevation="paper" tone="brand" withBorder>
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={700}>Routing Mode</Text>
                            <ThemeIcon size={32} radius="xl" variant="light" color="orange">
                                <IconBolt size={16} />
                            </ThemeIcon>
                        </Group>
                        <Select
                            size="sm"
                            value={routingMode}
                            onChange={handleRoutingModeChange}
                            data={ROUTING_OPTIONS.map((option) => ({
                                value: option.value,
                                label: option.label,
                            }))}
                            aria-label="Comfy backend routing mode"
                        />
                        <Text size="sm" c="var(--theme-text-secondary)">
                            {routingDetails.description}
                        </Text>
                    </Stack>
                </ElevatedCard>
            </SimpleGrid>

            <Paper p="xs" withBorder style={{ flexShrink: 0 }}>
                <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Group gap="xs" wrap="wrap">
                        <Tooltip label="Save Workflow">
                            <Button
                                size="sm"
                                variant="light"
                                leftSection={<IconDeviceFloppy size={16} />}
                                onClick={() => {
                                    setSaveModalOpen(true);
                                    setHasSeenComfyIntro(true);
                                }}
                            >
                                Save
                            </Button>
                        </Tooltip>
                        <Tooltip label="Load Workflow">
                            <Button
                                size="sm"
                                variant="light"
                                leftSection={<IconFolderOpen size={16} />}
                                onClick={() => {
                                    setLoadModalOpen(true);
                                    setHasSeenComfyIntro(true);
                                }}
                            >
                                Load
                            </Button>
                        </Tooltip>
                        <Tooltip label="Import current parameters from Generate tab as ComfyUI workflow">
                            <Button
                                size="sm"
                                variant="light"
                                color="cyan"
                                leftSection={<IconDownload size={16} />}
                                onClick={() => {
                                    setHasSeenComfyIntro(true);
                                    void handleImportFromGenerate();
                                }}
                            >
                                Import From Generate
                            </Button>
                        </Tooltip>
                    </Group>
                    <Group gap="xs" align="center" wrap="wrap">
                        <SwarmBadge tone="neutral" size="sm">
                            {routingDetails.label}
                        </SwarmBadge>
                        <Tooltip label="Refresh ComfyUI">
                            <ActionIcon variant="subtle" onClick={handleRefresh}>
                                <IconRefresh size={18} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>

            <Box style={{ flex: 1, position: 'relative', minHeight: 420 }}>
                <Paper withBorder style={{ height: '100%', overflow: 'hidden' }}>
                    {isLoading && (
                        <Center style={{ position: 'absolute', inset: 0, zIndex: 10, backgroundColor: 'color-mix(in srgb, var(--theme-gray-8) 88%, transparent)' }}>
                            <Stack align="center" gap="md" maw={420}>
                                <Loader size="xl" />
                                <Text fw={600}>Loading ComfyUI workspace</Text>
                                <Text c="dimmed" ta="center">
                                    If this takes more than a few seconds, the backend may still be starting. You can wait or refresh the workspace.
                                </Text>
                                <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={handleRefresh}>
                                    Refresh Workspace
                                </Button>
                            </Stack>
                        </Center>
                    )}

                    {loadError && (
                        <Center style={{ position: 'absolute', inset: 0, zIndex: 11, backgroundColor: 'color-mix(in srgb, var(--theme-gray-9) 82%, transparent)' }}>
                            <Stack align="center" gap="md" maw={460}>
                                <ThemeIcon size={46} radius="xl" color="red" variant="light">
                                    <IconAlertCircle size={24} />
                                </ThemeIcon>
                                <Text size="xl" fw={700}>ComfyUI is not ready</Text>
                                <Text c="dimmed" ta="center">{loadErrorMessage}</Text>
                                <Text size="sm" c="dimmed" ta="center">
                                    Next steps: confirm the Comfy backend is running, try reloading the workspace, or open a saved workflow after the backend finishes booting.
                                </Text>
                                <Group gap="xs">
                                    <Button onClick={handleRefresh} leftSection={<IconRefresh size={16} />}>
                                        Try Again
                                    </Button>
                                    <Button variant="light" onClick={() => setLoadModalOpen(true)} leftSection={<IconFolderOpen size={16} />}>
                                        Browse Saved Workflows
                                    </Button>
                                </Group>
                            </Stack>
                        </Center>
                    )}

                    <iframe
                        ref={iframeRef}
                        src={iframeSrc}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            display: loadError ? 'none' : 'block',
                            minHeight: 420,
                        }}
                        title="ComfyUI Editor"
                        onLoad={handleIframeLoad}
                        onError={handleIframeError}
                    />
                </Paper>
            </Box>

            {/* Save Modal */}
            <Modal
                opened={saveModalOpen}
                onClose={() => setSaveModalOpen(false)}
                title="Save Workflow"
            >
                <Stack gap="md">
                    <TextInput
                        label="Workflow Name"
                        placeholder="My Custom Workflow"
                        value={workflowName}
                        onChange={(e) => setWorkflowName(e.currentTarget.value)}
                        required
                    />
                    <Textarea
                        label="Description (optional)"
                        placeholder="Describe what this workflow does..."
                        value={workflowDescription}
                        onChange={(e) => setWorkflowDescription(e.currentTarget.value)}
                        minRows={2}
                    />
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setSaveModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} leftSection={<IconCheck size={16} />}>
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Load Modal */}
            <Modal
                opened={loadModalOpen}
                onClose={() => setLoadModalOpen(false)}
                title="Load Workflow"
                size="lg"
            >
                <Stack gap="md">
                    {loadingWorkflows ? (
                        <Center py="xl">
                            <Loader />
                        </Center>
                    ) : workflows.length === 0 ? (
                        <Text c="dimmed" ta="center" py="xl">
                            No saved workflows found
                        </Text>
                    ) : (
                        <ScrollArea h={400}>
                            <Stack gap="xs">
                                {workflows.map((wf) => (
                                    <Card
                                        key={wf.name}
                                        withBorder
                                        padding="sm"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => handleLoadWorkflow(wf.name)}
                                    >
                                        <Group justify="space-between">
                                            <Stack gap={4}>
                                                <Text fw={500}>{wf.name}</Text>
                                                {wf.description && (
                                                    <Text size="xs" c="dimmed" lineClamp={1}>
                                                        {wf.description}
                                                    </Text>
                                                )}
                                            </Stack>
                                            <Group gap="xs">
                                                {wf.enable_in_simple && (
                                                    <Badge size="sm" variant="light">
                                                        Simple
                                                    </Badge>
                                                )}
                                                <ActionIcon variant="subtle" color="green">
                                                    <IconPlayerPlay size={16} />
                                                </ActionIcon>
                                            </Group>
                                        </Group>
                                    </Card>
                                ))}
                            </Stack>
                        </ScrollArea>
                    )}
                    <Button
                        variant="subtle"
                        onClick={() => setLoadModalOpen(false)}
                        fullWidth
                    >
                        <IconX size={16} style={{ marginRight: 8 }} />
                        Close
                    </Button>
                </Stack>
            </Modal>
        </Box>
    );
}
