import { useMemo, useState } from 'react';
import {
    Badge,
    Group,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDatabase, IconPhoto, IconSparkles } from '@tabler/icons-react';
import { useCreativeWorkspaceStore } from '../../stores/creativeWorkspaceStore';
import { ElevatedCard, SwarmButton } from '../../components/ui';

/**
 * Project-aware dataset planning surface for future Kohya training integration.
 */
export function KohyaTrainerTab() {
    const [datasetName, setDatasetName] = useState('');
    const [baseModel, setBaseModel] = useState('');
    const [triggerWords, setTriggerWords] = useState('');
    const [captionDraft, setCaptionDraft] = useState('');
    const {
        projects,
        activeProjectId,
        reviewSets,
        trainingDatasets,
        createTrainingDataset,
        addItemsToTrainingDataset,
        setActiveProject,
    } = useCreativeWorkspaceStore();

    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
    const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
    const candidateReviewItems = useMemo(
        () => reviewSets
            .filter((reviewSet) => !activeProjectId || reviewSet.projectId === activeProjectId)
            .flatMap((reviewSet) => reviewSet.items)
            .filter((item) => item.state === 'dataset-candidate' || item.state === 'shortlisted'),
        [activeProjectId, reviewSets]
    );
    const activeProjectDatasets = trainingDatasets.filter((dataset) => dataset.projectId === activeProjectId);

    const handleCreateDataset = () => {
        const name = datasetName.trim() || `${activeProject?.name ?? 'Project'} Dataset`;
        createTrainingDataset({
            name,
            projectId: activeProjectId,
            baseModel: baseModel.trim() || undefined,
            triggerWords: triggerWords
                .split(',')
                .map((word) => word.trim())
                .filter(Boolean),
            items: candidateReviewItems.map((item) => ({
                imageSrc: item.imageSrc,
                caption: captionDraft.trim() || item.note || item.provenance?.prompt || '',
                state: captionDraft.trim() ? 'include' : 'caption-needed',
                provenance: {
                    ...item.provenance,
                    source: 'training',
                    trainingDatasetId: null,
                    capturedAt: Date.now(),
                },
            })),
        });
        setDatasetName('');
        setCaptionDraft('');
        notifications.show({
            title: 'Dataset Created',
            message: `${candidateReviewItems.length} candidate image(s) added to ${name}.`,
            color: 'teal',
        });
    };

    const handleAppendCandidates = (datasetId: string) => {
        addItemsToTrainingDataset(
            datasetId,
            candidateReviewItems.map((item) => ({
                imageSrc: item.imageSrc,
                caption: captionDraft.trim() || item.note || item.provenance?.prompt || '',
                state: captionDraft.trim() ? 'include' : 'caption-needed',
                provenance: {
                    ...item.provenance,
                    source: 'training',
                    trainingDatasetId: datasetId,
                    capturedAt: Date.now(),
                },
            }))
        );
        notifications.show({
            title: 'Dataset Updated',
            message: `${candidateReviewItems.length} candidate image(s) appended.`,
            color: 'teal',
        });
    };

    return (
        <Stack gap="md" p="md">
            <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                    <Text size="lg" fw={700}>Training Dataset Planner</Text>
                    <Text size="sm" c="dimmed">
                        Build project-aware LoRA dataset candidates from History review sets before launching backend training.
                    </Text>
                </Stack>
                <Badge variant="light">{candidateReviewItems.length} candidates</Badge>
            </Group>

            <ElevatedCard elevation="floor">
                <Stack gap="sm">
                    <Select
                        label="Project"
                        value={activeProjectId}
                        data={projectOptions}
                        onChange={setActiveProject}
                        placeholder="Choose a project"
                        searchable
                    />
                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                        <TextInput
                            label="Dataset name"
                            value={datasetName}
                            onChange={(event) => setDatasetName(event.currentTarget.value)}
                            placeholder={activeProject ? `${activeProject.name} Dataset` : 'Training Dataset'}
                        />
                        <TextInput
                            label="Base model"
                            value={baseModel}
                            onChange={(event) => setBaseModel(event.currentTarget.value)}
                            placeholder="Optional base model"
                        />
                        <TextInput
                            label="Trigger words"
                            value={triggerWords}
                            onChange={(event) => setTriggerWords(event.currentTarget.value)}
                            placeholder="comma, separated, triggers"
                        />
                    </SimpleGrid>
                    <Textarea
                        label="Caption assist seed"
                        description="Used as a fallback caption for selected review candidates."
                        value={captionDraft}
                        onChange={(event) => setCaptionDraft(event.currentTarget.value)}
                        minRows={3}
                        autosize
                    />
                    <Group justify="flex-end">
                        <SwarmButton
                            tone="brand"
                            emphasis="solid"
                            leftSection={<IconDatabase size={14} />}
                            onClick={handleCreateDataset}
                            disabled={candidateReviewItems.length === 0}
                        >
                            Create Dataset
                        </SwarmButton>
                    </Group>
                </Stack>
            </ElevatedCard>

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={700}>Candidate Review Items</Text>
                            <IconPhoto size={18} />
                        </Group>
                        {candidateReviewItems.slice(0, 12).map((item) => (
                            <Group key={item.id} justify="space-between" wrap="nowrap">
                                <Text size="sm" lineClamp={1}>{item.imageSrc}</Text>
                                <Badge size="xs" variant="outline">{item.state}</Badge>
                            </Group>
                        ))}
                        {candidateReviewItems.length === 0 ? (
                            <Text size="sm" c="dimmed">
                                Mark images as shortlisted or dataset candidates from History review sets.
                            </Text>
                        ) : null}
                    </Stack>
                </ElevatedCard>

                <ElevatedCard elevation="floor">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={700}>Project Datasets</Text>
                            <IconSparkles size={18} />
                        </Group>
                        {activeProjectDatasets.map((dataset) => (
                            <ElevatedCard key={dataset.id} elevation="paper">
                                <Group justify="space-between" align="flex-start">
                                    <Stack gap={2}>
                                        <Text fw={700}>{dataset.name}</Text>
                                        <Text size="xs" c="dimmed">
                                            {dataset.items.length} images · {dataset.triggerWords.join(', ') || 'no triggers'}
                                        </Text>
                                    </Stack>
                                    <SwarmButton
                                        size="xs"
                                        tone="secondary"
                                        emphasis="soft"
                                        onClick={() => handleAppendCandidates(dataset.id)}
                                        disabled={candidateReviewItems.length === 0}
                                    >
                                        Append
                                    </SwarmButton>
                                </Group>
                            </ElevatedCard>
                        ))}
                        {activeProjectDatasets.length === 0 ? (
                            <Text size="sm" c="dimmed">
                                No datasets for the active project yet.
                            </Text>
                        ) : null}
                    </Stack>
                </ElevatedCard>
            </SimpleGrid>
        </Stack>
    );
}
