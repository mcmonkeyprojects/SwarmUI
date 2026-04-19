import { useEffect, useMemo } from 'react';
import {
    Box,
    Grid,
    Group,
    SegmentedControl,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine/core';
import {
    IconArrowRight,
    IconBrandPython,
    IconClockHour4,
    IconRoute2,
    IconTargetArrow,
    IconWand,
} from '@tabler/icons-react';
import { ComfyUIView } from '../components/ComfyUIView';
import { WizardWorkflow, getWizardTemplateMeta } from '../components/WizardWorkflow';
import { PageScaffold } from '../components/layout/PageScaffold';
import { ElevatedCard, SectionHero, StatusTimeline, SwarmBadge, SwarmButton as Button, type StatusTimelineStep } from '../components/ui';
import { useWorkflowWorkspaceStore, type WorkflowWorkspaceMode } from '../stores/workflowWorkspaceStore';
import type { WorkflowRouteState } from '../stores/navigationStore';
import { useNavigationStore } from '../stores/navigationStore';

interface WorkspaceDescriptor {
    mode: WorkflowWorkspaceMode;
    title: string;
    subtitle: string;
    bestFor: string;
    tone: 'brand' | 'accent';
    bullets: string[];
    actionLabel: string;
    icon: React.ReactNode;
}

const WORKSPACE_DESCRIPTORS: WorkspaceDescriptor[] = [
    {
        mode: 'wizard',
        title: 'Guided Wizard',
        subtitle: 'Queue-first setup for the most common image workflows.',
        bestFor: 'Fast starts, clearer guardrails, and repeatable runs.',
        tone: 'brand',
        bullets: [
            'Choose a workflow by goal, not by node graph.',
            'Review model, prompt, size, and source image in one place.',
            'Queue-ready flow with less setup overhead.',
        ],
        actionLabel: 'Open Guided Wizard',
        icon: <IconWand size={18} />,
    },
    {
        mode: 'comfy',
        title: 'ComfyUI Editor',
        subtitle: 'Full node editing with save/load/import and backend routing.',
        bestFor: 'Advanced graph control and direct ComfyUI workflows.',
        tone: 'accent',
        bullets: [
            'Edit nodes directly inside the embedded ComfyUI workspace.',
            'Import your current Generate setup as a starting graph.',
            'Choose how workflow execution should route across backends.',
        ],
        actionLabel: 'Open ComfyUI Editor',
        icon: <IconBrandPython size={18} />,
    },
];

interface WorkflowPageProps {
    routeState?: WorkflowRouteState;
}

export function WorkflowPage({ routeState }: WorkflowPageProps) {
    const { lastWorkflowMode, lastWizardTemplate, setLastWorkflowMode } = useWorkflowWorkspaceStore();
    const navigateToWorkflows = useNavigationStore((state) => state.navigateToWorkflows);
    const mode = routeState?.mode ?? lastWorkflowMode;

    const lastTemplateMeta = useMemo(
        () => (lastWizardTemplate ? getWizardTemplateMeta(lastWizardTemplate) : null),
        [lastWizardTemplate]
    );

    const setActiveMode = (nextMode: WorkflowWorkspaceMode) => {
        if (nextMode === mode) {
            return;
        }
        setLastWorkflowMode(nextMode);
        navigateToWorkflows({ mode: nextMode });
    };

    useEffect(() => {
        if (routeState?.mode && routeState.mode !== lastWorkflowMode) {
            setLastWorkflowMode(routeState.mode);
        }
    }, [lastWorkflowMode, routeState?.mode, setLastWorkflowMode]);

    const activeDescriptor = WORKSPACE_DESCRIPTORS.find((item) => item.mode === mode) ?? WORKSPACE_DESCRIPTORS[0];
    const inactiveDescriptor = WORKSPACE_DESCRIPTORS.find((item) => item.mode !== mode) ?? WORKSPACE_DESCRIPTORS[1];

    const timeline: StatusTimelineStep[] = mode === 'wizard'
        ? [
            { label: 'Choose Workspace', state: 'complete' },
            { label: 'Configure Guided Run', state: 'active' },
            { label: 'Queue Generation', state: 'pending' },
        ]
        : [
            { label: 'Choose Workspace', state: 'complete' },
            { label: 'Prepare ComfyUI Session', state: 'active' },
            { label: 'Edit And Execute', state: 'pending' },
        ];

    return (
        <PageScaffold
            density="compact"
            header={
                <SectionHero
                    className="fx-reveal fx-gradient-sweep"
                    variant="subtle"
                    title="Workflow Workspaces"
                    subtitle="Choose the right workflow surface for the job, then continue where you left off."
                    icon={<IconRoute2 size={18} color="var(--theme-accent-2)" className="fx-icon-float" />}
                    badges={[
                        {
                            label: mode === 'wizard' ? 'Guided Wizard Active' : 'ComfyUI Editor Active',
                            color: mode === 'wizard' ? 'invokeBrand' : 'cyan',
                        },
                        ...(lastTemplateMeta
                            ? [{ label: `Last Guided Template: ${lastTemplateMeta.name}`, color: 'gray' }]
                            : []),
                    ]}
                    callout={<StatusTimeline steps={timeline} className="fx-reveal" />}
                />
            }
        >
            <Box style={{ overflow: 'auto', flex: 1, minHeight: 0, padding: '12px 0 0' }}>
                <Stack gap="md" pb="md">
                    <Grid gutter="md">
                        {WORKSPACE_DESCRIPTORS.map((workspace) => {
                            const isActive = workspace.mode === mode;
                            const lastContext = workspace.mode === 'wizard'
                                ? lastTemplateMeta
                                    ? `Continue with ${lastTemplateMeta.name}`
                                    : 'Start with a guided template'
                                : lastWorkflowMode === 'comfy'
                                    ? 'Return to your last ComfyUI session'
                                    : 'Open the advanced editor when you need direct graph control';

                            return (
                                <Grid.Col key={workspace.mode} span={{ base: 12, md: 6 }}>
                                    <ElevatedCard
                                        elevation={isActive ? 'raised' : 'paper'}
                                        tone={workspace.tone}
                                        interactive
                                        style={{
                                            height: '100%',
                                            borderColor: isActive
                                                ? 'color-mix(in srgb, var(--theme-brand) 55%, var(--theme-gray-5))'
                                                : undefined,
                                        }}
                                    >
                                        <Stack gap="md" style={{ height: '100%' }}>
                                            <Group justify="space-between" align="flex-start">
                                                <Group align="flex-start" gap="sm">
                                                    <ThemeIcon
                                                        size={42}
                                                        radius="xl"
                                                        variant="light"
                                                        color={workspace.mode === 'wizard' ? 'invokeBrand' : 'cyan'}
                                                    >
                                                        {workspace.icon}
                                                    </ThemeIcon>
                                                    <Stack gap={2}>
                                                        <Group gap="xs">
                                                            <Text fw={700} size="lg">
                                                                {workspace.title}
                                                            </Text>
                                                            {isActive && (
                                                                <SwarmBadge tone={workspace.mode === 'wizard' ? 'primary' : 'info'} size="sm">
                                                                    Current
                                                                </SwarmBadge>
                                                            )}
                                                        </Group>
                                                        <Text c="var(--theme-text-secondary)" size="sm">
                                                            {workspace.subtitle}
                                                        </Text>
                                                    </Stack>
                                                </Group>
                                                <ThemeIcon
                                                    size={34}
                                                    radius="xl"
                                                    variant="light"
                                                    color={workspace.mode === 'wizard' ? 'orange' : 'grape'}
                                                >
                                                    <IconTargetArrow size={16} />
                                                </ThemeIcon>
                                            </Group>

                                            <ElevatedCard elevation="floor" tone="neutral" withBorder>
                                                <Stack gap={4}>
                                                    <Text size="xs" tt="uppercase" fw={700} c="var(--theme-text-secondary)">
                                                        Best For
                                                    </Text>
                                                    <Text size="sm">{workspace.bestFor}</Text>
                                                    <Group gap="xs" mt={6}>
                                                        <IconClockHour4 size={14} color="var(--theme-text-secondary)" />
                                                        <Text size="xs" c="var(--theme-text-secondary)">
                                                            {lastContext}
                                                        </Text>
                                                    </Group>
                                                </Stack>
                                            </ElevatedCard>

                                            <Stack gap="xs" style={{ flex: 1 }}>
                                                {workspace.bullets.map((bullet) => (
                                                    <Group key={bullet} align="flex-start" gap="xs" wrap="nowrap">
                                                        <Text c="var(--theme-brand)" fw={700}>*</Text>
                                                        <Text size="sm" c="var(--theme-text-secondary)">
                                                            {bullet}
                                                        </Text>
                                                    </Group>
                                                ))}
                                            </Stack>

                                            <Group justify="space-between" align="center">
                                                <Text size="xs" c="var(--theme-text-secondary)">
                                                    {workspace.mode === 'wizard' && lastTemplateMeta
                                                        ? `Last guided template: ${lastTemplateMeta.name}`
                                                        : workspace.mode === 'comfy'
                                                            ? 'Includes save, load, import, and routing controls.'
                                                            : 'Includes review, source image handling, and queue flow.'}
                                                </Text>
                                                <Button
                                                    variant={isActive ? 'filled' : 'light'}
                                                    color={workspace.mode === 'wizard' ? 'invokeBrand' : 'cyan'}
                                                    rightSection={<IconArrowRight size={16} />}
                                                    onClick={() => setActiveMode(workspace.mode)}
                                                >
                                                    {isActive ? 'Continue' : workspace.actionLabel}
                                                </Button>
                                            </Group>
                                        </Stack>
                                    </ElevatedCard>
                                </Grid.Col>
                            );
                        })}
                    </Grid>

                    <ElevatedCard elevation="paper" tone={activeDescriptor.tone} withBorder>
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start" wrap="wrap">
                                <Stack gap={4}>
                                    <Group gap="xs">
                                        <Text size="lg" fw={700}>
                                            {activeDescriptor.title}
                                        </Text>
                                        <SwarmBadge tone={activeDescriptor.mode === 'wizard' ? 'primary' : 'info'} size="sm">
                                            Active Workspace
                                        </SwarmBadge>
                                    </Group>
                                    <Text size="sm" c="var(--theme-text-secondary)">
                                        {activeDescriptor.bestFor}
                                    </Text>
                                </Stack>

                                <SegmentedControl
                                    value={mode}
                                    onChange={(value) => setActiveMode(value as WorkflowWorkspaceMode)}
                                    data={[
                                        { value: 'wizard', label: 'Guided Wizard' },
                                        { value: 'comfy', label: 'ComfyUI Editor' },
                                    ]}
                                />
                            </Group>

                            <Box
                                style={{
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    minHeight: 420,
                                    background: 'color-mix(in srgb, var(--theme-gray-8) 85%, transparent)',
                                }}
                            >
                                <Box style={{ display: mode === 'wizard' ? 'block' : 'none', height: '100%' }}>
                                    <Box p="md" style={{ height: '100%', overflow: 'auto' }}>
                                        <WizardWorkflow />
                                    </Box>
                                </Box>
                                <Box style={{ display: mode === 'comfy' ? 'block' : 'none', height: '100%' }}>
                                    <ComfyUIView />
                                </Box>
                            </Box>
                        </Stack>
                    </ElevatedCard>

                    <ElevatedCard elevation="paper" tone={inactiveDescriptor.tone} withBorder>
                        <Group justify="space-between" align="center" wrap="wrap">
                            <Stack gap={2}>
                                <Text fw={600}>{inactiveDescriptor.title}</Text>
                                <Text size="sm" c="var(--theme-text-secondary)">
                                    {inactiveDescriptor.subtitle}
                                </Text>
                            </Stack>
                            <Button
                                variant="subtle"
                                color={inactiveDescriptor.mode === 'wizard' ? 'invokeBrand' : 'cyan'}
                                rightSection={<IconArrowRight size={16} />}
                                onClick={() => setActiveMode(inactiveDescriptor.mode)}
                            >
                                Switch To {inactiveDescriptor.title}
                            </Button>
                        </Group>
                    </ElevatedCard>
                </Stack>
            </Box>
        </PageScaffold>
    );
}
