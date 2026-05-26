/**
 * Queue Store
 * 
 * UI slice for queue management. References jobs in the entity store.
 * Handles job ordering, selection, and queue control.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { GenerateParams } from '../api/types';
import { useEntityStore } from './entityStore';
import type { JobEntity, BatchEntity, JobPriority, JobStatus, JobProvenance } from './entityTypes';
import { swarmClient } from '../api/client';
import { resolveAssetUrl } from '../config/runtimeEndpoints';
import { featureFlags } from '../config/featureFlags';
import {
  mergeGenerationPreviewSnapshot,
  type GenerationPreviewSnapshot,
} from '../utils/generationProgress';

// Re-export types for backward compatibility
export type { JobPriority, JobStatus } from './entityTypes';
export type QueueRunnerStatus = 'idle' | 'running' | 'paused' | 'stopping';

// Legacy interface for backward compatibility
export interface QueueJob extends GenerationPreviewSnapshot {
  id: string;
  name?: string;
  params: GenerateParams;
  status: JobStatus;
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  scheduledAt?: number;
  images: string[];
  error?: string;
  batchId?: string;
  priority: JobPriority;
  tags?: string[];
  estimatedDuration?: number;
  provenance?: JobProvenance;
}

export interface QueueBatch {
  id: string;
  name: string;
  createdAt: number;
  jobCount: number;
}

interface QueueUIState {
  // UI state (references entity IDs)
  jobIds: string[];           // Ordered list of job IDs
  batchIds: string[];         // Batch IDs
  isProcessing: boolean;
  isPaused: boolean;
  runnerStatus: QueueRunnerStatus;
  activeJobId: string | null;
  activeConnectionId: string | null;
  runnerVersion: number;
  selectedJobIds: string[];   // Selected jobs for bulk operations

}

interface QueueUIActions {
  // Job management (creates entities in entityStore)
  addJob: (params: GenerateParams, options?: {
    name?: string;
    priority?: JobPriority;
    scheduledAt?: number;
    batchId?: string;
    tags?: string[];
    provenance?: JobProvenance;
  }) => string;
  addBatchJobs: (jobs: GenerateParams[], batchName?: string) => string;
  updateJob: (id: string, updates: Partial<QueueJob>) => void;
  removeJob: (id: string) => void;
  removeJobs: (ids: string[]) => void;
  cancelJob: (id: string) => void;

  // Queue control
  clearCompleted: () => void;
  clearAll: () => void;
  getNextPendingJob: () => QueueJob | undefined;
  setProcessing: (processing: boolean) => void;
  setPaused: (paused: boolean) => void;
  startRunner: () => void;
  pauseRunner: () => void;
  stopRunner: () => void;

  // Batch management
  createBatch: (name: string) => string;
  deleteBatch: (id: string) => void;
  getJobsInBatch: (batchId: string) => QueueJob[];

  // Job ordering
  moveJob: (id: string, direction: 'up' | 'down') => void;
  reorderJobs: (jobIds: string[]) => void;

  // Selection for bulk operations
  selectJob: (id: string) => void;
  deselectJob: (id: string) => void;
  selectAllJobs: () => void;
  clearSelection: () => void;
  removeSelectedJobs: () => void;

  // Priority
  setJobPriority: (id: string, priority: JobPriority) => void;

  // Scheduling
  scheduleJob: (id: string, scheduledAt: number) => void;
  unscheduleJob: (id: string) => void;
  getScheduledJobs: () => QueueJob[];
  getDueJobs: () => QueueJob[];

  // Stats
  getPendingCount: () => number;
  getGeneratingCount: () => number;
  getCompletedCount: () => number;

  // Legacy getter for backward compatibility
  get jobs(): QueueJob[];
  get batches(): QueueBatch[];
  get selectedJobs(): string[];
}

const generateId = () => `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const generateBatchId = () => `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Priority weights for sorting (higher = process first)
const priorityWeight: Record<JobPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// Estimate duration based on params (rough estimate in ms)
const estimateDuration = (params: GenerateParams): number => {
  const steps = params.steps || 20;
  const images = params.images || 1;
  const baseTime = 2000;
  const perStep = 100;
  return (baseTime + steps * perStep) * images;
};

// Convert JobEntity to legacy QueueJob format
const toQueueJob = (entity: JobEntity): QueueJob => ({
  id: entity.id,
  name: entity.name,
  params: entity.params,
  status: entity.status,
  progress: entity.progress,
  createdAt: entity.createdAt,
  startedAt: entity.startedAt,
  completedAt: entity.completedAt,
  scheduledAt: entity.scheduledAt,
  images: entity.imageIds,
  error: entity.error,
  batchId: entity.batchId,
  priority: entity.priority,
  tags: entity.tags,
  estimatedDuration: entity.estimatedDuration,
  provenance: entity.provenance,
  previewImage: entity.previewImage,
  previewRevision: entity.previewRevision,
  previewEventSequence: entity.previewEventSequence,
  previewFrameSequence: entity.previewFrameSequence,
  backendProgressSequence: entity.backendProgressSequence,
  stageId: entity.stageId,
  stageLabel: entity.stageLabel,
  stageDetail: entity.stageDetail,
  stageIndex: entity.stageIndex,
  stageCount: entity.stageCount,
  stagesRemaining: entity.stagesRemaining,
  stageTaskIndex: entity.stageTaskIndex,
  stageTaskCount: entity.stageTaskCount,
  stageTasksRemaining: entity.stageTasksRemaining,
  currentStep: entity.currentStep,
  totalSteps: entity.totalSteps,
  stepSource: entity.stepSource,
  currentBatch: entity.currentBatch,
  totalBatches: entity.totalBatches,
  lastProgressAt: entity.lastProgressAt,
  lastPreviewAt: entity.lastPreviewAt,
});

// Convert BatchEntity to legacy QueueBatch format
const toBatchEntity = (entity: BatchEntity): QueueBatch => ({
  id: entity.id,
  name: entity.name,
  createdAt: entity.createdAt,
  jobCount: entity.jobCount,
});

// Module-level cache for memoized selectors (avoids setState during render)
let _jobsCache: QueueJob[] = [];
let _jobsCacheKey: string | null = null;
let _jobsCacheEntities: Record<string, JobEntity> | null = null;
let _batchesCache: QueueBatch[] = [];
let _batchesCacheKey: string | null = null;
let _batchesCacheEntities: Record<string, BatchEntity> | null = null;

// Memoized selector for jobs - only recomputes when dependencies change
export const selectJobs = (
  state: QueueUIState,
  entityJobs: Record<string, JobEntity>
): QueueJob[] => {
  const cacheKey = `${state.jobIds.join(',')}:${Object.keys(entityJobs).length}`;

  if (cacheKey === _jobsCacheKey && entityJobs === _jobsCacheEntities) {
    return _jobsCache;
  }

  const jobs = state.jobIds
    .map((id) => entityJobs[id])
    .filter(Boolean)
    .map(toQueueJob);

  _jobsCache = jobs;
  _jobsCacheKey = cacheKey;
  _jobsCacheEntities = entityJobs;

  return jobs;
};

// Memoized selector for batches
export const selectBatches = (
  state: QueueUIState,
  entityBatches: Record<string, BatchEntity>
): QueueBatch[] => {
  const cacheKey = `${state.batchIds.join(',')}:${Object.keys(entityBatches).length}`;

  if (cacheKey === _batchesCacheKey && entityBatches === _batchesCacheEntities) {
    return _batchesCache;
  }

  const batches = state.batchIds
    .map((id) => entityBatches[id])
    .filter(Boolean)
    .map(toBatchEntity);

  _batchesCache = batches;
  _batchesCacheKey = cacheKey;
  _batchesCacheEntities = entityBatches;

  return batches;
};

export function useQueueJobs(): QueueJob[] {
  const jobIds = useQueueStore((state) => state.jobIds);
  const entityJobs = useEntityStore((state) => state.entities.jobs);

  return useMemo(() => {
    const queueState = useQueueStore.getState();
    return selectJobs({ ...queueState, jobIds }, entityJobs);
  }, [entityJobs, jobIds]);
}

export function useQueueBatches(): QueueBatch[] {
  const batchIds = useQueueStore((state) => state.batchIds);
  const entityBatches = useEntityStore((state) => state.entities.batches);

  return useMemo(() => {
    const queueState = useQueueStore.getState();
    return selectBatches({ ...queueState, batchIds }, entityBatches);
  }, [batchIds, entityBatches]);
}

let activeQueueSocket: WebSocket | null = null;
const NEXT_JOB_DELAY_MS = 250;

function resolveQueueImagePath(rawPath: string): string {
  if (!rawPath) return rawPath;
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return rawPath;
  }
  return resolveAssetUrl(rawPath.startsWith('/') ? rawPath : `/${rawPath}`);
}

function readPositiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function calculateQueueGenerationProgress(progressData: Record<string, unknown>, params: GenerateParams): number {
  const totalImages = readPositiveNumber(params.images, 1);
  const batchIndex = Math.max(0, Math.floor(readNonNegativeNumber(progressData.batch_index, 0)));
  const rawOverallPercent = typeof progressData.overall_percent === 'number'
    ? progressData.overall_percent
    : typeof progressData.overall_percent === 'string'
      ? Number(progressData.overall_percent)
      : NaN;
  const batchPercent = Math.min(1, Math.max(0, Number.isFinite(rawOverallPercent) ? rawOverallPercent : 0));
  return Math.min(100, Math.max(0, Math.round(((batchIndex + batchPercent) / totalImages) * 100)));
}

function hasRunnableJob(jobIds: string[]): boolean {
  const entityStore = useEntityStore.getState();
  const now = Date.now();
  return jobIds.some((jobId) => {
    const job = entityStore.entities.jobs[jobId];
    if (!job) return false;
    if (job.status === 'pending') return true;
    if (job.status === 'scheduled' && job.scheduledAt !== undefined && job.scheduledAt <= now) {
      return true;
    }
    return false;
  });
}

function finalizeRunnerIdle(version: number): void {
  const state = useQueueStore.getState();
  if (state.runnerVersion !== version) {
    return;
  }
  useQueueStore.setState({
    runnerStatus: 'idle',
    isProcessing: false,
    isPaused: false,
    activeJobId: null,
    activeConnectionId: null,
  });
}

function scheduleNextRunnerTick(version: number): void {
  setTimeout(() => {
    void runQueueRunner(version);
  }, NEXT_JOB_DELAY_MS);
}

async function runQueueRunner(version: number): Promise<void> {
  const state = useQueueStore.getState();
  if (state.runnerVersion !== version || state.runnerStatus !== 'running') {
    return;
  }
  if (state.activeJobId) {
    return;
  }

  const nextJob = state.getNextPendingJob();
  if (!nextJob) {
    finalizeRunnerIdle(version);
    return;
  }

  state.updateJob(nextJob.id, {
    status: 'generating',
    startedAt: Date.now(),
    progress: 0,
    completedAt: undefined,
    error: undefined,
    previewImage: null,
    previewRevision: 0,
    previewEventSequence: null,
    previewFrameSequence: null,
    backendProgressSequence: null,
    stageId: null,
    stageLabel: null,
    stageDetail: null,
    stageIndex: 0,
    stageCount: 0,
    stagesRemaining: 0,
    stageTaskIndex: 0,
    stageTaskCount: 0,
    stageTasksRemaining: 0,
    currentStep: 0,
    totalSteps: 0,
    stepSource: 'unknown',
    currentBatch: 0,
    totalBatches: readPositiveNumber(nextJob.params.images, 1),
    lastProgressAt: undefined,
    lastPreviewAt: undefined,
  });

  useQueueStore.setState({
    activeJobId: nextJob.id,
    activeConnectionId: null,
  });

  const images: string[] = [];
  let isFinalized = false;

  const finalize = (
    status: JobStatus,
    updates: Partial<QueueJob> = {}
  ) => {
    if (isFinalized) {
      return;
    }
    isFinalized = true;

    const current = useQueueStore.getState();
    if (current.runnerVersion !== version) {
      return;
    }

    current.updateJob(nextJob.id, {
      status,
      completedAt: Date.now(),
      images,
      ...(status === 'completed' ? { progress: 100, previewImage: null } : {}),
      ...updates,
    });

    activeQueueSocket = null;
    useQueueStore.setState({
      activeJobId: null,
      activeConnectionId: null,
    });

    const afterFinalize = useQueueStore.getState();
    if (afterFinalize.runnerVersion !== version) {
      return;
    }

    if (afterFinalize.runnerStatus === 'running') {
      scheduleNextRunnerTick(version);
      return;
    }

    if (afterFinalize.runnerStatus === 'stopping') {
      finalizeRunnerIdle(version);
    }
  };

  try {
    const socket = swarmClient.generateImage(nextJob.params, {
      onProgress: (progressData) => {
        const progress = calculateQueueGenerationProgress(progressData as Record<string, unknown>, nextJob.params);
        const current = useQueueStore.getState();
        if (current.runnerVersion !== version) {
          return;
        }
        current.updateJob(nextJob.id, { progress });
      },
      onNormalizedProgress: (progressData) => {
        const current = useQueueStore.getState();
        if (current.runnerVersion !== version) {
          return;
        }
        const existing = useEntityStore.getState().entities.jobs[nextJob.id];
        const previewState = mergeGenerationPreviewSnapshot(existing ?? {}, progressData);
        current.updateJob(nextJob.id, {
          progress: Math.max(
            existing?.progress ?? 0,
            Math.round(progressData.overallPercent)
          ),
          ...previewState,
        });
      },
      onImage: (imageData) => {
        const rawImagePath =
          typeof imageData === 'object' && imageData && 'image' in imageData
            ? String((imageData as { image?: string }).image || '')
            : '';
        if (!rawImagePath) {
          return;
        }
        images.push(resolveQueueImagePath(rawImagePath));
      },
      onComplete: () => {
        finalize('completed');
      },
      onError: () => {
        finalize('failed', { error: 'Generation failed' });
      },
      onDataError: (errorMessage) => {
        finalize('failed', { error: errorMessage || 'Generation failed' });
      },
    });

    activeQueueSocket = socket;
    useQueueStore.setState({
      activeConnectionId: socket.url || `generation_${Date.now()}`,
    });
  } catch (error) {
    finalize('failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export const useQueueStore = create<QueueUIState & QueueUIActions>()(
  devtools(
    persist(
      (set, get) => ({
        jobIds: [],
        batchIds: [],
        isProcessing: false,
        isPaused: false,
        runnerStatus: 'idle',
        activeJobId: null,
        activeConnectionId: null,
        runnerVersion: 0,
        selectedJobIds: [],

        // Legacy getters using memoized selectors
        get jobs() {
          const entityStore = useEntityStore.getState();
          return selectJobs(get(), entityStore.entities.jobs);
        },

        get batches() {
          const entityStore = useEntityStore.getState();
          return selectBatches(get(), entityStore.entities.batches);
        },

        get selectedJobs() {
          return get().selectedJobIds;
        },

        addJob: (params, options = {}) => {
          const id = generateId();
          const jobEntity: JobEntity = {
            id,
            name: options.name,
            params,
            status: options.scheduledAt ? 'scheduled' : 'pending',
            progress: 0,
            priority: options.priority || 'normal',
            createdAt: Date.now(),
            scheduledAt: options.scheduledAt,
            batchId: options.batchId,
            tags: options.tags,
            imageIds: [],
            estimatedDuration: estimateDuration(params),
            provenance: options.provenance,
          };

          // Add to entity store
          useEntityStore.getState().setEntity('jobs', jobEntity);

          // Update UI state
          set((state) => ({
            jobIds: [...state.jobIds, id],
          }));

          return id;
        },

        addBatchJobs: (jobParams, batchName) => {
          const batchId = generateBatchId();
          const batchEntity: BatchEntity = {
            id: batchId,
            name: batchName || `Batch ${new Date().toLocaleString()}`,
            createdAt: Date.now(),
            jobCount: jobParams.length,
          };

          const newJobIds: string[] = [];
          const entityStore = useEntityStore.getState();

          // Create batch entity
          entityStore.setEntity('batches', batchEntity);

          // Create job entities
          jobParams.forEach((params, index) => {
            const id = generateId();
            const jobEntity: JobEntity = {
              id,
              name: `${batchEntity.name} - ${index + 1}`,
              params,
              status: 'pending',
              progress: 0,
              priority: 'normal',
              createdAt: Date.now(),
              batchId,
              imageIds: [],
              estimatedDuration: estimateDuration(params),
            };
            entityStore.setEntity('jobs', jobEntity);
            newJobIds.push(id);
          });

          // Update UI state
          set((state) => ({
            jobIds: [...state.jobIds, ...newJobIds],
            batchIds: [...state.batchIds, batchId],
          }));

          return batchId;
        },

        updateJob: (id, updates) => {
          const entityStore = useEntityStore.getState();
          const existing = entityStore.entities.jobs[id];
          if (!existing) return;

          // Convert legacy images array to imageIds
          const entityUpdates: Partial<JobEntity> = { ...updates };
          if ('images' in updates) {
            entityUpdates.imageIds = updates.images;
            delete (entityUpdates as Partial<JobEntity> & { images?: string[] }).images;
          }

          entityStore.updateEntity('jobs', id, entityUpdates);
        },

        removeJob: (id) => {
          useEntityStore.getState().removeEntity('jobs', id);
          set((state) => ({
            jobIds: state.jobIds.filter((jid) => jid !== id),
            selectedJobIds: state.selectedJobIds.filter((jid) => jid !== id),
          }));
        },

        removeJobs: (ids) => {
          useEntityStore.getState().removeEntities('jobs', ids);
          set((state) => ({
            jobIds: state.jobIds.filter((jid) => !ids.includes(jid)),
            selectedJobIds: state.selectedJobIds.filter((jid) => !ids.includes(jid)),
          }));
        },

        cancelJob: (id) => {
          const entityStore = useEntityStore.getState();
          const job = entityStore.entities.jobs[id];
          if (job && job.status !== 'completed' && job.status !== 'failed') {
            entityStore.updateEntity('jobs', id, { status: 'cancelled' });
          }
        },

        clearCompleted: () => {
          const entityStore = useEntityStore.getState();
          const { jobIds } = get();
          const completedIds = jobIds.filter((id) => {
            const job = entityStore.entities.jobs[id];
            return job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled');
          });

          entityStore.removeEntities('jobs', completedIds);
          set((state) => ({
            jobIds: state.jobIds.filter((id) => !completedIds.includes(id)),
          }));
        },

        clearAll: () => {
          const { jobIds, batchIds } = get();
          const entityStore = useEntityStore.getState();
          entityStore.removeEntities('jobs', jobIds);
          entityStore.removeEntities('batches', batchIds);
          if (activeQueueSocket) {
            try {
              activeQueueSocket.close(4000, 'Queue cleared');
            } catch {
              // best effort
            }
            activeQueueSocket = null;
          }
          set((state) => ({
            jobIds: [],
            batchIds: [],
            selectedJobIds: [],
            runnerStatus: 'idle',
            isProcessing: false,
            isPaused: false,
            activeJobId: null,
            activeConnectionId: null,
            runnerVersion: state.runnerVersion + 1,
          }));
        },

        getNextPendingJob: () => {
          const { isPaused, jobIds, runnerStatus } = get();
          if (isPaused || runnerStatus === 'paused' || runnerStatus === 'stopping') return undefined;

          const entityStore = useEntityStore.getState();
          const now = Date.now();

          // Get jobs that are ready to run
          const readyJobs = jobIds
            .map((id) => entityStore.entities.jobs[id])
            .filter((job): job is JobEntity => {
              if (!job) return false;
              if (job.status === 'pending') return true;
              if (job.status === 'scheduled' && job.scheduledAt && job.scheduledAt <= now) return true;
              return false;
            });

          if (readyJobs.length === 0) return undefined;

          // Sort by priority then creation time
          readyJobs.sort((a, b) => {
            const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return a.createdAt - b.createdAt;
          });

          return toQueueJob(readyJobs[0]);
        },

        setProcessing: (processing) => {
          if (!featureFlags.queueRunnerV2) {
            set({ isProcessing: processing });
            return;
          }

          if (processing) {
            get().startRunner();
            return;
          }

          get().stopRunner();
        },
        setPaused: (paused) => {
          if (!featureFlags.queueRunnerV2) {
            set({ isPaused: paused });
            return;
          }

          if (paused) {
            get().pauseRunner();
            return;
          }

          const state = get();
          if (state.runnerStatus === 'paused') {
            state.startRunner();
            return;
          }
          set({ isPaused: false });
        },

        startRunner: () => {
          const state = get();
          if (state.runnerStatus === 'running') {
            return;
          }

          const hasPendingJob = hasRunnableJob(state.jobIds);
          if (!hasPendingJob && !state.activeJobId) {
            set({
              runnerStatus: 'idle',
              isProcessing: false,
              isPaused: false,
            });
            return;
          }

          const nextVersion = state.runnerStatus === 'idle'
            ? state.runnerVersion + 1
            : state.runnerVersion;

          set({
            runnerStatus: 'running',
            isProcessing: true,
            isPaused: false,
            runnerVersion: nextVersion,
          });

          if (!state.activeJobId) {
            void runQueueRunner(nextVersion);
          }
        },

        pauseRunner: () => {
          const state = get();
          if (state.runnerStatus !== 'running') {
            return;
          }
          set({
            runnerStatus: 'paused',
            isPaused: true,
            isProcessing: true,
          });
        },

        stopRunner: () => {
          const state = get();
          const nextVersion = state.runnerVersion + 1;
          const hasActiveJob = !!state.activeJobId;

          if (activeQueueSocket) {
            try {
              activeQueueSocket.close(4000, 'Queue stopped');
            } catch {
              // best effort
            }
            activeQueueSocket = null;
          }

          if (state.activeJobId) {
            state.updateJob(state.activeJobId, {
              status: 'cancelled',
              completedAt: Date.now(),
              error: 'Stopped by user',
            });
          }

          set({
            runnerStatus: hasActiveJob ? 'stopping' : 'idle',
            isProcessing: false,
            isPaused: false,
            activeJobId: null,
            activeConnectionId: null,
            runnerVersion: nextVersion,
          });

          if (hasActiveJob) {
            setTimeout(() => finalizeRunnerIdle(nextVersion), 0);
          }
        },

        createBatch: (name) => {
          const id = generateBatchId();
          const batchEntity: BatchEntity = {
            id,
            name,
            createdAt: Date.now(),
            jobCount: 0,
          };
          useEntityStore.getState().setEntity('batches', batchEntity);
          set((state) => ({
            batchIds: [...state.batchIds, id],
          }));
          return id;
        },

        deleteBatch: (id) => {
          const entityStore = useEntityStore.getState();
          const { jobIds } = get();

          // Remove all jobs in the batch
          const batchJobIds = jobIds.filter((jid) => {
            const job = entityStore.entities.jobs[jid];
            return job && job.batchId === id;
          });

          entityStore.removeEntities('jobs', batchJobIds);
          entityStore.removeEntity('batches', id);

          set((state) => ({
            jobIds: state.jobIds.filter((jid) => !batchJobIds.includes(jid)),
            batchIds: state.batchIds.filter((bid) => bid !== id),
          }));
        },

        getJobsInBatch: (batchId) => {
          const entityStore = useEntityStore.getState();
          const { jobIds } = get();
          return jobIds
            .map((id) => entityStore.entities.jobs[id])
            .filter((job): job is JobEntity => job !== undefined && job.batchId === batchId)
            .map(toQueueJob);
        },

        moveJob: (id, direction) => {
          set((state) => {
            const index = state.jobIds.indexOf(id);
            if (index === -1) return state;

            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= state.jobIds.length) return state;

            const newJobIds = [...state.jobIds];
            [newJobIds[index], newJobIds[newIndex]] = [newJobIds[newIndex], newJobIds[index]];
            return { jobIds: newJobIds };
          });
        },

        reorderJobs: (newJobIds) => {
          set((state) => {
            const otherIds = state.jobIds.filter((id) => !newJobIds.includes(id));
            return { jobIds: [...newJobIds, ...otherIds] };
          });
        },

        selectJob: (id) => {
          set((state) => ({
            selectedJobIds: state.selectedJobIds.includes(id)
              ? state.selectedJobIds
              : [...state.selectedJobIds, id],
          }));
        },

        deselectJob: (id) => {
          set((state) => ({
            selectedJobIds: state.selectedJobIds.filter((jid) => jid !== id),
          }));
        },

        selectAllJobs: () => {
          set((state) => ({
            selectedJobIds: [...state.jobIds],
          }));
        },

        clearSelection: () => set({ selectedJobIds: [] }),

        removeSelectedJobs: () => {
          const { selectedJobIds } = get();
          get().removeJobs(selectedJobIds);
        },

        setJobPriority: (id, priority) => {
          useEntityStore.getState().updateEntity('jobs', id, { priority });
        },

        scheduleJob: (id, scheduledAt) => {
          useEntityStore.getState().updateEntity('jobs', id, {
            scheduledAt,
            status: 'scheduled'
          });
        },

        unscheduleJob: (id) => {
          useEntityStore.getState().updateEntity('jobs', id, {
            scheduledAt: undefined,
            status: 'pending'
          });
        },

        getScheduledJobs: () => {
          const entityStore = useEntityStore.getState();
          const { jobIds } = get();
          return jobIds
            .map((id) => entityStore.entities.jobs[id])
            .filter((job): job is JobEntity => job !== undefined && job.status === 'scheduled')
            .map(toQueueJob);
        },

        getDueJobs: () => {
          const entityStore = useEntityStore.getState();
          const { jobIds } = get();
          const now = Date.now();
          return jobIds
            .map((id) => entityStore.entities.jobs[id])
            .filter((job): job is JobEntity =>
              job !== undefined &&
              job.status === 'scheduled' &&
              job.scheduledAt !== undefined &&
              job.scheduledAt <= now
            )
            .map(toQueueJob);
        },

        getPendingCount: () => {
          const entityStore = useEntityStore.getState();
          const { jobIds } = get();
          return jobIds.filter((id) => {
            const job = entityStore.entities.jobs[id];
            return job && (job.status === 'pending' || job.status === 'scheduled');
          }).length;
        },

        getGeneratingCount: () => {
          const entityStore = useEntityStore.getState();
          const { jobIds } = get();
          return jobIds.filter((id) => {
            const job = entityStore.entities.jobs[id];
            return job && job.status === 'generating';
          }).length;
        },

        getCompletedCount: () => {
          const entityStore = useEntityStore.getState();
          const { jobIds } = get();
          return jobIds.filter((id) => {
            const job = entityStore.entities.jobs[id];
            return job && job.status === 'completed';
          }).length;
        },
      }),
      {
        name: 'swarmui-queue',
        partialize: (state) => ({
          jobIds: state.jobIds,
          batchIds: state.batchIds,
          // Don't persist processing state or selection
        }),
      }
    ),
    { name: 'QueueStore' }
  )
);
