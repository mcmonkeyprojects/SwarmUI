import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  TextInput,
  Card,
  Select,
  Progress,
  Badge,
  Tooltip,
  Image,
  Box,
  Divider,
  Alert,
  ScrollArea,
  Checkbox,
  Anchor,
  Loader,
  UnstyledButton,
  Collapse,
} from '@mantine/core';
import {
  IconDownload,
  IconX,
  IconCheck,
  IconAlertCircle,
  IconLink,
  IconFolderOpen,
  IconFile,
  IconTrash,
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconArrowBackUp,
  IconSearch,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../api/client';
import { isTauri } from '@tauri-apps/api/core';
import { open as openTauriDialog } from '@tauri-apps/plugin-dialog';
import { SwarmActionIcon as ActionIcon, SwarmButton as Button } from './ui';

// CivitAI prefixes
const CIVITAI_PREFIX = 'https://civitai.com/';
const CIVITAI_GREEN_PREFIX = 'https://civitai.green/';
const HUGGINGFACE_PREFIX = 'https://huggingface.co/';

// Model types
const MODEL_TYPES = [
  { value: 'Stable-Diffusion', label: 'Base Model' },
  { value: 'LoRA', label: 'LoRA' },
  { value: 'VAE', label: 'VAE' },
  { value: 'Embedding', label: 'Embedding' },
  { value: 'ControlNet', label: 'ControlNet' },
  { value: 'Clip', label: 'CLIP' },
  { value: 'ClipVision', label: 'CLIP Vision' },
];

type MetadataScanScope = 'all' | 'base' | 'exact';
type MetadataScanMode = 'missing-only' | 'upgrade-defaults';

const METADATA_SCAN_SCOPES: { value: MetadataScanScope; label: string }[] = [
  { value: 'all', label: 'All Folders' },
  { value: 'base', label: 'Current Base Folder' },
  { value: 'exact', label: 'Current Exact Path (Base + Subfolder)' },
];

const METADATA_SCAN_MODES: { value: MetadataScanMode; label: string }[] = [
  { value: 'missing-only', label: 'Missing Only (Strict)' },
  { value: 'upgrade-defaults', label: 'Missing + Default Titles' },
];

const SCAN_CONCURRENCY_OPTIONS = ['1', '2', '4', '6', '8'];
const SCAN_RETRY_OPTIONS = ['0', '1', '2', '3', '4'];
const SCAN_BACKOFF_OPTIONS = ['250', '500', '750', '1000', '1500', '2000'];

const MODEL_TYPE_FOLDER_HINTS: Record<string, string[]> = {
  'Stable-Diffusion': ['checkpoint', 'checkpoints', 'stable-diffusion', 'diffusion', 'model'],
  LoRA: ['lora', 'loras', 'lycoris'],
  VAE: ['vae', 'vaes'],
  Embedding: ['embedding', 'embeddings', 'textualinversion', 'textual-inversion'],
  ControlNet: ['controlnet', 'control-net'],
  Clip: ['clip', 'text_encoder', 'text-encoder'],
  ClipVision: ['clipvision', 'clip-vision', 'vision'],
};

// Ordered by Swarm default path intent so auto-map picks the most expected folder first.
const MODEL_TYPE_FOLDER_PREFERRED_ORDER: Record<string, string[]> = {
  'Stable-Diffusion': ['stable-diffusion', 'checkpoints', 'diffusion_models', 'unet', 'tensorrt'],
  LoRA: ['lora', 'loras', 'lycoris'],
  VAE: ['vae', 'vaes'],
  Embedding: ['embeddings', 'embedding', 'textualinversion', 'textual-inversion'],
  ControlNet: ['controlnet', 'model_patches'],
  Clip: ['text_encoders', 'clip'],
  ClipVision: ['clip_vision', 'clipvision', 'vision'],
};

const normalizeFolderToken = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const folderMatchesPreferredName = (folderPath: string, preferredName: string): boolean => {
  const normalizedFolder = normalizeFolderToken(folderPath);
  const normalizedPreferred = normalizeFolderToken(preferredName);
  if (!normalizedPreferred) {
    return false;
  }
  const segments = folderPath
    .split(/[\\/]/)
    .map((segment) => normalizeFolderToken(segment))
    .filter(Boolean);
  return (
    segments.some((segment) => segment === normalizedPreferred) ||
    normalizedFolder === normalizedPreferred
  );
};

const scoreFolderForHints = (folderPath: string, hints: string[]): number => {
  const normalizedPath = normalizeFolderToken(folderPath);
  const segments = folderPath
    .split(/[\\/]/)
    .map((segment) => normalizeFolderToken(segment))
    .filter(Boolean);
  let best = 0;
  for (const hint of hints) {
    const normalizedHint = normalizeFolderToken(hint);
    if (!normalizedHint) continue;
    if (segments.some((segment) => segment === normalizedHint)) {
      best = Math.max(best, 100);
      continue;
    }
    if (
      segments.some(
        (segment) => segment.startsWith(normalizedHint) || segment.endsWith(normalizedHint)
      )
    ) {
      best = Math.max(best, 85);
      continue;
    }
    if (normalizedPath.includes(normalizedHint)) {
      best = Math.max(best, 60);
    }
  }
  return best;
};

const findAutoMappedFolder = (modelType: string, availableFolders: string[]): string => {
  const preferredOrder = MODEL_TYPE_FOLDER_PREFERRED_ORDER[modelType] ?? [];
  for (const preferredFolderName of preferredOrder) {
    const preferredMatch = availableFolders.find((folderPath) =>
      folderMatchesPreferredName(folderPath, preferredFolderName)
    );
    if (preferredMatch) {
      return preferredMatch;
    }
  }

  const typeHints = MODEL_TYPE_FOLDER_HINTS[modelType] ?? [modelType];
  let bestFolder = '(None)';
  let bestScore = 0;
  for (const folderPath of availableFolders) {
    const score = scoreFolderForHints(folderPath, typeHints);
    if (score > bestScore) {
      bestScore = score;
      bestFolder = folderPath;
    }
  }
  return bestFolder;
};

const normalizeFolderPath = (value: string): string => {
  return value
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
};

const composeFolderPath = (root: string, subfolder: string): string => {
  const cleanRoot = normalizeFolderPath(root);
  const cleanSubfolder = normalizeFolderPath(subfolder);
  if (!cleanRoot || cleanRoot === '(None)') {
    return cleanSubfolder || '(None)';
  }
  return cleanSubfolder ? `${cleanRoot}/${cleanSubfolder}` : cleanRoot;
};

const METADATA_EMPTY_VALUES = new Set(['', '(none)', '(unset)']);

const isMissingMetadataText = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return true;
  }
  return METADATA_EMPTY_VALUES.has(value.trim().toLowerCase());
};

const isMissingMetadataTags = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .length === 0;
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean).length === 0;
  }
  return true;
};

const isSourceOnlyDescription = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return true;
  }
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return true;
  }
  if (lines.length === 1 && /^from\s+https?:\/\//i.test(lines[0])) {
    return true;
  }
  if (
    lines.length === 2 &&
    /^from\s+https?:\/\//i.test(lines[0]) &&
    lines[1].length < 8
  ) {
    return true;
  }
  return false;
};

const isMissingPreviewImage = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return true;
  }
  const trimmed = value.trim().toLowerCase();
  return !trimmed || trimmed === 'imgs/model_placeholder.jpg';
};

const CIVITAI_SOURCE_REGEX =
  /https?:\/\/(?:www\.)?(?:civitai\.com|civitai\.green)\/(?:models\/\d+(?:\/[^?\s"'<>]+)?(?:\?modelVersionId=\d+)?|api\/download\/models\/\d+)/i;
const HUGGINGFACE_SOURCE_REGEX = /https?:\/\/(?:www\.)?huggingface\.co\/[^\s"'<>]+/i;

const normalizeSourceUrlCandidate = (rawUrl: string): string => {
  return rawUrl.replace(/&amp;/gi, '&').replace(/[),.;]+$/, '').trim();
};

const extractSourceUrlFromText = (value: unknown): string | null => {
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

const normalizeSourceType = (value: unknown): 'civitai' | 'huggingface' | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'civitai' || normalized === 'huggingface') {
    return normalized;
  }
  return null;
};

const getTitleLooksLikeDefaultName = (modelName: string, title: unknown): boolean => {
  const currentTitle = typeof title === 'string' ? title.trim() : '';
  if (!currentTitle) {
    return false;
  }
  const fileNameWithoutFolder = modelName.split(/[\\/]/).pop() ?? modelName;
  const fileNameWithoutExtension = fileNameWithoutFolder.replace(/\.(safetensors|sft|gguf)$/i, '');
  return (
    currentTitle.toLowerCase() === modelName.toLowerCase() ||
    currentTitle.toLowerCase() === fileNameWithoutFolder.toLowerCase() ||
    currentTitle.toLowerCase() === fileNameWithoutExtension.toLowerCase()
  );
};

const sanitizeHashForCivitLookup = (hash: string): string => {
  return hash
    .trim()
    .replace(/^0x/i, '')
    .replace(/[^a-fA-F0-9]/g, '');
};

const coerceIdString = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

const metadataTagsToString = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

interface FolderTreeNode {
  name: string;
  fullPath: string;
  children: FolderTreeNode[];
}

function buildFolderTree(paths: string[]): FolderTreeNode[] {
  const root: FolderTreeNode[] = [];
  const sorted = [...paths].sort();
  for (const folderPath of sorted) {
    const segments = normalizeFolderPath(folderPath).split('/').filter(Boolean);
    let currentLevel = root;
    let currentPath = '';
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let existing = currentLevel.find((n) => n.name === segment);
      if (!existing) {
        existing = { name: segment, fullPath: currentPath, children: [] };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    }
  }
  return root;
}

function filterTree(nodes: FolderTreeNode[], query: string): FolderTreeNode[] {
  if (!query) return nodes;
  const lowerQuery = query.toLowerCase();
  const result: FolderTreeNode[] = [];
  for (const node of nodes) {
    const childMatches = filterTree(node.children, query);
    if (node.name.toLowerCase().includes(lowerQuery) || node.fullPath.toLowerCase().includes(lowerQuery) || childMatches.length > 0) {
      result.push({ ...node, children: childMatches.length > 0 ? childMatches : node.children });
    }
  }
  return result;
}

function collectAllPaths(nodes: FolderTreeNode[]): Set<string> {
  const paths = new Set<string>();
  for (const node of nodes) {
    paths.add(node.fullPath);
    for (const p of collectAllPaths(node.children)) {
      paths.add(p);
    }
  }
  return paths;
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
  id?: string;
  author?: string;
  tags?: string[];
  lastModified?: string;
  cardData?: {
    description?: string;
    tags?: string[];
  };
}

interface CivitAIDetails {
  modelId: string;
  modelName: string;
  versionName: string;
  baseModel?: string;
  createdAt?: string;
  modelDescription?: string;
  versionDescription?: string;
  trainedWords?: string[];
  sourceUrl: string;
}

interface ParsedCivitAIUrl {
  kind: 'model' | 'download' | 'invalid';
  modelId: string | null;
  versionId: string | null;
  normalizedUrl: string;
}

interface ActiveDownload {
  id: string;
  name: string;
  url: string;
  type: string;
  thumbnail?: string;
  progress: number;
  speed: number;
  status: 'downloading' | 'success' | 'error' | 'cancelled';
  error?: string;
  socket?: WebSocket;
}

interface ScannerModelRecord {
  name: string;
  local?: boolean;
  title?: string;
  architecture?: string;
  description?: string;
  author?: string;
  date?: string;
  usage_hint?: string;
  trigger_phrase?: string;
  tags?: string[] | string;
  preview_image?: string;
  hash?: string;
  standard_width?: number;
  standard_height?: number;
  license?: string;
  prediction_type?: string;
  is_negative_embedding?: boolean;
  lora_default_weight?: string;
  lora_default_confinement?: string;
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

interface ScanMetadataStats {
  total: number;
  processed: number;
  updated: number;
  failed: number;
  skipped: number;
  wouldUpdate: number;
}

interface ScanReportEntry {
  model: string;
  result: 'updated' | 'would-update' | 'failed' | 'skipped' | 'unchanged';
  source: string;
  sourceUrl: string;
  details: string;
  changedFields: string[];
  preview: string;
  timestamp: number;
}

interface CivitMetadataPayload {
  title?: string;
  description?: string;
  author?: string;
  date?: string;
  usageHint?: string;
  triggerPhrase?: string;
  tags?: string;
  previewImageData?: string | null;
  previewImageUrl?: string | null;
  sourceUrl?: string;
  sourceType?: 'civitai' | 'huggingface';
  sourceModelId?: string;
  sourceVersionId?: string;
  sourceRepo?: string;
  previewStrategy?: 'image' | 'video' | 'none';
}

interface ModelDownloaderProps {
  opened: boolean;
  onClose: () => void;
  onDownloadComplete?: () => void;
}

type DesktopFolderAPI = {
  selectFolder?: (startPath?: string) => Promise<string | null>;
};

export function ModelDownloader({ opened, onClose, onDownloadComplete }: ModelDownloaderProps) {
  const cancelledDownloadIdsRef = useRef<Set<string>>(new Set());
  const refreshedIndexForCurrentOpenRef = useRef(false);

  // Form state
  const [url, setUrl] = useState('');
  const [urlStatus, setUrlStatus] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [isUrlValid, setIsUrlValid] = useState(false);
  const [modelType, setModelType] = useState<string>('Stable-Diffusion');
  const [fileName, setFileName] = useState('');
  const [folder, setFolder] = useState<string | null>('(None)');
  const [folders, setFolders] = useState<string[]>([]);
  const [foldersUnderRoot, setFoldersUnderRoot] = useState<string[]>([]);
  const [rootFolder, setRootFolder] = useState<string>('(None)');
  const [subfolder, setSubfolder] = useState<string>('');
  const [manualFolderPath, setManualFolderPath] = useState<string>('');
  const [useManualFolder, setUseManualFolder] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [folderBrowserSearch, setFolderBrowserSearch] = useState('');
  const [folderOverrides, setFolderOverrides] = useState<Record<string, string>>({});
  const [isFolderAutoMapped, setIsFolderAutoMapped] = useState(false);
  const folderOverridesRef = useRef<Record<string, string>>({});
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Set<string>>(new Set());

  // Metadata state
  const [metadata, setMetadata] = useState<Record<string, string> | null>(null);
  const [civitaiDetails, setCivitaiDetails] = useState<CivitAIDetails | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [embedThumbnail, setEmbedThumbnail] = useState(true);
  const [isConvertingThumbnail, setIsConvertingThumbnail] = useState(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // UI collapse state
  const [metadataScannerCollapsed, setMetadataScannerCollapsed] = useState(true);

  // Downloads state
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  const [isScanningMissingMetadata, setIsScanningMissingMetadata] = useState(false);
  const [scanScope, setScanScope] = useState<MetadataScanScope>('all');
  const [scanMode, setScanMode] = useState<MetadataScanMode>('missing-only');
  const [scanDryRun, setScanDryRun] = useState(false);
  const [scanIncludeHeaderSourcePass, setScanIncludeHeaderSourcePass] = useState(true);
  const [scanRecordSyncOnUnchanged, setScanRecordSyncOnUnchanged] = useState(false);
  const [scanConcurrency, setScanConcurrency] = useState(4);
  const [scanRetries, setScanRetries] = useState(2);
  const [scanRetryDelayMs, setScanRetryDelayMs] = useState(500);
  const [scanAutoRunEnabled, setScanAutoRunEnabled] = useState(false);
  const [scanAutoRunMinutes, setScanAutoRunMinutes] = useState(15);
  const scanCancelRequestedRef = useRef(false);
  const scanRunRef = useRef<((opts?: { scheduled?: boolean; silent?: boolean }) => Promise<void>) | null>(
    null
  );
  const [scanMetadataStats, setScanMetadataStats] = useState<ScanMetadataStats>({
    total: 0,
    processed: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    wouldUpdate: 0,
  });
  const [scanMetadataStatus, setScanMetadataStatus] = useState('');
  const [scanReportEntries, setScanReportEntries] = useState<ScanReportEntry[]>([]);

  useEffect(() => {
    folderOverridesRef.current = folderOverrides;
  }, [folderOverrides]);

  // Can download?
  const canDownload =
    url.trim() !== '' && fileName.trim() !== '' && !isLoadingMetadata && isUrlValid;
  const allFolderPaths = folders.filter((folderPath) => folderPath !== '(None)');
  const rootFolderSet = new Set<string>();
  for (const folderPath of allFolderPaths) {
    const segments = normalizeFolderPath(folderPath)
      .split('/')
      .filter(Boolean);
    for (let i = 1; i <= segments.length; i++) {
      rootFolderSet.add(segments.slice(0, i).join('/'));
    }
  }
  // Include subfolder paths discovered under the selected root
  // Always add them so subfolders appear in Base Folder dropdown
  for (const sub of foldersUnderRoot) {
    const normalized = normalizeFolderPath(sub);
    if (normalized) {
      if (rootFolder && rootFolder !== '(None)') {
        rootFolderSet.add(composeFolderPath(rootFolder, normalized));
      } else {
        // When at root, subfolders ARE root-level paths
        rootFolderSet.add(normalized);
        // Also decompose into prefix segments for nested paths
        const segments = normalized.split('/').filter(Boolean);
        for (let i = 1; i <= segments.length; i++) {
          rootFolderSet.add(segments.slice(0, i).join('/'));
        }
      }
    }
  }
  if (rootFolder && rootFolder !== '(None)') {
    rootFolderSet.add(rootFolder);
  }
  const rootFolderOptions = [
    { value: '(None)', label: `${modelType} root` },
    ...Array.from(rootFolderSet).sort().map((entry) => ({ value: entry, label: entry })),
  ];
  const subfolderSet = new Set<string>();
  for (const folderPath of foldersUnderRoot) {
    const normalized = normalizeFolderPath(folderPath);
    if (normalized) {
      subfolderSet.add(normalized);
    }
  }
  if (subfolder) {
    subfolderSet.add(subfolder);
  }
  const subfolderOptions = [
    { value: '', label: '(No subfolder)' },
    ...Array.from(subfolderSet).sort().map((entry) => ({ value: entry, label: entry })),
  ];
  const resolvedTargetFolderLabel =
    folder && folder !== '(None)' ? folder : `${modelType} root folder`;

  const deriveRootAndSubfolder = useCallback(
    (targetFolder: string): { root: string; subfolder: string } => {
      const normalized = normalizeFolderPath(targetFolder) || '(None)';
      if (normalized === '(None)') {
        return { root: '(None)', subfolder: '' };
      }
      // Check if exact match in known API folders
      if (allFolderPaths.includes(normalized)) {
        return { root: normalized, subfolder: '' };
      }
      // Check if exact match in rootFolderSet (includes subfolder paths)
      if (rootFolderSet.has(normalized)) {
        return { root: normalized, subfolder: '' };
      }
      // Find the best matching prefix folder
      const allCandidates = [...new Set([...allFolderPaths, ...Array.from(rootFolderSet)])];
      let bestPrefix: string | null = null;
      for (const candidate of allCandidates) {
        const normalizedCandidate = normalizeFolderPath(candidate);
        if (
          normalizedCandidate &&
          normalized.startsWith(`${normalizedCandidate}/`) &&
          (!bestPrefix || normalizedCandidate.length > bestPrefix.length)
        ) {
          bestPrefix = normalizedCandidate;
        }
      }
      if (!bestPrefix) {
        return { root: '(None)', subfolder: normalized };
      }
      return {
        root: bestPrefix,
        subfolder: normalized.slice(bestPrefix.length + 1),
      };
    },
    [allFolderPaths, rootFolderSet]
  );

  // All browsable paths = API-returned folders + subfolder paths from rootFolderSet
  const allBrowsablePaths = useMemo(() => {
    const combined = new Set(allFolderPaths);
    for (const entry of rootFolderSet) {
      combined.add(entry);
    }
    return Array.from(combined).sort();
  }, [allFolderPaths, rootFolderSet]);

  const mapNativePathToKnownFolder = useCallback(
    (nativePath: string): string | null => {
      const normalizedNative = normalizeFolderPath(nativePath).toLowerCase();
      if (!normalizedNative) {
        return null;
      }
      let bestMatch: string | null = null;
      for (const candidate of allBrowsablePaths) {
        const normalizedCandidate = normalizeFolderPath(candidate).toLowerCase();
        if (!normalizedCandidate) {
          continue;
        }
        if (
          normalizedNative === normalizedCandidate ||
          normalizedNative.endsWith(`/${normalizedCandidate}`)
        ) {
          if (!bestMatch || normalizedCandidate.length > bestMatch.length) {
            bestMatch = candidate;
          }
        }
      }
      return bestMatch;
    },
    [allBrowsablePaths]
  );

  // Load folders and auto-map by model type on open/type change.
  useEffect(() => {
    if (!opened) {
      refreshedIndexForCurrentOpenRef.current = false;
      return;
    }
  }, [opened]);

  useEffect(() => {
    if (!opened) {
      return;
    }
    let isCancelled = false;
    const loadFolders = async () => {
      try {
        if (!refreshedIndexForCurrentOpenRef.current) {
          await swarmClient.triggerModelRefresh();
          if (isCancelled) {
            return;
          }
          refreshedIndexForCurrentOpenRef.current = true;
        }
        const folderList = await swarmClient.listModelFolderCandidates(modelType);
        if (isCancelled) {
          return;
        }
        const normalizedFolders = Array.from(
          new Set(
            folderList
              .map((entry) => normalizeFolderPath(entry))
              .filter(Boolean)
          )
        ).sort();
        const nextFolders = ['(None)', ...normalizedFolders];
        setFolders(nextFolders);

        // If user already overrode this type, always keep their choice.
        const userOverride = folderOverridesRef.current[modelType];
        if (userOverride) {
          const normalizedOverride = normalizeFolderPath(userOverride) || '(None)';
          const overrideParts = deriveRootAndSubfolder(normalizedOverride);
          const isManualOverride =
            normalizedOverride !== '(None)' && !nextFolders.includes(normalizedOverride);
          setFolder(normalizedOverride);
          setRootFolder(overrideParts.root);
          setSubfolder(overrideParts.subfolder);
          setManualFolderPath(isManualOverride ? normalizedOverride : '');
          setUseManualFolder(isManualOverride);
          setIsFolderAutoMapped(false);
          return;
        }

        // Otherwise, choose best match for type and keep manual override available.
        const mappedFolder = normalizeFolderPath(findAutoMappedFolder(modelType, normalizedFolders)) || '(None)';
        setFolder(mappedFolder);
        setRootFolder(mappedFolder);
        setSubfolder('');
        setManualFolderPath('');
        setUseManualFolder(false);
        setIsFolderAutoMapped(mappedFolder !== '(None)');
      } catch (error) {
        console.error('Failed to load folders:', error);
      }
    };
    void loadFolders();
    return () => {
      isCancelled = true;
    };
  }, [opened, modelType, deriveRootAndSubfolder]);

  // Load subfolders under the current selected root path.
  useEffect(() => {
    if (!opened) {
      return;
    }
    let isCancelled = false;
    const loadFoldersUnderRoot = async () => {
      // Clear stale entries immediately so the subfolder list reflects the selected root.
      setFoldersUnderRoot([]);
      try {
        const rootPath = rootFolder === '(None)' ? '' : rootFolder;
        const result = await swarmClient.listModelFoldersAtPath(modelType, rootPath);
        if (!isCancelled) {
          setFoldersUnderRoot(result);
        }
      } catch {
        if (!isCancelled) {
          setFoldersUnderRoot([]);
        }
      }
    };
    void loadFoldersUnderRoot();
    return () => {
      isCancelled = true;
    };
  }, [opened, modelType, rootFolder]);

  const clearMetadataState = () => {
    setMetadata(null);
    setCivitaiDetails(null);
    setThumbnailUrl(null);
    setThumbnailDataUrl(null);
    setAvailableImages([]);
    setSelectedImageIndex(0);
  };

  const isDownloadableModelFile = (name: string): boolean => {
    return /\.(safetensors|sft|gguf)$/i.test(name);
  };

  const extractCivitAIVersionIdFromDownloadUrl = (downloadUrl: string): string | null => {
    const withoutQuery = downloadUrl.split('?')[0];
    const parts = withoutQuery.split('/');
    const last = parts[parts.length - 1];
    return last || null;
  };

  const parseCivitAIUrl = (inputUrl: string): ParsedCivitAIUrl => {
    let normalizedUrl = inputUrl.trim();
    if (normalizedUrl.startsWith(CIVITAI_GREEN_PREFIX)) {
      normalizedUrl = CIVITAI_PREFIX + normalizedUrl.substring(CIVITAI_GREEN_PREFIX.length);
    }
    if (!normalizedUrl.startsWith(CIVITAI_PREFIX)) {
      return { kind: 'invalid', modelId: null, versionId: null, normalizedUrl };
    }
    try {
      const parsed = new URL(normalizedUrl);
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
    } catch (error) {
      console.error('Failed to parse CivitAI URL:', error);
    }
    return { kind: 'invalid', modelId: null, versionId: null, normalizedUrl };
  };

  const parseHuggingFaceRepoId = (inputUrl: string): string | null => {
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

  const ensureDescriptionHasSourceUrl = (description: string, sourceUrl: string | null): string => {
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

  const convertImageUrlToDataUrl = useCallback(async (imageUrl: string): Promise<string | null> => {
    // Prefer backend proxy first — avoids CORS issues and works with CivitAI API keys.
    try {
      const proxied = await swarmClient.forwardMetadataImageRequest(imageUrl);
      if (proxied && proxied.startsWith('data:image/')) {
        return proxied;
      }
    } catch {
      // Backend proxy failed, fall through to browser-side conversion.
    }

    const convertWithCanvas = async (): Promise<string | null> =>
      await new Promise<string | null>((resolve) => {
        const image = new window.Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          try {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            if (!width || !height) {
              resolve(null);
              return;
            }
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {
              resolve(null);
              return;
            }
            const targetMp = 256 * 256;
            const mp = Math.max(1, width * height);
            const ratio = Math.sqrt(targetMp / mp);
            const widthFixed = Math.max(1, Math.round(width * ratio));
            const heightFixed = Math.max(1, Math.round(height * ratio));
            canvas.width = widthFixed;
            canvas.height = heightFixed;
            context.drawImage(image, 0, 0, widthFixed, heightFixed);
            const converted = canvas.toDataURL('image/jpeg');
            resolve(converted.startsWith('data:image/') ? converted : null);
          } catch {
            resolve(null);
          }
        };
        image.onerror = () => resolve(null);
        image.src = imageUrl;
      });

    const canvasResult = await convertWithCanvas();
    if (canvasResult) {
      return canvasResult;
    }

    try {
      const response = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      const browserData = await new Promise<string | null>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          resolve(result.startsWith('data:image/') ? result : null);
        };
        reader.onerror = () => reject(new Error('Failed to read image data'));
        reader.readAsDataURL(blob);
      });
      return browserData;
    } catch {
      return null;
    }
  }, []);

  const convertVideoUrlToDataUrl = useCallback(async (videoUrl: string): Promise<string | null> => {
    return await new Promise<string | null>((resolve) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => {
        video.removeAttribute('src');
        video.load();
      };

      video.onloadeddata = () => {
        try {
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) {
            cleanup();
            resolve(null);
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) {
            cleanup();
            resolve(null);
            return;
          }
          context.drawImage(video, 0, 0, width, height);
          const result = canvas.toDataURL('image/jpeg');
          cleanup();
          resolve(result.startsWith('data:image/') ? result : null);
        } catch {
          cleanup();
          resolve(null);
        }
      };
      video.onerror = () => {
        cleanup();
        resolve(null);
      };

      video.src = videoUrl;
      video.load();
    });
  }, []);

  useEffect(() => {
    if (!embedThumbnail || !thumbnailUrl) {
      setThumbnailDataUrl(null);
      setIsConvertingThumbnail(false);
      return;
    }
    let cancelled = false;
    setIsConvertingThumbnail(true);
    convertImageUrlToDataUrl(thumbnailUrl)
      .then((dataUrl) => {
        if (!cancelled) {
          setThumbnailDataUrl(dataUrl);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsConvertingThumbnail(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [thumbnailUrl, embedThumbnail, convertImageUrlToDataUrl]);

  const fetchCivitAIMetadata = async (
    modelId: string,
    versionId: string | null
  ): Promise<boolean> => {
    setIsLoadingMetadata(true);
    try {
      const response = await swarmClient.forwardMetadataRequest(
        `${CIVITAI_PREFIX}api/v1/models/${modelId}`
      );
      if (!response) {
        setUrlStatus({ type: 'error', message: 'Failed to fetch CivitAI metadata: no response from server' });
        setIsUrlValid(false);
        return false;
      }
      if (response.error) {
        setUrlStatus({ type: 'error', message: `Failed to fetch CivitAI metadata: ${response.error}` });
        setIsUrlValid(false);
        return false;
      }
      if (!Array.isArray(response.modelVersions) || response.modelVersions.length === 0) {
        setUrlStatus({ type: 'error', message: 'Failed to fetch CivitAI metadata: no model versions found' });
        setIsUrlValid(false);
        return false;
      }

      const data = response as CivitAIMetadata;

      let selectedVersion = data.modelVersions[0];
      let selectedFile =
        selectedVersion.files.find((f) => isDownloadableModelFile(f.name)) ??
        selectedVersion.files[0];

      if (versionId) {
        let found = false;
        for (const version of data.modelVersions) {
          for (const file of version.files) {
            const fileVersionId = extractCivitAIVersionIdFromDownloadUrl(file.downloadUrl);
            if (fileVersionId === versionId) {
              selectedVersion = version;
              selectedFile = file;
              found = true;
              break;
            }
          }
          if (found) {
            break;
          }
        }
      }

      if (!isDownloadableModelFile(selectedFile.name)) {
        const fallback = data.modelVersions
          .flatMap((version) => version.files.map((file) => ({ version, file })))
          .find((entry) => isDownloadableModelFile(entry.file.name));
        if (fallback) {
          selectedVersion = fallback.version;
          selectedFile = fallback.file;
        }
      }

      if (!isDownloadableModelFile(selectedFile.name)) {
        setUrlStatus({
          type: 'error',
          message: `Cannot download: file is not safetensors or GGUF (${selectedFile.name})`,
        });
        setIsUrlValid(false);
        return false;
      }

      if (data.type === 'Checkpoint') setModelType('Stable-Diffusion');
      else if (['LORA', 'LoCon', 'LyCORIS'].includes(data.type)) setModelType('LoRA');
      else if (data.type === 'TextualInversion') setModelType('Embedding');
      else if (data.type === 'ControlNet') setModelType('ControlNet');
      else if (data.type === 'VAE') setModelType('VAE');

      const imageUrls =
        selectedVersion.images?.filter((img) => img.type === 'image').map((img) => img.url) ?? [];
      setAvailableImages(imageUrls);
      setSelectedImageIndex(0);
      setThumbnailUrl(imageUrls[0] ?? null);

      let downloadUrl = selectedFile.downloadUrl;
      if (selectedFile.name.endsWith('.gguf')) {
        downloadUrl += '#.gguf';
      }
      setUrl(downloadUrl);

      const safeName = `${data.name} - ${selectedVersion.name}`.replace(
        /[|\\/:*?"<>|,.&![\]()]/g,
        '-'
      );
      setFileName(safeName);

      const selectedVersionId = coerceIdString(selectedVersion.id) || versionId;
      const sourceUrl = selectedVersionId
        ? `${CIVITAI_PREFIX}models/${modelId}?modelVersionId=${selectedVersionId}`
        : `${CIVITAI_PREFIX}models/${modelId}`;

      const metadataObj: Record<string, string> = {
        'modelspec.title': `${data.name} - ${selectedVersion.name}`,
        'modelspec.description': `From ${sourceUrl}\n${selectedVersion.description || ''}\n${data.description || ''}`,
        'modelspec.date': selectedVersion.createdAt,
        'modelspec.author': data.creator?.username || '',
        'modelspec.trigger_phrase': selectedVersion.trainedWords?.join('; ') || '',
        'modelspec.tags': data.tags?.join(', ') || '',
      };
      if (['Illustrious', 'Pony'].includes(selectedVersion.baseModel)) {
        metadataObj['modelspec.usage_hint'] = selectedVersion.baseModel;
      }

      setMetadata(metadataObj);
      setIncludeMetadata(true);
      setEmbedThumbnail(true);
      setCivitaiDetails({
        modelId,
        modelName: data.name,
        versionName: selectedVersion.name,
        baseModel: selectedVersion.baseModel,
        createdAt: selectedVersion.createdAt,
        modelDescription: data.description,
        versionDescription: selectedVersion.description,
        trainedWords: selectedVersion.trainedWords,
        sourceUrl,
      });

      setUrlStatus({
        type: 'success',
        message: `CivitAI: ${data.name} - ${selectedVersion.name} (${selectedVersion.baseModel})`,
      });
      setIsUrlValid(true);
      return true;
    } catch (error) {
      console.error('CivitAI metadata error:', error);
      const detail = error instanceof Error ? error.message : String(error);
      setUrlStatus({ type: 'error', message: `Failed to load CivitAI metadata: ${detail}` });
      setIsUrlValid(false);
      return false;
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const fetchCivitAIMetadataByVersion = async (versionId: string): Promise<void> => {
    setIsLoadingMetadata(true);
    try {
      const lookup = await swarmClient.forwardMetadataRequest(
        `${CIVITAI_PREFIX}api/v1/model-versions/${versionId}`
      );
      if (!lookup || lookup.error) {
        const detail = lookup?.error ? `: ${lookup.error}` : '';
        setUrlStatus({
          type: 'warning',
          message: `Valid CivitAI download link, but metadata could not be loaded${detail}`,
        });
        setIsUrlValid(true);
        return;
      }
      if (typeof (lookup as CivitAIModelVersionLookup).modelId !== 'number') {
        setUrlStatus({
          type: 'warning',
          message: 'Valid CivitAI download link, but metadata response was missing modelId',
        });
        setIsUrlValid(true);
        return;
      }
      await fetchCivitAIMetadata(String((lookup as CivitAIModelVersionLookup).modelId), versionId);
    } catch (error) {
      console.error('CivitAI version metadata error:', error);
      setUrlStatus({
        type: 'warning',
        message: 'Valid CivitAI download link, but metadata could not be loaded',
      });
      setIsUrlValid(true);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setUrlStatus(null);
    setIsUrlValid(false);
    clearMetadataState();

    const trimmedUrl = newUrl.trim();
    if (!trimmedUrl) {
      return;
    }

    if (/\.(pt|pth|ckpt|bin)$/i.test(trimmedUrl)) {
      setUrlStatus({
        type: 'error',
        message: 'Pickle files (.pt, .pth, .ckpt, .bin) cannot be downloaded for security reasons',
      });
      setIsUrlValid(false);
      return;
    }

    if (trimmedUrl.startsWith(HUGGINGFACE_PREFIX)) {
      const parts = trimmedUrl.substring(HUGGINGFACE_PREFIX.length).split('/');
      if (parts.length < 5) {
        setUrlStatus({
          type: 'warning',
          message: 'HuggingFace URL should point to a specific file',
        });
        setIsUrlValid(false);
        return;
      }

      let cleanUrl = trimmedUrl;
      if (cleanUrl.endsWith('?download=true')) {
        cleanUrl = cleanUrl.replace('?download=true', '');
      }

      const filePath = parts.slice(4).join('/');
      const filePathWithoutQuery = filePath.split('?')[0];
      if (!isDownloadableModelFile(filePathWithoutQuery)) {
        setUrlStatus({
          type: 'error',
          message: 'Only .safetensors and .gguf files can be downloaded',
        });
        setIsUrlValid(false);
        return;
      }

      if (parts[2] === 'blob') {
        parts[2] = 'resolve';
        cleanUrl = HUGGINGFACE_PREFIX + parts.join('/');
        setUrl(cleanUrl);
        setUrlStatus({ type: 'success', message: 'HuggingFace URL corrected to download link' });
      } else if (parts[2] === 'resolve') {
        setUrlStatus({ type: 'success', message: 'Valid HuggingFace download link' });
      } else {
        setUrlStatus({
          type: 'warning',
          message: 'HuggingFace URL should use /resolve/ for direct download',
        });
        setIsUrlValid(false);
        return;
      }

      const nameFromPath = filePathWithoutQuery.replace(/\.(safetensors|sft|gguf)$/i, '');
      setFileName(nameFromPath);
      setIsUrlValid(true);
      return;
    }

    if (trimmedUrl.startsWith(CIVITAI_PREFIX) || trimmedUrl.startsWith(CIVITAI_GREEN_PREFIX)) {
      const parsed = parseCivitAIUrl(trimmedUrl);
      setUrl(parsed.normalizedUrl);
      if (parsed.kind === 'model' && parsed.modelId) {
        setUrlStatus({ type: 'info', message: 'Loading CivitAI metadata...' });
        void fetchCivitAIMetadata(parsed.modelId, parsed.versionId);
        return;
      }
      if (parsed.kind === 'download' && parsed.versionId) {
        setIsUrlValid(true);
        setUrlStatus({ type: 'info', message: 'Loading CivitAI metadata...' });
        void fetchCivitAIMetadataByVersion(parsed.versionId);
        return;
      }
      setUrlStatus({
        type: 'warning',
        message: 'CivitAI link should point to /models/{id} or /api/download/models/{id}',
      });
      setIsUrlValid(false);
      return;
    }

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      setUrlStatus({ type: 'error', message: 'URL must start with http:// or https://' });
      setIsUrlValid(false);
      return;
    }

    setUrlStatus({ type: 'info', message: 'URL appears valid (unrecognized source)' });
    setIsUrlValid(true);
  };

  const buildCivitMetadataPayload = useCallback(
    async (
      modelId: string,
      versionId: string | null,
      modelNameHint?: string
    ): Promise<CivitMetadataPayload | null> => {
      const response = await swarmClient.forwardMetadataRequest(`${CIVITAI_PREFIX}api/v1/models/${modelId}`);
      if (
        !response ||
        response.error ||
        !Array.isArray((response as CivitAIMetadata).modelVersions) ||
        (response as CivitAIMetadata).modelVersions.length === 0
      ) {
        return null;
      }

      const data = response as CivitAIMetadata;
      const normalizeModelToken = (value: string): string =>
        value
          .toLowerCase()
          .replace(/\.(safetensors|sft|gguf)$/i, '')
          .replace(/[^a-z0-9]+/g, '');
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
          if (!versionId) {
            return false;
          }
          const currentVersionId = coerceIdString(version.id);
          if (currentVersionId && currentVersionId === versionId) {
            return true;
          }
          return version.files.some(
            (file) => extractCivitAIVersionIdFromDownloadUrl(file.downloadUrl) === versionId
          );
        }) ?? hintedVersion ?? firstDownloadableVersion;
      const resolvedVersionId = coerceIdString(selectedVersion.id) || versionId;
      if (resolvedVersionId) {
        const versionDetails = await swarmClient.forwardMetadataRequest(
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
      const sourceUrl = resolvedVersionId
        ? `${CIVITAI_PREFIX}models/${modelId}?modelVersionId=${resolvedVersionId}`
        : `${CIVITAI_PREFIX}models/${modelId}`;

      const imageUrls =
        selectedVersion.images
          ?.filter((img) => {
            const kind = typeof img.type === 'string' ? img.type.toLowerCase() : '';
            return typeof img.url === 'string' && kind === 'image';
          })
          .map((img) => img.url) ?? [];
      const previewImageUrl = imageUrls[0] ?? null;
      const videoUrls =
        selectedVersion.images
          ?.filter((img) => {
            const kind = typeof img.type === 'string' ? img.type.toLowerCase() : '';
            return typeof img.url === 'string' && kind === 'video';
          })
          .map((img) => img.url) ?? [];
      let previewImageData: string | null = null;
      let previewStrategy: 'image' | 'video' | 'none' = 'none';
      for (const imageUrl of imageUrls) {
        previewImageData = await convertImageUrlToDataUrl(imageUrl);
        if (previewImageData) {
          previewStrategy = 'image';
          break;
        }
      }
      if (!previewImageData) {
        for (const videoUrl of videoUrls) {
          previewImageData = await convertVideoUrlToDataUrl(videoUrl);
          if (previewImageData) {
            previewStrategy = 'video';
            break;
          }
        }
      }

      const payload: CivitMetadataPayload = {
        title: `${data.name} - ${selectedVersion.name}`,
        description: `From ${sourceUrl}\n${selectedVersion.description || ''}\n${data.description || ''}`,
        author: data.creator?.username || '',
        date: selectedVersion.createdAt || '',
        triggerPhrase: selectedVersion.trainedWords?.join('; ') || '',
        tags: data.tags?.join(', ') || '',
        previewImageData,
        previewImageUrl,
        sourceUrl,
        sourceType: 'civitai',
        sourceModelId: modelId,
        sourceVersionId: resolvedVersionId || undefined,
        previewStrategy,
      };
      if (['Illustrious', 'Pony'].includes(selectedVersion.baseModel)) {
        payload.usageHint = selectedVersion.baseModel;
      }
      return payload;
    },
    [convertImageUrlToDataUrl, convertVideoUrlToDataUrl]
  );

  const buildHuggingFaceMetadataPayload = useCallback(
    async (repoId: string): Promise<CivitMetadataPayload | null> => {
      const cleanRepo = repoId.trim().replace(/^\/+|\/+$/g, '');
      const segments = cleanRepo.split('/').filter(Boolean);
      if (segments.length < 2) {
        return null;
      }
      const encodedRepo = `${encodeURIComponent(segments[0])}/${encodeURIComponent(segments[1])}`;
      const response = await swarmClient.forwardMetadataRequest(
        `${HUGGINGFACE_PREFIX}api/models/${encodedRepo}`
      );
      if (!response || response.error) {
        return null;
      }
      const data = response as HuggingFaceModelLookup;
      const sourceUrl = `${HUGGINGFACE_PREFIX}${segments[0]}/${segments[1]}`;
      const descriptionLines = [sourceUrl, data.cardData?.description || ''].filter(Boolean);
      const tags = [
        ...(Array.isArray(data.tags) ? data.tags : []),
        ...(Array.isArray(data.cardData?.tags) ? data.cardData.tags : []),
      ]
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .slice(0, 64);
      return {
        title: `${segments[0]}/${segments[1]}`,
        description: `From ${sourceUrl}\n${descriptionLines.join('\n')}`,
        author: data.author || segments[0],
        date: data.lastModified || '',
        tags: tags.length > 0 ? Array.from(new Set(tags)).join(', ') : '',
        sourceUrl,
        sourceType: 'huggingface',
        sourceRepo: `${segments[0]}/${segments[1]}`,
        previewStrategy: 'none',
      };
    },
    []
  );

  const isModelMissingMetadata = (
    model: ScannerModelRecord,
    mode: MetadataScanMode = scanMode
  ): boolean => {
    const includeDefaultTitles = mode === 'upgrade-defaults';
    return (
      isMissingPreviewImage(model.preview_image) ||
      isMissingMetadataText(model.description) ||
      isSourceOnlyDescription(model.description) ||
      isMissingMetadataText(model.author) ||
      isMissingMetadataText(model.usage_hint) ||
      isMissingMetadataText(model.trigger_phrase) ||
      isMissingMetadataText(model.date) ||
      isMissingMetadataTags(model.tags) ||
      isMissingMetadataText(model.title) ||
      (includeDefaultTitles && getTitleLooksLikeDefaultName(model.name, model.title))
    );
  };

  const cancelMissingMetadataScan = () => {
    if (!isScanningMissingMetadata) {
      return;
    }
    scanCancelRequestedRef.current = true;
    setScanMetadataStatus('Cancelling scan...');
  };

  const downloadScanReport = (content: string, extension: 'json' | 'csv') => {
    const blob = new Blob([content], {
      type: extension === 'json' ? 'application/json' : 'text/csv',
    });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `metadata-scan-report-${modelType.toLowerCase()}-${Date.now()}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(blobUrl);
  };

  const exportScanReportJson = () => {
    if (scanReportEntries.length === 0) {
      return;
    }
    downloadScanReport(JSON.stringify(scanReportEntries, null, 2), 'json');
  };

  const exportScanReportCsv = () => {
    if (scanReportEntries.length === 0) {
      return;
    }
    const escapeCsv = (value: string): string => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ['model', 'result', 'source', 'source_url', 'details', 'changed_fields', 'preview', 'timestamp'],
      ...scanReportEntries.map((entry) => [
        entry.model,
        entry.result,
        entry.source,
        entry.sourceUrl,
        entry.details,
        entry.changedFields.join('|'),
        entry.preview,
        new Date(entry.timestamp).toISOString(),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => escapeCsv(cell || '')).join(',')).join('\n');
    downloadScanReport(csv, 'csv');
  };

  const scanMissingMetadata = async (opts?: { scheduled?: boolean; silent?: boolean }) => {
    const scheduled = opts?.scheduled ?? false;
    const silent = opts?.silent ?? false;
    if (isScanningMissingMetadata) {
      return;
    }

    scanCancelRequestedRef.current = false;
    setIsScanningMissingMetadata(true);
    setScanMetadataStatus(scheduled ? 'Scheduled metadata scan started...' : 'Loading model list...');
    setScanMetadataStats({
      total: 0,
      processed: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      wouldUpdate: 0,
    });
    setScanReportEntries([]);

    try {
      const delay = async (ms: number) =>
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), ms);
        });
      const withRetries = async <T,>(operation: () => Promise<T>): Promise<T> => {
        let attempt = 0;
        while (true) {
          try {
            return await operation();
          } catch (error) {
            if (attempt >= scanRetries || scanCancelRequestedRef.current) {
              throw error;
            }
            const backoffMs = Math.max(50, scanRetryDelayMs) * Math.pow(2, attempt);
            attempt++;
            await delay(backoffMs);
          }
        }
      };
      setScanMetadataStatus('Refreshing model index...');
      await withRetries(() => swarmClient.triggerModelRefresh());
      if (scanCancelRequestedRef.current) {
        setScanMetadataStatus('Scan cancelled.');
        if (!silent) {
          notifications.show({
            title: 'Metadata Scan Cancelled',
            message: 'Scan cancelled before discovery.',
            color: 'yellow',
          });
        }
        return;
      }

      const baseScopedPath =
        rootFolder && rootFolder !== '(None)' ? normalizeFolderPath(rootFolder) : '';
      const exactScopedPath = (() => {
        const composed = normalizeFolderPath(composeFolderPath(rootFolder, subfolder));
        return composed === '(None)' ? '' : composed;
      })();
      const scanPath =
        scanScope === 'base' ? baseScopedPath : scanScope === 'exact' ? exactScopedPath : '';

      const fetchByHash = async (
        hash: string
      ): Promise<{ modelId: string; versionId: string | null } | null> => {
        const normalized = sanitizeHashForCivitLookup(hash);
        if (!normalized) {
          return null;
        }
        const candidates = [normalized];
        if (normalized.length > 12) {
          candidates.push(normalized.slice(0, 12));
        }
        for (const candidate of candidates) {
          const byHash = await withRetries(() =>
            swarmClient.forwardMetadataRequest(
              `${CIVITAI_PREFIX}api/v1/model-versions/by-hash/${encodeURIComponent(candidate)}`
            )
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
      };

      const allModelNames = await withRetries(() => swarmClient.listModelNamesFromRefresh(modelType));
      if (scanCancelRequestedRef.current) {
        setScanMetadataStatus('Scan cancelled.');
        if (!silent) {
          notifications.show({
            title: 'Metadata Scan Cancelled',
            message: 'Scan cancelled before processing models.',
            color: 'yellow',
          });
        }
        return;
      }
      const normalizedScope = scanPath.toLowerCase();
      const scanTargetNames = allModelNames.filter((modelName) => {
        const normalizedModelName = normalizeFolderPath(modelName);
        if (!normalizedModelName || normalizedModelName === '(None)') {
          return false;
        }
        if (!normalizedScope) {
          return true;
        }
        return (
          normalizedModelName.toLowerCase() === normalizedScope ||
          normalizedModelName.toLowerCase().startsWith(`${normalizedScope}/`)
        );
      });
      const scanTargets = Array.from(new Set(scanTargetNames)).map((name) => ({ name }));
      setScanMetadataStatus(
        `Discovered ${scanTargets.length} ${modelType} model(s) in scope '${scanPath || '(root)'}'.`
      );

      if (scanTargets.length === 0) {
        setScanMetadataStatus('No models with missing metadata found for this scope.');
        if (!silent) {
          notifications.show({
            title: 'Metadata Scan Complete',
            message: 'No models with missing metadata were found.',
            color: 'blue',
          });
        }
        return;
      }

      let processed = 0;
      let updated = 0;
      let failed = 0;
      let skipped = 0;
      let wouldUpdate = 0;
      let missingCandidates = 0;
      let sourceFromCivitUrl = 0;
      let sourceFromCivitHash = 0;
      let sourceFromHuggingFace = 0;
      let sourceFromHeaders = 0;
      let sourceNotFound = 0;
      let metadataNotFound = 0;
      let noChangesAfterLookup = 0;
      let saveErrors = 0;
      let previewFromImage = 0;
      let previewFromVideo = 0;
      let previewUnavailable = 0;
      let previewAlreadyPresent = 0;
      let previewUnresolved = 0;
      let previewApplied = 0;
      const saveErrorSamples: string[] = [];
      const unchangedSamples: string[] = [];
      const reportRows: ScanReportEntry[] = [];
      const total = scanTargets.length;
      const maxConcurrent = Math.max(1, Math.min(12, scanConcurrency));
      let nextIndex = 0;

      const updateScanStatus = () => {
        setScanMetadataStats({ total, processed, updated, failed, skipped, wouldUpdate });
        setScanMetadataStatus(
          `Processed ${processed}/${total}. Updated ${updated}, would-update ${wouldUpdate}, failed ${failed}, skipped ${skipped}. Sources: Civit URL ${sourceFromCivitUrl}, Civit hash ${sourceFromCivitHash}, HF ${sourceFromHuggingFace}, headers ${sourceFromHeaders}, no source ${sourceNotFound}.`
        );
      };
      updateScanStatus();

      const worker = async () => {
        while (true) {
          if (scanCancelRequestedRef.current) {
            return;
          }

          const currentIndex = nextIndex++;
          if (currentIndex >= total) {
            return;
          }
          if (scanCancelRequestedRef.current) {
            return;
          }

          const current = scanTargets[currentIndex];
          try {
            const describeResponse = await withRetries(() =>
              swarmClient.describeModel(current.name, modelType)
            );
            if (!('model' in describeResponse)) {
              failed++;
              reportRows.push({
                model: current.name,
                result: 'failed',
                source: 'describe',
                sourceUrl: '',
                details: 'DescribeModel did not return model data.',
                changedFields: [],
                preview: 'n/a',
                timestamp: Date.now(),
              });
              continue;
            }
            const currentModel = describeResponse.model as unknown as ScannerModelRecord;
            if (!isModelMissingMetadata(currentModel, scanMode)) {
              skipped++;
              reportRows.push({
                model: current.name,
                result: 'skipped',
                source: 'n/a',
                sourceUrl: '',
                details: 'Already has required metadata for selected mode.',
                changedFields: [],
                preview: 'n/a',
                timestamp: Date.now(),
              });
              continue;
            }
            missingCandidates++;

            const description =
              typeof currentModel.description === 'string' ? currentModel.description : '';
            let sourceUrl =
              (typeof currentModel.source_url === 'string' && currentModel.source_url.trim()) ||
              extractSourceUrlFromText(description) ||
              '';
            sourceUrl = sourceUrl ? normalizeSourceUrlCandidate(sourceUrl) : '';
            let sourceType = normalizeSourceType(currentModel.source_type);
            let modelId = coerceIdString(currentModel.source_model_id);
            let versionId = coerceIdString(currentModel.source_version_id);
            let sourceRepo =
              typeof currentModel.source_repo === 'string' && currentModel.source_repo.trim()
                ? currentModel.source_repo.trim()
                : null;

            if (scanIncludeHeaderSourcePass && !sourceUrl && !modelId && !sourceRepo) {
              const headerPayload = await withRetries(() =>
                swarmClient.getModelHeaders(current.name, modelType)
              );
              const rawHeaders =
                typeof headerPayload === 'object' &&
                  headerPayload !== null &&
                  'headers' in headerPayload
                  ? (headerPayload as { headers?: unknown }).headers
                  : headerPayload;
              const headerObject =
                rawHeaders && typeof rawHeaders === 'object'
                  ? (rawHeaders as Record<string, unknown>)
                  : null;
              const metadataObject =
                headerObject &&
                  headerObject.__metadata__ &&
                  typeof headerObject.__metadata__ === 'object'
                  ? (headerObject.__metadata__ as Record<string, unknown>)
                  : headerObject;
              const pickHeaderText = (...keys: string[]): string => {
                for (const key of keys) {
                  const value = metadataObject?.[key] ?? headerObject?.[key];
                  if (typeof value === 'string' && value.trim().length > 0) {
                    return value.trim();
                  }
                  if (typeof value === 'number' && Number.isFinite(value)) {
                    return String(value);
                  }
                }
                return '';
              };
              const sourceUrlFromHeader = pickHeaderText('modelspec.source_url', 'source_url');
              const sourceTypeFromHeader = normalizeSourceType(
                pickHeaderText('modelspec.source_type', 'source_type')
              );
              const sourceModelIdFromHeader = coerceIdString(
                pickHeaderText('modelspec.source_model_id', 'source_model_id')
              );
              const sourceVersionIdFromHeader = coerceIdString(
                pickHeaderText('modelspec.source_version_id', 'source_version_id')
              );
              const sourceRepoFromHeader = pickHeaderText('modelspec.source_repo', 'source_repo');
              const sourceDescFromHeader = pickHeaderText('modelspec.description', 'description');
              sourceUrl =
                sourceUrl ||
                sourceUrlFromHeader ||
                extractSourceUrlFromText(sourceDescFromHeader) ||
                '';
              sourceType = sourceType || sourceTypeFromHeader;
              modelId = modelId || sourceModelIdFromHeader;
              versionId = versionId || sourceVersionIdFromHeader;
              sourceRepo = sourceRepo || (sourceRepoFromHeader || null);
              if (sourceUrl || modelId || sourceRepo) {
                sourceFromHeaders++;
              }
            }

            if (sourceUrl) {
              const parsed = parseCivitAIUrl(sourceUrl);
              if (parsed.kind === 'model' && parsed.modelId) {
                sourceType = 'civitai';
                modelId = modelId || parsed.modelId;
                versionId = versionId || parsed.versionId;
                sourceFromCivitUrl++;
              } else if (parsed.kind === 'download' && parsed.versionId) {
                sourceType = 'civitai';
                versionId = versionId || parsed.versionId;
                sourceFromCivitUrl++;
              } else {
                const parsedRepo = parseHuggingFaceRepoId(sourceUrl);
                if (parsedRepo) {
                  sourceType = sourceType || 'huggingface';
                  sourceRepo = sourceRepo || parsedRepo;
                }
              }
            }

            if ((!sourceType || sourceType === 'civitai') && !modelId) {
              let hash = typeof currentModel.hash === 'string' ? currentModel.hash : '';
              if (!hash) {
                const hashResponse = await withRetries(() =>
                  swarmClient.getModelHash(current.name, modelType)
                );
                hash = typeof hashResponse?.hash === 'string' ? hashResponse.hash : '';
              }
              if (hash) {
                const byHashResult = await fetchByHash(hash);
                if (byHashResult) {
                  sourceType = 'civitai';
                  modelId = byHashResult.modelId;
                  versionId = byHashResult.versionId;
                  sourceFromCivitHash++;
                }
              }
            }
            if (modelId && !versionId) {
              let hash = typeof currentModel.hash === 'string' ? currentModel.hash : '';
              if (!hash) {
                const hashResponse = await withRetries(() =>
                  swarmClient.getModelHash(current.name, modelType)
                );
                hash = typeof hashResponse?.hash === 'string' ? hashResponse.hash : '';
              }
              if (hash) {
                const byHashResult = await fetchByHash(hash);
                if (byHashResult?.versionId) {
                  versionId = byHashResult.versionId;
                }
              }
            }

            if ((!sourceType || sourceType === 'civitai') && !modelId && versionId) {
              const versionLookup = await withRetries(() =>
                swarmClient.forwardMetadataRequest(
                  `${CIVITAI_PREFIX}api/v1/model-versions/${versionId}`
                )
              );
              if (
                versionLookup &&
                !versionLookup.error &&
                coerceIdString((versionLookup as CivitAIModelVersionLookup).modelId)
              ) {
                sourceType = 'civitai';
                modelId = coerceIdString((versionLookup as CivitAIModelVersionLookup).modelId);
              }
            }
            const huggingFaceRepo = sourceRepo || (sourceUrl ? parseHuggingFaceRepoId(sourceUrl) : null);
            let sourcePayload: CivitMetadataPayload | null = null;
            if ((sourceType === 'civitai' || (!sourceType && !!modelId)) && modelId) {
              sourcePayload = await withRetries(() =>
                buildCivitMetadataPayload(modelId, versionId, currentModel.name)
              );
            } else if (sourceType === 'huggingface' || huggingFaceRepo) {
              sourceFromHuggingFace++;
              sourcePayload = await withRetries(() =>
                buildHuggingFaceMetadataPayload(huggingFaceRepo || '')
              );
            } else {
              sourceNotFound++;
              failed++;
              reportRows.push({
                model: current.name,
                result: 'failed',
                source: 'source-miss',
                sourceUrl: sourceUrl || '',
                details: 'No source URL/hash mapping available.',
                changedFields: [],
                preview: 'n/a',
                timestamp: Date.now(),
              });
              continue;
            }
            if (!sourcePayload) {
              metadataNotFound++;
              failed++;
              reportRows.push({
                model: current.name,
                result: 'failed',
                source: sourceType || 'unknown',
                sourceUrl: sourceUrl || '',
                details: 'Metadata payload lookup returned no result.',
                changedFields: [],
                preview: 'n/a',
                timestamp: Date.now(),
              });
              continue;
            }

            if (sourcePayload.previewStrategy === 'image' || !!sourcePayload.previewImageUrl) {
              previewFromImage++;
            } else if (sourcePayload.previewStrategy === 'video') {
              previewFromVideo++;
            } else {
              previewUnavailable++;
            }

            const includeDefaultTitles = scanMode === 'upgrade-defaults';
            const titleMissing =
              isMissingMetadataText(currentModel.title) ||
              (includeDefaultTitles && getTitleLooksLikeDefaultName(currentModel.name, currentModel.title));
            const descriptionMissing =
              isMissingMetadataText(currentModel.description) ||
              isSourceOnlyDescription(currentModel.description);
            const authorMissing = isMissingMetadataText(currentModel.author);
            const dateMissing = isMissingMetadataText(currentModel.date);
            const usageHintMissing = isMissingMetadataText(currentModel.usage_hint);
            const triggerMissing = isMissingMetadataText(currentModel.trigger_phrase);
            const tagsMissing = isMissingMetadataTags(currentModel.tags);

            const nextTitle = titleMissing
              ? sourcePayload.title || currentModel.title || ''
              : currentModel.title || '';
            let nextDescription =
              descriptionMissing
                ? sourcePayload.description || currentModel.description || ''
                : currentModel.description || '';
            const nextAuthor = authorMissing
              ? sourcePayload.author || currentModel.author || ''
              : currentModel.author || '';
            const nextDate = dateMissing
              ? sourcePayload.date || currentModel.date || ''
              : currentModel.date || '';
            const nextUsageHint = usageHintMissing
              ? sourcePayload.usageHint || currentModel.usage_hint || ''
              : currentModel.usage_hint || '';
            const nextTrigger = triggerMissing
              ? sourcePayload.triggerPhrase || currentModel.trigger_phrase || ''
              : currentModel.trigger_phrase || '';
            const nextTags = tagsMissing
              ? sourcePayload.tags || metadataTagsToString(currentModel.tags)
              : metadataTagsToString(currentModel.tags);
            const previewMissing = isMissingPreviewImage(currentModel.preview_image);
            if (!previewMissing) {
              previewAlreadyPresent++;
            }
            const resolvedSourceType =
              sourcePayload.sourceType ||
              sourceType ||
              (modelId || versionId ? 'civitai' : huggingFaceRepo ? 'huggingface' : null);
            const resolvedSourceUrl = sourcePayload.sourceUrl || sourceUrl || '';
            const resolvedSourceModelId = sourcePayload.sourceModelId || modelId || '';
            const resolvedSourceVersionId = sourcePayload.sourceVersionId || versionId || '';
            const resolvedSourceRepo =
              sourcePayload.sourceRepo ||
              sourceRepo ||
              (resolvedSourceType === 'huggingface'
                ? parseHuggingFaceRepoId(resolvedSourceUrl || '') || ''
                : '');
            const previewImageUrlCandidate =
              typeof sourcePayload.previewImageUrl === 'string' &&
                sourcePayload.previewImageUrl.trim().length > 0
                ? sourcePayload.previewImageUrl.trim()
                : null;
            const shouldUpdatePreviewImage =
              previewMissing &&
              typeof sourcePayload.previewImageData === 'string' &&
              sourcePayload.previewImageData.startsWith('data:image/');
            const shouldUpdatePreviewByUrl =
              previewMissing && !shouldUpdatePreviewImage && !!previewImageUrlCandidate;
            const nextPreviewImage = shouldUpdatePreviewImage
              ? sourcePayload.previewImageData || null
              : currentModel.preview_image || null;

            if (previewMissing && !shouldUpdatePreviewImage && !shouldUpdatePreviewByUrl) {
              previewUnresolved++;
            }

            nextDescription = ensureDescriptionHasSourceUrl(nextDescription, resolvedSourceUrl || null);

            const changedFields: string[] = [];
            if (nextTitle !== (currentModel.title || '')) changedFields.push('title');
            if (nextDescription !== (currentModel.description || '')) changedFields.push('description');
            if (nextAuthor !== (currentModel.author || '')) changedFields.push('author');
            if (nextDate !== (currentModel.date || '')) changedFields.push('date');
            if (nextUsageHint !== (currentModel.usage_hint || '')) changedFields.push('usage_hint');
            if (nextTrigger !== (currentModel.trigger_phrase || '')) changedFields.push('trigger_phrase');
            if (nextTags !== metadataTagsToString(currentModel.tags)) changedFields.push('tags');
            if (
              shouldUpdatePreviewByUrl ||
              (nextPreviewImage || null) !== (currentModel.preview_image || null)
            ) {
              changedFields.push('preview_image');
            }
            if ((resolvedSourceType || '') !== (currentModel.source_type || '')) {
              changedFields.push('source_type');
            }
            if ((resolvedSourceModelId || '') !== (currentModel.source_model_id || '')) {
              changedFields.push('source_model_id');
            }
            if ((resolvedSourceVersionId || '') !== (currentModel.source_version_id || '')) {
              changedFields.push('source_version_id');
            }
            if ((resolvedSourceRepo || '') !== (currentModel.source_repo || '')) {
              changedFields.push('source_repo');
            }
            if ((resolvedSourceUrl || '') !== (currentModel.source_url || '')) {
              changedFields.push('source_url');
            }

            const hasMetadataChanges = changedFields.length > 0;

            if (!hasMetadataChanges && !scanRecordSyncOnUnchanged) {
              const unchangedReasonBits: string[] = [];
              if (previewMissing && !shouldUpdatePreviewImage && !shouldUpdatePreviewByUrl) {
                unchangedReasonBits.push('preview-unresolved');
              }
              if (titleMissing && !sourcePayload.title) {
                unchangedReasonBits.push('title-empty');
              }
              if (descriptionMissing && !sourcePayload.description) {
                unchangedReasonBits.push('description-empty');
              }
              if (authorMissing && !sourcePayload.author) {
                unchangedReasonBits.push('author-empty');
              }
              if (triggerMissing && !sourcePayload.triggerPhrase) {
                unchangedReasonBits.push('trigger-empty');
              }
              if (tagsMissing && !sourcePayload.tags) {
                unchangedReasonBits.push('tags-empty');
              }
              const unchangedReason =
                unchangedReasonBits.length > 0 ? unchangedReasonBits.join(', ') : 'no-diff';
              if (unchangedSamples.length < 5) {
                unchangedSamples.push(`${current.name}: ${unchangedReason}`);
              }
              noChangesAfterLookup++;
              skipped++;
              reportRows.push({
                model: current.name,
                result: 'unchanged',
                source: resolvedSourceType || sourceType || 'unknown',
                sourceUrl: resolvedSourceUrl,
                details: unchangedReason,
                changedFields: [],
                preview: previewMissing ? 'unresolved' : 'existing',
                timestamp: Date.now(),
              });
              continue;
            }

            if (scanDryRun) {
              wouldUpdate++;
              reportRows.push({
                model: current.name,
                result: 'would-update',
                source: resolvedSourceType || sourceType || 'unknown',
                sourceUrl: resolvedSourceUrl,
                details: `Dry run: ${changedFields.join(', ') || 'sync-state-only'}`,
                changedFields,
                preview: shouldUpdatePreviewImage || shouldUpdatePreviewByUrl
                  ? 'would-apply'
                  : previewMissing
                    ? 'unresolved'
                    : 'existing',
                timestamp: Date.now(),
              });
              continue;
            }

            const now = Date.now();
            const saveResponse = await withRetries(() =>
              swarmClient.editModelMetadata({
                model: current.name,
                subtype: modelType,
                title: nextTitle,
                author: nextAuthor,
                type: currentModel.architecture || '',
                description: nextDescription,
                standard_width:
                  typeof currentModel.standard_width === 'number' ? currentModel.standard_width : 0,
                standard_height:
                  typeof currentModel.standard_height === 'number' ? currentModel.standard_height : 0,
                usage_hint: nextUsageHint,
                date: nextDate,
                license: currentModel.license || '',
                trigger_phrase: nextTrigger,
                prediction_type: currentModel.prediction_type || '',
                tags: nextTags,
                preview_image: shouldUpdatePreviewImage ? nextPreviewImage : null,
                preview_image_metadata: null,
                source_type: resolvedSourceType || null,
                source_model_id: resolvedSourceModelId || null,
                source_version_id: resolvedSourceVersionId || null,
                source_repo: resolvedSourceRepo || null,
                source_url: resolvedSourceUrl || null,
                source_locked: !!(resolvedSourceType || resolvedSourceUrl),
                last_metadata_sync_at: now,
                last_metadata_sync_source: resolvedSourceType || sourceType || 'unknown',
                last_metadata_sync_status: hasMetadataChanges ? 'updated' : 'unchanged',
                last_metadata_sync_message: hasMetadataChanges
                  ? `Updated fields: ${changedFields.join(', ')}`
                  : 'No metadata field changes; recorded sync status only.',
              })
            );

            if (saveResponse?.error) {
              saveErrors++;
              if (saveErrorSamples.length < 3) {
                saveErrorSamples.push(`${current.name}: ${saveResponse.error}`);
              }
              failed++;
              reportRows.push({
                model: current.name,
                result: 'failed',
                source: resolvedSourceType || sourceType || 'unknown',
                sourceUrl: resolvedSourceUrl,
                details: saveResponse.error,
                changedFields,
                preview: shouldUpdatePreviewImage || shouldUpdatePreviewByUrl ? 'apply-failed' : 'n/a',
                timestamp: now,
              });
            } else {
              let previewApplyError: string | null = null;
              if (shouldUpdatePreviewByUrl && previewImageUrlCandidate) {
                const previewApplyResponse = await withRetries(() =>
                  swarmClient.setModelPreviewFromMetadataUrl({
                    model: current.name,
                    subtype: modelType,
                    image_url: previewImageUrlCandidate,
                    preview_image_metadata: null,
                  })
                );
                if (previewApplyResponse?.error) {
                  previewApplyError = previewApplyResponse.error;
                }
              }
              if (previewApplyError) {
                saveErrors++;
                if (saveErrorSamples.length < 3) {
                  saveErrorSamples.push(`${current.name}: ${previewApplyError}`);
                }
                updated++;
                previewUnresolved++;
                reportRows.push({
                  model: current.name,
                  result: 'updated',
                  source: resolvedSourceType || sourceType || 'unknown',
                  sourceUrl: resolvedSourceUrl,
                  details: `Preview apply failed: ${previewApplyError}`,
                  changedFields,
                  preview: 'unresolved',
                  timestamp: now,
                });
                continue;
              }
              if (hasMetadataChanges) {
                updated++;
                if (shouldUpdatePreviewImage || shouldUpdatePreviewByUrl) {
                  previewApplied++;
                }
                reportRows.push({
                  model: current.name,
                  result: 'updated',
                  source: resolvedSourceType || sourceType || 'unknown',
                  sourceUrl: resolvedSourceUrl,
                  details: `Updated ${changedFields.join(', ')}`,
                  changedFields,
                  preview: shouldUpdatePreviewImage || shouldUpdatePreviewByUrl ? 'applied' : 'n/a',
                  timestamp: now,
                });
              } else {
                skipped++;
                reportRows.push({
                  model: current.name,
                  result: 'unchanged',
                  source: resolvedSourceType || sourceType || 'unknown',
                  sourceUrl: resolvedSourceUrl,
                  details: 'Recorded sync status only.',
                  changedFields: [],
                  preview: previewMissing ? 'unresolved' : 'existing',
                  timestamp: now,
                });
              }
            }
          } catch (error) {
            console.error('Missing metadata scan failed for model:', current.name, error);
            failed++;
            reportRows.push({
              model: current.name,
              result: 'failed',
              source: 'exception',
              sourceUrl: '',
              details: error instanceof Error ? error.message : 'Unexpected scanner error',
              changedFields: [],
              preview: 'n/a',
              timestamp: Date.now(),
            });
          } finally {
            processed++;
            updateScanStatus();
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(maxConcurrent, total) }, () => worker())
      );
      setScanReportEntries(reportRows);

      const wasCancelled = scanCancelRequestedRef.current;
      if (!scanDryRun && updated > 0) {
        await withRetries(() => swarmClient.triggerModelRefresh());
      }

      if (wasCancelled) {
        setScanMetadataStatus(
          `Scan cancelled. Processed ${processed}/${total}. Updated ${updated}, would-update ${wouldUpdate}, failed ${failed}, skipped ${skipped}. Missing candidates ${missingCandidates}, source misses ${sourceNotFound}, metadata misses ${metadataNotFound}.`
        );
        if (!silent) {
          notifications.show({
            title: 'Metadata Scan Cancelled',
            message: `Processed ${processed}/${total}. Updated ${updated}, failed ${failed}, skipped ${skipped}.`,
            color: 'yellow',
          });
        }
        return;
      }

      const diagnosticsSummary = `missing ${missingCandidates}, civit-url ${sourceFromCivitUrl}, civit-hash ${sourceFromCivitHash}, hf ${sourceFromHuggingFace}, headers ${sourceFromHeaders}, source-miss ${sourceNotFound}, metadata-miss ${metadataNotFound}, unchanged ${noChangesAfterLookup}, save-errors ${saveErrors}, preview(image ${previewFromImage}, video ${previewFromVideo}, unavailable ${previewUnavailable}, existing ${previewAlreadyPresent}, unresolved ${previewUnresolved}, applied ${previewApplied})`;
      if (!silent) {
        notifications.show({
          title: scanDryRun ? 'Metadata Scan Dry Run Complete' : 'Metadata Scan Complete',
          message: `Updated ${updated}. Would-update ${wouldUpdate}. Failed ${failed}. Skipped ${skipped}. ${diagnosticsSummary}`,
          color: failed > 0 ? 'yellow' : 'green',
        });
      }
      if (saveErrorSamples.length > 0) {
        setScanMetadataStatus(
          `Scan finished. ${diagnosticsSummary}. Save errors: ${saveErrorSamples.join(' | ')}`
        );
      } else if (unchangedSamples.length > 0) {
        setScanMetadataStatus(
          `Scan finished. ${diagnosticsSummary}. Unchanged samples: ${unchangedSamples.join(' | ')}`
        );
      } else {
        setScanMetadataStatus(`Scan finished. ${diagnosticsSummary}.`);
      }
    } catch (error) {
      console.error('Missing metadata scan failed:', error);
      if (!silent) {
        notifications.show({
          title: 'Metadata Scan Failed',
          message: 'Could not complete missing metadata scan.',
          color: 'red',
        });
      }
      setScanMetadataStatus('Scan failed. Check browser console/logs for details.');
    } finally {
      scanCancelRequestedRef.current = false;
      setIsScanningMissingMetadata(false);
    }
  };

  useEffect(() => {
    scanRunRef.current = scanMissingMetadata;
  });

  useEffect(() => {
    if (!opened || !scanAutoRunEnabled) {
      return;
    }
    const intervalMs = Math.max(1, scanAutoRunMinutes) * 60 * 1000;
    const handle = window.setInterval(() => {
      if (!scanCancelRequestedRef.current && !isScanningMissingMetadata) {
        void scanRunRef.current?.({ scheduled: true, silent: true });
      }
    }, intervalMs);
    return () => {
      window.clearInterval(handle);
    };
  }, [opened, scanAutoRunEnabled, scanAutoRunMinutes, isScanningMissingMetadata]);

  const applyFolderSelection = (
    nextFolder: string,
    source: 'selector' | 'manual',
    selection?: { root: string; subfolder: string }
  ) => {
    const resolvedFolder = normalizeFolderPath(nextFolder) || '(None)';
    const parts = selection ?? deriveRootAndSubfolder(resolvedFolder);
    // Recognize paths in allFolderPaths, rootFolderSet, or any path whose root is known
    const isKnownFolder =
      allFolderPaths.includes(resolvedFolder) ||
      rootFolderSet.has(resolvedFolder) ||
      (parts.root !== '(None)' && (allFolderPaths.includes(parts.root) || rootFolderSet.has(parts.root)));
    const isManualOverride =
      source === 'manual' && resolvedFolder !== '(None)' && !isKnownFolder;
    setFolder(resolvedFolder);
    setRootFolder(parts.root);
    setSubfolder(parts.subfolder);
    setUseManualFolder(isManualOverride);
    setManualFolderPath(isManualOverride ? resolvedFolder : '');
    setFolderOverrides((prev) => ({ ...prev, [modelType]: resolvedFolder }));
    setIsFolderAutoMapped(false);
  };

  const handleRootFolderChange = (nextRoot: string | null) => {
    const resolvedRoot = nextRoot ?? '(None)';
    const resolvedFolder = composeFolderPath(resolvedRoot, '');
    applyFolderSelection(resolvedFolder, 'selector', { root: resolvedRoot, subfolder: '' });
  };

  const handleSubfolderChange = (nextSubfolder: string | null) => {
    const resolvedSubfolder = normalizeFolderPath(nextSubfolder ?? '');
    if (rootFolder === '(None)' && resolvedSubfolder) {
      // Selecting a top-level subfolder from root should promote that folder to the root selector.
      const [nextRoot, ...rest] = resolvedSubfolder.split('/').filter(Boolean);
      if (nextRoot) {
        const nextNestedSubfolder = rest.join('/');
        const resolvedFolderFromRoot = composeFolderPath(nextRoot, nextNestedSubfolder);
        applyFolderSelection(resolvedFolderFromRoot, 'selector', {
          root: nextRoot,
          subfolder: nextNestedSubfolder,
        });
        return;
      }
    }
    const resolvedFolder = composeFolderPath(rootFolder, resolvedSubfolder);
    applyFolderSelection(resolvedFolder, 'selector', {
      root: rootFolder,
      subfolder: resolvedSubfolder,
    });
  };

  const handleManualFolderChange = (nextFolderPath: string) => {
    setManualFolderPath(nextFolderPath);
    if (!nextFolderPath.trim()) {
      const resolvedFromSelectors = composeFolderPath(rootFolder, subfolder);
      applyFolderSelection(resolvedFromSelectors, 'selector');
      return;
    }
    applyFolderSelection(nextFolderPath, 'manual');
  };

  const resetToAutoFolder = () => {
    setFolderOverrides((prev) => {
      const next = { ...prev };
      delete next[modelType];
      return next;
    });
    folderOverridesRef.current = { ...folderOverridesRef.current };
    delete folderOverridesRef.current[modelType];
    const normalizedFolders = folders.filter((f) => f !== '(None)');
    const mappedFolder = normalizeFolderPath(findAutoMappedFolder(modelType, normalizedFolders)) || '(None)';
    setFolder(mappedFolder);
    setRootFolder(mappedFolder);
    setSubfolder('');
    setManualFolderPath('');
    setUseManualFolder(false);
    setIsFolderAutoMapped(mappedFolder !== '(None)');
  };

  const handleBrowseDestination = async () => {
    try {
      if (isTauri()) {
        const selected = await openTauriDialog({ directory: true, multiple: false });
        if (selected) {
          const pathString = Array.isArray(selected) ? selected[0] : selected;
          const mappedFolder = mapNativePathToKnownFolder(pathString);
          if (mappedFolder) {
            applyFolderSelection(mappedFolder, 'selector', { root: mappedFolder, subfolder: '' });
            return;
          }
          applyFolderSelection(pathString, 'manual');
          notifications.show({
            title: 'Using Manual Path',
            message: `Selected external folder: ${pathString}`,
            color: 'blue',
          });
          return;
        }
        return; // User cancelled
      }
    } catch {
      // isTauri() throws if not in Tauri, so we fall through to Electron check
    }

    const desktopApi = (
      window as Window & { electron?: DesktopFolderAPI; electronAPI?: DesktopFolderAPI }
    ).electron?.selectFolder
      ? (window as Window & { electron?: DesktopFolderAPI }).electron
      : (window as Window & { electronAPI?: DesktopFolderAPI }).electronAPI;
    if (desktopApi?.selectFolder) {
      try {
        const nativeSelection = await desktopApi.selectFolder(folder ?? undefined);
        if (!nativeSelection) {
          return;
        }
        const mappedFolder = mapNativePathToKnownFolder(nativeSelection);
        if (mappedFolder) {
          applyFolderSelection(mappedFolder, 'selector', { root: mappedFolder, subfolder: '' });
          return;
        }
        applyFolderSelection(nativeSelection, 'manual');
        notifications.show({
          title: 'Using Manual Path',
          message: `Selected external folder: ${nativeSelection}`,
          color: 'blue',
        });
        return;
      } catch {
        notifications.show({
          title: 'Browse Failed',
          message: 'Could not open native folder picker. Using in-app browser instead.',
          color: 'yellow',
        });
      }
    }
    setFolderBrowserOpen(true);
  };

  const buildDownloadErrorHint = (error: string): string => {
    if (error === 'Download was cancelled.') {
      return error;
    }
    if (error === 'Model at that save path already exists.' || error === 'Invalid type.') {
      return error;
    }
    return `${error} If this is gated/private content, add CivitAI or Hugging Face API keys in User Settings.`;
  };

  // Start download
  const startDownload = () => {
    if (!canDownload) return;

    const fullName = folder && folder !== '(None)' ? `${folder}/${fileName}` : fileName;
    const downloadId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const normalizedDownloadUrl = url.split('#')[0].toLowerCase();
    const downloadExtension = normalizedDownloadUrl.endsWith('.gguf') ? 'gguf' : 'safetensors';
    const downloadedModelName = `${fullName}.${downloadExtension}`;
    const previewForModel = thumbnailDataUrl;
    const previewUrlForModel = thumbnailUrl;

    const newDownload: ActiveDownload = {
      id: downloadId,
      name: fullName,
      url: url,
      type: modelType,
      thumbnail: thumbnailUrl || undefined,
      progress: 0,
      speed: 0,
      status: 'downloading',
    };

    setActiveDownloads((prev) => [newDownload, ...prev]);

    // Build metadata string
    const resolvedSourceUrl = (() => {
      if (civitaiDetails?.sourceUrl) {
        return civitaiDetails.sourceUrl;
      }
      const parsedCivit = parseCivitAIUrl(url);
      if (parsedCivit.kind === 'model' && parsedCivit.modelId) {
        return parsedCivit.versionId
          ? `${CIVITAI_PREFIX}models/${parsedCivit.modelId}?modelVersionId=${parsedCivit.versionId}`
          : `${CIVITAI_PREFIX}models/${parsedCivit.modelId}`;
      }
      if (parsedCivit.kind === 'download' && parsedCivit.versionId) {
        return `${CIVITAI_PREFIX}api/download/models/${parsedCivit.versionId}`;
      }
      const hfRepo = parseHuggingFaceRepoId(url);
      if (hfRepo) {
        return `${HUGGINGFACE_PREFIX}${hfRepo}`;
      }
      return null;
    })();
    const parsedResolvedCivit = parseCivitAIUrl(resolvedSourceUrl || url);
    const resolvedSourceType =
      parsedResolvedCivit.kind !== 'invalid'
        ? 'civitai'
        : parseHuggingFaceRepoId(resolvedSourceUrl || url)
          ? 'huggingface'
          : null;
    const resolvedSourceModelId =
      parsedResolvedCivit.kind === 'model' && parsedResolvedCivit.modelId
        ? parsedResolvedCivit.modelId
        : null;
    const resolvedSourceVersionId =
      parsedResolvedCivit.versionId || (civitaiDetails?.sourceUrl ? parseCivitAIUrl(civitaiDetails.sourceUrl).versionId : null);
    const resolvedSourceRepo = parseHuggingFaceRepoId(resolvedSourceUrl || url);

    let metadataStr = '';
    if (includeMetadata && metadata) {
      const metadataPayload: Record<string, string> = { ...metadata };
      if (resolvedSourceUrl) {
        metadataPayload['modelspec.description'] = ensureDescriptionHasSourceUrl(
          metadataPayload['modelspec.description'] || '',
          resolvedSourceUrl
        );
        metadataPayload['modelspec.source_url'] = resolvedSourceUrl;
      }
      if (resolvedSourceType) {
        metadataPayload['modelspec.source_type'] = resolvedSourceType;
        metadataPayload['modelspec.source_locked'] = 'true';
      }
      if (resolvedSourceModelId) {
        metadataPayload['modelspec.source_model_id'] = resolvedSourceModelId;
      }
      if (resolvedSourceVersionId) {
        metadataPayload['modelspec.source_version_id'] = resolvedSourceVersionId;
      }
      if (resolvedSourceRepo) {
        metadataPayload['modelspec.source_repo'] = resolvedSourceRepo;
      }
      if (embedThumbnail && thumbnailDataUrl) {
        metadataPayload['modelspec.thumbnail'] = thumbnailDataUrl;
      }
      metadataStr = JSON.stringify(metadataPayload);
    } else if (resolvedSourceUrl) {
      const fallbackMetadataPayload: Record<string, string> = {
        'modelspec.description': ensureDescriptionHasSourceUrl('', resolvedSourceUrl),
        'modelspec.source_url': resolvedSourceUrl,
      };
      if (resolvedSourceType) {
        fallbackMetadataPayload['modelspec.source_type'] = resolvedSourceType;
        fallbackMetadataPayload['modelspec.source_locked'] = 'true';
      }
      if (resolvedSourceModelId) {
        fallbackMetadataPayload['modelspec.source_model_id'] = resolvedSourceModelId;
      }
      if (resolvedSourceVersionId) {
        fallbackMetadataPayload['modelspec.source_version_id'] = resolvedSourceVersionId;
      }
      if (resolvedSourceRepo) {
        fallbackMetadataPayload['modelspec.source_repo'] = resolvedSourceRepo;
      }
      metadataStr = JSON.stringify(fallbackMetadataPayload);
    }

    // Start WebSocket download
    const socket = swarmClient.downloadModel(
      {
        url: url,
        type: modelType,
        name: fullName,
        metadata: metadataStr || undefined,
      },
      {
        onProgress: (data) => {
          const percent = Math.max(
            0,
            Math.min(100, (data.current_percent ?? data.overall_percent ?? 0) * 100)
          );
          setActiveDownloads((prev) =>
            prev.map((d) =>
              d.id === downloadId
                ? {
                  ...d,
                  progress: percent,
                  speed: data.per_second,
                }
                : d
            )
          );
        },
        onSuccess: async () => {
          cancelledDownloadIdsRef.current.delete(downloadId);
          setActiveDownloads((prev) =>
            prev.map((d) => (d.id === downloadId ? { ...d, status: 'success', progress: 100 } : d))
          );
          if (previewForModel || previewUrlForModel) {
            try {
              const describeResponse = await swarmClient.describeModel(downloadedModelName, modelType);
              const modelDetails =
                'model' in describeResponse
                  ? (describeResponse.model as unknown as {
                    title?: string;
                    author?: string;
                    architecture?: string;
                    description?: string;
                    standard_width?: number;
                    standard_height?: number;
                    usage_hint?: string;
                    date?: string;
                    license?: string;
                    trigger_phrase?: string;
                    prediction_type?: string;
                    tags?: string[] | string;
                  })
                  : null;
              const fallbackTitle =
                (metadata?.['modelspec.title'] as string | undefined) || fileName || downloadedModelName;
              const fallbackAuthor = (metadata?.['modelspec.author'] as string | undefined) || '';
              const fallbackDescription = (metadata?.['modelspec.description'] as string | undefined) || '';
              const fallbackUsageHint = (metadata?.['modelspec.usage_hint'] as string | undefined) || '';
              const fallbackDate = (metadata?.['modelspec.date'] as string | undefined) || '';
              const fallbackTrigger = (metadata?.['modelspec.trigger_phrase'] as string | undefined) || '';
              const fallbackTags = (metadata?.['modelspec.tags'] as string | undefined) || '';

              const previewUpdate = await swarmClient.editModelMetadata({
                model: downloadedModelName,
                subtype: modelType,
                title:
                  (typeof modelDetails?.title === 'string' && modelDetails.title) || fallbackTitle,
                author:
                  (typeof modelDetails?.author === 'string' && modelDetails.author) || fallbackAuthor,
                type:
                  (typeof modelDetails?.architecture === 'string' && modelDetails.architecture) || '',
                description:
                  ensureDescriptionHasSourceUrl(
                    (typeof modelDetails?.description === 'string' && modelDetails.description) ||
                    fallbackDescription,
                    resolvedSourceUrl
                  ),
                standard_width:
                  typeof modelDetails?.standard_width === 'number'
                    ? (modelDetails.standard_width as number)
                    : 0,
                standard_height:
                  typeof modelDetails?.standard_height === 'number'
                    ? (modelDetails.standard_height as number)
                    : 0,
                usage_hint:
                  (typeof modelDetails?.usage_hint === 'string' && modelDetails.usage_hint) ||
                  fallbackUsageHint,
                date: (typeof modelDetails?.date === 'string' && modelDetails.date) || fallbackDate,
                license:
                  (typeof modelDetails?.license === 'string' && modelDetails.license) || '',
                trigger_phrase:
                  (typeof modelDetails?.trigger_phrase === 'string' && modelDetails.trigger_phrase) ||
                  fallbackTrigger,
                prediction_type:
                  (typeof modelDetails?.prediction_type === 'string' && modelDetails.prediction_type) ||
                  '',
                tags:
                  (Array.isArray(modelDetails?.tags)
                    ? (modelDetails?.tags as string[]).join(', ')
                    : typeof modelDetails?.tags === 'string'
                      ? (modelDetails.tags as string)
                      : '') || fallbackTags,
                preview_image: previewForModel,
                source_type: resolvedSourceType,
                source_model_id: resolvedSourceModelId,
                source_version_id: resolvedSourceVersionId,
                source_repo: resolvedSourceRepo,
                source_url: resolvedSourceUrl,
                source_locked: !!resolvedSourceType,
                last_metadata_sync_at: Date.now(),
                last_metadata_sync_source: resolvedSourceType || 'download',
                last_metadata_sync_status: 'updated',
                last_metadata_sync_message: 'Metadata/source fields applied after download.',
              });
              if (previewUpdate?.error) {
                notifications.show({
                  title: 'Preview Not Saved',
                  message: previewUpdate.error,
                  color: 'yellow',
                });
              }
              // If no data URI preview was available, always try server-side URL fetch
              // as fallback. This handles CORS failures and race conditions where the
              // browser conversion hadn't completed before download started.
              if (!previewForModel && previewUrlForModel) {
                const previewFromUrl = await swarmClient.setModelPreviewFromMetadataUrl({
                  model: downloadedModelName,
                  subtype: modelType,
                  image_url: previewUrlForModel,
                  preview_image_metadata: null,
                });
                if (previewFromUrl?.error) {
                  notifications.show({
                    title: 'Preview Not Saved',
                    message: `Could not fetch preview image: ${previewFromUrl.error}`,
                    color: 'yellow',
                  });
                }
              }
            } catch {
              notifications.show({
                title: 'Preview Not Saved',
                message: 'Model downloaded, but preview image could not be set automatically.',
                color: 'yellow',
              });
            }
          }
          notifications.show({
            title: 'Download Complete',
            message: `${fullName} has been downloaded successfully`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          swarmClient.triggerModelRefresh();
          onDownloadComplete?.();
        },
        onError: (error) => {
          const wasCancelled =
            cancelledDownloadIdsRef.current.has(downloadId) || error === 'Download was cancelled.';
          cancelledDownloadIdsRef.current.delete(downloadId);
          if (wasCancelled) {
            setActiveDownloads((prev) =>
              prev.map((d) =>
                d.id === downloadId ? { ...d, status: 'cancelled', error: undefined } : d
              )
            );
            return;
          }
          const message = buildDownloadErrorHint(error);
          setActiveDownloads((prev) =>
            prev.map((d) => (d.id === downloadId ? { ...d, status: 'error', error: message } : d))
          );
          notifications.show({
            title: 'Download Failed',
            message,
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
      }
    );

    // Store socket reference for cancellation
    setActiveDownloads((prev) => prev.map((d) => (d.id === downloadId ? { ...d, socket } : d)));

    // Clear form for next download and reset folder to auto-detected root
    setUrl('');
    setFileName('');
    setUrlStatus(null);
    setIsUrlValid(false);
    clearMetadataState();
    // Reset folder overrides so the next download starts from the auto-detected root
    setFolderOverrides((prev) => {
      const next = { ...prev };
      delete next[modelType];
      return next;
    });
    delete folderOverridesRef.current[modelType];
    const normalizedFolders = folders.filter((f) => f !== '(None)');
    const mappedFolder = normalizeFolderPath(findAutoMappedFolder(modelType, normalizedFolders)) || '(None)';
    setFolder(mappedFolder);
    setRootFolder(mappedFolder);
    setSubfolder('');
    setManualFolderPath('');
    setUseManualFolder(false);
    setIsFolderAutoMapped(mappedFolder !== '(None)');
  };

  // Cancel download
  const cancelDownload = (downloadId: string) => {
    const download = activeDownloads.find((d) => d.id === downloadId);
    if (download?.socket) {
      cancelledDownloadIdsRef.current.add(downloadId);
      download.socket.send(JSON.stringify({ signal: 'cancel' }));
      setActiveDownloads((prev) =>
        prev.map((d) => (d.id === downloadId ? { ...d, status: 'cancelled' } : d))
      );
    }
  };

  // Remove download from list
  const removeDownload = (downloadId: string) => {
    cancelledDownloadIdsRef.current.delete(downloadId);
    setActiveDownloads((prev) => prev.filter((d) => d.id !== downloadId));
  };

  // Format speed for display
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={
          <Group gap="xs">
            <IconDownload size={20} />
            <Text fw={600}>Model Downloader</Text>
          </Group>
        }
        size="80%"
        centered
      >
        <Stack gap="md">
          {/* URL Input */}
          <TextInput
            label="Model URL"
            placeholder="Paste CivitAI, HuggingFace, or direct download URL"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            leftSection={<IconLink size={16} />}
            rightSection={
              url && (
                <ActionIcon variant="subtle" onClick={() => handleUrlChange('')} size="sm">
                  <IconX size={14} />
                </ActionIcon>
              )
            }
          />

          {/* URL Status */}
          {urlStatus && (
            <Alert
              color={
                urlStatus.type === 'error'
                  ? 'red'
                  : urlStatus.type === 'warning'
                    ? 'yellow'
                    : urlStatus.type === 'success'
                      ? 'green'
                      : 'blue'
              }
              variant="light"
              py="xs"
            >
              {urlStatus.message}
            </Alert>
          )}

          {/* Thumbnail Preview */}
          {thumbnailUrl && (
            <Card withBorder p="xs">
              <Group gap="md" align="flex-start">
                <Image
                  src={thumbnailUrl}
                  w={120}
                  h={120}
                  fit="cover"
                  radius="sm"
                  fallbackSrc="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>"
                />
                {metadata && (
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Text size="sm" fw={600}>
                      {metadata['modelspec.title']}
                    </Text>
                    {metadata['modelspec.author'] && (
                      <Text size="xs" c="dimmed">
                        By {metadata['modelspec.author']}
                      </Text>
                    )}
                    {metadata['modelspec.trigger_phrase'] && (
                      <Text size="xs" lineClamp={2}>
                        <strong>Trigger:</strong> {metadata['modelspec.trigger_phrase']}
                      </Text>
                    )}
                    {isConvertingThumbnail && (
                      <Group gap={6}>
                        <Loader size="xs" />
                        <Text size="xs" c="dimmed">
                          Converting preview image for metadata...
                        </Text>
                      </Group>
                    )}
                  </Stack>
                )}
              </Group>
              {availableImages.length > 1 && (
                <Stack gap={6} mt="sm">
                  <Text size="xs" c="dimmed">
                    Select preview image to embed in metadata
                  </Text>
                  <ScrollArea type="auto">
                    <Group gap="xs" wrap="nowrap">
                      {availableImages.map((img, index) => (
                        <Box
                          key={`${img}-${index}`}
                          component="button"
                          type="button"
                          onClick={() => {
                            setSelectedImageIndex(index);
                            setThumbnailUrl(img);
                          }}
                          style={{
                            border:
                              index === selectedImageIndex
                                ? '2px solid var(--mantine-color-blue-5)'
                                : '1px solid var(--mantine-color-gray-4)',
                            borderRadius: 8,
                            padding: 2,
                            background: 'transparent',
                            cursor: 'pointer',
                            lineHeight: 0,
                          }}
                        >
                          <Image
                            src={img}
                            w={58}
                            h={58}
                            fit="cover"
                            radius="sm"
                            fallbackSrc="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>"
                          />
                        </Box>
                      ))}
                    </Group>
                  </ScrollArea>
                </Stack>
              )}
            </Card>
          )}

          {/* CivitAI metadata options */}
          {civitaiDetails && (
            <Card withBorder p="xs">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={600}>
                    CivitAI Metadata
                  </Text>
                  <Anchor href={civitaiDetails.sourceUrl} target="_blank" rel="noreferrer">
                    Open source page
                  </Anchor>
                </Group>
                <Text size="xs" c="dimmed">
                  {civitaiDetails.modelName} - {civitaiDetails.versionName}
                  {civitaiDetails.baseModel ? ` (${civitaiDetails.baseModel})` : ''}
                </Text>
                {civitaiDetails.createdAt && (
                  <Text size="xs" c="dimmed">
                    Published: {new Date(civitaiDetails.createdAt).toLocaleString()}
                  </Text>
                )}
                <Checkbox
                  label="Include CivitAI metadata in downloaded model info"
                  checked={includeMetadata}
                  onChange={(event) => setIncludeMetadata(event.currentTarget.checked)}
                />
                <Checkbox
                  label="Embed selected preview image in metadata"
                  checked={embedThumbnail}
                  disabled={!includeMetadata || !thumbnailUrl}
                  onChange={(event) => setEmbedThumbnail(event.currentTarget.checked)}
                />
                {includeMetadata &&
                  embedThumbnail &&
                  thumbnailUrl &&
                  !isConvertingThumbnail &&
                  !thumbnailDataUrl && (
                    <Text size="xs" c="yellow">
                      Preview image conversion failed. Download will continue without embedded
                      thumbnail metadata.
                    </Text>
                  )}
              </Stack>
            </Card>
          )}

          {/* Model Type & Folder */}
          <Group grow align="flex-start">
            <Select
              label="Model Type"
              data={MODEL_TYPES}
              value={modelType}
              onChange={(val) => val && setModelType(val)}
              leftSection={<IconFile size={16} />}
              disabled={isScanningMissingMetadata}
            />
            <Stack gap={6} style={{ flex: 1 }}>
              <Group grow align="flex-start">
                <Select
                  label="Base Folder"
                  data={rootFolderOptions}
                  value={rootFolder}
                  onChange={handleRootFolderChange}
                  leftSection={<IconFolderOpen size={16} />}
                  searchable
                />
                <Select
                  label="Subfolder"
                  data={subfolderOptions}
                  value={subfolder}
                  onChange={handleSubfolderChange}
                  searchable
                  disabled={useManualFolder}
                />
              </Group>
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Manual Destination Override"
                  placeholder="Optional: custom/subfolder/path"
                  value={manualFolderPath}
                  onChange={(event) => handleManualFolderChange(event.currentTarget.value)}
                  description="Use for exact placement when needed; clear to use base/subfolder selection."
                  style={{ flex: 1 }}
                />
                <Button
                  variant="light"
                  leftSection={<IconFolderOpen size={16} />}
                  onClick={() => void handleBrowseDestination()}
                >
                  Browse
                </Button>
              </Group>
              <Group gap="xs" align="center">
                {isFolderAutoMapped ? (
                  <Badge color="blue" variant="light" size="sm" leftSection={<IconCheck size={12} />}>
                    Auto-mapped
                  </Badge>
                ) : useManualFolder ? (
                  <Badge color="orange" variant="light" size="sm" leftSection={<IconFolderOpen size={12} />}>
                    Manual Override
                  </Badge>
                ) : (
                  <Badge color="gray" variant="light" size="sm" leftSection={<IconFolder size={12} />}>
                    User Selected
                  </Badge>
                )}
                <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                  Destination: {resolvedTargetFolderLabel}
                </Text>
                {!isFolderAutoMapped && (
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    leftSection={<IconArrowBackUp size={14} />}
                    onClick={resetToAutoFolder}
                  >
                    Reset to Auto
                  </Button>
                )}
              </Group>
            </Stack>
          </Group>

          <Card withBorder p="sm">
            <UnstyledButton
              onClick={() => setMetadataScannerCollapsed((prev) => !prev)}
              style={{ width: '100%' }}
            >
              <Group justify="space-between" align="center">
                <Group gap="xs" align="center">
                  <IconChevronRight
                    size={16}
                    style={{
                      transform: metadataScannerCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                      transition: 'transform 200ms ease',
                    }}
                  />
                  <Text fw={600}>Missing Metadata Scanner</Text>
                </Group>
                <Badge
                  color={isScanningMissingMetadata ? 'blue' : 'gray'}
                  variant="light"
                  leftSection={isScanningMissingMetadata ? <Loader size={10} /> : <IconCheck size={10} />}
                >
                  {isScanningMissingMetadata ? 'Scanning' : 'Idle'}
                </Badge>
              </Group>
            </UnstyledButton>
            <Collapse in={!metadataScannerCollapsed}>
              <Stack gap="xs" mt="xs">
                <Text size="xs" c="dimmed">
                  Scans {modelType} models and fills missing metadata from CivitAI/HuggingFace with source locking and sync diagnostics.
                </Text>
                <Group grow align="flex-start">
                  <Select
                    label="Scan Scope"
                    data={METADATA_SCAN_SCOPES}
                    value={scanScope}
                    onChange={(value) => setScanScope((value as MetadataScanScope) || 'all')}
                    disabled={isScanningMissingMetadata}
                  />
                  <Select
                    label="Scan Mode"
                    data={METADATA_SCAN_MODES}
                    value={scanMode}
                    onChange={(value) => setScanMode((value as MetadataScanMode) || 'missing-only')}
                    disabled={isScanningMissingMetadata}
                  />
                </Group>
                <Group grow align="flex-start">
                  <Select
                    label="Concurrency"
                    data={SCAN_CONCURRENCY_OPTIONS.map((value) => ({ value, label: value }))}
                    value={String(scanConcurrency)}
                    onChange={(value) => setScanConcurrency(Number(value || 4))}
                    disabled={isScanningMissingMetadata}
                  />
                  <Select
                    label="Retries"
                    data={SCAN_RETRY_OPTIONS.map((value) => ({ value, label: value }))}
                    value={String(scanRetries)}
                    onChange={(value) => setScanRetries(Number(value || 2))}
                    disabled={isScanningMissingMetadata}
                  />
                  <Select
                    label="Backoff (ms)"
                    data={SCAN_BACKOFF_OPTIONS.map((value) => ({ value, label: value }))}
                    value={String(scanRetryDelayMs)}
                    onChange={(value) => setScanRetryDelayMs(Number(value || 500))}
                    disabled={isScanningMissingMetadata}
                  />
                </Group>
                <Group grow align="flex-start">
                  <Checkbox
                    label="Dry Run (no writes)"
                    checked={scanDryRun}
                    onChange={(event) => setScanDryRun(event.currentTarget.checked)}
                    disabled={isScanningMissingMetadata}
                  />
                  <Checkbox
                    label="Use Header/Sidecar Source Hints"
                    checked={scanIncludeHeaderSourcePass}
                    onChange={(event) => setScanIncludeHeaderSourcePass(event.currentTarget.checked)}
                    disabled={isScanningMissingMetadata}
                  />
                </Group>
                <Group grow align="flex-start">
                  <Checkbox
                    label="Record Sync State on Unchanged"
                    checked={scanRecordSyncOnUnchanged}
                    onChange={(event) => setScanRecordSyncOnUnchanged(event.currentTarget.checked)}
                    disabled={isScanningMissingMetadata || scanDryRun}
                  />
                  <Checkbox
                    label="Background Scheduled Scan"
                    checked={scanAutoRunEnabled}
                    onChange={(event) => setScanAutoRunEnabled(event.currentTarget.checked)}
                    disabled={isScanningMissingMetadata}
                  />
                </Group>
                {scanAutoRunEnabled && (
                  <TextInput
                    label="Schedule Interval (minutes)"
                    value={String(scanAutoRunMinutes)}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.currentTarget.value || '15', 10);
                      setScanAutoRunMinutes(Number.isFinite(parsed) && parsed > 0 ? parsed : 15);
                    }}
                    disabled={isScanningMissingMetadata}
                  />
                )}
                <Text size="xs" c="dimmed">
                  Base folder: {rootFolder === '(None)' ? `${modelType} root` : rootFolder}
                </Text>
                <Text size="xs" c="dimmed">
                  Exact path: {composeFolderPath(rootFolder, subfolder) === '(None)'
                    ? `${modelType} root`
                    : composeFolderPath(rootFolder, subfolder)}
                </Text>
                <Group gap="xs" align="center">
                  <Button
                    variant="light"
                    leftSection={<IconSearch size={16} />}
                    onClick={() => void scanMissingMetadata()}
                    loading={isScanningMissingMetadata}
                    disabled={isLoadingMetadata}
                  >
                    Scan Missing Metadata
                  </Button>
                  <Button
                    variant="subtle"
                    color="red"
                    leftSection={<IconX size={16} />}
                    onClick={cancelMissingMetadataScan}
                    disabled={!isScanningMissingMetadata}
                  >
                    Cancel Scan
                  </Button>
                  <Text size="xs" c="dimmed">
                    Uses your CivitAI API key if configured in User Settings.
                  </Text>
                </Group>
                <Group gap="xs" align="center">
                  <Button
                    variant="subtle"
                    leftSection={<IconDownload size={16} />}
                    onClick={exportScanReportJson}
                    disabled={scanReportEntries.length === 0}
                  >
                    Export JSON
                  </Button>
                  <Button
                    variant="subtle"
                    leftSection={<IconDownload size={16} />}
                    onClick={exportScanReportCsv}
                    disabled={scanReportEntries.length === 0}
                  >
                    Export CSV
                  </Button>
                  <Text size="xs" c="dimmed">
                    Report rows: {scanReportEntries.length}
                  </Text>
                </Group>
                {scanMetadataStats.total > 0 && (
                  <Text size="xs" c="dimmed">
                    Total {scanMetadataStats.total}, processed {scanMetadataStats.processed}, updated{' '}
                    {scanMetadataStats.updated}, would-update {scanMetadataStats.wouldUpdate}, failed{' '}
                    {scanMetadataStats.failed}, skipped {scanMetadataStats.skipped}
                  </Text>
                )}
                {scanMetadataStatus && (
                  <Text size="xs" c="dimmed">
                    {scanMetadataStatus}
                  </Text>
                )}
              </Stack>
            </Collapse>
          </Card>

          {/* File Name */}
          <TextInput
            label="File Name"
            placeholder="Model name (without .safetensors)"
            value={fileName}
            onChange={(e) => setFileName(e.target.value.replace(/ /g, '_'))}
            description="Spaces will be replaced with underscores"
          />

          {/* Download Button */}
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={startDownload}
            disabled={!canDownload}
            loading={isLoadingMetadata}
            fullWidth
          >
            Download Model
          </Button>

          {/* Active Downloads */}
          {activeDownloads.length > 0 && (
            <>
              <Divider label="Active Downloads" labelPosition="center" />
              <ScrollArea.Autosize mah={300}>
                <Stack gap="sm">
                  {activeDownloads.map((download) => (
                    <Card key={download.id} withBorder p="sm">
                      <Group gap="sm" mb="xs">
                        {download.thumbnail && (
                          <Image src={download.thumbnail} w={40} h={40} fit="cover" radius="sm" />
                        )}
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" fw={500} truncate>
                              {download.name}
                            </Text>
                            <Badge
                              size="xs"
                              color={
                                download.status === 'success'
                                  ? 'green'
                                  : download.status === 'error'
                                    ? 'red'
                                    : download.status === 'cancelled'
                                      ? 'yellow'
                                      : 'blue'
                              }
                            >
                              {download.status}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed">
                            [{download.type}]
                          </Text>
                        </Box>

                        {download.status === 'downloading' && (
                          <Tooltip label="Cancel">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => cancelDownload(download.id)}
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}

                        {download.status !== 'downloading' && (
                          <Tooltip label="Remove">
                            <ActionIcon variant="subtle" onClick={() => removeDownload(download.id)}>
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>

                      {download.status === 'downloading' && (
                        <>
                          <Progress value={download.progress} size="sm" mb={4} />
                          <Text size="xs" c="dimmed">
                            {download.progress.toFixed(1)}% | {formatSpeed(download.speed)}
                          </Text>
                        </>
                      )}

                      {download.status === 'error' && download.error && (
                        <Alert color="red" variant="light" py={4} mt="xs">
                          <Text size="xs">{download.error}</Text>
                        </Alert>
                      )}
                    </Card>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </>
          )}
        </Stack>
      </Modal>
      <Modal
        opened={folderBrowserOpen}
        onClose={() => setFolderBrowserOpen(false)}
        title={
          <Group gap="xs">
            <IconFolderOpen size={20} />
            <Text fw={600}>Select Destination Folder</Text>
          </Group>
        }
        size="md"
        centered
      >
        <Stack gap="sm">
          <TextInput
            placeholder="Search folders..."
            leftSection={<IconSearch size={16} />}
            value={folderBrowserSearch}
            onChange={(event) => setFolderBrowserSearch(event.currentTarget.value)}
            rightSection={
              folderBrowserSearch && (
                <ActionIcon variant="subtle" size="sm" onClick={() => setFolderBrowserSearch('')}>
                  <IconX size={14} />
                </ActionIcon>
              )
            }
          />
          {folder && folder !== '(None)' && (
            <Group gap="xs">
              <IconFolder size={14} color="var(--mantine-color-blue-5)" />
              <Text size="xs" c="blue" fw={500}>
                Currently selected: {folder}
              </Text>
            </Group>
          )}
          <Group>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconArrowBackUp size={14} />}
              onClick={() => {
                applyFolderSelection('(None)', 'selector');
                setFolderBrowserOpen(false);
              }}
            >
              Use Root / Default
            </Button>
            {folderBrowserSearch && (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => {
                  const tree = filterTree(buildFolderTree(allBrowsablePaths), folderBrowserSearch);
                  setExpandedTreeNodes((prev) => {
                    const next = new Set(prev);
                    for (const p of collectAllPaths(tree)) {
                      next.add(p);
                    }
                    return next;
                  });
                }}
              >
                Expand All Matches
              </Button>
            )}
          </Group>
          <Divider />
          <ScrollArea.Autosize mah={400}>
            {(() => {
              const tree = buildFolderTree(allBrowsablePaths);
              const displayTree = folderBrowserSearch
                ? filterTree(tree, folderBrowserSearch)
                : tree;

              if (displayTree.length === 0) {
                return (
                  <Text size="sm" c="dimmed" py="md" ta="center">
                    No matching folders found. You can still type a manual override path.
                  </Text>
                );
              }

              const renderTreeNode = (node: FolderTreeNode, depth: number = 0): React.ReactNode => {
                const hasChildren = node.children.length > 0;
                const isExpanded = expandedTreeNodes.has(node.fullPath);
                const isSelected = folder === node.fullPath;

                return (
                  <Box key={node.fullPath}>
                    <UnstyledButton
                      onClick={() => {
                        applyFolderSelection(node.fullPath, 'selector', {
                          root: node.fullPath,
                          subfolder: '',
                        });
                        setFolderBrowserOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                        paddingLeft: depth * 20 + 8,
                        paddingRight: 8,
                        paddingTop: 6,
                        paddingBottom: 6,
                        borderRadius: 4,
                        backgroundColor: isSelected
                          ? 'var(--mantine-color-blue-light)'
                          : undefined,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor =
                            'var(--mantine-color-gray-light-hover)';
                        }
                      }}
                      onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = '';
                        }
                      }}
                    >
                      {hasChildren ? (
                        <ActionIcon
                          variant="subtle"
                          size="xs"
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            setExpandedTreeNodes((prev) => {
                              const next = new Set(prev);
                              if (next.has(node.fullPath)) {
                                next.delete(node.fullPath);
                              } else {
                                next.add(node.fullPath);
                              }
                              return next;
                            });
                          }}
                        >
                          {isExpanded ? (
                            <IconChevronDown size={14} />
                          ) : (
                            <IconChevronRight size={14} />
                          )}
                        </ActionIcon>
                      ) : (
                        <Box style={{ width: 22 }} />
                      )}
                      <IconFolder
                        size={16}
                        color={
                          isSelected
                            ? 'var(--mantine-color-blue-5)'
                            : 'var(--mantine-color-yellow-6)'
                        }
                      />
                      <Text
                        size="sm"
                        fw={isSelected ? 600 : 400}
                        c={isSelected ? 'blue' : undefined}
                        style={{ flex: 1 }}
                      >
                        {node.name}
                      </Text>
                      {isSelected && <IconCheck size={14} color="var(--mantine-color-blue-5)" />}
                    </UnstyledButton>
                    {hasChildren && isExpanded && (
                      <Box>
                        {node.children.map((child) =>
                          renderTreeNode(child, depth + 1)
                        )}
                      </Box>
                    )}
                  </Box>
                );
              };

              return (
                <Stack gap={2}>
                  {displayTree.map((node) => renderTreeNode(node, 0))}
                </Stack>
              );
            })()}
          </ScrollArea.Autosize>
        </Stack>
      </Modal>
    </>
  );
}
