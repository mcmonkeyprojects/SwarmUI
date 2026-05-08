import type { ModelDescription } from '../api/types';
import { createIndexedDbStorage } from './indexedDbStorage';

const storage = createIndexedDbStorage('remote-model-preview-cache');
const MAX_PREVIEW_CANDIDATES = 8;
const CIVITAI_PREFIX = 'https://civitai.com/';
const HUGGINGFACE_PREFIX = 'https://huggingface.co/';
const CIVITAI_HOSTS = new Set([
  'civitai.com',
  'www.civitai.com',
  'civitai.green',
  'www.civitai.green',
  'civitai.red',
  'www.civitai.red',
]);

const CIVITAI_SOURCE_REGEX =
  /https?:\/\/(?:www\.)?(?:civitai\.com|civitai\.green|civitai\.red)\/(?:models\/\d+(?:\/[^?\s"'<>]+)?(?:\?modelVersionId=\d+)?|api\/download\/models\/\d+)/i;
const HUGGINGFACE_SOURCE_REGEX = /https?:\/\/(?:www\.)?huggingface\.co\/[^\s"'<>]+/i;

export interface ParsedCivitAIUrl {
  kind: 'model' | 'download' | 'invalid';
  modelId: string | null;
  versionId: string | null;
  normalizedUrl: string;
}

export interface RemotePreviewCandidate {
  id: string;
  sourceUrl: string;
  displayUrl: string;
  kind: 'image' | 'video';
}

export interface RemoteModelPreviewCacheEntry {
  cacheKey: string;
  sourceType: 'civitai' | 'huggingface';
  sourceUrl: string;
  sourceModelId?: string | null;
  sourceVersionId?: string | null;
  sourceRepo?: string | null;
  sourceHash?: string | null;
  refreshedAt: number;
  title?: string;
  description?: string;
  author?: string;
  date?: string;
  usageHint?: string;
  triggerPhrase?: string;
  tags?: string;
  previewStrategy: 'image' | 'video' | 'none';
  previewImageUrl?: string | null;
  previewImageData?: string | null;
  previewCandidates: RemotePreviewCandidate[];
  civitaiModelName?: string;
  civitaiVersionName?: string;
  civitaiBaseModel?: string;
  civitaiCreatedAt?: string;
  civitaiModelDescription?: string;
  civitaiVersionDescription?: string;
  civitaiTrainedWords?: string[];
  resolvedDownloadUrl?: string | null;
  suggestedFileName?: string | null;
  suggestedModelType?: string | null;
}

export interface ResolvedRemoteModelSource {
  sourceType: 'civitai' | 'huggingface' | null;
  sourceUrl: string;
  sourceModelId: string | null;
  sourceVersionId: string | null;
  sourceRepo: string | null;
  sourceHash: string | null;
  cacheKey: string | null;
}

interface CivitAIMetadata {
  name: string;
  creator?: { username: string };
  type: string;
  description?: string;
  tags?: string[];
  modelVersions: {
    id?: number | string;
    name: string;
    baseModel: string;
    createdAt: string;
    description?: string;
    trainedWords?: string[];
    images?: { url: string; type: string }[];
    files: {
      name: string;
      downloadUrl: string;
    }[];
  }[];
}

interface CivitAIModelVersionLookup {
  id: number;
  modelId: number;
}

interface HuggingFaceModelLookup {
  author?: string;
  tags?: string[];
  lastModified?: string;
  cardData?: {
    description?: string;
    tags?: string[];
  };
}

export interface RemotePreviewClient {
  forwardMetadataRequest(url: string): Promise<Record<string, unknown> | null>;
  getModelHeaders(model: string, subtype?: string): Promise<Record<string, unknown>>;
  getModelHash(modelName: string, subtype?: string): Promise<Record<string, unknown>>;
}

export interface RemotePreviewConverters {
  convertImageUrlToDataUrl: (imageUrl: string) => Promise<string | null>;
  convertVideoUrlToDataUrl?: (videoUrl: string) => Promise<string | null>;
}

function storageKey(cacheKey: string): string {
  return `entry:${cacheKey}`;
}

export const normalizeSourceUrlCandidate = (rawUrl: string): string => {
  return rawUrl.replace(/&amp;/gi, '&').replace(/[),.;]+$/, '').trim();
};

export const extractSourceUrlFromText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const civitMatch = value.match(CIVITAI_SOURCE_REGEX);
  if (civitMatch?.[0]) {
    return normalizeSourceUrlCandidate(civitMatch[0]);
  }
  const hfMatch = value.match(HUGGINGFACE_SOURCE_REGEX);
  if (hfMatch?.[0]) {
    return normalizeSourceUrlCandidate(hfMatch[0]);
  }
  return null;
};

export const normalizeSourceType = (value: unknown): 'civitai' | 'huggingface' | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'civitai' || normalized === 'huggingface') {
    return normalized;
  }
  return null;
};

export const sanitizeHashForCivitLookup = (hash: string): string => {
  return hash
    .trim()
    .replace(/^0x/i, '')
    .replace(/[^a-fA-F0-9]/g, '');
};

export const coerceIdString = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

export const parseCivitAIUrl = (inputUrl: string): ParsedCivitAIUrl => {
  const rawUrl = inputUrl.trim();
  let normalizedUrl = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !CIVITAI_HOSTS.has(host)) {
      return { kind: 'invalid', modelId: null, versionId: null, normalizedUrl };
    }
    normalizedUrl = `${CIVITAI_PREFIX}${`${parsed.pathname}${parsed.search}`.replace(/^\/+/, '')}`;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'models' && parts.length >= 2) {
      return {
        kind: 'model',
        modelId: parts[1],
        versionId: parsed.searchParams.get('modelVersionId'),
        normalizedUrl,
      };
    }
    if (
      parts[0] === 'api' &&
      parts[1] === 'download' &&
      parts[2] === 'models' &&
      parts.length >= 4
    ) {
      return {
        kind: 'download',
        modelId: null,
        versionId: parts[3],
        normalizedUrl,
      };
    }
  } catch {
    return { kind: 'invalid', modelId: null, versionId: null, normalizedUrl };
  }
  return { kind: 'invalid', modelId: null, versionId: null, normalizedUrl };
};

export const parseHuggingFaceRepoId = (inputUrl: string): string | null => {
  try {
    const parsed = new URL(inputUrl.trim());
    const host = parsed.hostname.toLowerCase();
    if (!(host === 'huggingface.co' || host.endsWith('.huggingface.co'))) {
      return null;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'models') {
      return `${parts[2]}/${parts[3]}`;
    }
    const reservedRootPaths = new Set([
      'api',
      'models',
      'datasets',
      'spaces',
      'docs',
      'tasks',
      'collections',
      'organizations',
    ]);
    if (parts.length >= 2 && !reservedRootPaths.has(parts[0].toLowerCase())) {
      return `${parts[0]}/${parts[1]}`;
    }
    return null;
  } catch {
    return null;
  }
};

export const ensureDescriptionHasSourceUrl = (description: string, sourceUrl: string | null): string => {
  const cleanSourceUrl = (sourceUrl || '').trim();
  const cleanDescription = (description || '').trim();
  if (!cleanSourceUrl) {
    return cleanDescription;
  }
  if (!cleanDescription) {
    return `From ${cleanSourceUrl}`;
  }
  if (cleanDescription.toLowerCase().includes(cleanSourceUrl.toLowerCase())) {
    return cleanDescription;
  }
  const withoutExistingFrom = cleanDescription.replace(/^From\s+https?:\/\/[^\s]+\s*/i, '').trim();
  return `From ${cleanSourceUrl}${withoutExistingFrom ? `\n${withoutExistingFrom}` : ''}`;
};

export const getSourceCacheKey = (source: {
  sourceType?: string | null;
  sourceModelId?: string | null;
  sourceVersionId?: string | null;
  sourceUrl?: string | null;
  sourceHash?: string | null;
}): string | null => {
  const sourceType = normalizeSourceType(source.sourceType);
  const sourceModelId = coerceIdString(source.sourceModelId);
  const sourceVersionId = coerceIdString(source.sourceVersionId);
  const sourceUrl =
    typeof source.sourceUrl === 'string' && source.sourceUrl.trim()
      ? normalizeSourceUrlCandidate(source.sourceUrl)
      : '';
  const sourceHash =
    typeof source.sourceHash === 'string' ? sanitizeHashForCivitLookup(source.sourceHash) : '';

  if (sourceType && sourceModelId && sourceVersionId) {
    return `${sourceType}:${sourceModelId}:${sourceVersionId}`;
  }
  if (sourceUrl) {
    return `url:${sourceUrl.toLowerCase()}`;
  }
  if (sourceHash) {
    return `hash:civitai:${sourceHash.toLowerCase()}`;
  }
  return null;
};

export async function loadRemoteModelPreviewCache(
  cacheKey: string | null | undefined
): Promise<RemoteModelPreviewCacheEntry | null> {
  if (!cacheKey) {
    return null;
  }
  try {
    const raw = await storage.getItem(storageKey(cacheKey));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as RemoteModelPreviewCacheEntry;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRemoteModelPreviewCache(
  entry: RemoteModelPreviewCacheEntry
): Promise<void> {
  const serialized = JSON.stringify(entry);
  const aliasKeys = new Set<string>([entry.cacheKey]);
  const urlAlias = getSourceCacheKey({
    sourceUrl: entry.sourceUrl,
  });
  const hashAlias = getSourceCacheKey({
    sourceHash: entry.sourceHash,
  });
  if (urlAlias) {
    aliasKeys.add(urlAlias);
  }
  if (hashAlias) {
    aliasKeys.add(hashAlias);
  }
  for (const aliasKey of aliasKeys) {
    await storage.setItem(storageKey(aliasKey), serialized);
  }
}

function extractMetadataObjectFromHeaders(headerPayload: Record<string, unknown>): Record<string, unknown> | null {
  const rawHeaders =
    typeof headerPayload === 'object' && headerPayload !== null && 'headers' in headerPayload
      ? (headerPayload as { headers?: unknown }).headers
      : headerPayload;
  const headerObject =
    rawHeaders && typeof rawHeaders === 'object' ? (rawHeaders as Record<string, unknown>) : null;
  if (!headerObject) {
    return null;
  }
  if (headerObject.__metadata__ && typeof headerObject.__metadata__ === 'object') {
    return headerObject.__metadata__ as Record<string, unknown>;
  }
  return headerObject;
}

function pickHeaderText(metadataObject: Record<string, unknown> | null, ...keys: string[]): string {
  for (const key of keys) {
    const value = metadataObject?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

async function fetchCivitSourceByHash(
  client: RemotePreviewClient,
  hash: string
): Promise<{ modelId: string; versionId: string | null } | null> {
  const normalized = sanitizeHashForCivitLookup(hash);
  if (!normalized) {
    return null;
  }
  const candidates = [normalized];
  if (normalized.length > 12) {
    candidates.push(normalized.slice(0, 12));
  }
  for (const candidate of candidates) {
    const byHash = await client.forwardMetadataRequest(
      `${CIVITAI_PREFIX}api/v1/model-versions/by-hash/${encodeURIComponent(candidate)}`
    );
    if (!byHash || byHash.error) {
      continue;
    }
    const modelId = coerceIdString((byHash as CivitAIModelVersionLookup).modelId);
    if (!modelId) {
      continue;
    }
    return {
      modelId,
      versionId: coerceIdString((byHash as CivitAIModelVersionLookup).id),
    };
  }
  return null;
}

export async function resolveRemoteSourceForModel(
  client: RemotePreviewClient,
  model: ModelDescription,
  subtype: string,
  options?: {
    allowRemoteLookup?: boolean;
  }
): Promise<ResolvedRemoteModelSource> {
  const allowRemoteLookup = options?.allowRemoteLookup ?? true;
  const description = typeof model.description === 'string' ? model.description : '';
  let sourceUrl =
    (typeof model.source_url === 'string' && model.source_url.trim()) ||
    extractSourceUrlFromText(description) ||
    '';
  sourceUrl = sourceUrl ? normalizeSourceUrlCandidate(sourceUrl) : '';

  let sourceType = normalizeSourceType(model.source_type);
  let sourceModelId = coerceIdString(model.source_model_id);
  let sourceVersionId = coerceIdString(model.source_version_id);
  let sourceRepo =
    typeof model.source_repo === 'string' && model.source_repo.trim() ? model.source_repo.trim() : null;
  let sourceHash = typeof model.hash === 'string' && model.hash.trim() ? model.hash.trim() : null;

  if (!sourceUrl && !sourceModelId && !sourceRepo) {
    try {
      const headerPayload = await client.getModelHeaders(model.name, subtype);
      const metadataObject = extractMetadataObjectFromHeaders(headerPayload);
      const headerSourceUrl = pickHeaderText(metadataObject, 'modelspec.source_url', 'source_url');
      const headerSourceType = normalizeSourceType(
        pickHeaderText(metadataObject, 'modelspec.source_type', 'source_type')
      );
      const headerSourceModelId = coerceIdString(
        pickHeaderText(metadataObject, 'modelspec.source_model_id', 'source_model_id')
      );
      const headerSourceVersionId = coerceIdString(
        pickHeaderText(metadataObject, 'modelspec.source_version_id', 'source_version_id')
      );
      const headerSourceRepo = pickHeaderText(metadataObject, 'modelspec.source_repo', 'source_repo');
      const headerDescription = pickHeaderText(metadataObject, 'modelspec.description', 'description');
      sourceUrl =
        sourceUrl || headerSourceUrl || extractSourceUrlFromText(headerDescription) || '';
      sourceType = sourceType || headerSourceType;
      sourceModelId = sourceModelId || headerSourceModelId;
      sourceVersionId = sourceVersionId || headerSourceVersionId;
      sourceRepo = sourceRepo || (headerSourceRepo || null);
    } catch {
      // Ignore local header lookup failures and fall back to hash/source URL paths.
    }
  }

  if (sourceUrl) {
    const parsedCivit = parseCivitAIUrl(sourceUrl);
    if (parsedCivit.kind === 'model' && parsedCivit.modelId) {
      sourceType = 'civitai';
      sourceModelId = sourceModelId || parsedCivit.modelId;
      sourceVersionId = sourceVersionId || parsedCivit.versionId;
    } else if (parsedCivit.kind === 'download' && parsedCivit.versionId) {
      sourceType = 'civitai';
      sourceVersionId = sourceVersionId || parsedCivit.versionId;
    } else {
      const parsedRepo = parseHuggingFaceRepoId(sourceUrl);
      if (parsedRepo) {
        sourceType = sourceType || 'huggingface';
        sourceRepo = sourceRepo || parsedRepo;
      }
    }
  }

  if ((!sourceType || sourceType === 'civitai') && !sourceModelId) {
    if (!sourceHash) {
      try {
        const hashResponse = await client.getModelHash(model.name, subtype);
        sourceHash = typeof hashResponse?.hash === 'string' ? hashResponse.hash : null;
      } catch {
        sourceHash = null;
      }
    }
    if (allowRemoteLookup && sourceHash) {
      const byHashResult = await fetchCivitSourceByHash(client, sourceHash);
      if (byHashResult) {
        sourceType = 'civitai';
        sourceModelId = byHashResult.modelId;
        sourceVersionId = sourceVersionId || byHashResult.versionId;
      }
    }
  }

  if (allowRemoteLookup && (!sourceType || sourceType === 'civitai') && !sourceModelId && sourceVersionId) {
    const versionLookup = await client.forwardMetadataRequest(
      `${CIVITAI_PREFIX}api/v1/model-versions/${sourceVersionId}`
    );
    const versionModelId =
      versionLookup && !versionLookup.error
        ? coerceIdString((versionLookup as CivitAIModelVersionLookup).modelId)
        : null;
    if (versionModelId) {
      sourceType = 'civitai';
      sourceModelId = versionModelId;
    }
  }

  const cacheKey = getSourceCacheKey({
    sourceType,
    sourceModelId,
    sourceVersionId,
    sourceUrl,
    sourceHash,
  });
  return {
    sourceType,
    sourceUrl,
    sourceModelId,
    sourceVersionId,
    sourceRepo,
    sourceHash,
    cacheKey,
  };
}

function isDownloadableModelFile(name: string): boolean {
  return /\.(safetensors|sft|gguf)$/i.test(name);
}

function extractCivitAIVersionIdFromDownloadUrl(downloadUrl: string): string | null {
  const withoutQuery = downloadUrl.split('?')[0];
  const parts = withoutQuery.split('/');
  const last = parts[parts.length - 1];
  return last || null;
}

function normalizeModelToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.(safetensors|sft|gguf)$/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

function mapCivitModelTypeToSwarm(type: string): string | null {
  if (type === 'Checkpoint') {
    return 'Stable-Diffusion';
  }
  if (['LORA', 'LoCon', 'LyCORIS'].includes(type)) {
    return 'LoRA';
  }
  if (type === 'TextualInversion') {
    return 'Embedding';
  }
  if (type === 'ControlNet') {
    return 'ControlNet';
  }
  if (type === 'VAE') {
    return 'VAE';
  }
  return null;
}

async function buildPreviewCandidates(
  imageItems: Array<{ url: string; type: string }> | undefined,
  converters: RemotePreviewConverters
): Promise<{
  previewCandidates: RemotePreviewCandidate[];
  previewStrategy: 'image' | 'video' | 'none';
  previewImageUrl: string | null;
  previewImageData: string | null;
}> {
  const previewCandidates: RemotePreviewCandidate[] = [];
  const images =
    imageItems
      ?.filter((item) => typeof item.url === 'string' && item.type?.toLowerCase() === 'image')
      .map((item) => item.url) ?? [];
  const videos =
    imageItems
      ?.filter((item) => typeof item.url === 'string' && item.type?.toLowerCase() === 'video')
      .map((item) => item.url) ?? [];

  let index = 0;
  for (const imageUrl of images) {
    if (previewCandidates.length >= MAX_PREVIEW_CANDIDATES) {
      break;
    }
    const displayUrl = await converters.convertImageUrlToDataUrl(imageUrl);
    previewCandidates.push({
      id: `image-${index}`,
      sourceUrl: imageUrl,
      displayUrl:
        displayUrl && displayUrl.startsWith('data:image/')
          ? displayUrl
          : imageUrl,
      kind: 'image',
    });
    index++;
  }

  if (converters.convertVideoUrlToDataUrl) {
    for (const videoUrl of videos) {
      if (previewCandidates.length >= MAX_PREVIEW_CANDIDATES) {
        break;
      }
      const displayUrl = await converters.convertVideoUrlToDataUrl(videoUrl);
      if (!displayUrl || !displayUrl.startsWith('data:image/')) {
        continue;
      }
      previewCandidates.push({
        id: `video-${index}`,
        sourceUrl: videoUrl,
        displayUrl,
        kind: 'video',
      });
      index++;
    }
  }

  return {
    previewCandidates,
    previewStrategy: previewCandidates[0]?.kind ?? 'none',
    previewImageUrl: previewCandidates[0]?.sourceUrl ?? null,
    previewImageData: previewCandidates[0]?.displayUrl ?? null,
  };
}

async function buildCivitaiCacheEntry(
  client: RemotePreviewClient,
  source: ResolvedRemoteModelSource,
  converters: RemotePreviewConverters,
  modelNameHint?: string
): Promise<RemoteModelPreviewCacheEntry | null> {
  if (!source.sourceModelId || !source.cacheKey) {
    return null;
  }

  const response = await client.forwardMetadataRequest(
    `${CIVITAI_PREFIX}api/v1/models/${source.sourceModelId}`
  );
  if (
    !response ||
    response.error ||
    !Array.isArray((response as CivitAIMetadata).modelVersions) ||
    (response as CivitAIMetadata).modelVersions.length === 0
  ) {
    return null;
  }

  const data = response as CivitAIMetadata;
  const hintedFileName = modelNameHint ? modelNameHint.split(/[\\/]/).pop() || '' : '';
  const hintedToken = hintedFileName ? normalizeModelToken(hintedFileName) : '';
  const firstDownloadableVersion =
    data.modelVersions.find((version) =>
      version.files.some((file) => isDownloadableModelFile(file.name))
    ) ?? data.modelVersions[0];
  const hintedVersion =
    hintedToken
      ? data.modelVersions.find((version) =>
          version.files.some((file) => {
            const fileToken = normalizeModelToken(file.name.split(/[\\/]/).pop() || '');
            return !!fileToken && fileToken === hintedToken;
          })
        ) ?? null
      : null;

  let selectedVersion =
    data.modelVersions.find((version) => {
      if (!source.sourceVersionId) {
        return false;
      }
      const currentVersionId = coerceIdString(version.id);
      if (currentVersionId && currentVersionId === source.sourceVersionId) {
        return true;
      }
      return version.files.some(
        (file) => extractCivitAIVersionIdFromDownloadUrl(file.downloadUrl) === source.sourceVersionId
      );
    }) ?? hintedVersion ?? firstDownloadableVersion;

  const resolvedVersionId = coerceIdString(selectedVersion.id) || source.sourceVersionId;
  if (resolvedVersionId) {
    const versionDetails = await client.forwardMetadataRequest(
      `${CIVITAI_PREFIX}api/v1/model-versions/${resolvedVersionId}`
    );
    if (versionDetails && !versionDetails.error && typeof versionDetails === 'object') {
      const mergedVersion = {
        ...selectedVersion,
        ...versionDetails,
      } as typeof selectedVersion;
      if (Array.isArray((versionDetails as { files?: unknown }).files)) {
        mergedVersion.files = (versionDetails as { files: typeof selectedVersion.files }).files;
      }
      if (Array.isArray((versionDetails as { images?: unknown }).images)) {
        mergedVersion.images = (versionDetails as { images: typeof selectedVersion.images }).images;
      }
      if (Array.isArray((versionDetails as { trainedWords?: unknown }).trainedWords)) {
        mergedVersion.trainedWords = (
          versionDetails as { trainedWords: typeof selectedVersion.trainedWords }
        ).trainedWords;
      }
      selectedVersion = mergedVersion;
    }
  }

  let selectedFile =
    selectedVersion.files.find((file) => isDownloadableModelFile(file.name)) ?? selectedVersion.files[0];
  if (!isDownloadableModelFile(selectedFile.name)) {
    const fallback = data.modelVersions
      .flatMap((version) => version.files.map((file) => ({ version, file })))
      .find((entry) => isDownloadableModelFile(entry.file.name));
    if (fallback) {
      selectedVersion = fallback.version;
      selectedFile = fallback.file;
    }
  }

  const previewData = await buildPreviewCandidates(selectedVersion.images, converters);
  let resolvedDownloadUrl = selectedFile?.downloadUrl || '';
  if (selectedFile?.name.endsWith('.gguf')) {
    resolvedDownloadUrl += '#.gguf';
  }
  const sourceUrl = resolvedVersionId
    ? `${CIVITAI_PREFIX}models/${source.sourceModelId}?modelVersionId=${resolvedVersionId}`
    : `${CIVITAI_PREFIX}models/${source.sourceModelId}`;
  const suggestedFileName = `${data.name} - ${selectedVersion.name}`.replace(
    /[|\\/:*?"<>|,.&![\]()]/g,
    '-'
  );
  const suggestedModelType = mapCivitModelTypeToSwarm(data.type);

  const entry: RemoteModelPreviewCacheEntry = {
    cacheKey: source.cacheKey,
    sourceType: 'civitai',
    sourceUrl,
    sourceModelId: source.sourceModelId,
    sourceVersionId: resolvedVersionId || null,
    sourceRepo: null,
    sourceHash: source.sourceHash,
    refreshedAt: Date.now(),
    title: `${data.name} - ${selectedVersion.name}`,
    description: ensureDescriptionHasSourceUrl(
      `${selectedVersion.description || ''}\n${data.description || ''}`.trim(),
      sourceUrl
    ),
    author: data.creator?.username || '',
    date: selectedVersion.createdAt || '',
    usageHint: ['Illustrious', 'Pony'].includes(selectedVersion.baseModel)
      ? selectedVersion.baseModel
      : '',
    triggerPhrase: selectedVersion.trainedWords?.join('; ') || '',
    tags: data.tags?.join(', ') || '',
    previewStrategy: previewData.previewStrategy,
    previewImageUrl: previewData.previewImageUrl,
    previewImageData: previewData.previewImageData,
    previewCandidates: previewData.previewCandidates,
    civitaiModelName: data.name,
    civitaiVersionName: selectedVersion.name,
    civitaiBaseModel: selectedVersion.baseModel,
    civitaiCreatedAt: selectedVersion.createdAt,
    civitaiModelDescription: data.description,
    civitaiVersionDescription: selectedVersion.description,
    civitaiTrainedWords: selectedVersion.trainedWords,
    resolvedDownloadUrl: resolvedDownloadUrl || null,
    suggestedFileName,
    suggestedModelType,
  };
  await saveRemoteModelPreviewCache(entry);
  return entry;
}

async function buildHuggingFaceCacheEntry(
  client: RemotePreviewClient,
  source: ResolvedRemoteModelSource
): Promise<RemoteModelPreviewCacheEntry | null> {
  const cleanRepo = (source.sourceRepo || parseHuggingFaceRepoId(source.sourceUrl) || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const segments = cleanRepo.split('/').filter(Boolean);
  if (segments.length < 2 || !source.cacheKey) {
    return null;
  }
  const encodedRepo = `${encodeURIComponent(segments[0])}/${encodeURIComponent(segments[1])}`;
  const response = await client.forwardMetadataRequest(`${HUGGINGFACE_PREFIX}api/models/${encodedRepo}`);
  if (!response || response.error) {
    return null;
  }
  const data = response as HuggingFaceModelLookup;
  const sourceUrl = `${HUGGINGFACE_PREFIX}${segments[0]}/${segments[1]}`;
  const descriptionLines = [data.cardData?.description || ''].filter(Boolean);
  const tags = [
    ...(Array.isArray(data.tags) ? data.tags : []),
    ...(Array.isArray(data.cardData?.tags) ? data.cardData.tags : []),
  ]
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .slice(0, 64);
  const entry: RemoteModelPreviewCacheEntry = {
    cacheKey: source.cacheKey,
    sourceType: 'huggingface',
    sourceUrl,
    sourceModelId: null,
    sourceVersionId: null,
    sourceRepo: `${segments[0]}/${segments[1]}`,
    sourceHash: source.sourceHash,
    refreshedAt: Date.now(),
    title: `${segments[0]}/${segments[1]}`,
    description: ensureDescriptionHasSourceUrl(descriptionLines.join('\n').trim(), sourceUrl),
    author: data.author || segments[0],
    date: data.lastModified || '',
    usageHint: '',
    triggerPhrase: '',
    tags: tags.length > 0 ? Array.from(new Set(tags)).join(', ') : '',
    previewStrategy: 'none',
    previewImageUrl: null,
    previewImageData: null,
    previewCandidates: [],
    resolvedDownloadUrl: null,
    suggestedFileName: null,
    suggestedModelType: null,
  };
  await saveRemoteModelPreviewCache(entry);
  return entry;
}

export async function refreshRemoteModelPreviewCache(
  client: RemotePreviewClient,
  source: ResolvedRemoteModelSource,
  converters: RemotePreviewConverters,
  modelNameHint?: string
): Promise<RemoteModelPreviewCacheEntry | null> {
  if ((source.sourceType === 'civitai' || (!source.sourceType && source.sourceModelId)) && source.sourceModelId) {
    return await buildCivitaiCacheEntry(client, source, converters, modelNameHint);
  }
  if (source.sourceType === 'huggingface' || source.sourceRepo || parseHuggingFaceRepoId(source.sourceUrl)) {
    return await buildHuggingFaceCacheEntry(client, source);
  }
  return null;
}
