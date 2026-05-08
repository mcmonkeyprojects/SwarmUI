import { useMemo, useState, useEffect } from 'react';
import {
  Stack,
  Card,
  Text,
  Group,
  Progress,
  Table,
  ScrollArea,
  Modal,
  Code,
  Divider,
  Checkbox,
  Menu,
  Tooltip,
  Paper,
  TextInput,
  SimpleGrid,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconClearAll,
  IconEye,
  IconFlag,
  IconClock,
  IconChevronUp,
  IconChevronDown,
  IconX,
  IconSearch,
  IconSparkles,
  IconAlertTriangle,
  IconChecks,
  IconClockCog,
  IconTableOptions,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQueueStore, type QueueJob, type JobPriority } from '../stores/queue';
import { swarmClient } from '../api/client';
import { useShallow } from 'zustand/react/shallow';
import { featureFlags } from '../config/featureFlags';
import { resolveAssetUrl } from '../config/runtimeEndpoints';
import { useNavigationStore, type QueueRouteState } from '../stores/navigationStore';
import { useCreativeWorkspaceStore } from '../stores/creativeWorkspaceStore';
import type { ImageListItem } from '../api/types';
import { PageScaffold } from '../components/layout/PageScaffold';
import { ImageComparison } from '../components/ImageComparison';
import {
  EmptyStateCard,
  ProgressRingStat,
  QuickActionRail,
  SectionHero,
  StatTile,
  StatusTimeline,
  SwarmActionIcon,
  SwarmBadge,
  SwarmButton,
  SwarmSegmentedControl,
  type SwarmTone,
  type QuickActionItem,
  type StatusTimelineStep,
} from '../components/ui';

interface QueuePageProps {
  routeState?: QueueRouteState;
}

export function QueuePage({ routeState }: QueuePageProps) {
  const {
    jobs,
    isProcessing,
    isPaused,
    runnerStatus,
    selectedJobs,
    updateJob,
    removeJob,
    clearCompleted,
    clearAll,
    getNextPendingJob,
    setProcessing,
    setPaused,
    startRunner,
    pauseRunner,
    stopRunner,
    selectJob,
    deselectJob,
    selectAllJobs,
    clearSelection,
    removeSelectedJobs,
    setJobPriority,
    moveJob,
  } = useQueueStore(
    useShallow((state) => ({
      jobs: state.jobs,
      isProcessing: state.isProcessing,
      isPaused: state.isPaused,
      runnerStatus: state.runnerStatus,
      selectedJobs: state.selectedJobs,
      updateJob: state.updateJob,
      removeJob: state.removeJob,
      clearCompleted: state.clearCompleted,
      clearAll: state.clearAll,
      getNextPendingJob: state.getNextPendingJob,
      setProcessing: state.setProcessing,
      setPaused: state.setPaused,
      startRunner: state.startRunner,
      pauseRunner: state.pauseRunner,
      stopRunner: state.stopRunner,
      selectJob: state.selectJob,
      deselectJob: state.deselectJob,
      selectAllJobs: state.selectAllJobs,
      clearSelection: state.clearSelection,
      removeSelectedJobs: state.removeSelectedJobs,
      setJobPriority: state.setJobPriority,
      moveJob: state.moveJob,
    }))
  );

  const [selectedJobDetails, setSelectedJobDetails] = useState<QueueJob | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'batches' | 'scheduled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [comparisonPair, setComparisonPair] = useState<[ImageListItem | null, ImageListItem | null]>([null, null]);
  const navigateToQueue = useNavigationStore((state) => state.navigateToQueue);
  const { activeProjectId, ensureActiveProject, createRunMatrix } = useCreativeWorkspaceStore();

  // Current time for duration calculation - updated every second for running jobs
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Update current time for running jobs
  useEffect(() => {
    const hasRunningJobs = jobs.some(j => j.status === 'generating');
    if (!hasRunningJobs) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [jobs]);

  // Process queue effect
  useEffect(() => {
    if (featureFlags.queueRunnerV2) return;
    if (!isProcessing || isPaused) return;

    const processQueue = async () => {
      const nextJob = getNextPendingJob();
      if (!nextJob) {
        setProcessing(false);
        notifications.show({
          title: 'Queue Complete',
          message: 'All jobs have been processed',
          color: 'green',
        });
        return;
      }

      // Update job status
      updateJob(nextJob.id, {
        status: 'generating',
        startedAt: Date.now(),
      });

      try {
        const images: string[] = [];

        swarmClient.generateImage(nextJob.params, {
          onProgress: (progressData) => {
            const backendPercent = Number(progressData.overall_percent);
            const progress = Number.isFinite(backendPercent)
              ? Math.min(100, Math.max(0, Math.round(backendPercent * 100)))
              : 0;
            updateJob(nextJob.id, {
              progress,
            });
          },
          onImage: (imageData) => {
            const imagePath = resolveAssetUrl(
              imageData.image?.startsWith('/') ? imageData.image : `/${imageData.image}`
            );
            images.push(imagePath);
          },
          onComplete: () => {
            updateJob(nextJob.id, {
              status: 'completed',
              completedAt: Date.now(),
              progress: 100,
              images,
            });
            setTimeout(processQueue, 500);
          },
          onError: () => {
            updateJob(nextJob.id, {
              status: 'failed',
              completedAt: Date.now(),
              error: 'Generation failed',
            });
            setTimeout(processQueue, 500);
          },
        });
      } catch (error) {
        updateJob(nextJob.id, {
          status: 'failed',
          completedAt: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        setTimeout(processQueue, 500);
      }
    };

    processQueue();
  }, [isProcessing, isPaused, getNextPendingJob, setProcessing, updateJob]);

  const handleStartQueue = () => {
    const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'scheduled');
    if (pendingJobs.length === 0) {
      notifications.show({
        title: 'No Jobs',
        message: 'There are no pending jobs to process',
        color: 'orange',
      });
      return;
    }

    if (featureFlags.queueRunnerV2) {
      startRunner();
    } else {
      setProcessing(true);
      setPaused(false);
    }
    notifications.show({
      title: 'Queue Started',
      message: `Processing ${pendingJobs.length} job(s)`,
      color: 'blue',
    });
  };

  const handlePauseQueue = () => {
    if (featureFlags.queueRunnerV2) {
      pauseRunner();
    } else {
      setPaused(true);
    }
    notifications.show({
      title: 'Queue Paused',
      message: 'Processing paused after current job',
      color: 'orange',
    });
  };

  const handleResumeQueue = () => {
    if (featureFlags.queueRunnerV2) {
      startRunner();
    } else {
      setPaused(false);
    }
    notifications.show({
      title: 'Queue Resumed',
      message: 'Continuing queue processing',
      color: 'blue',
    });
  };

  const handleStopQueue = () => {
    if (featureFlags.queueRunnerV2) {
      stopRunner();
    } else {
      setProcessing(false);
      setPaused(false);
    }
    notifications.show({
      title: 'Queue Stopped',
      message: 'Queue processing stopped',
      color: 'red',
    });
  };

  const handleSaveCampaign = () => {
    const candidateJobs = selectedJobs.length > 0
      ? jobs.filter((job) => selectedJobs.includes(job.id))
      : filteredJobs;
    const sourceJob = candidateJobs[0];
    if (!sourceJob) {
      notifications.show({
        title: 'No Jobs Selected',
        message: 'Select jobs or filter the queue before saving a campaign snapshot.',
        color: 'orange',
      });
      return;
    }
    const projectId = activeProjectId ?? ensureActiveProject();
    const uniqueModels = Array.from(new Set(candidateJobs.map((job) => job.params.model).filter(Boolean))) as string[];
    const uniqueSeeds = Array.from(new Set(candidateJobs.map((job) => job.params.seed).filter((seed): seed is number => typeof seed === 'number')));
    const uniqueCfg = Array.from(new Set(candidateJobs.map((job) => job.params.cfgscale).filter((cfg): cfg is number => typeof cfg === 'number')));
    const axes = [
      ...(uniqueModels.length > 1 ? [{ id: 'axis-model', paramKey: 'model', label: 'Model', values: uniqueModels }] : []),
      ...(uniqueSeeds.length > 1 ? [{ id: 'axis-seed', paramKey: 'seed', label: 'Seed', values: uniqueSeeds }] : []),
      ...(uniqueCfg.length > 1 ? [{ id: 'axis-cfg', paramKey: 'cfgscale', label: 'CFG', values: uniqueCfg }] : []),
    ];
    createRunMatrix({
      name: sourceJob.batchId ? `Queue Campaign ${sourceJob.batchId.slice(-4)}` : 'Queue Campaign Snapshot',
      projectId,
      baseParams: sourceJob.params,
      axes,
    });
    notifications.show({
      title: 'Campaign Saved',
      message: `${candidateJobs.length} job(s) summarized for the active project.`,
      color: 'teal',
    });
  };

  const getStatusTone = (status: QueueJob['status']): SwarmTone => {
    switch (status) {
      case 'pending': return 'secondary';
      case 'scheduled': return 'info';
      case 'generating': return 'info';
      case 'completed': return 'success';
      case 'failed': return 'danger';
      case 'cancelled': return 'warning';
      default: return 'secondary';
    }
  };

  const getPriorityTone = (priority: JobPriority): SwarmTone => {
    switch (priority) {
      case 'low': return 'secondary';
      case 'normal': return 'info';
      case 'high': return 'warning';
      case 'urgent': return 'danger';
      default: return 'info';
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const formatScheduledTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = timestamp - now.getTime();

    if (diffMs < 0) return 'Due now';
    if (diffMs < 60000) return 'Due in < 1 min';
    if (diffMs < 3600000) return `In ${Math.round(diffMs / 60000)} min`;

    return date.toLocaleString();
  };

  // Filter jobs based on view mode and search
  const filteredJobs = jobs.filter(job => {
    if (viewMode === 'scheduled' && job.status !== 'scheduled') return false;
    if (viewMode === 'batches' && !job.batchId) return false;
    if (routeState?.batchId && job.batchId !== routeState.batchId) return false;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        job.name?.toLowerCase().includes(query) ||
        job.params.prompt?.toLowerCase().includes(query) ||
        job.params.model?.toLowerCase().includes(query) ||
        job.tags?.some(t => t.toLowerCase().includes(query))
      );
    }
    return true;
  });

  // Stats
  const pendingCount = jobs.filter(j => j.status === 'pending').length;
  const scheduledCount = jobs.filter(j => j.status === 'scheduled').length;
  const generatingCount = jobs.filter(j => j.status === 'generating').length;
  const completedCount = jobs.filter(j => j.status === 'completed').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  const cancelledCount = jobs.filter(j => j.status === 'cancelled').length;
  const resolvedCount = completedCount + failedCount + cancelledCount;
  const queueCompletion = jobs.length > 0 ? (resolvedCount / jobs.length) * 100 : 0;

  const isAllSelected = selectedJobs.length === jobs.length && jobs.length > 0;
  const effectiveProcessing = featureFlags.queueRunnerV2
    ? runnerStatus === 'running' || runnerStatus === 'paused' || runnerStatus === 'stopping'
    : isProcessing;
  const effectivePaused = featureFlags.queueRunnerV2 ? runnerStatus === 'paused' : isPaused;

  const queueActions: QuickActionItem[] = [
    ...(effectiveProcessing
      ? [
        effectivePaused
          ? {
            id: 'resume',
            label: 'Resume',
            icon: <IconPlayerPlay size={14} />,
            onClick: handleResumeQueue,
            tone: 'info' as const,
            emphasis: 'solid' as const,
            tooltip: 'Resume queue processing',
          }
          : {
            id: 'pause',
            label: 'Pause',
            icon: <IconPlayerPause size={14} />,
            onClick: handlePauseQueue,
            tone: 'warning' as const,
            emphasis: 'solid' as const,
            tooltip: 'Pause after the current running job',
          },
        {
          id: 'stop',
          label: 'Stop',
          icon: <IconX size={14} />,
          onClick: handleStopQueue,
          tone: 'danger' as const,
          emphasis: 'soft' as const,
          tooltip: 'Stop queue processing immediately',
        },
      ]
      : [
        {
          id: 'start',
          label: 'Start Queue',
          icon: <IconPlayerPlay size={14} />,
          onClick: handleStartQueue,
          disabled: pendingCount + scheduledCount === 0,
          tone: 'primary' as const,
          emphasis: 'solid' as const,
          tooltip: 'Start processing pending and scheduled jobs',
        },
      ]),
    {
      id: 'save-campaign',
      label: 'Save Campaign',
      icon: <IconTableOptions size={14} />,
      onClick: handleSaveCampaign,
      disabled: jobs.length === 0,
      tone: 'info' as const,
      emphasis: 'soft' as const,
      tooltip: 'Save selected or visible jobs as a project queue campaign',
    },
    {
      id: 'clear-completed',
      label: 'Clear Done',
      icon: <IconChecks size={14} />,
      onClick: clearCompleted,
      disabled: completedCount === 0 && failedCount === 0,
      tone: 'warning' as const,
      emphasis: 'soft' as const,
      tooltip: 'Remove completed and failed jobs',
    },
    {
      id: 'clear-all',
      label: 'Clear All',
      icon: <IconClearAll size={14} />,
      onClick: clearAll,
      disabled: jobs.length === 0,
      tone: 'danger' as const,
      emphasis: 'soft' as const,
      tooltip: 'Remove all queue jobs',
    },
  ];

  const queueTimeline: StatusTimelineStep[] = [
    {
      label: 'Queued',
      state: jobs.length > 0 ? 'complete' : 'pending',
    },
    {
      label: 'Processing',
      state: generatingCount > 0 || effectiveProcessing ? 'active' : jobs.length > 0 ? 'complete' : 'pending',
    },
    {
      label: 'Review',
      state: failedCount > 0 ? 'error' : completedCount > 0 ? 'complete' : 'pending',
    },
    {
      label: 'Complete',
      state: jobs.length > 0 && resolvedCount === jobs.length
        ? (failedCount > 0 ? 'error' : 'complete')
        : 'pending',
    },
  ];

  useEffect(() => {
    if (routeState?.view && routeState.view !== viewMode) {
      // Route navigation can intentionally push a different queue tab after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewMode(routeState.view);
    }

    if (routeState?.jobId) {
      const job = jobs.find((entry) => entry.id === routeState.jobId);
      if (job && selectedJobDetails?.id !== job.id) {
        setSelectedJobDetails(job);
      }
    }
  }, [jobs, routeState?.jobId, routeState?.view, selectedJobDetails?.id, viewMode]);

  useEffect(() => {
    navigateToQueue({
      view: viewMode,
      jobId: selectedJobDetails?.id ?? null,
      batchId: selectedJobDetails?.batchId ?? null,
    });
  }, [navigateToQueue, selectedJobDetails?.batchId, selectedJobDetails?.id, viewMode]);

  const experimentSummaries = useMemo(() => {
    const summaries = new Map<string, {
      id: string;
      label: string;
      total: number;
      completed: number;
      failed: number;
      images: string[];
    }>();

    for (const job of jobs) {
      const groupId = job.batchId || job.provenance?.recipeId || job.provenance?.recipeName || `job:${job.id}`;
      const label = job.batchId
        ? `Batch ${job.batchId.slice(-4)}`
        : job.provenance?.recipeName
          ? `Recipe ${job.provenance.recipeName}`
          : job.name || 'Single Run';

      const existing = summaries.get(groupId) ?? {
        id: groupId,
        label,
        total: 0,
        completed: 0,
        failed: 0,
        images: [],
      };

      existing.total += 1;
      if (job.status === 'completed') {
        existing.completed += 1;
      }
      if (job.status === 'failed') {
        existing.failed += 1;
      }
      existing.images.push(...job.images);
      summaries.set(groupId, existing);
    }

    return Array.from(summaries.values()).filter((summary) => summary.total > 1);
  }, [jobs]);

  const openExperimentCompare = (summaryId: string) => {
    const summary = experimentSummaries.find((item) => item.id === summaryId);
    if (!summary || summary.images.length < 2) {
      return;
    }

    setComparisonPair(summary.images.slice(0, 2).map((src) => ({
      src,
      metadata: null,
      starred: false,
      canonical_src: src,
      preview_src: src,
      media_type: 'image',
      created_at: Date.now(),
      prompt_preview: null,
      model: null,
      width: null,
      height: null,
      seed: null,
    })) as [ImageListItem, ImageListItem]);
    setComparisonModalOpen(true);
  };

  return (
    <PageScaffold
      header={
        <Stack gap="md">
          <SectionHero
            className="fx-reveal fx-gradient-sweep"
            title="Generation Queue"
            subtitle="Prioritize, schedule, and monitor generation tasks with richer visual telemetry."
            icon={<IconSparkles size={18} color="var(--theme-accent-2)" className="fx-icon-float" />}
            badges={[
              { label: `${jobs.length} total`, tone: 'secondary' },
              ...(pendingCount > 0 ? [{ label: `${pendingCount} pending`, tone: 'secondary' as const }] : []),
              ...(scheduledCount > 0 ? [{ label: `${scheduledCount} scheduled`, tone: 'info' as const }] : []),
              ...(generatingCount > 0 ? [{ label: `${generatingCount} active`, tone: 'info' as const }] : []),
              ...(completedCount > 0 ? [{ label: `${completedCount} done`, tone: 'success' as const }] : []),
              ...(failedCount > 0 ? [{ label: `${failedCount} failed`, tone: 'danger' as const }] : []),
            ]}
            rightSection={<QuickActionRail actions={queueActions} className="fx-gradient-sweep" />}
            callout={
              <Text size="xs">
                Active monitoring: queue updates in real time while generation is running.
              </Text>
            }
          />

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm" className="fx-stagger">
            <StatTile
              label="Pending"
              value={pendingCount}
              hint={scheduledCount > 0 ? `${scheduledCount} scheduled` : 'Ready to process'}
              tone="neutral"
              icon={<IconClockCog size={18} color="var(--theme-gray-3)" />}
              className="fx-hover-lift fx-gradient-sweep"
            />
            <StatTile
              label="Running"
              value={generatingCount}
              hint={effectiveProcessing ? (effectivePaused ? 'Paused' : 'Processing now') : 'Idle'}
              tone="brand"
              icon={<IconPlayerPlay size={18} color="var(--theme-brand)" />}
              className="fx-hover-lift fx-gradient-sweep"
            />
            <StatTile
              label="Completed"
              value={completedCount}
              hint="Successful jobs"
              tone="success"
              icon={<IconChecks size={18} color="var(--theme-success)" />}
              className="fx-hover-lift fx-gradient-sweep"
            />
            <StatTile
              label="Failed"
              value={failedCount}
              hint="Needs review"
              tone="error"
              icon={<IconAlertTriangle size={18} color="var(--theme-error)" />}
              className="fx-hover-lift fx-gradient-sweep"
            />
            <ProgressRingStat
              label="Resolved"
              value={queueCompletion}
              description={jobs.length > 0 ? `${resolvedCount} of ${jobs.length} jobs` : 'No jobs yet'}
              color={failedCount > 0 ? 'var(--theme-warning)' : 'var(--theme-brand)'}
              className="fx-hover-lift fx-gradient-sweep"
            />
          </SimpleGrid>

          <StatusTimeline steps={queueTimeline} className="fx-reveal" />

          {experimentSummaries.length > 0 && (
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="sm">
              {experimentSummaries.map((summary) => (
                <Card key={summary.id} className="surface-glass fx-reveal" withBorder radius="md" shadow="sm">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text fw={600}>{summary.label}</Text>
                      <SwarmBadge tone="secondary">{summary.total} jobs</SwarmBadge>
                    </Group>
                    <Group gap="xs" wrap="wrap">
                      <SwarmBadge tone="success">{summary.completed} complete</SwarmBadge>
                      {summary.failed > 0 ? <SwarmBadge tone="danger">{summary.failed} failed</SwarmBadge> : null}
                    </Group>
                    <Text size="sm" c="dimmed">
                      Use this summary to review grouped runs before drilling into individual jobs.
                    </Text>
                    <Group justify="space-between">
                      <SwarmButton
                        size="xs"
                        tone="secondary"
                        emphasis="soft"
                        onClick={() => navigateToQueue({ view: 'batches', batchId: summary.id.startsWith('batch-') ? summary.id : null })}
                      >
                        Focus Group
                      </SwarmButton>
                      <SwarmButton
                        size="xs"
                        tone="primary"
                        emphasis="soft"
                        onClick={() => openExperimentCompare(summary.id)}
                        disabled={summary.images.length < 2}
                      >
                        Quick Compare
                      </SwarmButton>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          )}

          {/* Filters and View Mode */}
          <Group justify="space-between" wrap="wrap" align="flex-start">
            <Group wrap="wrap">
              <SwarmSegmentedControl
                value={viewMode}
                onChange={(v) => setViewMode(v as typeof viewMode)}
                data={[
                  { label: 'All Jobs', value: 'all' },
                  { label: 'Batches', value: 'batches' },
                  { label: 'Scheduled', value: 'scheduled' },
                ]}
              />
              <TextInput
                placeholder="Search jobs..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 'clamp(180px, 22vw, 320px)' }}
              />
            </Group>
            {selectedJobs.length > 0 && (
              <Group>
                <Text size="sm" c="dimmed">{selectedJobs.length} selected</Text>
                <SwarmButton size="xs" tone="secondary" emphasis="soft" onClick={clearSelection}>
                  Deselect All
                </SwarmButton>
                <SwarmButton size="xs" tone="danger" emphasis="soft" onClick={removeSelectedJobs}>
                  Delete Selected
                </SwarmButton>
              </Group>
            )}
          </Group>
        </Stack>
      }
    >
      <ScrollArea h="100%" p="md">
        {/* Jobs Table */}
        {filteredJobs.length === 0 ? (
        <EmptyStateCard
          className="fx-reveal"
          title={jobs.length === 0 ? 'Queue is empty' : 'No matching jobs'}
          description={
            jobs.length === 0
              ? 'Jobs added from the Generate page will appear here.'
              : 'Adjust search or view mode to reveal the jobs you need.'
          }
          icon={
            jobs.length === 0
              ? <IconClockCog size={34} color="var(--theme-gray-3)" />
              : <IconSearch size={34} color="var(--theme-gray-3)" />
          }
          actionLabel={jobs.length === 0 ? undefined : 'Reset filters'}
          onAction={
            jobs.length === 0
              ? undefined
              : () => {
                setSearchQuery('');
                setViewMode('all');
              }
          }
        />
        ) : (
          <Card className="surface-glass fx-reveal" shadow="sm" padding="md" radius="md" withBorder>
            <ScrollArea className="swarm-queue-table-scroll">
              <Table striped highlightOnHover className="swarm-queue-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 40 }} className="swarm-queue-sticky-left">
                    <Checkbox
                      checked={isAllSelected}
                      indeterminate={selectedJobs.length > 0 && !isAllSelected}
                      onChange={() => isAllSelected ? clearSelection() : selectAllJobs()}
                    />
                  </Table.Th>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Name / Prompt</Table.Th>
                  <Table.Th>Model</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Progress</Table.Th>
                  <Table.Th>Duration</Table.Th>
                  <Table.Th className="swarm-queue-sticky-right">Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredJobs.map((job, index) => {
                  const duration = job.completedAt && job.startedAt
                    ? job.completedAt - job.startedAt
                    : job.startedAt
                      ? currentTime - job.startedAt
                      : 0;

                  const isSelected = selectedJobs.includes(job.id);

                  return (
                    <Table.Tr
                      key={job.id}
                      className={isSelected ? 'swarm-selected-table-row' : undefined}
                    >
                      <Table.Td className="swarm-queue-sticky-left">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => isSelected ? deselectJob(job.id) : selectJob(job.id)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Menu withinPortal position="bottom-start" shadow="sm">
                          <Menu.Target>
                            <SwarmBadge
                              tone={getPriorityTone(job.priority)}
                              emphasis="soft"
                              size="sm"
                              style={{ cursor: 'pointer' }}
                              leftSection={<IconFlag size={10} />}
                            >
                              {job.priority}
                            </SwarmBadge>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Label>Set Priority</Menu.Label>
                            <Menu.Item onClick={() => setJobPriority(job.id, 'low')}>
                              <Group gap="xs">
                                <SwarmBadge size="xs" tone="secondary">Low</SwarmBadge>
                              </Group>
                            </Menu.Item>
                            <Menu.Item onClick={() => setJobPriority(job.id, 'normal')}>
                              <Group gap="xs">
                                <SwarmBadge size="xs" tone="info">Normal</SwarmBadge>
                              </Group>
                            </Menu.Item>
                            <Menu.Item onClick={() => setJobPriority(job.id, 'high')}>
                              <Group gap="xs">
                                <SwarmBadge size="xs" tone="warning">High</SwarmBadge>
                              </Group>
                            </Menu.Item>
                            <Menu.Item onClick={() => setJobPriority(job.id, 'urgent')}>
                              <Group gap="xs">
                                <SwarmBadge size="xs" tone="danger">Urgent</SwarmBadge>
                              </Group>
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <SwarmBadge tone={getStatusTone(job.status)} size="sm">
                            {job.status}
                          </SwarmBadge>
                          {job.scheduledAt && job.status === 'scheduled' && (
                            <Tooltip label={new Date(job.scheduledAt).toLocaleString()}>
                              <SwarmBadge size="xs" tone="info" leftSection={<IconClock size={10} />}>
                                {formatScheduledTime(job.scheduledAt)}
                              </SwarmBadge>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          {job.name && (
                            <Text size="sm" fw={500}>{job.name}</Text>
                          )}
                          <Text
                            size="sm"
                            lineClamp={1}
                            style={{ maxWidth: 'clamp(220px, 24vw, 380px)' }}
                            c={job.name ? 'dimmed' : undefined}
                          >
                            {job.params.prompt || 'No prompt'}
                          </Text>
                          {job.tags && job.tags.length > 0 && (
                            <Group gap={4}>
                              {job.tags.map(tag => (
                                <SwarmBadge key={tag} size="xs" tone="secondary" emphasis="outline">{tag}</SwarmBadge>
                              ))}
                            </Group>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {job.params.model?.split('/').pop() || 'Default'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {job.params.width}x{job.params.height}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {job.status === 'generating' ? (
                          <Group gap="xs">
                            <Progress
                              value={job.progress}
                              size="sm"
                              style={{ width: 80 }}
                              animated
                              styles={{
                                root: {
                                  background: 'var(--theme-progress-track-bg)',
                                  border: '1px solid var(--theme-progress-track-border)',
                                },
                                section: {
                                  background: 'var(--theme-progress-fill)',
                                  boxShadow: '0 0 9px var(--theme-progress-glow)',
                                },
                              }}
                            />
                            <Text size="xs" c="dimmed">
                              {job.progress}%
                            </Text>
                          </Group>
                        ) : (
                          <Text size="sm" c="dimmed">
                            {job.status === 'completed' ? '100%' : '-'}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {duration > 0 ? formatDuration(duration) : '-'}
                        </Text>
                      </Table.Td>
                      <Table.Td className="swarm-queue-sticky-right">
                        <Group gap="xs">
                          <Tooltip label="Move up">
                            <SwarmActionIcon
                              size="sm"
                              tone="secondary"
                              emphasis="ghost"
                              label="Move job up"
                              onClick={() => moveJob(job.id, 'up')}
                              disabled={index === 0 || job.status === 'generating'}
                            >
                              <IconChevronUp size={16} />
                            </SwarmActionIcon>
                          </Tooltip>
                          <Tooltip label="Move down">
                            <SwarmActionIcon
                              size="sm"
                              tone="secondary"
                              emphasis="ghost"
                              label="Move job down"
                              onClick={() => moveJob(job.id, 'down')}
                              disabled={index === filteredJobs.length - 1 || job.status === 'generating'}
                            >
                              <IconChevronDown size={16} />
                            </SwarmActionIcon>
                          </Tooltip>
                          <Tooltip label="View details">
                            <SwarmActionIcon
                              size="sm"
                              tone="info"
                              emphasis="ghost"
                              label="View job details"
                              onClick={() => setSelectedJobDetails(job)}
                            >
                              <IconEye size={16} />
                            </SwarmActionIcon>
                          </Tooltip>
                          <Tooltip label="Remove job">
                            <SwarmActionIcon
                              size="sm"
                              tone="danger"
                              emphasis="ghost"
                              label="Remove job"
                              onClick={() => removeJob(job.id)}
                              disabled={job.status === 'generating'}
                            >
                              <IconTrash size={16} />
                            </SwarmActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
              </Table>
            </ScrollArea>
          </Card>
        )}
      </ScrollArea>

      {/* Job Details Modal */}
      <Modal
        opened={selectedJobDetails !== null}
        onClose={() => setSelectedJobDetails(null)}
        title="Job Details"
        size="lg"
      >
        {selectedJobDetails && (
          <Stack gap="md">
            <Group>
              <SwarmBadge tone={getStatusTone(selectedJobDetails.status)} size="lg">
                {selectedJobDetails.status}
              </SwarmBadge>
              <SwarmBadge tone={getPriorityTone(selectedJobDetails.priority)} size="lg">
                {selectedJobDetails.priority} priority
              </SwarmBadge>
              {selectedJobDetails.progress > 0 && (
                <Text size="sm" c="dimmed">{selectedJobDetails.progress}% complete</Text>
              )}
            </Group>

            {selectedJobDetails.name && (
              <Paper p="sm" withBorder>
                <Text size="sm" fw={500}>Job Name</Text>
                <Text>{selectedJobDetails.name}</Text>
              </Paper>
            )}

            {selectedJobDetails.provenance && (
              <Paper p="sm" withBorder>
                <Text size="sm" fw={500}>Provenance</Text>
                <Group gap="xs" mt="xs">
                  <SwarmBadge tone="secondary">{selectedJobDetails.provenance.source}</SwarmBadge>
                  {selectedJobDetails.provenance.workspaceMode ? (
                    <SwarmBadge tone="info">{selectedJobDetails.provenance.workspaceMode}</SwarmBadge>
                  ) : null}
                  {selectedJobDetails.provenance.recipeName ? (
                    <SwarmBadge tone="success">{selectedJobDetails.provenance.recipeName}</SwarmBadge>
                  ) : null}
                  {selectedJobDetails.provenance.projectId ? (
                    <SwarmBadge tone="primary">project</SwarmBadge>
                  ) : null}
                  {selectedJobDetails.provenance.roleplayCharacterName ? (
                    <SwarmBadge tone="info">{selectedJobDetails.provenance.roleplayCharacterName}</SwarmBadge>
                  ) : null}
                  {selectedJobDetails.provenance.workflowMode ? (
                    <SwarmBadge tone="info">{selectedJobDetails.provenance.workflowMode}</SwarmBadge>
                  ) : null}
                </Group>
                {selectedJobDetails.provenance.prompt ? (
                  <Text size="sm" mt="xs" lineClamp={3}>
                    {selectedJobDetails.provenance.prompt}
                  </Text>
                ) : null}
              </Paper>
            )}

            {selectedJobDetails.scheduledAt && (
              <Paper p="sm" withBorder>
                <Text size="sm" fw={500}>Scheduled For</Text>
                <Text>{new Date(selectedJobDetails.scheduledAt).toLocaleString()}</Text>
              </Paper>
            )}

            <Divider label="Parameters" />
            <ScrollArea h={200}>
              <Code block>
                {JSON.stringify(selectedJobDetails.params, null, 2)}
              </Code>
            </ScrollArea>

            {selectedJobDetails.images.length > 0 && (
              <>
                <Divider label={`Generated Images (${selectedJobDetails.images.length})`} />
                <Group gap="sm">
                  {selectedJobDetails.images.map((img: string, i: number) => (
                    <img
                      key={i}
                      src={img}
                      alt={`Generated ${i + 1}`}
                      style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 8 }}
                    />
                  ))}
                </Group>
              </>
            )}

            {selectedJobDetails.error && (
              <>
                <Divider label="Error" />
                <Text size="sm" style={{ color: 'var(--theme-error)' }}>{selectedJobDetails.error}</Text>
              </>
            )}

            <Group justify="flex-end">
              <SwarmButton tone="secondary" emphasis="ghost" onClick={() => setSelectedJobDetails(null)}>
                Close
              </SwarmButton>
            </Group>
          </Stack>
        )}
      </Modal>

      <ImageComparison
        leftImage={comparisonPair[0]}
        rightImage={comparisonPair[1]}
        opened={comparisonModalOpen}
        onClose={() => setComparisonModalOpen(false)}
      />
    </PageScaffold>
  );
}
