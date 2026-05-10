import {
    Badge,
    Box,
    Card,
    Divider,
    Group,
    Menu,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconBookmark,
    IconChevronDown,
    IconDeviceFloppy,
    IconRestore,
    IconSparkles,
    IconX,
} from '@tabler/icons-react';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';
import type { GenerationIssue, GenerationRecipe, WorkspaceSnapshot } from '../../../features/generation/productTypes';
import { SwarmButton } from '../../../components/ui';

interface WorkspaceExperiencePanelProps {
    mode: GenerateWorkspaceMode;
    onModeChange: (mode: GenerateWorkspaceMode) => void;
    recipes: GenerationRecipe[];
    activeRecipeId: string | null;
    onApplyRecipe: (recipeId: string | null) => void;
    onSaveRecipe: () => void;
    onPromoteWorkflow: () => void;
    lastSnapshot: WorkspaceSnapshot | null;
    onRestoreSnapshot: () => void;
    issues: GenerationIssue[];
    selectedModel: string;
    backendCount: number;
    diffCount: number;
}

export function WorkspaceExperiencePanel({
    mode,
    onModeChange,
    recipes,
    activeRecipeId,
    onApplyRecipe,
    onSaveRecipe,
    onPromoteWorkflow,
    lastSnapshot,
    onRestoreSnapshot,
    issues,
    selectedModel,
    backendCount,
    diffCount,
}: WorkspaceExperiencePanelProps) {
    const activeRecipe = recipes.find((recipe) => recipe.id === activeRecipeId) ?? null;
    const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
    const warningIssues = issues.filter((issue) => issue.severity === 'warning');
    const helperBadges = [
        ...blockingIssues.map((issue) => ({ key: issue.id, color: 'red', label: issue.message })),
        ...warningIssues.map((issue) => ({ key: issue.id, color: 'yellow', label: issue.message })),
    ];

    return (
        <Stack gap={0} pb={6}>
            <Card withBorder radius="md" shadow="sm" className="generate-workspace-bar">
                <Stack gap={6}>
                    <Group justify="space-between" align="center" wrap="wrap" gap="sm" className="generate-workspace-bar__top">
                        <Group gap="sm" wrap="wrap" className="generate-workspace-bar__identity">
                            <Group gap="xs" wrap="nowrap">
                                <IconSparkles size={16} />
                                <Text fw={700}>Workspace</Text>
                            </Group>
                            <Box className="generate-workspace-bar__mode">
                                <SegmentedControl
                                    value={mode}
                                    onChange={(value) => onModeChange(value as GenerateWorkspaceMode)}
                                    size="xs"
                                    data={[
                                        { value: 'quick', label: 'Quick' },
                                        { value: 'guided', label: 'Guided' },
                                        { value: 'advanced', label: 'Advanced' },
                                        { value: 'video', label: 'Video' },
                                    ]}
                                />
                            </Box>
                            <Group gap="xs" wrap="wrap" className="generate-workspace-bar__status">
                                <Badge variant="light" color="blue">{backendCount} backends tracked</Badge>
                                {selectedModel ? <Badge variant="light" color="gray">{selectedModel}</Badge> : null}
                                {activeRecipe ? (
                                    <Badge color={diffCount > 0 ? 'grape' : 'teal'} variant="light">
                                        {activeRecipe.name}{diffCount > 0 ? ` (${diffCount} diffs)` : ''}
                                    </Badge>
                                ) : null}
                            </Group>
                        </Group>

                        <Group gap="sm" wrap="wrap" className="generate-workspace-bar__actions">
                            <SwarmButton
                                tone="secondary"
                                emphasis="soft"
                                leftSection={<IconRestore size={14} />}
                                onClick={onRestoreSnapshot}
                                disabled={!lastSnapshot}
                            >
                                Restore Session
                            </SwarmButton>
                            <SwarmButton tone="secondary" emphasis="soft" onClick={onPromoteWorkflow}>
                                Send To Workflow
                            </SwarmButton>
                            <Menu shadow="md" position="bottom-end" width={260} withinPortal>
                                <Menu.Target>
                                    <SwarmButton
                                        tone={activeRecipe ? 'primary' : 'secondary'}
                                        emphasis={activeRecipe ? 'soft' : 'ghost'}
                                        size="xs"
                                        leftSection={<IconBookmark size={14} />}
                                        rightSection={<IconChevronDown size={12} />}
                                    >
                                        Recipe
                                    </SwarmButton>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Label>Recipe Actions</Menu.Label>
                                    <Menu.Item leftSection={<IconDeviceFloppy size={14} />} onClick={onSaveRecipe}>
                                        Save current recipe
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={<IconX size={14} />}
                                        onClick={() => onApplyRecipe(null)}
                                        disabled={!activeRecipe}
                                    >
                                        Clear active recipe
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Label>Saved Recipes</Menu.Label>
                                    {recipes.length > 0 ? recipes.map((recipe) => (
                                        <Menu.Item
                                            key={recipe.id}
                                            leftSection={<IconBookmark size={14} />}
                                            onClick={() => onApplyRecipe(recipe.id)}
                                            color={recipe.id === activeRecipeId ? 'teal' : undefined}
                                        >
                                            {recipe.name}
                                        </Menu.Item>
                                    )) : (
                                        <Menu.Item disabled>No saved recipes</Menu.Item>
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                    </Group>

                    {helperBadges.length > 0 ? (
                        <>
                            <Divider opacity={0.4} />
                            <Group gap="xs" wrap="wrap">
                                {helperBadges.map((badge) => (
                                    <Badge key={badge.key} color={badge.color} variant="light">
                                        {badge.label}
                                    </Badge>
                                ))}
                            </Group>
                        </>
                    ) : null}
                </Stack>
            </Card>
        </Stack>
    );
}
