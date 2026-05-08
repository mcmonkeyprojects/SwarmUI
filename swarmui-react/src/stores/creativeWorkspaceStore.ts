import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createIndexedDbStorage } from '../lib/indexedDbStorage';
import type { GenerateParams } from '../api/types';
import type {
  AssetPack,
  AssetPackItem,
  CreativeProject,
  ProjectLinkedItem,
  ProjectTemplateId,
  PromptSnippet,
  ReviewSet,
  ReviewSetItem,
  RunMatrix,
  RunMatrixAxis,
  SceneBrief,
  TrainingDataset,
  TrainingDatasetItem,
} from '../features/creativeWorkspace/types';
import { PROJECT_TEMPLATE_LABELS } from '../features/creativeWorkspace/types';

interface CreativeWorkspaceState {
  projects: CreativeProject[];
  activeProjectId: string | null;
  reviewSets: ReviewSet[];
  runMatrices: RunMatrix[];
  assetPacks: AssetPack[];
  sceneBriefs: SceneBrief[];
  trainingDatasets: TrainingDataset[];
  createProject: (input: {
    name: string;
    description?: string;
    templateId?: ProjectTemplateId;
  }) => string;
  createProjectFromTemplate: (templateId: ProjectTemplateId) => string;
  setActiveProject: (projectId: string | null) => void;
  ensureActiveProject: () => string;
  updateProjectNotes: (projectId: string, notes: string) => void;
  addItemToProject: (projectId: string, item: Omit<ProjectLinkedItem, 'id' | 'createdAt'>) => string;
  capturePromptSnippet: (
    projectId: string,
    snippet: Omit<PromptSnippet, 'id' | 'createdAt'>
  ) => string;
  saveSceneBrief: (brief: SceneBrief, projectId?: string | null) => string;
  createReviewSet: (input: {
    name: string;
    description?: string;
    projectId?: string | null;
    items?: Array<Omit<ReviewSetItem, 'id' | 'createdAt' | 'updatedAt'>>;
  }) => string;
  addItemsToReviewSet: (
    reviewSetId: string,
    items: Array<Omit<ReviewSetItem, 'id' | 'createdAt' | 'updatedAt'>>
  ) => void;
  createRunMatrix: (input: {
    name: string;
    projectId?: string | null;
    baseParams: Partial<GenerateParams>;
    axes: RunMatrixAxis[];
  }) => string;
  createAssetPack: (input: {
    name: string;
    description?: string;
    projectId?: string | null;
    items: AssetPackItem[];
    recommendedParams?: Partial<GenerateParams>;
  }) => string;
  createTrainingDataset: (input: {
    name: string;
    projectId?: string | null;
    baseModel?: string;
    triggerWords?: string[];
    resolution?: number;
    items?: Array<Omit<TrainingDatasetItem, 'id' | 'createdAt' | 'updatedAt'>>;
  }) => string;
  addItemsToTrainingDataset: (
    datasetId: string,
    items: Array<Omit<TrainingDatasetItem, 'id' | 'createdAt' | 'updatedAt'>>
  ) => void;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowStamped<T extends object>(value: T): T & { createdAt: number; updatedAt: number } {
  const now = Date.now();
  return { ...value, createdAt: now, updatedAt: now };
}

function getTemplateDescription(templateId: ProjectTemplateId): string {
  switch (templateId) {
    case 'portrait-pack':
      return 'Collect character portraits, prompt snippets, model settings, and review sets.';
    case 'roleplay-campaign':
      return 'Track roleplay characters, sessions, scene briefs, generated scenes, and storyboards.';
    case 'lora-training-set':
      return 'Curate source images, captions, trigger words, and training dataset candidates.';
    case 'model-comparison':
      return 'Compare models, LoRA stacks, queue campaigns, and shortlisted outputs.';
    case 'video-storyboard':
      return 'Plan scenes, prompts, keyframes, source images, and video workflow outputs.';
    default:
      return 'A flexible creative workspace for prompts, assets, outputs, queues, and notes.';
  }
}

function estimateMatrixJobs(axes: RunMatrixAxis[]): number {
  if (axes.length === 0) {
    return 0;
  }
  return axes.reduce((total, axis) => total * Math.max(1, axis.values.length), 1);
}

function mapReviewItems(
  items: Array<Omit<ReviewSetItem, 'id' | 'createdAt' | 'updatedAt'>>
): ReviewSetItem[] {
  return items.map((item) => nowStamped({ ...item, id: generateId('review-item') }));
}

function mapDatasetItems(
  items: Array<Omit<TrainingDatasetItem, 'id' | 'createdAt' | 'updatedAt'>>
): TrainingDatasetItem[] {
  return items.map((item) => nowStamped({ ...item, id: generateId('dataset-item') }));
}

export const useCreativeWorkspaceStore = create<CreativeWorkspaceState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      reviewSets: [],
      runMatrices: [],
      assetPacks: [],
      sceneBriefs: [],
      trainingDatasets: [],

      createProject: (input) => {
        const id = generateId('project');
        const templateId = input.templateId ?? 'blank';
        const project: CreativeProject = nowStamped({
          id,
          name: input.name.trim() || PROJECT_TEMPLATE_LABELS[templateId],
          description: input.description ?? getTemplateDescription(templateId),
          templateId,
          notes: '',
          linkedItems: [],
          promptSnippets: [],
          assetPackIds: [],
          reviewSetIds: [],
          sceneBriefIds: [],
          trainingDatasetIds: [],
        });
        set((state) => ({
          projects: [project, ...state.projects],
          activeProjectId: id,
        }));
        return id;
      },

      createProjectFromTemplate: (templateId) =>
        get().createProject({
          name: PROJECT_TEMPLATE_LABELS[templateId],
          description: getTemplateDescription(templateId),
          templateId,
        }),

      setActiveProject: (projectId) => set({ activeProjectId: projectId }),

      ensureActiveProject: () => {
        const state = get();
        if (state.activeProjectId && state.projects.some((project) => project.id === state.activeProjectId)) {
          return state.activeProjectId;
        }
        return state.createProjectFromTemplate('blank');
      },

      updateProjectNotes: (projectId, notes) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId ? { ...project, notes, updatedAt: Date.now() } : project
          ),
        }));
      },

      addItemToProject: (projectId, item) => {
        const id = generateId('project-item');
        const linkedItem: ProjectLinkedItem = {
          ...item,
          id,
          createdAt: Date.now(),
        };
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  linkedItems: [linkedItem, ...project.linkedItems],
                  updatedAt: Date.now(),
                }
              : project
          ),
        }));
        return id;
      },

      capturePromptSnippet: (projectId, snippet) => {
        const id = generateId('prompt-snippet');
        const promptSnippet: PromptSnippet = {
          ...snippet,
          id,
          createdAt: Date.now(),
        };
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  promptSnippets: [promptSnippet, ...project.promptSnippets],
                  updatedAt: Date.now(),
                }
              : project
          ),
        }));
        return id;
      },

      saveSceneBrief: (brief, projectId = brief.projectId ?? null) => {
        const targetProjectId = projectId ?? get().activeProjectId;
        const savedBrief: SceneBrief = {
          ...brief,
          projectId: targetProjectId,
          provenance: {
            ...brief.provenance,
            projectId: targetProjectId,
          },
          updatedAt: Date.now(),
        };
        set((state) => ({
          sceneBriefs: [savedBrief, ...state.sceneBriefs.filter((item) => item.id !== savedBrief.id)],
          projects: targetProjectId
            ? state.projects.map((project) =>
                project.id === targetProjectId
                  ? {
                      ...project,
                      sceneBriefIds: [savedBrief.id, ...project.sceneBriefIds.filter((id) => id !== savedBrief.id)],
                      linkedItems: [
                        {
                          id: generateId('project-item'),
                          kind: 'scene-brief',
                          label: savedBrief.title,
                          refId: savedBrief.id,
                          provenance: savedBrief.provenance,
                          createdAt: Date.now(),
                        },
                        ...project.linkedItems,
                      ],
                      updatedAt: Date.now(),
                    }
                  : project
              )
            : state.projects,
        }));
        return savedBrief.id;
      },

      createReviewSet: (input) => {
        const id = generateId('review-set');
        const reviewSet: ReviewSet = nowStamped({
          id,
          projectId: input.projectId ?? get().activeProjectId,
          name: input.name.trim() || 'Review Set',
          description: input.description ?? '',
          items: mapReviewItems(input.items ?? []),
        });
        set((state) => ({
          reviewSets: [reviewSet, ...state.reviewSets],
          projects: reviewSet.projectId
            ? state.projects.map((project) =>
                project.id === reviewSet.projectId
                  ? {
                      ...project,
                      reviewSetIds: [reviewSet.id, ...project.reviewSetIds],
                      linkedItems: [
                        {
                          id: generateId('project-item'),
                          kind: 'review-set',
                          label: reviewSet.name,
                          refId: reviewSet.id,
                          createdAt: Date.now(),
                        },
                        ...project.linkedItems,
                      ],
                      updatedAt: Date.now(),
                    }
                  : project
              )
            : state.projects,
        }));
        return id;
      },

      addItemsToReviewSet: (reviewSetId, items) => {
        const mappedItems = mapReviewItems(items);
        set((state) => ({
          reviewSets: state.reviewSets.map((reviewSet) =>
            reviewSet.id === reviewSetId
              ? {
                  ...reviewSet,
                  items: [...mappedItems, ...reviewSet.items],
                  updatedAt: Date.now(),
                }
              : reviewSet
          ),
        }));
      },

      createRunMatrix: (input) => {
        const id = generateId('run-matrix');
        const matrix: RunMatrix = nowStamped({
          id,
          projectId: input.projectId ?? get().activeProjectId,
          name: input.name.trim() || 'Queue Campaign',
          baseParams: input.baseParams,
          axes: input.axes,
          estimatedJobs: estimateMatrixJobs(input.axes),
        });
        set((state) => ({
          runMatrices: [matrix, ...state.runMatrices],
        }));
        return id;
      },

      createAssetPack: (input) => {
        const id = generateId('asset-pack');
        const pack: AssetPack = nowStamped({
          id,
          projectId: input.projectId ?? get().activeProjectId,
          name: input.name.trim() || 'Asset Pack',
          description: input.description ?? '',
          items: input.items,
          recommendedParams: input.recommendedParams ?? {},
        });
        set((state) => ({
          assetPacks: [pack, ...state.assetPacks],
          projects: pack.projectId
            ? state.projects.map((project) =>
                project.id === pack.projectId
                  ? {
                      ...project,
                      assetPackIds: [pack.id, ...project.assetPackIds],
                      updatedAt: Date.now(),
                    }
                  : project
              )
            : state.projects,
        }));
        return id;
      },

      createTrainingDataset: (input) => {
        const id = generateId('training-dataset');
        const dataset: TrainingDataset = nowStamped({
          id,
          projectId: input.projectId ?? get().activeProjectId,
          name: input.name.trim() || 'Training Dataset',
          baseModel: input.baseModel,
          triggerWords: input.triggerWords ?? [],
          resolution: input.resolution ?? 1024,
          items: mapDatasetItems(input.items ?? []),
        });
        set((state) => ({
          trainingDatasets: [dataset, ...state.trainingDatasets],
          projects: dataset.projectId
            ? state.projects.map((project) =>
                project.id === dataset.projectId
                  ? {
                      ...project,
                      trainingDatasetIds: [dataset.id, ...project.trainingDatasetIds],
                      linkedItems: [
                        {
                          id: generateId('project-item'),
                          kind: 'training-dataset',
                          label: dataset.name,
                          refId: dataset.id,
                          createdAt: Date.now(),
                        },
                        ...project.linkedItems,
                      ],
                      updatedAt: Date.now(),
                    }
                  : project
              )
            : state.projects,
        }));
        return id;
      },

      addItemsToTrainingDataset: (datasetId, items) => {
        const mappedItems = mapDatasetItems(items);
        set((state) => ({
          trainingDatasets: state.trainingDatasets.map((dataset) =>
            dataset.id === datasetId
              ? {
                  ...dataset,
                  items: [...mappedItems, ...dataset.items],
                  updatedAt: Date.now(),
                }
              : dataset
          ),
        }));
      },
    }),
    {
      name: 'swarmui-creative-workspace-v1',
      storage: createJSONStorage(() => createIndexedDbStorage('swarmui-creative-workspace')),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        reviewSets: state.reviewSets,
        runMatrices: state.runMatrices,
        assetPacks: state.assetPacks,
        sceneBriefs: state.sceneBriefs,
        trainingDatasets: state.trainingDatasets,
      }),
    }
  )
);
