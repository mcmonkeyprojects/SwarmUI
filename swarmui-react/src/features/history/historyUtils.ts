import type { HistoryImageItem, HistoryMediaType } from '../../api/types';
import { resolveAssetUrl } from '../../config/runtimeEndpoints';
import { extractRelativePath, toImageUrl } from '../../utils/imageUtils';

export const HISTORY_PAGE_SIZE = 96;
export const HISTORY_PREFERENCES_KEY = 'swarmui-history-preferences-v2';

export interface HistoryPreferences {
    viewMode: 'gallery' | 'folders';
    sortBy: 'Date' | 'Name';
    sortReverse: boolean;
    starredOnly: boolean;
    mediaType: HistoryMediaType;
    currentFolderOnly: boolean;
}

export interface HistoryMetadataSummary {
    prompt: string | null;
    model: string | null;
    seed: string | null;
    resolution: string | null;
    metadataObject: Record<string, unknown> | null;
    metadataText: string;
}

export interface HistoryUpscalePreviewInfo {
    scale: number;
    method: string | null;
    sourceResolution: string | null;
    outputResolution: string | null;
    badgeLabel: string;
}

export const DEFAULT_HISTORY_PREFERENCES: HistoryPreferences = {
    viewMode: 'gallery',
    sortBy: 'Date',
    sortReverse: false,
    starredOnly: false,
    mediaType: 'all',
    currentFolderOnly: false,
};

export function cleanHistoryFolderPath(path: string | null | undefined): string {
    return (path || '')
        .replace(/\\/g, '/')
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
        .join('/');
}

export function isReservedHistoryFolderPath(path: string | null | undefined): boolean {
    const clean = cleanHistoryFolderPath(path);
    return clean.startsWith('_') || clean === 'Starred' || clean.startsWith('Starred/');
}

export function readHistoryPreferences(): HistoryPreferences {
    if (typeof window === 'undefined') {
        return DEFAULT_HISTORY_PREFERENCES;
    }

    try {
        const rawValue = window.localStorage.getItem(HISTORY_PREFERENCES_KEY);
        if (!rawValue) {
            return DEFAULT_HISTORY_PREFERENCES;
        }

        const parsed = JSON.parse(rawValue) as Partial<HistoryPreferences>;
        return {
            ...DEFAULT_HISTORY_PREFERENCES,
            ...parsed,
        };
    } catch {
        return DEFAULT_HISTORY_PREFERENCES;
    }
}

export function writeHistoryPreferences(preferences: HistoryPreferences): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(HISTORY_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function resolveHistoryItems(items: HistoryImageItem[]): HistoryImageItem[] {
    return items.map((item) => {
        const src = toImageUrl(item.src);
        const previewPath = item.preview_src || item.src;
        const preview_src = previewPath.startsWith('/View/')
            || previewPath.startsWith('/imgs/')
            || previewPath.startsWith('http://')
            || previewPath.startsWith('https://')
            || previewPath.startsWith('data:')
            || previewPath.startsWith('blob:')
            ? resolveAssetUrl(previewPath)
            : toImageUrl(previewPath);

        return {
            ...item,
            src,
            preview_src,
            media_type: item.media_type || 'image',
        };
    });
}

export function mergeHistoryItems(existing: HistoryImageItem[], incoming: HistoryImageItem[]): HistoryImageItem[] {
    const merged = new Map<string, HistoryImageItem>();

    for (const item of existing) {
        merged.set(getHistorySelectionId(item), item);
    }

    for (const item of incoming) {
        merged.set(getHistorySelectionId(item), item);
    }

    return Array.from(merged.values());
}

export function getHistorySelectionId(item: Pick<HistoryImageItem, 'canonical_src' | 'src'>): string {
    return item.canonical_src || item.src;
}

export function getHistoryRelativePath(item: Pick<HistoryImageItem, 'src'>): string {
    return extractRelativePath(item.src);
}

export function getHistoryFilename(item: Pick<HistoryImageItem, 'src'>): string {
    const relativePath = getHistoryRelativePath(item);
    return relativePath.split('/').filter(Boolean).pop() || 'history-item';
}

export function parseHistoryMetadata(metadata: string | Record<string, unknown> | null): Record<string, unknown> | null {
    if (!metadata) {
        return null;
    }

    if (typeof metadata === 'object') {
        return metadata;
    }

    const trimmed = metadata.trim();
    if (!trimmed.startsWith('{')) {
        return null;
    }

    try {
        return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
        return null;
    }
}

export function getHistoryMetadataSummary(item: {
    metadata: string | Record<string, unknown> | null;
    prompt_preview?: string | null;
    model?: string | null;
    seed?: number | null;
    width?: number | null;
    height?: number | null;
}): HistoryMetadataSummary {
    const metadataObject = parseHistoryMetadata(item.metadata);
    const params = asRecord(metadataObject?.sui_image_params)
        || asRecord(metadataObject?.swarm)
        || metadataObject;

    const prompt = firstString(
        item.prompt_preview,
        readString(params, 'prompt'),
        readString(metadataObject, 'prompt')
    );

    const model = firstString(
        item.model,
        readString(params, 'model'),
        readString(metadataObject, 'model'),
        readString(metadataObject, 'Model')
    );

    const seed = firstString(
        normalizeValue(item.seed),
        normalizeValue(readValue(params, 'seed')),
        normalizeValue(readValue(metadataObject, 'seed'))
    );

    const width = firstString(
        normalizeValue(item.width),
        normalizeValue(readValue(params, 'width')),
        normalizeValue(readValue(metadataObject, 'width'))
    );

    const height = firstString(
        normalizeValue(item.height),
        normalizeValue(readValue(params, 'height')),
        normalizeValue(readValue(metadataObject, 'height'))
    );

    return {
        prompt,
        model,
        seed,
        resolution: width && height ? `${width}x${height}` : null,
        metadataObject,
        metadataText: typeof item.metadata === 'string'
            ? item.metadata
            : item.metadata
                ? JSON.stringify(item.metadata, null, 2)
                : '',
    };
}

export function getHistoryUpscalePreviewInfo(item: {
    metadata: string | Record<string, unknown> | null;
    width?: number | null;
    height?: number | null;
}): HistoryUpscalePreviewInfo | null {
    const metadataObject = parseHistoryMetadata(item.metadata);
    const params = asRecord(metadataObject?.sui_image_params)
        || asRecord(metadataObject?.swarm)
        || metadataObject;

    const scale = readNumber(params, 'refinerupscale') ?? readNumber(metadataObject, 'refinerupscale');
    if (!scale || scale <= 1) {
        return null;
    }

    const method = firstString(
        readString(params, 'refinerupscalemethod'),
        readString(metadataObject, 'refinerupscalemethod')
    );
    const width = readNumber(params, 'width') ?? readNumber(metadataObject, 'width') ?? normalizeNumber(item.width);
    const height = readNumber(params, 'height') ?? readNumber(metadataObject, 'height') ?? normalizeNumber(item.height);
    const outputWidth = width ? Math.round(width * scale) : null;
    const outputHeight = height ? Math.round(height * scale) : null;
    const outputResolution = outputWidth && outputHeight ? `${outputWidth}x${outputHeight}` : null;
    const sourceResolution = width && height ? `${width}x${height}` : null;
    const scaleLabel = formatScaleLabel(scale);

    return {
        scale,
        method,
        sourceResolution,
        outputResolution,
        badgeLabel: outputResolution ? `Upscaled ${outputResolution}` : `Upscaled ${scaleLabel}`,
    };
}

export function isImageMedia(item: { media_type?: HistoryMediaType | null }): boolean {
    return (item.media_type || 'image') === 'image';
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readString(source: Record<string, unknown> | null | undefined, key: string): string | null {
    const value = readValue(source, key);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(source: Record<string, unknown> | null | undefined, key: string): number | null {
    return normalizeNumber(readValue(source, key));
}

function readValue(source: Record<string, unknown> | null | undefined, key: string): unknown {
    if (!source) {
        return null;
    }
    return source[key];
}

function normalizeNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function normalizeValue(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    return String(value);
}

function firstString(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return null;
}

function formatScaleLabel(scale: number): string {
    if (Number.isInteger(scale)) {
        return `${scale}x`;
    }
    return `${Number(scale.toFixed(2))}x`;
}
