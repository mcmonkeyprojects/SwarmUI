import type { GenerateParams } from '../../api/types';
import type { AssetCatalogKind } from '../assets/catalog';

export type ProvenanceSource =
  | 'generate'
  | 'roleplay'
  | 'history'
  | 'queue'
  | 'workflow'
  | 'training'
  | 'asset';

export interface CreativeProvenance {
  source: ProvenanceSource;
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
  workflowMode?: 'wizard' | 'comfy';
  trainingDatasetId?: string | null;
  capturedAt: number;
}

export type ProjectTemplateId =
  | 'blank'
  | 'portrait-pack'
  | 'roleplay-campaign'
  | 'lora-training-set'
  | 'model-comparison'
  | 'video-storyboard';

export type ProjectLinkedItemKind =
  | 'prompt'
  | 'roleplay-character'
  | 'roleplay-session'
  | 'history-image'
  | 'queue-job'
  | 'queue-batch'
  | 'workflow'
  | 'asset'
  | 'review-set'
  | 'scene-brief'
  | 'training-dataset';

export interface ProjectLinkedItem {
  id: string;
  kind: ProjectLinkedItemKind;
  label: string;
  refId: string;
  preview?: string | null;
  provenance?: CreativeProvenance;
  createdAt: number;
}

export interface PromptSnippet {
  id: string;
  label: string;
  prompt: string;
  negativePrompt?: string;
  provenance?: CreativeProvenance;
  createdAt: number;
}

export interface CreativeProject {
  id: string;
  name: string;
  description: string;
  templateId: ProjectTemplateId;
  notes: string;
  linkedItems: ProjectLinkedItem[];
  promptSnippets: PromptSnippet[];
  assetPackIds: string[];
  reviewSetIds: string[];
  sceneBriefIds: string[];
  trainingDatasetIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type ReviewSetItemState = 'unreviewed' | 'shortlisted' | 'rejected' | 'dataset-candidate';

export interface ReviewSetItem {
  id: string;
  imageId: string;
  imageSrc: string;
  state: ReviewSetItemState;
  rating: number | null;
  note: string;
  provenance?: CreativeProvenance;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewSet {
  id: string;
  projectId?: string | null;
  name: string;
  description: string;
  items: ReviewSetItem[];
  createdAt: number;
  updatedAt: number;
}

export interface RunMatrixAxis {
  id: string;
  paramKey: keyof GenerateParams | string;
  label: string;
  values: Array<string | number | boolean>;
}

export interface RunMatrix {
  id: string;
  projectId?: string | null;
  name: string;
  baseParams: Partial<GenerateParams>;
  axes: RunMatrixAxis[];
  estimatedJobs: number;
  provenance?: CreativeProvenance;
  createdAt: number;
  updatedAt: number;
}

export interface AssetPackItem {
  id: string;
  kind: AssetCatalogKind;
  name: string;
  title: string;
  compatibilityNote?: string;
}

export interface AssetPack {
  id: string;
  projectId?: string | null;
  name: string;
  description: string;
  items: AssetPackItem[];
  recommendedParams: Partial<GenerateParams>;
  provenance?: CreativeProvenance;
  createdAt: number;
  updatedAt: number;
}

export interface SceneBrief {
  id: string;
  projectId?: string | null;
  title: string;
  prompt: string;
  negativePrompt?: string;
  appearancePrefix?: string;
  sceneSummary?: string;
  referenceImageUrls?: string[];
  generateParams: Partial<GenerateParams>;
  memorySummary?: string;
  openThreads: string[];
  provenance: CreativeProvenance;
  createdAt: number;
  updatedAt: number;
}

export type TrainingDatasetItemState =
  | 'include'
  | 'reject'
  | 'crop-needed'
  | 'caption-needed'
  | 'duplicate'
  | 'low-quality';

export interface TrainingDatasetItem {
  id: string;
  imageSrc: string;
  caption: string;
  state: TrainingDatasetItemState;
  provenance?: CreativeProvenance;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingDataset {
  id: string;
  projectId?: string | null;
  name: string;
  baseModel?: string;
  triggerWords: string[];
  resolution: number;
  items: TrainingDatasetItem[];
  createdAt: number;
  updatedAt: number;
}

export const PROJECT_TEMPLATE_LABELS: Record<ProjectTemplateId, string> = {
  blank: 'Blank Project',
  'portrait-pack': 'Portrait Pack',
  'roleplay-campaign': 'Roleplay Campaign',
  'lora-training-set': 'LoRA Training Set',
  'model-comparison': 'Model Comparison',
  'video-storyboard': 'Video Storyboard',
};
