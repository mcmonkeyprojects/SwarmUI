import type { RuntimeMode } from '../config/runtimeEndpoints';

// SwarmUI API Types

export interface SessionResponse {
  session_id: string;
  user_id: string;
  output_append_user: boolean;
  version: string;
  server_id: string;
  permissions: string[];
}

export interface APIError {
  error?: string;
  error_id?: string;
}

export interface GenerateParams {
  // Core parameters
  // NOTE: SwarmUI parameter names are lowercase letters only (no underscores/spaces)
  // The backend converts "CFG Scale" -> "cfgscale", "CLIP Stop At Layer" -> "clipstopatlayer"
  prompt: string;
  negativeprompt?: string;
  images?: number;
  steps?: number;
  cfgscale?: number;  // NOT cfg_scale - SwarmUI uses no underscores
  seed?: number;
  width?: number;
  height?: number;
  model?: string;
  sampler?: string;
  scheduler?: string;

  // Init Image / Img2Img
  initimage?: string;
  initimagecreativity?: number;
  initimageresettonorm?: number;
  initimagenoise?: number;
  maskimage?: string;
  resizemode?: string;
  maskblur?: number;
  invertmask?: boolean;
  seamlesstileable?: string;  // '', 'both', 'horizontal', 'vertical'

  // Model Addons
  vae?: string;
  loras?: string;
  loraweights?: string;

  // Variation Seed
  variationseed?: number;
  variationseedstrength?: number;

  // Refiner
  refinermodel?: string;
  refinercontrol?: number;         // Legacy alias; backend expects refinercontrolpercentage
  refinercontrolpercentage?: number;
  refinerupscale?: number;
  refinermethod?: string;
  refinervae?: string;
  refinersteps?: number;           // Toggleable: Override step count for refiner stage
  refinercfgscale?: number;        // Toggleable: Override CFG scale for refiner stage
  refinerdotiling?: boolean;       // Enable tiling in refiner stage
  refinerupscalemethod?: string;   // pixel-*, model-*, or latent-* upscale method

  // Advanced Sampling
  clipstopatlayer?: number;  // NOT clipskip - SwarmUI calls it "CLIP Stop At Layer" -> "clipstopatlayer"

  // Additional Options
  batchsize?: number;
  removebackground?: boolean;
  donotsave?: boolean;
  dontsaveintermediates?: boolean;
  nopreviews?: boolean;

  // FreeU
  freeublockone?: number;  // SwarmUI: "FreeU Block 1" -> "freeublockone" (not freeu_enabled)
  freeublocktwo?: number;
  freeuskipone?: number;
  freeuskiptwo?: number;

  // Color Adjustment
  coloradjust?: string;

  // Video Generation
  videomodel?: string;
  videoframes?: number;
  videosteps?: number;
  videocfg?: number;
  videofps?: number;
  videoformat?: string;
  videoboomerang?: boolean;

  // Text2Video
  text2videoframes?: number;
  text2videofps?: number;
  text2videoformat?: string;

  // ControlNet
  controlnetimageinput?: string;
  controlnetmodel?: string;
  controlnetstrength?: number;
  controlnetstart?: number;
  controlnetend?: number;
  controlnettwoimageinput?: string;
  controlnettwomodel?: string;
  controlnettwostrength?: number;
  controlnettwostart?: number;
  controlnettwoend?: number;
  controlnetthreeimageinput?: string;
  controlnetthreemodel?: string;
  controlnetthreestrength?: number;
  controlnetthreestart?: number;
  controlnetthreeend?: number;
  controlnetpreprocessor?: string;
  controlnettwopreprocessor?: string;
  controlnetthreepreprocessor?: string;

  // Allow any additional parameters
  [key: string]: unknown;
}

export interface GenerationStatus {
  waiting_gens?: number;
  loading_models?: number;
  waiting_backends?: number;
  live_gens?: number;
}

export interface GenerationProgress {
  batch_index: string;
  overall_percent: number;
  current_percent: number;
  preview?: string;
  request_id?: string;
  stage_id?: string;
  stage_label?: string;
  stage_detail?: string;
  stage_index?: number;
  stage_count?: number;
  stages_remaining?: number;
  stage_task_index?: number;
  stage_task_count?: number;
  stage_tasks_remaining?: number;
  stage_current_step?: number;
  stage_total_steps?: number;
  backend_preview?: {
    preview_mode?: string;
    preview_method?: string;
    warning?: string | null;
    prompt_queued_ms?: number;
    execution_start_ms?: number;
    first_progress_ms?: number;
    first_preview_ms?: number;
    first_image_ms?: number;
    complete_ms?: number;
    preview_event_count?: number;
    first_preview_bytes?: number;
    average_preview_bytes?: number;
    final_image_bytes?: number;
    is_final?: boolean;
  };
}

export interface GeneratedImage {
  image: string;
  batch_index: string;
  metadata: string;
  request_id?: string;
}

export interface WebSocketMessage {
  status?: GenerationStatus;
  gen_progress?: GenerationProgress;
  image?: string;
  batch_index?: string;
  metadata?: string;
  request_id?: string;
  socket_intention?: 'close';
  success?: boolean;  // Model load completion indicator
  error?: string;
  error_id?: string;
  load_progress?: number;
  // Model download progress fields
  overall_percent?: number;
  current_percent?: number;
  per_second?: number;
}

export interface ImageListItem {
  src: string;
  metadata: string | Record<string, unknown> | null;
  starred: boolean;
  canonical_src?: string;
  preview_src?: string | null;
  media_type?: HistoryMediaType;
  created_at?: number;
  prompt_preview?: string | null;
  model?: string | null;
  width?: number | null;
  height?: number | null;
  seed?: number | null;
}

export interface ImageFolderResponse {
  folders: string[];
  files: ImageListItem[];
}

export type HistoryMediaType = 'all' | 'image' | 'video' | 'audio' | 'html';
export type HistorySortBy = 'Date' | 'Name';

export interface HistoryImageItem extends ImageListItem {
  canonical_src: string;
  preview_src: string | null;
  media_type: HistoryMediaType;
  created_at: number;
  prompt_preview: string | null;
  model: string | null;
  width: number | null;
  height: number | null;
  seed: number | null;
}

export interface ListImagesV2Params {
  path?: string;
  recursive?: boolean;
  depth?: number | null;
  query?: string | null;
  sortBy?: HistorySortBy;
  sortReverse?: boolean;
  starredOnly?: boolean;
  mediaType?: HistoryMediaType;
  cursor?: string | null;
  limit?: number;
}

export interface HistoryFolderResponseV2 {
  folders: string[];
  files: HistoryImageItem[];
  next_cursor: string | null;
  has_more: boolean;
  truncated: boolean;
  total_count: number;
}

export interface ExportHistoryZipParams extends Omit<ListImagesV2Params, 'cursor' | 'limit'> {
  paths?: string[];
}

export interface ExportHistoryZipResponse {
  success?: boolean;
  filename?: string;
  url?: string;
  count?: number;
  error?: string;
}

export interface Model {
  name: string;
  title?: string;
  architecture?: string;
  class?: string;
  description?: string;
  hash?: string;
  loaded?: boolean;
  preview_image?: string;
  preview?: string;
  [key: string]: unknown;
}

export interface VAEModel {
  name: string;
  title?: string;
  description?: string;
  path: string;
  preview_image?: string;
  preview?: string;
  [key: string]: unknown;
}

export interface BackendStatus {
  id: string;
  status: string;
  type: string;
  modcount: number;
  class: string;
  enabled?: boolean;
  title?: string;
  can_load_models?: boolean;
  max_usages?: number;
  current_model?: string | null;
  settings?: Record<string, unknown>;
  seconds_since_used?: number;
  time_since_used?: string;
  [key: string]: unknown;
}

export interface LoRA {
  name: string;
  title?: string;
  preview?: string;
  description?: string;
  path: string;
  metadata?: Record<string, unknown>;
  activationText?: string;
  tags?: string[];
  trainedWords?: string[];
  baseModel?: string;
  folder?: string;
  [key: string]: unknown;
}

export interface LoRASelection {
  lora: string;
  weight: number;
}

export interface Embedding {
  name: string;
  title?: string;
  description?: string;
  path: string;
  [key: string]: unknown;
}

export interface UpscaleParams {
  image: string;
  scale: number;
  model?: string;
}

export interface Workflow {
  id: string;
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

// ComfyUI Workflow Types

/** Basic workflow info returned from list endpoint */
export interface ComfyWorkflowInfo {
  name: string;
  image: string;
  description?: string;
  enable_in_simple: boolean;
}

/** Full workflow data returned from read endpoint */
export interface ComfyWorkflowData {
  workflow: unknown;
  prompt: unknown;
  custom_params?: unknown;
  image?: string;
  description?: string;
  enable_in_simple?: boolean;
}

// === T2I Parameter Types (from ListT2IParams API) ===

export interface T2IParam {
  name: string;
  id: string;
  description: string;
  type: string;
  subtype?: string | null;
  default: string | number | boolean;
  min?: number;
  max?: number;
  view_max?: number;
  step?: number;
  values?: string[] | null;
  value_names?: string[] | null;
  examples?: string[] | null;
  visible: boolean;
  advanced: boolean;
  feature_flag?: string | null;
  toggleable: boolean;
  priority: number;
  group?: string | null;
  always_retain: boolean;
  do_not_save: boolean;
  do_not_preview: boolean;
  view_type?: string;
  extra_hidden: boolean;
}

export interface T2IParamGroup {
  name: string;
  id: string;
  toggles: boolean;
  open: boolean;
  priority: number;
  description: string;
  advanced: boolean;
  can_shrink: boolean;
  parent?: string | null;
}

export interface T2IParamsResponse {
  list: T2IParam[];
  groups: T2IParamGroup[];
  models: Record<string, [string, string | null][]>;
  wildcards: string[];
  param_edits?: Record<string, unknown> | null;
}

// === Backend Preset Types ===

export interface BackendPreset {
  author: string;
  title: string;
  description: string;
  param_map: Record<string, string>;
  preview_image: string;
  is_starred: boolean;
}

export interface UserDataResponse {
  user_name: string;
  presets: BackendPreset[];
  language: string;
  permissions: string[];
  starred_models: Record<string, string[]>;
  autocompletions: string[] | null;
}

// === Model Description Types ===

export interface ModelDescription {
  name: string;
  title: string;
  author: string;
  description: string;
  preview_image: string;
  hash?: string;
  loaded: boolean;
  architecture: string;
  class: string;
  compat_class: string;
  standard_width: number;
  standard_height: number;
  license: string;
  date: string;
  usage_hint: string;
  trigger_phrase: string;
  merged_from: string;
  tags: string[];
  is_supported_model_format: boolean;
  is_negative_embedding: boolean;
  local: boolean;
  source_type?: string;
  source_model_id?: string;
  source_version_id?: string;
  source_repo?: string;
  source_url?: string;
  source_locked?: boolean;
  last_metadata_sync_at?: number;
  last_metadata_sync_source?: string;
  last_metadata_sync_status?: string;
  last_metadata_sync_message?: string;
}

// === Backend Management Types ===

export interface BackendSettingDef {
  name: string;
  type: string;
  description: string;
  placeholder?: string;
  values?: string[];
  value_names?: string[];
}

export interface BackendType {
  id: string;
  name: string;
  description: string;
  settings: BackendSettingDef[];
  is_standard: boolean;
}

export interface BackendDetail {
  id: number | string;
  type: string;
  status: string;
  settings: Record<string, unknown>;
  modcount: number;
  features: string[];
  enabled: boolean;
  title: string;
  can_load_models: boolean;
  max_usages: number;
  current_model?: string | null;
  seconds_since_used?: number;
  time_since_used?: string;
}

// === Log Types ===

export interface LogType {
  name: string;
  color: string;
  identifier: string;
}

export interface LogMessage {
  sequence_id: number;
  time: string;
  message: string;
}

// === Server Resource Types ===

export interface ServerResourceInfo {
  cpu: { usage: number; cores: number };
  system_ram: { total: number; used: number; free: number };
  gpus: Record<string, {
    id: number;
    name: string;
    temperature: number;
    utilization_gpu: number;
    utilization_memory: number;
    total_memory: number;
    free_memory: number;
    used_memory: number;
  }>;
}

export interface UpdateCommitPreview {
  commit: string;
  short_commit: string;
  date_utc: string;
  subject: string;
}

export interface RepoUpdateStatus {
  name: string;
  branch: string;
  upstream: string;
  current_commit: string;
  upstream_commit?: string | null;
  has_local_changes: boolean;
  local_changes_preview: string[];
  ahead_count: number;
  behind_count: number;
  has_updates: boolean;
  is_detached: boolean;
  is_diverged: boolean;
  can_auto_update: boolean;
  can_fast_forward: boolean;
  update_preview: string[];
  update_details: UpdateCommitPreview[];
  warnings: string[];
}

export interface UpdateCheckResponse {
  checked_at_utc?: string;
  server_updates_count: number;
  server_updates_preview: string[];
  server_repo?: RepoUpdateStatus;
  extension_repos?: RepoUpdateStatus[];
  extension_updates: string[];
  backend_updates: string[];
  backend_repos?: RepoUpdateStatus[];
  warnings?: string[];
  can_auto_update?: boolean;
}

export interface UpdateAndRestartResponse {
  success?: boolean;
  error?: string;
  result?: string;
  updated_repositories?: string[];
  warnings?: string[];
}

export interface KohyaStatusResponse {
  installed: boolean;
  running: boolean;
  status_message: string;
  kohya_path: string;
  launch_command: string;
  setup_steps?: string[];
}

export interface KohyaTrainingTemplate {
  model_type?: string;
  model_path?: string;
  train_data_dir?: string;
  output_dir?: string;
  output_name?: string;
  learning_rate?: number;
  num_train_epochs?: number;
  batch_size?: number;
  resolution?: string;
  clip_skip?: number;
  mixed_precision?: string;
  use_8bit_adam?: boolean;
  gradient_checkpointing?: boolean;
  xformers?: boolean;
  [key: string]: unknown;
}

export interface KohyaDatasetInfo {
  name: string;
  image_count: number;
  path: string;
}

export interface KohyaTrainedLoraInfo {
  name: string;
  filename: string;
  size_mb: number;
  created?: string;
  path: string;
}

export type LoraWorkflowMode = 'generated' | 'stored';

export interface LoraWorkflowDescriptor {
  mode: LoraWorkflowMode;
  name?: string;
  source?: string;
  path?: string;
}

export interface LoraProjectSummary {
  character_id: string;
  base_prompt: string;
  reference_image: string;
  raw_count: number;
  approved_count: number;
  updated_utc?: string;
}

export interface LoraProject {
  character_id: string;
  reference_image: string;
  base_prompt: string;
  variations: Record<string, string[]>;
  settings: Record<string, unknown>;
  created_utc?: string;
  updated_utc?: string;
}

export interface LoraBatchPlanJob {
  index?: number;
  prompt: string;
  seed?: number | null;
  variation_values?: string[];
}

export interface LoraBatchManifestSummary {
  batch_id: string;
  job_count: number;
  created_utc?: string;
  reference_image?: string;
  path?: string;
  workflow?: LoraWorkflowDescriptor;
}

export interface LoraDatasetItem {
  image_id: string;
  filename?: string;
  prompt?: string;
  seed?: number | null;
  approved: boolean;
  folder: string;
  status?: string;
  path?: string;
  preview_image?: string;
  source?: string;
  workflow_mode?: string;
  workflow_name?: string;
  workflow_source?: string;
  workflow_path?: string;
}

export interface LoraBatchExecutionJob {
  index: number;
  status: string;
  prompt: string;
  seed?: number | null;
  error?: string;
  image?: string;
  output_path?: string;
  started_utc?: string;
  completed_utc?: string;
  workflow?: LoraWorkflowDescriptor;
}

export interface LoraBatchExecutionStatus {
  batch_id: string;
  character_id: string;
  status: string;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  current_job_index?: number;
  started_utc?: string;
  completed_utc?: string;
  updated_utc?: string;
  workflow?: LoraWorkflowDescriptor;
  jobs: LoraBatchExecutionJob[];
}

export interface LoraTrainableProject {
  character_id: string;
  approved_count: number;
  raw_count: number;
  train_data_dir: string;
  output_dir: string;
}

export interface LoraTrainingLaunchPreview {
  command_line: string;
  args?: string[];
  base_model?: string;
  train_data_dir?: string;
  output_dir?: string;
  output_name?: string;
}

export interface LoraTrainingJob {
  job_id: string;
  character_id: string;
  state: string;
  output_dir?: string;
  output_name?: string;
  base_model?: string;
  train_data_dir?: string;
  launch_preview?: LoraTrainingLaunchPreview;
  message?: string;
  created_utc?: string;
  started_utc?: string;
  finished_utc?: string;
  completion_summary?: Record<string, unknown>;
}

export interface LoraTrainingStatus {
  state: string;
  job_id?: string;
  character_id?: string;
  message?: string;
  pid?: number;
  active_process_running?: boolean;
  started_utc?: string;
  finished_utc?: string;
  exit_code?: number;
  launch_preview?: LoraTrainingLaunchPreview;
  completion_summary?: Record<string, unknown>;
  refresh_triggered?: boolean;
  refresh_state?: string;
  refresh_message?: string;
  refresh_requested_utc?: string;
  refresh_completed_utc?: string;
}

// === Backend Compatibility Layer Types ===

export type BackendTransportKind = 'unknown' | 'rest' | 'websocket';

export type BackendTransportStatus = 'idle' | 'connected' | 'reconnecting' | 'degraded' | 'offline' | 'error';

export type BackendBootstrapReason =
  | 'startup'
  | 'reconnect'
  | 'session-refresh'
  | 'capability-refresh'
  | 'manual'
  | 'unknown';

export type BackendBootstrapSource =
  | 'session-init'
  | 'session-change'
  | 'websocket-open'
  | 'websocket-reconnect'
  | 'websocket-session-recovered'
  | 'query'
  | 'preload'
  | 'unknown';

export interface BackendSessionSnapshot {
  sessionId: string;
  userId: string;
  permissions: string[];
  version: string | null;
}

export interface BackendCapabilitySnapshot {
  id: string;
  name: string;
  source: 't2i-param' | 'backend' | 'model-catalog' | 'user-data' | 'runtime';
  available: boolean;
  type?: string | null;
  subtype?: string | null;
  values?: string[];
  defaultValue?: string | number | boolean | null;
  toggleable?: boolean;
  advanced?: boolean;
  priority?: number;
  featureFlag?: string | null;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ConnectionHealthSnapshot {
  transport: BackendTransportKind;
  status: BackendTransportStatus;
  connected: boolean;
  lastEventAt: number | null;
  lastBootstrapAt: number | null;
  lastReconnectAt: number | null;
  reconnectAttempts: number;
  activeConnections: number;
  lastError: string | null;
}

export interface BackendBootstrapSnapshot {
  refreshedAt: number;
  refreshReason: BackendBootstrapReason;
  refreshSource: BackendBootstrapSource;
  servedFromCache: boolean;
  cacheAgeMs: number;
  session: BackendSessionSnapshot | null;
  serverVersion: string | null;
  transport: {
    apiBaseUrl: string;
    wsBaseUrl: string;
    mode: RuntimeMode;
  };
  connectionHealth: ConnectionHealthSnapshot;
  capabilityMap: Record<string, BackendCapabilitySnapshot>;
  modelCatalog: Record<string, Array<Model | VAEModel>>;
  samplerCatalog: string[];
  extensionCatalog: BackendStatus[];
  backendStatus: BackendStatus[];
  t2iParams: T2IParamsResponse | null;
  userData: UserDataResponse | null;
  errors: string[];
}

export interface SwarmEventEnvelope<T = unknown> {
  type: string;
  scope: 'bootstrap' | 'transport' | 'websocket' | 'session';
  endpoint: string;
  timestamp: number;
  revision?: number;
  data: T;
}

