import { useMemo, useState } from 'react';
import {
  Badge,
  Group,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconFolderPlus,
  IconLink,
  IconSparkles,
} from '@tabler/icons-react';
import { useGenerationStore } from '../../store/generationStore';
import { useNavigationStore } from '../../stores/navigationStore';
import { useCreativeWorkspaceStore } from '../../stores/creativeWorkspaceStore';
import { useQueueJobs, useQueueStore } from '../../stores/queue';
import { useRoleplayStore } from '../../stores/roleplayStore';
import {
  PROJECT_TEMPLATE_LABELS,
  type ProjectTemplateId,
} from '../../features/creativeWorkspace/types';
import { buildRoleplaySceneBrief } from '../../features/creativeWorkspace/sceneBriefs';
import { ElevatedCard, SwarmButton } from '../ui';

interface ProjectWorkspaceModalProps {
  opened: boolean;
  onClose: () => void;
}

const TEMPLATE_OPTIONS: ProjectTemplateId[] = [
  'blank',
  'portrait-pack',
  'roleplay-campaign',
  'lora-training-set',
  'model-comparison',
  'video-storyboard',
];

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function ProjectWorkspaceModal({ opened, onClose }: ProjectWorkspaceModalProps) {
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplateId>('blank');
  const route = useNavigationStore((state) => state.route);
  const generationParams = useGenerationStore((state) => state.params);
  const generationModel = useGenerationStore((state) => state.selectedModel);
  const selectedQueueJobs = useQueueStore((state) => state.selectedJobs);
  const queueJobs = useQueueJobs();
  const roleplayState = useRoleplayStore();
  const {
    projects,
    activeProjectId,
    reviewSets,
    runMatrices,
    assetPacks,
    sceneBriefs,
    trainingDatasets,
    createProject,
    createProjectFromTemplate,
    setActiveProject,
    ensureActiveProject,
    updateProjectNotes,
    addItemToProject,
    capturePromptSnippet,
    saveSceneBrief,
  } = useCreativeWorkspaceStore();

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeCharacter = roleplayState.getActiveCharacter();
  const activeSession = roleplayState.getActiveSession();
  const activePersona = roleplayState.getActivePersona();
  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  const activeProjectReviewSets = reviewSets.filter((reviewSet) => reviewSet.projectId === activeProjectId);
  const activeProjectSceneBriefs = sceneBriefs.filter((brief) => brief.projectId === activeProjectId);
  const activeProjectDatasets = trainingDatasets.filter((dataset) => dataset.projectId === activeProjectId);
  const activeProjectAssetPacks = assetPacks.filter((pack) => pack.projectId === activeProjectId);
  const activeProjectMatrices = runMatrices.filter((matrix) => matrix.projectId === activeProjectId);
  const selectedQueueJobModels = useMemo(
    () => selectedQueueJobs
      .map((id) => queueJobs.find((job) => job.id === id))
      .filter((job): job is (typeof queueJobs)[number] => Boolean(job)),
    [queueJobs, selectedQueueJobs]
  );

  const handleCreateProject = () => {
    const id = newProjectName.trim()
      ? createProject({
          name: newProjectName.trim(),
          templateId: selectedTemplate,
        })
      : createProjectFromTemplate(selectedTemplate);
    setNewProjectName('');
    setActiveProject(id);
  };

  const handleCaptureCurrentPage = () => {
    const projectId = ensureActiveProject();
    const now = Date.now();

    if (route.page === 'generate') {
      const prompt = String(generationParams.prompt || '').trim();
      if (!prompt) {
        notifications.show({
          title: 'No Prompt To Capture',
          message: 'The Generate prompt is empty.',
          color: 'orange',
        });
        return;
      }
      capturePromptSnippet(projectId, {
        label: `Generate prompt ${formatDate(now)}`,
        prompt,
        negativePrompt: String(generationParams.negativeprompt || ''),
        provenance: {
          source: 'generate',
          projectId,
          prompt,
          negativePrompt: String(generationParams.negativeprompt || ''),
          model: String(generationParams.model || generationModel || ''),
          capturedAt: now,
        },
      });
      addItemToProject(projectId, {
        kind: 'prompt',
        label: prompt.slice(0, 80),
        refId: `prompt-${now}`,
        provenance: {
          source: 'generate',
          projectId,
          prompt,
          model: String(generationParams.model || generationModel || ''),
          capturedAt: now,
        },
      });
      notifications.show({ title: 'Prompt Captured', message: 'Generate prompt added to project.', color: 'teal' });
      return;
    }

    if (route.page === 'roleplay' && activeCharacter && activeSession) {
      addItemToProject(projectId, {
        kind: 'roleplay-character',
        label: activeCharacter.name,
        refId: activeCharacter.id,
        preview: activeCharacter.avatar,
        provenance: {
          source: 'roleplay',
          projectId,
          roleplayCharacterId: activeCharacter.id,
          roleplayCharacterName: activeCharacter.name,
          roleplaySessionId: activeSession.id,
          capturedAt: now,
        },
      });
      const brief = buildRoleplaySceneBrief({
        character: activeCharacter,
        session: activeSession,
        persona: activePersona,
        model: activeCharacter.imageModelId || generationModel,
        width: roleplayState.imageWidth,
        height: roleplayState.imageHeight,
        steps: roleplayState.imageSteps,
        cfgscale: roleplayState.imageCfgScale,
        clipstopatlayer: roleplayState.imageClipStopAtLayer,
        projectId,
      });
      saveSceneBrief(brief, projectId);
      notifications.show({ title: 'Roleplay Captured', message: 'Character and scene brief added.', color: 'teal' });
      return;
    }

    if (route.page === 'queue' && selectedQueueJobModels.length > 0) {
      for (const job of selectedQueueJobModels) {
        addItemToProject(projectId, {
          kind: 'queue-job',
          label: job.name || job.params.prompt?.slice(0, 80) || job.id,
          refId: job.id,
          provenance: {
            source: 'queue',
            projectId,
            prompt: job.params.prompt,
            model: job.params.model,
            queueJobId: job.id,
            queueBatchId: job.batchId ?? null,
            capturedAt: now,
          },
        });
      }
      notifications.show({
        title: 'Queue Jobs Captured',
        message: `${selectedQueueJobModels.length} selected job(s) added to project.`,
        color: 'teal',
      });
      return;
    }

    addItemToProject(projectId, {
      kind: route.page === 'workflows' ? 'workflow' : 'prompt',
      label: `${route.page} context ${formatDate(now)}`,
      refId: `${route.page}-${now}`,
      provenance: {
        source: route.page === 'workflows'
          ? 'workflow'
          : route.page === 'history'
            ? 'history'
            : route.page === 'queue'
              ? 'queue'
              : route.page === 'roleplay'
                ? 'roleplay'
                : 'generate',
        projectId,
        capturedAt: now,
      },
    });
    notifications.show({ title: 'Context Captured', message: `${route.page} context added to project.`, color: 'teal' });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Creative Projects"
      size="90%"
      centered
      overlayProps={{ backgroundOpacity: 0.45, blur: 8 }}
    >
      <Stack gap="md">
        <Group align="end" wrap="wrap">
          <TextInput
            label="New project"
            placeholder={PROJECT_TEMPLATE_LABELS[selectedTemplate]}
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <Select
            label="Template"
            value={selectedTemplate}
            data={TEMPLATE_OPTIONS.map((value) => ({
              value,
              label: PROJECT_TEMPLATE_LABELS[value],
            }))}
            onChange={(value) => setSelectedTemplate((value ?? 'blank') as ProjectTemplateId)}
            allowDeselect={false}
            style={{ minWidth: 220 }}
          />
          <SwarmButton tone="brand" emphasis="solid" leftSection={<IconFolderPlus size={14} />} onClick={handleCreateProject}>
            Create
          </SwarmButton>
        </Group>

        <Group align="end" wrap="wrap">
          <Select
            label="Active project"
            value={activeProjectId}
            data={projectOptions}
            onChange={setActiveProject}
            placeholder="Choose a project"
            searchable
            style={{ minWidth: 260 }}
          />
          <SwarmButton tone="primary" emphasis="soft" leftSection={<IconLink size={14} />} onClick={handleCaptureCurrentPage}>
            Capture Current Page
          </SwarmButton>
        </Group>

        {activeProject ? (
          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
            <ElevatedCard elevation="raised" tone="brand">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Text size="xl" fw={800}>{activeProject.name}</Text>
                    <Text size="sm" c="dimmed">{activeProject.description}</Text>
                  </Stack>
                  <Badge variant="filled">{PROJECT_TEMPLATE_LABELS[activeProject.templateId]}</Badge>
                </Group>
                <SimpleGrid cols={2} spacing="xs">
                  <Stat label="Links" value={activeProject.linkedItems.length} />
                  <Stat label="Prompts" value={activeProject.promptSnippets.length} />
                  <Stat label="Review Sets" value={activeProjectReviewSets.length} />
                  <Stat label="Scene Briefs" value={activeProjectSceneBriefs.length} />
                  <Stat label="Asset Packs" value={activeProjectAssetPacks.length} />
                  <Stat label="Datasets" value={activeProjectDatasets.length} />
                </SimpleGrid>
                <Textarea
                  label="Project notes"
                  value={activeProject.notes}
                  onChange={(event) => updateProjectNotes(activeProject.id, event.currentTarget.value)}
                  minRows={5}
                  autosize
                />
              </Stack>
            </ElevatedCard>

            <ElevatedCard elevation="floor">
              <Stack gap="xs">
                <Text fw={700}>Timeline</Text>
                <ScrollArea.Autosize mah={420}>
                  <Stack gap="xs">
                    {activeProject.linkedItems.slice(0, 30).map((item) => (
                      <ElevatedCard key={item.id} elevation="paper">
                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                          <Stack gap={2} style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>{item.label}</Text>
                            <Text size="xs" c="dimmed">{item.kind} - {formatDate(item.createdAt)}</Text>
                          </Stack>
                          <Badge size="xs" variant="outline">{item.provenance?.source ?? 'manual'}</Badge>
                        </Group>
                      </ElevatedCard>
                    ))}
                    {activeProject.linkedItems.length === 0 ? (
                      <Text size="sm" c="dimmed">Capture a page or add review sets to start the project timeline.</Text>
                    ) : null}
                  </Stack>
                </ScrollArea.Autosize>
              </Stack>
            </ElevatedCard>

            <ElevatedCard elevation="floor">
              <Stack gap="xs">
                <Text fw={700}>Next Actions</Text>
                <ActionLine label="Review" value={`${activeProjectReviewSets.reduce((sum, set) => sum + set.items.length, 0)} review images`} />
                <ActionLine label="Scene" value={`${activeProjectSceneBriefs.length} saved briefs`} />
                <ActionLine label="Queue" value={`${activeProjectMatrices.reduce((sum, matrix) => sum + matrix.estimatedJobs, 0)} planned matrix jobs`} />
                <ActionLine label="Assets" value={`${activeProjectAssetPacks.length} packs`} />
                <ActionLine label="Training" value={`${activeProjectDatasets.reduce((sum, dataset) => sum + dataset.items.length, 0)} dataset items`} />
                <Text size="xs" c="dimmed">
                  Projects are intentionally thin in v1: they link existing app objects without changing backend storage or route contracts.
                </Text>
              </Stack>
            </ElevatedCard>
          </SimpleGrid>
        ) : (
          <ElevatedCard elevation="floor">
            <Stack align="center" py="xl">
              <IconSparkles size={28} />
              <Text fw={700}>No active project</Text>
              <Text size="sm" c="dimmed">Create a project or choose one to start linking creative work.</Text>
            </Stack>
          </ElevatedCard>
        )}
      </Stack>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <ElevatedCard elevation="paper">
      <Stack gap={2}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="lg" fw={800}>{value}</Text>
      </Stack>
    </ElevatedCard>
  );
}

function ActionLine({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm">{label}</Text>
      <Badge variant="light">{value}</Badge>
    </Group>
  );
}
