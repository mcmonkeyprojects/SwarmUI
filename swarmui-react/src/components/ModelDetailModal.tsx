import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Stack,
    Group,
    Text,
    TextInput,
    Textarea,
    Loader,
    Center,
    Box,
    Modal,
    Collapse,
    Badge,
    FileButton,
    Alert,
    SimpleGrid,
    Tabs,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronUp, IconCopy, IconExternalLink, IconMaximize, IconPhoto, IconRefresh, IconTrash } from '@tabler/icons-react';
import { swarmClient } from '../api/client';
import type { ModelDescription } from '../api/types';
import { LazyImage } from './LazyImage';
import { ControlTray, SwarmButton, SwarmBadge, SwarmSliderField } from './ui';
import {
    type RemotePreviewCandidate,
    type RemoteModelPreviewCacheEntry,
    loadRemoteModelPreviewCache,
    refreshRemoteModelPreviewCache,
    resolveRemoteSourceForModel,
    saveRemoteModelPreviewCache,
    type ResolvedRemoteModelSource,
} from '../lib/remoteModelPreviewCache';

interface ModelDetailModalProps {
    opened: boolean;
    onClose: () => void;
    modelName: string;
    subtype?: string;
    onModelChanged?: () => void;
    onAddTriggerToPrompt?: (trigger: string) => void;
    extraTriggerKeywords?: string[];
}

function buildSourceUrl(source: ResolvedRemoteModelSource | null, currentModel: ModelDescription | null): string | null {
    const rawSourceUrl = (source?.sourceUrl || currentModel?.source_url || '').trim();
    if (rawSourceUrl) {
        return rawSourceUrl;
    }
    const sourceType = source?.sourceType || currentModel?.source_type || null;
    const modelId = source?.sourceModelId || currentModel?.source_model_id || null;
    const versionId = source?.sourceVersionId || currentModel?.source_version_id || null;
    const repo = source?.sourceRepo || currentModel?.source_repo || null;

    if (sourceType === 'civitai' && modelId) {
        return versionId
            ? `https://civitai.com/models/${modelId}?modelVersionId=${versionId}`
            : `https://civitai.com/models/${modelId}`;
    }
    if (sourceType === 'huggingface' && repo) {
        return `https://huggingface.co/${repo}`;
    }
    return null;
}

export function ModelDetailModal({
    opened,
    onClose,
    modelName,
    subtype = 'Stable-Diffusion',
    onModelChanged,
    onAddTriggerToPrompt,
    extraTriggerKeywords = [],
}: ModelDetailModalProps) {
    const lastAutoLoadKeyRef = useRef<string | null>(null);
    const missingPreviewProxyRouteRef = useRef(false);
    const [model, setModel] = useState<ModelDescription | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    // Editable fields
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [description, setDescription] = useState('');
    const [triggerPhrase, setTriggerPhrase] = useState('');
    const [tags, setTags] = useState('');
    const [standardWidth, setStandardWidth] = useState<number>(512);
    const [standardHeight, setStandardHeight] = useState<number>(512);
    const [usageHint, setUsageHint] = useState('');
    const [license, setLicense] = useState('');
    const [previewImageData, setPreviewImageData] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [savingPreview, setSavingPreview] = useState(false);
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
    const [showPreviewDiagnostics, setShowPreviewDiagnostics] = useState(false);
    const [activeDetailTab, setActiveDetailTab] = useState<string | null>('overview');
    const [previewLightboxOpen, setPreviewLightboxOpen] = useState(false);
    const [civitaiPreviewCandidates, setCivitaiPreviewCandidates] = useState<RemotePreviewCandidate[]>([]);
    const [selectedCivitaiImageIndex, setSelectedCivitaiImageIndex] = useState<number>(-1);
    const [loadingCivitaiImages, setLoadingCivitaiImages] = useState(false);
    const [hydratingRemotePreviews, setHydratingRemotePreviews] = useState(false);
    const [convertingCivitaiImage, setConvertingCivitaiImage] = useState(false);
    const [civitaiImageError, setCivitaiImageError] = useState<string | null>(null);
    const [selectedCivitaiImageUrl, setSelectedCivitaiImageUrl] = useState<string | null>(null);
    const [resolvedRemoteSource, setResolvedRemoteSource] = useState<ResolvedRemoteModelSource | null>(null);
    const [remotePreviewStatus, setRemotePreviewStatus] = useState<string | null>(null);
    const [remotePreviewDebugLog, setRemotePreviewDebugLog] = useState<string[]>([]);

    const copySourceUrl = useCallback(async () => {
        const sourceUrl = buildSourceUrl(resolvedRemoteSource, model);
        if (!sourceUrl) {
            notifications.show({
                title: 'No Source URL',
                message: 'No source URL metadata is available for this item.',
                color: 'yellow',
            });
            return;
        }

        try {
            await navigator.clipboard.writeText(sourceUrl);
            notifications.show({
                title: 'Copied',
                message: 'Source URL copied to clipboard.',
                color: 'green',
            });
        } catch {
            notifications.show({
                title: 'Copy Failed',
                message: 'Could not copy the source URL.',
                color: 'red',
            });
        }
    }, [model, resolvedRemoteSource]);

    const copyText = useCallback(async (text: string, label: string) => {
        if (!text.trim()) {
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            notifications.show({
                title: 'Copied',
                message: `${label} copied to clipboard.`,
                color: 'green',
            });
        } catch {
            notifications.show({
                title: 'Copy Failed',
                message: `Could not copy ${label.toLowerCase()}.`,
                color: 'red',
            });
        }
    }, []);

    const sanitizeDescription = (input: string): string => {
        if (!input) return '';
        const withParagraphBreaks = input
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<(br|hr)\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|section|article|header|footer|blockquote|h[1-6]|ul|ol|li|table|tr)>/gi, '\n\n')
            .replace(/<(p|div|section|article|header|footer|blockquote|h[1-6]|ul|ol|li|table|tr)[^>]*>/gi, '\n')
            .replace(/<\/?[^>]+(>|$)/g, ' ');
        return withParagraphBreaks
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/[ \t\f\v]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    };

    const extractTriggerKeywords = (input: string): string[] => {
        if (!input) return [];
        return input
            .split(/[,\n;]+/)
            .map((word) => word.trim())
            .filter((word) => word.length > 1);
    };

    const isUnknownApiRouteError = useCallback((value: string | null | undefined): boolean => {
        return (value || '').toLowerCase().includes('unknown api route');
    }, []);

    const appendRemotePreviewLog = useCallback((level: 'debug' | 'warn' | 'error', message: string) => {
        const stamp = new Date().toLocaleTimeString();
        const line = `${stamp} [${level}] ${message}`;
        if (level === 'error') {
            console.error('[RemotePreview]', message);
        } else if (level === 'warn') {
            console.warn('[RemotePreview]', message);
        } else {
            console.debug('[RemotePreview]', message);
        }
        setRemotePreviewDebugLog((current) => [...current.slice(-11), line]);
    }, []);

    const withTimeout = useCallback(async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T | null> => {
        return await new Promise<T | null>((resolve) => {
            let settled = false;
            const timeout = window.setTimeout(() => {
                if (!settled) {
                    settled = true;
                    appendRemotePreviewLog('warn', `${label} timed out after ${timeoutMs}ms`);
                    resolve(null);
                }
            }, timeoutMs);
            promise
                .then((result) => {
                    if (!settled) {
                        settled = true;
                        window.clearTimeout(timeout);
                        resolve(result);
                    }
                })
                .catch(() => {
                    if (!settled) {
                        settled = true;
                        window.clearTimeout(timeout);
                        resolve(null);
                    }
                });
        });
    }, [appendRemotePreviewLog]);

    const convertImageUrlToDataUrl = useCallback(async (imageUrl: string): Promise<string | null> => {
        appendRemotePreviewLog('debug', `Starting image hydration for ${imageUrl}`);
        // Prefer backend proxy first (works in desktop/CSP environments and avoids CORS quirks).
        const proxied = await withTimeout(
            swarmClient.forwardMetadataImageRequestDetailed(imageUrl),
            15000,
            `Backend image proxy for ${imageUrl}`
        );
        if (proxied?.image && proxied.image.startsWith('data:image/')) {
            appendRemotePreviewLog('debug', `Backend image proxy succeeded for ${imageUrl}`);
            return proxied.image;
        }
        appendRemotePreviewLog('warn', `Backend image proxy failed for ${imageUrl}: ${proxied?.error ?? 'unknown error'}`);
        if (isUnknownApiRouteError(proxied?.error)) {
            missingPreviewProxyRouteRef.current = true;
            setCivitaiImageError('Server restart required: the running backend is missing the remote preview proxy API routes.');
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

        const canvasResult = await withTimeout(convertWithCanvas(), 5000, `Canvas conversion for ${imageUrl}`);
        if (canvasResult) {
            appendRemotePreviewLog('debug', `Canvas conversion succeeded for ${imageUrl}`);
            return canvasResult;
        }
        appendRemotePreviewLog('warn', `Canvas conversion failed for ${imageUrl}`);

        try {
            const controller = new AbortController();
            const fetchTimeout = window.setTimeout(() => controller.abort(), 5000);
            const response = await fetch(imageUrl, {
                mode: 'cors',
                credentials: 'omit',
                signal: controller.signal,
            }).finally(() => window.clearTimeout(fetchTimeout));
            if (!response.ok) {
                appendRemotePreviewLog('warn', `Direct fetch for ${imageUrl} returned ${response.status} ${response.statusText}`);
                const proxied = await withTimeout(
                    swarmClient.forwardMetadataImageRequestDetailed(imageUrl),
                    8000,
                    `Fallback backend image proxy for ${imageUrl}`
                );
                if (!proxied?.image) {
                    appendRemotePreviewLog('warn', `Fallback backend image proxy failed for ${imageUrl}: ${proxied?.error ?? 'unknown error'}`);
                    if (isUnknownApiRouteError(proxied?.error)) {
                        missingPreviewProxyRouteRef.current = true;
                        setCivitaiImageError('Server restart required: the running backend is missing the remote preview proxy API routes.');
                    }
                }
                return proxied?.image ?? null;
            }
            const blob = await response.blob();
            appendRemotePreviewLog('debug', `Direct fetch succeeded for ${imageUrl} with blob type ${blob.type || 'unknown'}`);
            const browserData = await new Promise<string | null>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = typeof reader.result === 'string' ? reader.result : '';
                    resolve(result.startsWith('data:image/') ? result : null);
                };
                reader.onerror = () => reject(new Error('Failed to read image data'));
                reader.readAsDataURL(blob);
            });
            if (browserData) {
                appendRemotePreviewLog('debug', `Browser FileReader conversion succeeded for ${imageUrl}`);
                return browserData;
            }
            appendRemotePreviewLog('warn', `Browser FileReader conversion returned no image data for ${imageUrl}`);
            const finalProxy = await withTimeout(
                swarmClient.forwardMetadataImageRequestDetailed(imageUrl),
                8000,
                `Final backend image proxy for ${imageUrl}`
            );
            if (!finalProxy?.image) {
                appendRemotePreviewLog('warn', `Final backend image proxy failed for ${imageUrl}: ${finalProxy?.error ?? 'unknown error'}`);
                if (isUnknownApiRouteError(finalProxy?.error)) {
                    missingPreviewProxyRouteRef.current = true;
                    setCivitaiImageError('Server restart required: the running backend is missing the remote preview proxy API routes.');
                }
            }
            return finalProxy?.image ?? null;
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            appendRemotePreviewLog('warn', `Direct fetch path failed for ${imageUrl}: ${detail}`);
            const finalProxy = await withTimeout(
                swarmClient.forwardMetadataImageRequestDetailed(imageUrl),
                8000,
                `Final backend image proxy after fetch failure for ${imageUrl}`
            );
            if (!finalProxy?.image) {
                appendRemotePreviewLog('warn', `Final backend image proxy after fetch failure failed for ${imageUrl}: ${finalProxy?.error ?? 'unknown error'}`);
                if (isUnknownApiRouteError(finalProxy?.error)) {
                    missingPreviewProxyRouteRef.current = true;
                    setCivitaiImageError('Server restart required: the running backend is missing the remote preview proxy API routes.');
                }
            }
            return finalProxy?.image ?? null;
        }
    }, [appendRemotePreviewLog, isUnknownApiRouteError, withTimeout]);

    const convertVideoUrlToDataUrl = useCallback(async (videoUrl: string): Promise<string | null> => {
        appendRemotePreviewLog('debug', `Starting video preview extraction for ${videoUrl}`);
        const result = await withTimeout(new Promise<string | null>((resolve) => {
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
        }), 6000, `Video preview extraction for ${videoUrl}`);
        if (result) {
            appendRemotePreviewLog('debug', `Video preview extraction succeeded for ${videoUrl}`);
        } else {
            appendRemotePreviewLog('warn', `Video preview extraction failed for ${videoUrl}`);
        }
        return result;
    }, [appendRemotePreviewLog, withTimeout]);

    const hydrateRemotePreviewCandidates = useCallback(async (candidateEntry: RemoteModelPreviewCacheEntry | null | undefined) => {
        const previewCandidates = candidateEntry?.previewCandidates ?? [];
        if (previewCandidates.length === 0) {
            return;
        }
        if (!previewCandidates.some((candidate) => !candidate.displayUrl.startsWith('data:image/'))) {
            appendRemotePreviewLog('debug', `Cached preview entry already hydrated with ${previewCandidates.length} image candidates`);
            return;
        }
        appendRemotePreviewLog('debug', `Hydrating ${previewCandidates.length} cached preview candidates`);
        setHydratingRemotePreviews(true);
        try {
            const hydratedResults = await Promise.all(
                previewCandidates.map(async (candidate) => {
                    if (candidate.displayUrl.startsWith('data:image/')) {
                        return candidate;
                    }
                    if (candidate.kind === 'video') {
                        const hydratedVideo = await convertVideoUrlToDataUrl(candidate.sourceUrl);
                        return hydratedVideo && hydratedVideo.startsWith('data:image/')
                            ? { ...candidate, displayUrl: hydratedVideo }
                            : null;
                    }
                    const hydratedImage = await convertImageUrlToDataUrl(candidate.sourceUrl);
                    return hydratedImage && hydratedImage.startsWith('data:image/')
                        ? { ...candidate, displayUrl: hydratedImage }
                        : null;
                })
            );
            const hydratedCandidates = hydratedResults.filter((candidate): candidate is RemotePreviewCandidate => candidate !== null);
            if (hydratedCandidates.length === 0) {
                appendRemotePreviewLog('error', 'All cached preview candidate hydration attempts failed');
                setCivitaiImageError((current) => current ?? 'Cached preview images could not be rendered locally. See diagnostics below and browser console logs.');
                return;
            }
            appendRemotePreviewLog('debug', `Hydrated ${hydratedCandidates.length}/${previewCandidates.length} preview candidates successfully`);
            setCivitaiPreviewCandidates(hydratedCandidates);
            setSelectedCivitaiImageIndex((currentIndex) => {
                if (currentIndex < 0) {
                    return 0;
                }
                return Math.min(currentIndex, hydratedCandidates.length - 1);
            });
            if (candidateEntry?.cacheKey) {
                await saveRemoteModelPreviewCache({
                    ...candidateEntry,
                    previewCandidates: hydratedCandidates,
                    previewImageUrl: hydratedCandidates[0]?.sourceUrl ?? candidateEntry.previewImageUrl ?? null,
                    previewImageData: hydratedCandidates[0]?.displayUrl ?? candidateEntry.previewImageData ?? null,
                });
                appendRemotePreviewLog('debug', `Saved ${hydratedCandidates.length} repaired preview candidates back to cache`);
            }
        } finally {
            setHydratingRemotePreviews(false);
        }
    }, [appendRemotePreviewLog, convertImageUrlToDataUrl, convertVideoUrlToDataUrl]);

    const applyCachedRemoteEntry = useCallback((candidateEntry: Awaited<ReturnType<typeof loadRemoteModelPreviewCache>>) => {
        const previewCandidates = candidateEntry?.previewCandidates ?? [];
        setCivitaiPreviewCandidates(previewCandidates);
        setSelectedCivitaiImageIndex(previewCandidates.length > 0 ? 0 : -1);
        if (previewCandidates.length === 0) {
            setSelectedCivitaiImageUrl(null);
        }
        setRemotePreviewStatus(
            candidateEntry
                ? `Cached remote metadata refreshed ${new Date(candidateEntry.refreshedAt).toLocaleString()}.`
                : null
        );
        if (candidateEntry?.previewCandidates?.length) {
            void hydrateRemotePreviewCandidates(candidateEntry);
        }
    }, [hydrateRemotePreviewCandidates]);

    const loadCachedRemotePreviews = useCallback(async (currentModel: ModelDescription) => {
        setLoadingCivitaiImages(true);
        setCivitaiImageError(null);
        setRemotePreviewStatus(null);
        setRemotePreviewDebugLog([]);
        missingPreviewProxyRouteRef.current = false;
        appendRemotePreviewLog('debug', `Loading cached remote previews for ${currentModel.name}`);
        try {
            const source = await resolveRemoteSourceForModel(swarmClient, currentModel, subtype, {
                allowRemoteLookup: false,
            });
            setResolvedRemoteSource(source);
            appendRemotePreviewLog('debug', `Resolved source type=${source.sourceType ?? 'unknown'} key=${source.cacheKey ?? 'none'}`);
            const cacheEntry = await loadRemoteModelPreviewCache(source.cacheKey);
            applyCachedRemoteEntry(cacheEntry);
            if (!cacheEntry) {
                appendRemotePreviewLog('warn', 'No cached remote preview entry was found');
                setRemotePreviewStatus(source.cacheKey ? 'No cached remote previews yet.' : 'No remote source metadata found for this model.');
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            appendRemotePreviewLog('error', `Failed to load cached remote previews: ${detail}`);
            setResolvedRemoteSource(null);
            setCivitaiImageError('Unable to resolve cached remote preview options');
            setCivitaiPreviewCandidates([]);
            setSelectedCivitaiImageIndex(-1);
        } finally {
            setLoadingCivitaiImages(false);
        }
    }, [appendRemotePreviewLog, applyCachedRemoteEntry, subtype]);

    const handleRefreshRemotePreviews = useCallback(async () => {
        if (!model) {
            return;
        }
        setLoadingCivitaiImages(true);
        setCivitaiImageError(null);
        setRemotePreviewStatus(null);
        setRemotePreviewDebugLog([]);
        missingPreviewProxyRouteRef.current = false;
        appendRemotePreviewLog('debug', `Refreshing remote previews for ${model.name}`);
        let sourceForRefresh: ResolvedRemoteModelSource | null = null;
        try {
            const source = await resolveRemoteSourceForModel(swarmClient, model, subtype, {
                allowRemoteLookup: true,
            });
            sourceForRefresh = source;
            setResolvedRemoteSource(source);
            appendRemotePreviewLog('debug', `Resolved refresh source type=${source.sourceType ?? 'unknown'} key=${source.cacheKey ?? 'none'}`);
            if (!source.cacheKey) {
                appendRemotePreviewLog('warn', 'Refresh aborted because no cache key/source identity was available');
                setCivitaiImageError('No remote source metadata available for this model.');
                setCivitaiPreviewCandidates([]);
                setSelectedCivitaiImageIndex(-1);
                return;
            }
            const refreshedEntry = await refreshRemoteModelPreviewCache(
                swarmClient,
                source,
                {
                    convertImageUrlToDataUrl,
                    convertVideoUrlToDataUrl,
                },
                model.name
            );
            if (!refreshedEntry) {
                appendRemotePreviewLog('warn', 'Remote refresh returned no data, falling back to cached entry');
                const cachedEntry = await loadRemoteModelPreviewCache(source.cacheKey);
                applyCachedRemoteEntry(cachedEntry);
                setCivitaiImageError('Remote refresh failed. Using cached preview options if available.');
                return;
            }
            applyCachedRemoteEntry(refreshedEntry);
            appendRemotePreviewLog('debug', `Remote refresh returned ${refreshedEntry.previewCandidates.length} preview candidates`);
            if (refreshedEntry.previewCandidates.length > 0) {
                notifications.show({
                    title: 'Remote Previews Updated',
                    message: `Loaded ${refreshedEntry.previewCandidates.length} remote preview option${refreshedEntry.previewCandidates.length === 1 ? '' : 's'}.`,
                    color: 'green',
                });
            } else {
                setCivitaiImageError('Remote metadata refreshed, but no preview images were available for display.');
                notifications.show({
                    title: 'No Preview Images',
                    message: 'Remote metadata refreshed, but no preview images were available for display.',
                    color: 'yellow',
                });
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            appendRemotePreviewLog('error', `Remote refresh failed: ${detail}`);
            const cacheEntry = await loadRemoteModelPreviewCache(sourceForRefresh?.cacheKey ?? resolvedRemoteSource?.cacheKey ?? null);
            applyCachedRemoteEntry(cacheEntry);
            setCivitaiImageError(`Remote refresh failed: ${detail}`);
        } finally {
            setLoadingCivitaiImages(false);
        }
    }, [appendRemotePreviewLog, applyCachedRemoteEntry, convertImageUrlToDataUrl, convertVideoUrlToDataUrl, model, resolvedRemoteSource, subtype]);

    const loadModel = useCallback(async (requestedModelName: string, requestedSubtype: string) => {
        if (!requestedModelName) return;
        setLoading(true);
        try {
            const response = await swarmClient.describeModel(requestedModelName, requestedSubtype);
            if ('model' in response) {
                const m = response.model;
                const cleanedDescription = sanitizeDescription(m.description || '');
                setModel(m);
                setTitle(m.title || '');
                setAuthor(m.author || '');
                setDescription(cleanedDescription);
                setTriggerPhrase(m.trigger_phrase || '');
                setTags(Array.isArray(m.tags) ? m.tags.join(', ') : '');
                setStandardWidth(m.standard_width || 512);
                setStandardHeight(m.standard_height || 512);
                setUsageHint(m.usage_hint || '');
                setLicense(m.license || '');
                setPreviewImageData(m.preview_image || null);
                setPreviewFileName(null);
                setSelectedCivitaiImageUrl(null);
                setResolvedRemoteSource(null);
                setShowFullDescription(false);
                setShowAdvancedEdit(false);
                void loadCachedRemotePreviews(m);
            } else {
                notifications.show({ title: 'Error', message: response.error, color: 'red' });
            }
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to load model details', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, [loadCachedRemotePreviews]);

    useEffect(() => {
        if (!opened || !modelName) {
            lastAutoLoadKeyRef.current = null;
            return;
        }
        const loadKey = `${subtype}::${modelName}`;
        if (lastAutoLoadKeyRef.current === loadKey) {
            return;
        }
        lastAutoLoadKeyRef.current = loadKey;
        setEditing(false);
        void loadModel(modelName, subtype);
    }, [opened, modelName, subtype, loadModel]);

    const handleSave = async () => {
        if (!model) return;
        setSaving(true);
        try {
            const response = await swarmClient.editModelMetadata({
                model: modelName,
                title,
                author,
                description,
                trigger_phrase: triggerPhrase,
                tags,
                standard_width: standardWidth,
                standard_height: standardHeight,
                usage_hint: usageHint,
                license,
                preview_image:
                    previewImageData && previewImageData.startsWith('data:image/')
                        ? previewImageData
                        : null,
                subtype,
            });
            if (response.error) {
                notifications.show({ title: 'Save Failed', message: response.error, color: 'red' });
            } else {
                notifications.show({ title: 'Saved', message: 'Model metadata updated', color: 'green' });
                setEditing(false);
                onModelChanged?.();
                lastAutoLoadKeyRef.current = null;
                await loadModel(modelName, subtype);
            }
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to save metadata', color: 'red' });
        } finally {
            setSaving(false);
        }
    };

    const sourceUrl = buildSourceUrl(resolvedRemoteSource, model);
    const sourceLabel = resolvedRemoteSource?.sourceType || model?.source_type || null;
    const visibleDescription = showFullDescription || description.length <= 320
        ? description
        : `${description.slice(0, 320).trim()}...`;
    const descriptionParagraphs = visibleDescription
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph.length > 0);
    const sourceNotePattern = /^(from\s+https?:\/\/|https?:\/\/|join\s+|download|monthly payment|whop|civitai|hugging\s*face)/i;
    const sourceNoteParagraphs = descriptionParagraphs.filter((paragraph) => sourceNotePattern.test(paragraph));
    const modelNoteParagraphs = descriptionParagraphs.filter((paragraph) => !sourceNotePattern.test(paragraph));
    const primaryDescriptionParagraphs = modelNoteParagraphs.length > 0 ? modelNoteParagraphs : descriptionParagraphs;

    const previewUrl = (() => {
        const rawPreview = (previewImageData || '').trim();
        if (!rawPreview) {
            return null;
        }
        if (
            rawPreview === 'imgs/model_placeholder.jpg' ||
            rawPreview === '/imgs/model_placeholder.jpg'
        ) {
            return null;
        }
        if (
            rawPreview.startsWith('data:') ||
            rawPreview.startsWith('http://') ||
            rawPreview.startsWith('https://')
        ) {
            return rawPreview;
        }
        if (rawPreview.startsWith('viewspecial/')) {
            return rawPreview.replace('viewspecial/', '/View/');
        }
        if (rawPreview.startsWith('/')) {
            return rawPreview;
        }
        return `/View/${rawPreview}`;
    })();

    const triggerKeywords = useMemo(() => {
        const fromPhrase = extractTriggerKeywords(triggerPhrase || model?.trigger_phrase || '');
        const fromExtra = extraTriggerKeywords
            .map((keyword) => keyword.trim())
            .filter((keyword) => keyword.length > 1);
        return Array.from(new Set([...fromPhrase, ...fromExtra]));
    }, [triggerPhrase, model?.trigger_phrase, extraTriggerKeywords]);

    const metadataHealth = useMemo(() => {
        if (!model) {
            return [];
        }
        return [
            { label: previewUrl ? 'Preview OK' : 'Add preview', ready: Boolean(previewUrl), tab: 'preview' },
            { label: sourceUrl ? 'Source OK' : 'Add source', ready: Boolean(sourceUrl), tab: 'metadata' },
            { label: description ? 'Description OK' : 'Add description', ready: Boolean(description), tab: description ? 'overview' : 'edit' },
            { label: model.standard_width > 0 ? 'Dimensions OK' : 'Edit dimensions', ready: model.standard_width > 0, tab: 'edit' },
        ];
    }, [description, model, previewUrl, sourceUrl]);

    const handleHealthClick = (tab: string) => {
        setActiveDetailTab(tab);
        setEditing(tab === 'edit');
        if (tab === 'preview') {
            setShowPreviewDiagnostics(true);
        }
        if (tab === 'edit') {
            setShowAdvancedEdit(true);
        }
    };

    const handlePreviewFileSelect = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : null;
            if (!result) {
                notifications.show({ title: 'Error', message: 'Failed to read image file', color: 'red' });
                return;
            }
            setPreviewImageData(result);
            setPreviewFileName(file.name);
            setSelectedCivitaiImageUrl(null);
            notifications.show({ title: 'Preview Updated', message: `Loaded "${file.name}"`, color: 'green' });
        };
        reader.onerror = () => {
            notifications.show({ title: 'Error', message: 'Failed to load preview image', color: 'red' });
        };
        reader.readAsDataURL(file);
    };

    const handleSavePreview = async () => {
        if (!model) return;
        setSavingPreview(true);
        appendRemotePreviewLog('debug', `Saving preview image for ${modelName}`);
        try {
            let backendError: string | null = null;
            // If we have a CivitAI URL but previewImageData is NOT yet a data URI,
            // try the direct backend URL-to-model save (avoids double conversion).
            if (
                selectedCivitaiImageUrl &&
                (!previewImageData || !previewImageData.startsWith('data:image/'))
            ) {
                try {
                    const previewByUrl = await swarmClient.setModelPreviewFromMetadataUrl({
                        model: modelName,
                        subtype,
                        image_url: selectedCivitaiImageUrl,
                        preview_image_metadata: null,
                    });
                    if (!previewByUrl?.error) {
                        appendRemotePreviewLog('debug', `Server-side preview save succeeded for ${selectedCivitaiImageUrl}`);
                        notifications.show({ title: 'Saved', message: 'Preview image updated', color: 'green' });
                        setPreviewFileName(null);
                        setSelectedCivitaiImageUrl(null);
                        onModelChanged?.();
                        lastAutoLoadKeyRef.current = null;
                        await loadModel(modelName, subtype);
                        return;
                    }
                    backendError = previewByUrl.error;
                    appendRemotePreviewLog('warn', `Server-side preview save failed: ${backendError}`);
                } catch {
                    backendError = 'Network error contacting server';
                    appendRemotePreviewLog('warn', 'Server-side preview save failed due to network error');
                }
            }

            let previewToSave = previewImageData;
            if (
                selectedCivitaiImageUrl &&
                (!previewToSave || !previewToSave.startsWith('data:image/'))
            ) {
                previewToSave = await convertImageUrlToDataUrl(selectedCivitaiImageUrl);
            }
            if (!previewToSave || !previewToSave.startsWith('data:image/')) {
                const detail = backendError
                    ? `Server could not fetch the image: ${backendError}. If this is NSFW content, ensure your CivitAI API key is configured in User Settings.`
                    : 'Could not convert the selected preview image into a savable format.';
                appendRemotePreviewLog('error', `Preview save aborted because no savable image data was available. ${detail}`);
                notifications.show({
                    title: 'Save Failed',
                    message: detail,
                    color: 'red',
                    autoClose: 8000,
                });
                return;
            }

            const modelAny = model as unknown as { prediction_type?: string };
            const response = await swarmClient.editModelMetadata({
                model: modelName,
                title: title || model.title || modelName,
                author: author || model.author || '',
                type: model.architecture || '',
                description: description || model.description || '',
                standard_width: standardWidth || model.standard_width || 0,
                standard_height: standardHeight || model.standard_height || 0,
                usage_hint: usageHint || model.usage_hint || '',
                date: model.date || '',
                license: license || model.license || '',
                trigger_phrase: triggerPhrase || model.trigger_phrase || '',
                prediction_type: typeof modelAny.prediction_type === 'string' ? modelAny.prediction_type : '',
                tags: tags || (Array.isArray(model.tags) ? model.tags.join(', ') : ''),
                preview_image: previewToSave,
                subtype,
            });
            if (response.error) {
                appendRemotePreviewLog('error', `EditModelMetadata failed while saving preview: ${response.error}`);
                notifications.show({ title: 'Save Failed', message: response.error, color: 'red' });
                return;
            }
            appendRemotePreviewLog('debug', 'Preview image saved through EditModelMetadata');
            notifications.show({ title: 'Saved', message: 'Preview image updated', color: 'green' });
            setPreviewFileName(null);
            setSelectedCivitaiImageUrl(null);
            onModelChanged?.();
            lastAutoLoadKeyRef.current = null;
            await loadModel(modelName, subtype);
        } catch {
            appendRemotePreviewLog('error', 'Failed to save preview image due to unexpected client-side exception');
            notifications.show({ title: 'Error', message: 'Failed to save preview image', color: 'red' });
        } finally {
            setSavingPreview(false);
        }
    };

    const handleSelectCivitaiPreview = async (candidate: RemotePreviewCandidate, index: number) => {
        setConvertingCivitaiImage(true);
        setSelectedCivitaiImageIndex(index);
        setSelectedCivitaiImageUrl(candidate.sourceUrl);
        setPreviewFileName(`CivitAI preview ${index + 1}`);
        appendRemotePreviewLog('debug', `Selected preview candidate ${index + 1}: ${candidate.sourceUrl}`);
        try {
            if (candidate.displayUrl.startsWith('data:image/')) {
                setPreviewImageData(candidate.displayUrl);
                appendRemotePreviewLog('debug', `Candidate ${index + 1} already had cached image data`);
                notifications.show({ title: 'Preview Updated', message: 'Selected CivitAI preview image', color: 'green' });
            } else {
                const proxyResult = await swarmClient.forwardMetadataImageRequestDetailed(candidate.sourceUrl);
                if (proxyResult.image && proxyResult.image.startsWith('data:image/')) {
                    setPreviewImageData(proxyResult.image);
                    appendRemotePreviewLog('debug', `On-demand backend image proxy succeeded for candidate ${index + 1}`);
                    notifications.show({ title: 'Preview Updated', message: 'Selected CivitAI preview image', color: 'green' });
                } else {
                    setPreviewImageData(candidate.sourceUrl);
                    appendRemotePreviewLog('warn', `On-demand backend image proxy failed for candidate ${index + 1}: ${proxyResult.error ?? 'unknown error'}`);
                    notifications.show({ title: 'Preview Updated', message: 'Selected CivitAI preview image (server conversion pending)', color: 'blue' });
                }
            }
        } catch {
            if (candidate.displayUrl.startsWith('data:image/')) {
                setPreviewImageData(candidate.displayUrl);
                appendRemotePreviewLog('debug', `Candidate ${index + 1} fell back to cached image data after selection error`);
                notifications.show({ title: 'Preview Updated', message: 'Selected cached preview image', color: 'green' });
            } else {
                setPreviewImageData(candidate.sourceUrl);
                appendRemotePreviewLog('error', `Candidate ${index + 1} selection failed and no cached image data was available`);
                notifications.show({ title: 'Preview Updated', message: 'Selected CivitAI preview image (server conversion pending)', color: 'blue' });
            }
        } finally {
            setConvertingCivitaiImage(false);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={model?.title || modelName}
            size="min(1080px, 96vw)"
            centered
            classNames={{ body: 'model-detail-modal__body' }}
        >
            {loading ? (
                <Center h={300}><Loader size="lg" /></Center>
            ) : model ? (
                <Stack gap="md" className="swarm-browser-shell model-detail-modal">
                    <Box className="model-detail-modal__hero-grid">
                        <Stack gap="sm" className="model-detail-modal__preview-column">
                            <Box
                                component={previewUrl ? 'button' : 'div'}
                                type={previewUrl ? 'button' : undefined}
                                className="model-detail-modal__preview-frame"
                                onClick={previewUrl ? () => setPreviewLightboxOpen(true) : undefined}
                                aria-label={previewUrl ? 'Open preview image inspector' : undefined}
                            >
                                {previewUrl ? (
                                    <>
                                        <Box className="model-detail-modal__preview-backdrop">
                                            <LazyImage
                                                src={previewUrl}
                                                alt=""
                                                fit="cover"
                                                height="100%"
                                                width="100%"
                                            />
                                        </Box>
                                        <LazyImage
                                            src={previewUrl}
                                            alt={model.title || model.name}
                                            fit="contain"
                                            height="100%"
                                            width="100%"
                                        />
                                        <Box className="model-detail-modal__preview-inspect">
                                            <IconMaximize size={14} />
                                            <Text size="xs">Inspect</Text>
                                        </Box>
                                    </>
                                ) : (
                                    <Center h="100%" className="model-detail-modal__preview-empty">
                                        <Stack gap={6} align="center">
                                            <IconPhoto size={34} />
                                            <Text size="xs" c="dimmed">No preview image</Text>
                                        </Stack>
                                    </Center>
                                )}
                            </Box>

                            {civitaiPreviewCandidates.length > 0 && (
                                <Stack gap={6} className="model-detail-modal__filmstrip-wrap">
                                    <Group justify="space-between" gap="xs">
                                        <Text size="xs" c="dimmed">Remote preview options</Text>
                                        <SwarmBadge tone="info" emphasis="soft" size="xs">
                                            {civitaiPreviewCandidates.length}
                                        </SwarmBadge>
                                    </Group>
                                    <Box className="model-detail-modal__filmstrip">
                                        <Group gap="xs" wrap="nowrap">
                                            {civitaiPreviewCandidates.map((candidate, index) => (
                                                <Box
                                                    key={`${candidate.id}-${index}`}
                                                    component="button"
                                                    type="button"
                                                    className="model-detail-modal__filmstrip-item"
                                                    data-selected={index === selectedCivitaiImageIndex ? 'true' : undefined}
                                                    onClick={() => void handleSelectCivitaiPreview(candidate, index)}
                                                >
                                                    {candidate.displayUrl.startsWith('data:image/') ? (
                                                        <img
                                                            src={candidate.displayUrl}
                                                            alt={`Remote preview ${index + 1}`}
                                                        />
                                                    ) : (
                                                        <Center className="model-detail-modal__filmstrip-loading">
                                                            <Loader size="xs" />
                                                        </Center>
                                                    )}
                                                </Box>
                                            ))}
                                        </Group>
                                    </Box>
                                </Stack>
                            )}

                            <ControlTray
                                title="Preview Controls"
                                subtitle="Use local art or hydrate remote preview candidates."
                                status={previewFileName ? 'Local selected' : civitaiPreviewCandidates.length > 0 ? `${civitaiPreviewCandidates.length} remote` : 'Ready'}
                                tone={previewFileName || civitaiPreviewCandidates.length > 0 ? 'info' : 'secondary'}
                            >
                                <Group gap="xs" wrap="wrap">
                                    <FileButton onChange={handlePreviewFileSelect} accept="image/png,image/jpeg,image/webp,image/gif">
                                        {(props) => (
                                            <SwarmButton {...props} tone="info" emphasis="soft" size="xs" leftSection={<IconPhoto size={14} />}>
                                                Choose Image
                                            </SwarmButton>
                                        )}
                                    </FileButton>
                                    <SwarmButton
                                        tone="danger"
                                        emphasis="soft"
                                        size="xs"
                                        leftSection={<IconTrash size={14} />}
                                        onClick={() => {
                                            setPreviewImageData(null);
                                            setPreviewFileName(null);
                                            setSelectedCivitaiImageUrl(null);
                                        }}
                                    >
                                        Clear
                                    </SwarmButton>
                                    <SwarmButton
                                        tone="success"
                                        emphasis="solid"
                                        size="xs"
                                        loading={savingPreview}
                                        disabled={previewFileName === null || convertingCivitaiImage}
                                        onClick={handleSavePreview}
                                    >
                                        Save Preview
                                    </SwarmButton>
                                    <SwarmButton
                                        tone="info"
                                        emphasis="ghost"
                                        size="xs"
                                        leftSection={<IconRefresh size={14} />}
                                        loading={loadingCivitaiImages}
                                        disabled={!model}
                                        onClick={() => void handleRefreshRemotePreviews()}
                                    >
                                        Refresh
                                    </SwarmButton>
                                </Group>
                                {previewFileName && <Text size="xs" c="dimmed">Selected: {previewFileName}</Text>}
                                {(loadingCivitaiImages || hydratingRemotePreviews) && (
                                    <Text size="xs" c="dimmed">Loading cached remote preview options...</Text>
                                )}
                                {remotePreviewStatus && (
                                    <Alert color="blue" variant="light" py={6}>
                                        <Text size="xs">{remotePreviewStatus}</Text>
                                    </Alert>
                                )}
                                {civitaiImageError && <Text size="xs" c="red">{civitaiImageError}</Text>}
                                {(remotePreviewDebugLog.length > 0 || resolvedRemoteSource?.sourceType) && (
                                    <Stack gap={6}>
                                        <SwarmButton
                                            size="xs"
                                            tone="secondary"
                                            emphasis="ghost"
                                            rightSection={showPreviewDiagnostics ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                                            onClick={() => setShowPreviewDiagnostics((value) => !value)}
                                        >
                                            Preview Diagnostics
                                        </SwarmButton>
                                        <Collapse expanded={showPreviewDiagnostics}>
                                            <Alert color="gray" variant="light" py={6}>
                                                <Stack gap={4}>
                                                    {resolvedRemoteSource?.sourceType && (
                                                        <Text size="xs" c="dimmed">Remote source: {resolvedRemoteSource.sourceType}</Text>
                                                    )}
                                                    {remotePreviewDebugLog.slice(-12).map((line, index) => (
                                                        <Text
                                                            key={`${line}-${index}`}
                                                            size="xs"
                                                            className="model-detail-modal__diagnostic-line"
                                                        >
                                                            {line}
                                                        </Text>
                                                    ))}
                                                </Stack>
                                            </Alert>
                                        </Collapse>
                                    </Stack>
                                )}
                            </ControlTray>
                        </Stack>

                        <Stack gap="md" className="model-detail-modal__summary-column">
                            <Stack gap="xs" className="model-detail-modal__identity">
                                <Text size="xs" c="dimmed" className="model-detail-modal__filename">
                                    {model.name}
                                </Text>
                                <Group gap="xs" wrap="wrap">
                                    {model.architecture && <SwarmBadge tone="secondary" size="sm">{model.architecture}</SwarmBadge>}
                                    {model.class && <SwarmBadge tone="info" emphasis="soft" size="sm">{model.class}</SwarmBadge>}
                                    {model.loaded && <Badge color="green" size="sm">Loaded</Badge>}
                                    {!model.is_supported_model_format && <Badge color="orange" size="sm">Unsupported Format</Badge>}
                                    {model.local && <SwarmBadge tone="success" emphasis="soft" size="sm">Local</SwarmBadge>}
                                    {model.is_negative_embedding && <SwarmBadge tone="warning" emphasis="soft" size="sm">Negative Embedding</SwarmBadge>}
                                    {model.compat_class && <SwarmBadge tone="secondary" emphasis="outline" size="sm">{model.compat_class}</SwarmBadge>}
                                </Group>
                            </Stack>

                            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" className="model-detail-modal__spec-grid">
                                <Box className="model-detail-modal__spec-tile">
                                    <Text size="xs" c="dimmed">Source</Text>
                                    <Text size="sm" fw={700} truncate>{sourceLabel || 'Local'}</Text>
                                </Box>
                                <Box className="model-detail-modal__spec-tile">
                                    <Text size="xs" c="dimmed">Default</Text>
                                    <Text size="sm" fw={700}>
                                        {model.standard_width > 0 ? `${model.standard_width} x ${model.standard_height}` : 'Unset'}
                                    </Text>
                                </Box>
                                <Box className="model-detail-modal__spec-tile">
                                    <Text size="xs" c="dimmed">Type</Text>
                                    <Text size="sm" fw={700} truncate>{model.class || model.architecture || subtype}</Text>
                                </Box>
                                <Box className="model-detail-modal__spec-tile">
                                    <Text size="xs" c="dimmed">Format</Text>
                                    <Text size="sm" fw={700}>{model.is_supported_model_format ? 'Supported' : 'Unsupported'}</Text>
                                </Box>
                            </SimpleGrid>

                            <Group gap={6} wrap="wrap" className="model-detail-modal__health-row">
                                {metadataHealth.map((item) => (
                                    <Badge
                                        key={item.label}
                                        component="button"
                                        type="button"
                                        size="xs"
                                        variant="light"
                                        color={item.ready ? 'green' : 'gray'}
                                        className="model-detail-modal__health-chip"
                                        onClick={() => handleHealthClick(item.tab)}
                                    >
                                        {item.label}
                                    </Badge>
                                ))}
                            </Group>

                            {Array.isArray(model.tags) && model.tags.length > 0 && (
                                <Group gap={4} className="model-detail-modal__tag-row">
                                    {model.tags.map(tag => (
                                        <Badge key={tag} size="xs" variant="outline" title={tag}>
                                            {tag}
                                        </Badge>
                                    ))}
                                </Group>
                            )}

                            {(sourceUrl || sourceLabel || model.hash) && (
                                <Stack gap="xs" className="model-detail-modal__source-panel">
                                    {(sourceUrl || sourceLabel) && (
                                        <Group gap="xs" justify="space-between" wrap="wrap">
                                            <Text size="xs" c="dimmed" truncate>
                                                Source: {sourceLabel || 'remote metadata'}
                                            </Text>
                                            {sourceUrl && (
                                                <Group gap="xs">
                                                    <SwarmButton
                                                        tone="secondary"
                                                        emphasis="soft"
                                                        size="xs"
                                                        leftSection={<IconCopy size={14} />}
                                                        onClick={() => void copySourceUrl()}
                                                    >
                                                        Copy
                                                    </SwarmButton>
                                                    <SwarmButton
                                                        tone="secondary"
                                                        emphasis="ghost"
                                                        size="xs"
                                                        leftSection={<IconExternalLink size={14} />}
                                                        onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')}
                                                    >
                                                        Open
                                                    </SwarmButton>
                                                </Group>
                                            )}
                                        </Group>
                                    )}
                                    {model.hash && (
                                        <Text size="xs" c="dimmed" className="model-detail-modal__hash">
                                            Hash: {model.hash}
                                        </Text>
                                    )}
                                    <Group gap={6} wrap="wrap">
                                        <Badge
                                            component="button"
                                            type="button"
                                            size="xs"
                                            variant="light"
                                            color="gray"
                                            className="model-detail-modal__copy-chip"
                                            onClick={() => void copyText(model.name, 'Model name')}
                                        >
                                            Copy model name
                                        </Badge>
                                        {sourceUrl && (
                                            <Badge
                                                component="button"
                                                type="button"
                                                size="xs"
                                                variant="light"
                                                color="blue"
                                                className="model-detail-modal__copy-chip"
                                                onClick={() => void copyText(sourceUrl, 'Source URL')}
                                            >
                                                Copy source
                                            </Badge>
                                        )}
                                        {model.source_model_id && (
                                            <Badge
                                                component="button"
                                                type="button"
                                                size="xs"
                                                variant="light"
                                                color="gray"
                                                className="model-detail-modal__copy-chip"
                                                onClick={() => void copyText(String(model.source_model_id), 'Source model ID')}
                                            >
                                                Model ID {model.source_model_id}
                                            </Badge>
                                        )}
                                        {model.source_version_id && (
                                            <Badge
                                                component="button"
                                                type="button"
                                                size="xs"
                                                variant="light"
                                                color="gray"
                                                className="model-detail-modal__copy-chip"
                                                onClick={() => void copyText(String(model.source_version_id), 'Source version ID')}
                                            >
                                                Version {model.source_version_id}
                                            </Badge>
                                        )}
                                    </Group>
                                </Stack>
                            )}
                            <Group gap="xs" wrap="wrap" className="model-detail-modal__quick-actions">
                                {sourceUrl && (
                                    <SwarmButton
                                        size="xs"
                                        tone="secondary"
                                        emphasis="soft"
                                        leftSection={<IconCopy size={13} />}
                                        onClick={() => void copySourceUrl()}
                                    >
                                        Copy Source
                                    </SwarmButton>
                                )}
                                <SwarmButton
                                    size="xs"
                                    tone="info"
                                    emphasis="soft"
                                    leftSection={<IconMaximize size={13} />}
                                    disabled={!previewUrl}
                                    onClick={() => setPreviewLightboxOpen(true)}
                                >
                                    Inspect
                                </SwarmButton>
                                <SwarmButton
                                    size="xs"
                                    tone="secondary"
                                    emphasis="ghost"
                                    onClick={() => handleHealthClick('edit')}
                                >
                                    Edit Metadata
                                </SwarmButton>
                            </Group>
                        </Stack>
                    </Box>

                    <Tabs
                        value={editing ? 'edit' : activeDetailTab}
                        onChange={(value) => {
                            const next = value || 'overview';
                            setActiveDetailTab(next);
                            setEditing(next === 'edit');
                        }}
                        className="model-detail-modal__tabs"
                    >
                        <Tabs.List>
                            <Tabs.Tab value="overview">Overview</Tabs.Tab>
                            <Tabs.Tab value="preview">Preview</Tabs.Tab>
                            <Tabs.Tab value="metadata">Metadata</Tabs.Tab>
                            <Tabs.Tab value="edit">Edit</Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="overview" pt="md">
                            <Stack gap="md">
                                {description ? (
                                    <Stack gap="sm" className="model-detail-modal__description-panel">
                                        <Group justify="space-between" align="center">
                                            <Text size="sm" fw={700}>Description</Text>
                                            <SwarmBadge tone="secondary" emphasis="soft" size="xs">
                                                {descriptionParagraphs.length} section{descriptionParagraphs.length === 1 ? '' : 's'}
                                            </SwarmBadge>
                                        </Group>
                                        <Stack gap="sm" className="model-detail-modal__description-copy">
                                            {primaryDescriptionParagraphs.map((paragraph, index) => (
                                                <Text key={`${index}-${paragraph.slice(0, 12)}`} size="sm" c="dimmed">
                                                    {paragraph}
                                                </Text>
                                            ))}
                                        </Stack>
                                        {sourceNoteParagraphs.length > 0 && (
                                            <Stack gap={6} className="model-detail-modal__source-notes">
                                                <Text size="xs" fw={700} c="dimmed">Source Notes</Text>
                                                {sourceNoteParagraphs.map((paragraph, index) => (
                                                    <Text key={`${index}-${paragraph.slice(0, 12)}`} size="xs" c="dimmed">
                                                        {paragraph}
                                                    </Text>
                                                ))}
                                            </Stack>
                                        )}
                                        {description.length > 320 && (
                                            <SwarmButton
                                                size="xs"
                                                tone="secondary"
                                                emphasis="ghost"
                                                onClick={() => setShowFullDescription((v) => !v)}
                                            >
                                                {showFullDescription ? 'Show Less' : 'Show More'}
                                            </SwarmButton>
                                        )}
                                    </Stack>
                                ) : (
                                    <Stack gap="xs" className="model-detail-modal__description-panel">
                                        <Text size="sm" fw={700}>Description</Text>
                                        <Text size="sm" c="dimmed">No description has been saved for this item yet.</Text>
                                        <SwarmButton size="xs" tone="secondary" emphasis="soft" onClick={() => handleHealthClick('edit')}>
                                            Add Description
                                        </SwarmButton>
                                    </Stack>
                                )}
                                {model.trigger_phrase && (
                                    <Group gap="xs" className="model-detail-modal__trigger-phrase" wrap="wrap">
                                        <Text size="sm">
                                            <Text span fw={600} c="var(--theme-gray-1)">Trigger Phrase:</Text>{' '}
                                            <Text span c="var(--theme-accent)" fw={500}>{model.trigger_phrase}</Text>
                                        </Text>
                                        <SwarmButton
                                            size="xs"
                                            tone="secondary"
                                            emphasis="ghost"
                                            leftSection={<IconCopy size={13} />}
                                            onClick={() => void copyText(model.trigger_phrase || '', 'Trigger phrase')}
                                        >
                                            Copy
                                        </SwarmButton>
                                    </Group>
                                )}
                                {onAddTriggerToPrompt && triggerKeywords.length > 0 && (
                                    <Stack gap={6} className="model-detail-modal__trigger-panel">
                                        <Text size="xs" fw={600} c="var(--theme-gray-1)">Trigger Keywords</Text>
                                        <Group gap={6}>
                                            {triggerKeywords.map((keyword) => (
                                                <Badge
                                                    key={keyword}
                                                    component="button"
                                                    type="button"
                                                    size="sm"
                                                    variant="light"
                                                    color="green"
                                                    className="model-detail-modal__copy-chip"
                                                    onClick={() => {
                                                        onAddTriggerToPrompt(keyword);
                                                        notifications.show({
                                                            title: 'Trigger Added',
                                                            message: `Added "${keyword}" to prompt`,
                                                            color: 'green',
                                                        });
                                                    }}
                                                >
                                                    Add {keyword}
                                                </Badge>
                                            ))}
                                        </Group>
                                    </Stack>
                                )}
                            </Stack>
                        </Tabs.Panel>

                        <Tabs.Panel value="preview" pt="md">
                            <Stack gap="md" className="model-detail-modal__advanced-panel">
                                <Group gap="xs" wrap="wrap">
                                    <SwarmButton
                                        size="xs"
                                        tone="info"
                                        emphasis="soft"
                                        leftSection={<IconMaximize size={14} />}
                                        disabled={!previewUrl}
                                        onClick={() => setPreviewLightboxOpen(true)}
                                    >
                                        Inspect Preview
                                    </SwarmButton>
                                    <SwarmButton
                                        size="xs"
                                        tone="info"
                                        emphasis="ghost"
                                        leftSection={<IconRefresh size={14} />}
                                        loading={loadingCivitaiImages}
                                        onClick={() => void handleRefreshRemotePreviews()}
                                    >
                                        Refresh Remote Previews
                                    </SwarmButton>
                                </Group>
                                <Text size="xs" c="dimmed">
                                    Current preview source: {previewFileName || selectedCivitaiImageUrl || (previewUrl ? 'saved metadata preview' : 'none')}
                                </Text>
                                <Stack gap="sm" className="model-detail-modal__remote-library">
                                    <Group justify="space-between" align="center" wrap="wrap">
                                        <Stack gap={2}>
                                            <Text size="sm" fw={700}>Remote Preview Library</Text>
                                            <Text size="xs" c="dimmed">
                                                Cached remote images from the source API. Select one to preview it, then save it if you want it as the model preview.
                                            </Text>
                                        </Stack>
                                        <SwarmBadge tone={civitaiPreviewCandidates.length > 0 ? 'info' : 'secondary'} emphasis="soft" size="sm">
                                            {civitaiPreviewCandidates.length > 0 ? `${civitaiPreviewCandidates.length} cached` : 'No cached images'}
                                        </SwarmBadge>
                                    </Group>
                                    {civitaiPreviewCandidates.length > 0 ? (
                                        <Box className="model-detail-modal__remote-grid">
                                            {civitaiPreviewCandidates.map((candidate, index) => (
                                                <Box
                                                    key={`${candidate.id}-preview-tab-${index}`}
                                                    component="button"
                                                    type="button"
                                                    className="model-detail-modal__remote-card"
                                                    data-selected={index === selectedCivitaiImageIndex ? 'true' : undefined}
                                                    onClick={() => void handleSelectCivitaiPreview(candidate, index)}
                                                >
                                                    {candidate.displayUrl.startsWith('data:image/') ? (
                                                        <img src={candidate.displayUrl} alt={`Remote candidate ${index + 1}`} />
                                                    ) : (
                                                        <Center className="model-detail-modal__remote-card-loading">
                                                            <Loader size="xs" />
                                                        </Center>
                                                    )}
                                                    <Text size="xs" fw={700}>Option {index + 1}</Text>
                                                </Box>
                                            ))}
                                        </Box>
                                    ) : (
                                        <Stack gap="xs" className="model-detail-modal__remote-empty">
                                            <Text size="sm" c="dimmed">
                                                No cached remote preview options are loaded for this model.
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                Refresh will resolve CivitAI or Hugging Face metadata from saved source fields, description links, headers, or model hash when available.
                                            </Text>
                                            <Group gap="xs">
                                                <SwarmButton
                                                    size="xs"
                                                    tone="info"
                                                    emphasis="soft"
                                                    leftSection={<IconRefresh size={14} />}
                                                    loading={loadingCivitaiImages}
                                                    onClick={() => void handleRefreshRemotePreviews()}
                                                >
                                                    Pull From Source API
                                                </SwarmButton>
                                                <SwarmButton
                                                    size="xs"
                                                    tone="secondary"
                                                    emphasis="ghost"
                                                    onClick={() => setShowPreviewDiagnostics((value) => !value)}
                                                >
                                                    Show Diagnostics
                                                </SwarmButton>
                                            </Group>
                                        </Stack>
                                    )}
                                </Stack>
                                <Collapse expanded={showPreviewDiagnostics || remotePreviewDebugLog.length > 0}>
                                    <Alert color="gray" variant="light" py={6}>
                                        <Stack gap={4}>
                                            {resolvedRemoteSource?.sourceType && (
                                                <Text size="xs" c="dimmed">Remote source: {resolvedRemoteSource.sourceType}</Text>
                                            )}
                                            {remotePreviewDebugLog.length > 0 ? remotePreviewDebugLog.slice(-12).map((line, index) => (
                                                <Text key={`${line}-${index}`} size="xs" className="model-detail-modal__diagnostic-line">
                                                    {line}
                                                </Text>
                                            )) : (
                                                <Text size="xs" c="dimmed">No preview diagnostics recorded yet.</Text>
                                            )}
                                        </Stack>
                                    </Alert>
                                </Collapse>
                            </Stack>
                        </Tabs.Panel>

                        <Tabs.Panel value="metadata" pt="md">
                            <Stack gap="md" className="model-detail-modal__advanced-panel">
                                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                                    {model.author && <Text size="sm"><strong>Author:</strong> {model.author}</Text>}
                                    {model.usage_hint && <Text size="sm"><strong>Usage Hint:</strong> {model.usage_hint}</Text>}
                                    {model.license && <Text size="sm"><strong>License:</strong> {model.license}</Text>}
                                    {model.date && <Text size="sm"><strong>Date:</strong> {model.date}</Text>}
                                    {model.hash && <Text size="sm" className="model-detail-modal__hash"><strong>Hash:</strong> {model.hash}</Text>}
                                    {sourceLabel && <Text size="sm"><strong>Source type:</strong> {sourceLabel}</Text>}
                                </SimpleGrid>
                                <Group gap={6} wrap="wrap">
                                    {sourceUrl && (
                                        <Badge component="button" type="button" size="sm" variant="light" color="blue" className="model-detail-modal__copy-chip" onClick={() => void copyText(sourceUrl, 'Source URL')}>
                                            Copy source URL
                                        </Badge>
                                    )}
                                    {model.hash && (
                                        <Badge component="button" type="button" size="sm" variant="light" color="gray" className="model-detail-modal__copy-chip" onClick={() => void copyText(model.hash || '', 'Hash')}>
                                            Copy hash
                                        </Badge>
                                    )}
                                </Group>
                            </Stack>
                        </Tabs.Panel>

                        <Tabs.Panel value="edit" pt="md">
                            <Stack gap="sm">
                                <TextInput label="Title" value={title} onChange={e => setTitle(e.currentTarget.value)} />
                                <Textarea label="Description" value={description} onChange={e => setDescription(e.currentTarget.value)} minRows={3} autosize />
                                <TextInput label="Trigger Phrase" value={triggerPhrase} onChange={e => setTriggerPhrase(e.currentTarget.value)} />
                                <SwarmButton
                                    size="xs"
                                    tone="secondary"
                                    emphasis="ghost"
                                    rightSection={showAdvancedEdit ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                                    onClick={() => setShowAdvancedEdit((v) => !v)}
                                >
                                    {showAdvancedEdit ? 'Hide Advanced Fields' : 'Show Advanced Fields'}
                                </SwarmButton>
                                <Collapse expanded={showAdvancedEdit}>
                                    <Stack gap="sm">
                                        <TextInput label="Author" value={author} onChange={e => setAuthor(e.currentTarget.value)} />
                                        <TextInput label="Tags (comma-separated)" value={tags} onChange={e => setTags(e.currentTarget.value)} />
                                        <ControlTray
                                            title="Standard Size"
                                            subtitle="Metadata defaults used by browser details and model hints."
                                            status={`${standardWidth}x${standardHeight}`}
                                            tone="info"
                                        >
                                            <Group grow align="flex-start">
                                                <SwarmSliderField label="Width" value={standardWidth} onChange={(value) => setStandardWidth(Number(value) || 512)} min={64} max={8192} step={64} unit="px" tone="info" />
                                                <SwarmSliderField label="Height" value={standardHeight} onChange={(value) => setStandardHeight(Number(value) || 512)} min={64} max={8192} step={64} unit="px" tone="info" />
                                            </Group>
                                        </ControlTray>
                                        <TextInput label="Usage Hint" value={usageHint} onChange={e => setUsageHint(e.currentTarget.value)} />
                                        <TextInput label="License" value={license} onChange={e => setLicense(e.currentTarget.value)} />
                                    </Stack>
                                </Collapse>
                                <Group justify="flex-end" className="model-detail-modal__action-bar">
                                    <SwarmButton tone="secondary" emphasis="ghost" onClick={() => { setEditing(false); setActiveDetailTab('overview'); }}>Cancel</SwarmButton>
                                    <SwarmButton tone="brand" loading={saving} onClick={handleSave}>Save</SwarmButton>
                                </Group>
                            </Stack>
                        </Tabs.Panel>
                    </Tabs>
                </Stack>
            ) : null}
            <Modal
                opened={previewLightboxOpen}
                onClose={() => setPreviewLightboxOpen(false)}
                title="Preview Inspector"
                size="min(920px, 94vw)"
                centered
                classNames={{ body: 'model-detail-modal__lightbox-body' }}
            >
                {previewUrl && (
                    <Stack gap="sm">
                        <Box className="model-detail-modal__lightbox-frame">
                            <LazyImage
                                src={previewUrl}
                                alt={model?.title || model?.name || modelName}
                                fit="contain"
                                height="100%"
                                width="100%"
                            />
                        </Box>
                        <Group justify="space-between" wrap="wrap">
                            <Text size="xs" c="dimmed" truncate>
                                {previewFileName || selectedCivitaiImageUrl || 'Saved metadata preview'}
                            </Text>
                            {selectedCivitaiImageUrl && (
                                <SwarmButton
                                    size="xs"
                                    tone="secondary"
                                    emphasis="ghost"
                                    leftSection={<IconCopy size={13} />}
                                    onClick={() => void copyText(selectedCivitaiImageUrl, 'Preview URL')}
                                >
                                    Copy Preview URL
                                </SwarmButton>
                            )}
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Modal>
    );
}
