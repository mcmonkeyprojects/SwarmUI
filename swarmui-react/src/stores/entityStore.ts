/**
 * Entity Store
 * 
 * Centralized normalized entity storage for all application data.
 * Provides O(1) lookups, automatic deduplication, and optimistic updates.
 */

import { create } from 'zustand';
import { persist, devtools, createJSONStorage } from 'zustand/middleware';
import { createIndexedDbStorage } from '../lib/indexedDbStorage';
import type {
    EntitiesState,
    EntityType,
    EntityTypeMap,
    PendingOperation,
    JobEntity,
    BaseEntity,
} from './entityTypes';

// ============================================================================
// Store State
// ============================================================================

interface EntityStoreState {
    entities: EntitiesState;
    pendingOperations: PendingOperation[];
}

interface EntityStoreActions {
    // Entity CRUD operations
    setEntity: <K extends EntityType>(type: K, entity: EntityTypeMap[K]) => void;
    setEntities: <K extends EntityType>(type: K, entities: EntityTypeMap[K][]) => void;
    updateEntity: <K extends EntityType>(type: K, id: string, updates: Partial<EntityTypeMap[K]>) => void;
    removeEntity: <K extends EntityType>(type: K, id: string) => void;
    removeEntities: <K extends EntityType>(type: K, ids: string[]) => void;

    // Getters
    getEntity: <K extends EntityType>(type: K, id: string) => EntityTypeMap[K] | undefined;
    getEntities: <K extends EntityType>(type: K, ids: string[]) => EntityTypeMap[K][];
    getAllEntities: <K extends EntityType>(type: K) => EntityTypeMap[K][];
    getAllIds: <K extends EntityType>(type: K) => string[];

    // Optimistic update operations
    addPendingOperation: (operation: Omit<PendingOperation, 'id' | 'timestamp'>) => string;
    commitOperation: (operationId: string) => void;
    rollbackOperation: (operationId: string) => void;

    // Batch operations
    mergeEntities: <K extends EntityType>(type: K, entities: EntityTypeMap[K][]) => void;
    clearEntityType: <K extends EntityType>(type: K) => void;

    // Reset
    reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialEntities: EntitiesState = {
    jobs: {},
    batches: {},
    images: {},
    history: {},
    favorites: {},
    presets: {},
    workflows: {},
};

const initialState: EntityStoreState = {
    entities: initialEntities,
    pendingOperations: [],
};

// ============================================================================
// Utility Functions
// ============================================================================

const generateOperationId = () => `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// ============================================================================
// Store
// ============================================================================

export const useEntityStore = create<EntityStoreState & EntityStoreActions>()(
    devtools(
        persist(
            (set, get) => ({
                ...initialState,

                // ======================================================================
                // Entity CRUD Operations
                // ======================================================================

                setEntity: (type, entity) => {
                    set((state) => ({
                        entities: {
                            ...state.entities,
                            [type]: {
                                ...state.entities[type],
                                [entity.id]: entity,
                            },
                        },
                    }));
                },

                setEntities: (type, entities) => {
                    set((state) => {
                        const newCollection = { ...state.entities[type] };
                        for (const entity of entities) {
                            newCollection[entity.id] = entity;
                        }
                        return {
                            entities: {
                                ...state.entities,
                                [type]: newCollection,
                            },
                        };
                    });
                },

                updateEntity: (type, id, updates) => {
                    set((state) => {
                        const existing = state.entities[type][id];
                        if (!existing) return state;

                        return {
                            entities: {
                                ...state.entities,
                                [type]: {
                                    ...state.entities[type],
                                    [id]: { ...existing, ...updates },
                                },
                            },
                        };
                    });
                },

                removeEntity: (type, id) => {
                    set((state) => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { [id]: _, ...remaining } = state.entities[type];
                        return {
                            entities: {
                                ...state.entities,
                                [type]: remaining,
                            },
                        };
                    });
                },

                removeEntities: (type, ids) => {
                    set((state) => {
                        const newCollection = { ...state.entities[type] };
                        for (const id of ids) {
                            delete newCollection[id];
                        }
                        return {
                            entities: {
                                ...state.entities,
                                [type]: newCollection,
                            },
                        };
                    });
                },

                // ======================================================================
                // Getters
                // ======================================================================

                getEntity: (type, id) => {
                    return get().entities[type][id] as EntityTypeMap[typeof type] | undefined;
                },

                getEntities: (type, ids) => {
                    const collection = get().entities[type];
                    return ids
                        .map((id) => collection[id])
                        .filter(Boolean) as EntityTypeMap[typeof type][];
                },

                getAllEntities: (type) => {
                    return Object.values(get().entities[type]) as EntityTypeMap[typeof type][];
                },

                getAllIds: (type) => {
                    return Object.keys(get().entities[type]);
                },

                // ======================================================================
                // Optimistic Update Operations
                // ======================================================================

                addPendingOperation: (operation) => {
                    const id = generateOperationId();
                    const pendingOp: PendingOperation = {
                        ...operation,
                        id,
                        timestamp: Date.now(),
                    };

                    set((state) => ({
                        pendingOperations: [...state.pendingOperations, pendingOp],
                    }));

                    return id;
                },

                commitOperation: (operationId) => {
                    set((state) => ({
                        pendingOperations: state.pendingOperations.filter(
                            (op) => op.id !== operationId
                        ),
                    }));
                },

                rollbackOperation: (operationId) => {
                    const { pendingOperations } = get();
                    const operation = pendingOperations.find((op) => op.id === operationId);

                    if (!operation) return;

                    set((state) => {
                        const newEntities: EntitiesState = { ...state.entities };
                        const entityType = operation.entityType;

                        if (operation.operation === 'create') {
                            // Rollback create: remove the entity
                            const collection = { ...state.entities[entityType] } as Record<string, BaseEntity>;
                            delete collection[operation.entityId];
                            (newEntities as Record<EntityType, Record<string, BaseEntity>>)[entityType] = collection;
                        } else if (operation.operation === 'update' && operation.previousState) {
                            // Rollback update: restore previous state
                            const collection = { ...state.entities[entityType] } as Record<string, BaseEntity>;
                            collection[operation.entityId] = operation.previousState;
                            (newEntities as Record<EntityType, Record<string, BaseEntity>>)[entityType] = collection;
                        } else if (operation.operation === 'delete' && operation.previousState) {
                            // Rollback delete: restore the entity
                            const collection = { ...state.entities[entityType] } as Record<string, BaseEntity>;
                            collection[operation.entityId] = operation.previousState;
                            (newEntities as Record<EntityType, Record<string, BaseEntity>>)[entityType] = collection;
                        }

                        return {
                            entities: newEntities,
                            pendingOperations: state.pendingOperations.filter(
                                (op) => op.id !== operationId
                            ),
                        };
                    });
                },

                // ======================================================================
                // Batch Operations
                // ======================================================================

                mergeEntities: (type, entities) => {
                    set((state) => {
                        const newCollection = { ...state.entities[type] };
                        for (const entity of entities) {
                            // Only add if not already present, or merge if exists
                            const existing = newCollection[entity.id];
                            if (existing) {
                                newCollection[entity.id] = { ...existing, ...entity };
                            } else {
                                newCollection[entity.id] = entity;
                            }
                        }
                        return {
                            entities: {
                                ...state.entities,
                                [type]: newCollection,
                            },
                        };
                    });
                },

                clearEntityType: (type) => {
                    set((state) => ({
                        entities: {
                            ...state.entities,
                            [type]: {},
                        },
                    }));
                },

                // ======================================================================
                // Reset
                // ======================================================================

                reset: () => {
                    set(initialState);
                },
            }),
            {
                name: 'swarmui-entities',
                storage: createJSONStorage(() => createIndexedDbStorage('swarmui-entities')),
                partialize: (state) => ({
                    entities: {
                        // Don't persist jobs that are in progress
                        jobs: Object.fromEntries(
                            Object.entries(state.entities.jobs).filter(
                                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                ([_id, job]) => (job as JobEntity).status !== 'generating'
                            )
                        ),
                        batches: state.entities.batches,
                        images: state.entities.images,
                        history: state.entities.history,
                        favorites: state.entities.favorites,
                        presets: state.entities.presets,
                        workflows: state.entities.workflows,
                    },
                    // Don't persist pending operations
                }),
            }
        ),
        { name: 'EntityStore' }
    )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectEntity = <K extends EntityType>(
    type: K,
    id: string
) => (state: EntityStoreState): EntityTypeMap[K] | undefined => {
    return state.entities[type][id] as EntityTypeMap[K] | undefined;
};

export const selectEntities = <K extends EntityType>(
    type: K,
    ids: string[]
) => (state: EntityStoreState): EntityTypeMap[K][] => {
    const collection = state.entities[type];
    return ids.map((id) => collection[id]).filter(Boolean) as EntityTypeMap[K][];
};

export const selectAllEntities = <K extends EntityType>(
    type: K
) => (state: EntityStoreState): EntityTypeMap[K][] => {
    return Object.values(state.entities[type]) as EntityTypeMap[K][];
};

export const selectEntityIds = <K extends EntityType>(
    type: K
) => (state: EntityStoreState): string[] => {
    return Object.keys(state.entities[type]);
};

export const selectHasPendingOperations = (state: EntityStoreState): boolean => {
    return state.pendingOperations.length > 0;
};
