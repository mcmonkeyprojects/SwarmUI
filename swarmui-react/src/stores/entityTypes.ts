/**
 * Entity Types
 * 
 * Centralized type definitions for normalized entities.
 */

import type { GenerateParams } from '../api/types';

// ============================================================================
// Core Entity Types
// ============================================================================

/** Base entity interface - all entities must have an ID */
export interface BaseEntity {
    id: string;
}

/** Job priority levels */
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Job status */
export type JobStatus = 'pending' | 'scheduled' | 'generating' | 'completed' | 'failed' | 'cancelled';

/** Queue job entity */
export interface JobProvenance {
    source: 'generate' | 'history' | 'workflow' | 'roleplay' | 'queue' | 'training' | 'asset';
    projectId?: string | null;
    prompt?: string | null;
    negativePrompt?: string | null;
    model?: string | null;
    loras?: string[];
    initImage?: string | null;
    parentImageId?: string | null;
    childImageIds?: string[];
    roleplayCharacterId?: string | null;
    roleplayCharacterName?: string | null;
    roleplaySessionId?: string | null;
    roleplayMessageId?: string | null;
    queueJobId?: string | null;
    queueBatchId?: string | null;
    workflowId?: string | null;
    trainingDatasetId?: string | null;
    capturedAt?: number;
    /** Legacy Generate recipe provenance. Kept only for persisted queue compatibility. */
    recipeId?: string;
    /** Legacy Generate recipe provenance. Kept only for persisted queue compatibility. */
    recipeName?: string;
    workspaceMode?: 'quick' | 'guided' | 'advanced' | 'video';
    historyImagePath?: string;
    workflowMode?: 'wizard' | 'comfy';
}

export interface JobEntity extends BaseEntity {
    name?: string;
    params: GenerateParams;
    status: JobStatus;
    progress: number;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    scheduledAt?: number;
    imageIds: string[];  // References to ImageEntity IDs
    error?: string;
    batchId?: string;
    priority: JobPriority;
    tags?: string[];
    estimatedDuration?: number;
    provenance?: JobProvenance;
}

/** Queue batch entity */
export interface BatchEntity extends BaseEntity {
    name: string;
    createdAt: number;
    jobCount: number;
}

/** Image entity - for generated images */
export interface ImageEntity extends BaseEntity {
    src: string;
    path: string;
    timestamp: number;
    metadata?: {
        prompt?: string;
        negativePrompt?: string;
        model?: string;
        seed?: number;
        steps?: number;
        cfgScale?: number;
        width?: number;
        height?: number;
        sampler?: string;
    };
    jobId?: string;
    batchIndex?: string;
}

/** History entry entity */
export interface HistoryEntryEntity extends BaseEntity {
    timestamp: number;
    prompt: string;
    negativePrompt: string;
    model: string;
    imageIds: string[];  // References to ImageEntity IDs (or paths for backward compat)
    imagePaths: string[]; // Keep for backward compatibility
    params: {
        steps?: number;
        cfgScale?: number;
        width?: number;
        height?: number;
        seed?: number;
        sampler?: string;
    };
}

/** Favorite reference entity */
export interface FavoriteEntity extends BaseEntity {
    // ID is the image path for favorites
    timestamp: number;
    prompt?: string;
    model?: string;
}

/** Preset entity */
export interface PresetEntity extends BaseEntity {
    name: string;
    description?: string;
    params: Partial<GenerateParams>;
    createdAt: number;
}

/** Workflow entity */
export interface WorkflowEntity extends BaseEntity {
    name: string;
    description?: string;
    data: {
        nodes: Array<{
            id: string;
            type: string;
            position: { x: number; y: number };
        }>;
        connections: Array<{
            from: string;
            to: string;
        }>;
    };
    preview?: string;
    createdAt: number;
    updatedAt: number;
}

// ============================================================================
// Entity State Types
// ============================================================================

/** Entity type names for accessing the entity store */
export type EntityType = 'jobs' | 'batches' | 'images' | 'history' | 'favorites' | 'presets' | 'workflows';

/** Map of entity type to entity interface */
export interface EntityTypeMap {
    jobs: JobEntity;
    batches: BatchEntity;
    images: ImageEntity;
    history: HistoryEntryEntity;
    favorites: FavoriteEntity;
    presets: PresetEntity;
    workflows: WorkflowEntity;
}

/** Normalized entity collection (lookup by ID) */
export type EntityCollection<T extends BaseEntity> = Record<string, T>;

/** All entities state */
export interface EntitiesState {
    jobs: EntityCollection<JobEntity>;
    batches: EntityCollection<BatchEntity>;
    images: EntityCollection<ImageEntity>;
    history: EntityCollection<HistoryEntryEntity>;
    favorites: EntityCollection<FavoriteEntity>;
    presets: EntityCollection<PresetEntity>;
    workflows: EntityCollection<WorkflowEntity>;
}

// ============================================================================
// Optimistic Update Types
// ============================================================================

/** Pending optimistic operation */
export interface PendingOperation {
    id: string;
    entityType: EntityType;
    entityId: string;
    operation: 'create' | 'update' | 'delete';
    previousState?: BaseEntity;
    timestamp: number;
}

/** Optimistic update result */
export interface OptimisticResult<T> {
    /** The optimistic entity (may be rolled back) */
    optimisticValue: T;
    /** Commit the change (remove from pending) */
    commit: () => void;
    /** Rollback to previous state */
    rollback: () => void;
    /** The pending operation ID */
    operationId: string;
}
