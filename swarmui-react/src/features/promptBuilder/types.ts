export const PROMPT_BUILDER_BLOCK_START = '<comment:swarm-builder-start:v1>';
export const PROMPT_BUILDER_BLOCK_END = '<comment:swarm-builder-end>';

export type PromptBuilderSyncState = 'synced' | 'manual_override' | 'out_of_sync';

export type BuilderRegionShape = 'rectangle' | 'background';
export type BuilderRegionSource = 'character' | 'canvas' | 'manual';

export interface BuilderRegionRule {
  id: string;
  shape: BuilderRegionShape;
  source?: BuilderRegionSource;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strength: number;
  useInpaint: boolean;
  inpaintStrength: number;
  prompt: string;
  enabled: boolean;
}

export type BuilderSegmentModelType = 'clip-seg' | 'yolo';

export interface BuilderSegmentRule {
  id: string;
  modelType: BuilderSegmentModelType;
  textMatch: string;
  yoloModel: string;
  yoloId: number;
  yoloClassIds: string;
  creativity: number;
  threshold: number;
  invertMask: boolean;
  prompt: string;
  sampler: string;
  scheduler: string;
  enabled: boolean;
}

export interface PromptBuilderSourceContext {
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

export interface PromptBuilderCompileMeta {
  managedBlock: string;
  managedLines: string[];
  blockHash: string;
  hasContent: boolean;
  regionCount: number;
  segmentCount: number;
}

export interface PromptBuilderSnapshot {
  regions: BuilderRegionRule[];
  segments: BuilderSegmentRule[];
}

export interface CanvasApplyPayload {
  mode: 'inpaint' | 'outpaint' | 'regional';
  sessionId?: string;
  workflowStep?: string;
  sourceImageUrl: string;
  sourceImageWidth: number;
  sourceImageHeight: number;
  initImageDataUrl?: string;
  maskDataUrl: string | null;
  hasMask: boolean;
  hasOutpaintCanvas?: boolean;
  regions: BuilderRegionRule[];
  segments: BuilderSegmentRule[];
  managedBlock: string;
  managedBlockHash: string;
  syncState: PromptBuilderSyncState;
}
