import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Stack,
    Group,
    Text,
    TextInput,
    Textarea,
    NumberInput,
    Loader,
    Center,
    Box,
    Modal,
    Collapse,
    Badge,
    FileButton,
    Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronUp, IconPhoto, IconRefresh, IconTrash } from '@tabler/icons-react';
import { swarmClient } from '../api/client';
import type { ModelDescription } from '../api/types';
import { LazyImage } from './LazyImage';
import { SwarmButton, SwarmBadge } from './ui';
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
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
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

    const sanitizeDescription = (input: string): string => {
        if (!input) return '';
        const withoutTags = input
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<\/?[^>]+(>|$)/g, ' ');
        return withoutTags
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/\s+/g, ' ')
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
                setShowAdvanced(false);
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
            size="lg"
            centered
        >
            {loading ? (
                <Center h={300}><Loader size="lg" /></Center>
            ) : model ? (
                <Stack gap="md">
                    {/* Preview + Badges */}
                    <Group align="flex-start" gap="md">
                        {previewUrl && (
                            <Box style={{
                                width: 160,
                                height: 160,
                                borderRadius: 8,
                                overflow: 'hidden',
                                backgroundColor: 'var(--theme-gray-6)',
                                flexShrink: 0,
                            }}>
                                <LazyImage
                                    src={previewUrl}
                                    alt={model.title || model.name}
                                    fit="cover"
                                    height="100%"
                                    width="100%"
                                />
                            </Box>
                        )}
                        <Stack gap="xs" style={{ flex: 1 }}>
                            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                                {model.name}
                            </Text>
                            <Group gap="xs">
                                {model.architecture && <SwarmBadge tone="secondary" size="sm">{model.architecture}</SwarmBadge>}
                                {model.class && <SwarmBadge tone="info" emphasis="soft" size="sm">{model.class}</SwarmBadge>}
                                {model.loaded && <Badge color="green" size="sm">Loaded</Badge>}
                                {!model.is_supported_model_format && <Badge color="orange" size="sm">Unsupported Format</Badge>}
                            </Group>
                            {model.standard_width > 0 && (
                                <Text size="xs" c="dimmed">
                                    Default: {model.standard_width} x {model.standard_height}
                                </Text>
                            )}
                            {Array.isArray(model.tags) && model.tags.length > 0 && (
                                <Group gap={4} style={{ maxWidth: '100%' }}>
                                    {model.tags.map(tag => (
                                        <Badge
                                            key={tag}
                                            size="xs"
                                            variant="outline"
                                            style={{
                                                maxWidth: 200,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                            title={tag}
                                        >
                                            {tag}
                                        </Badge>
                                    ))}
                                </Group>
                            )}
                            {model.hash && (
                                <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                                    Hash: {model.hash}
                                </Text>
                            )}
                            <Group gap="xs">
                                {model.local && <SwarmBadge tone="success" emphasis="soft" size="xs">Local</SwarmBadge>}
                                {model.is_negative_embedding && <SwarmBadge tone="warning" emphasis="soft" size="xs">Negative Embedding</SwarmBadge>}
                                {model.compat_class && <SwarmBadge tone="secondary" emphasis="outline" size="xs">{model.compat_class}</SwarmBadge>}
                            </Group>
                            <Stack gap={6}>
                                <Text size="xs" fw={600}>Preview Image</Text>
                                <Group gap="xs">
                                    <FileButton onChange={handlePreviewFileSelect} accept="image/png,image/jpeg,image/webp,image/gif">
                                        {(props) => (
                                            <SwarmButton
                                                {...props}
                                                tone="info"
                                                emphasis="soft"
                                                size="xs"
                                                leftSection={<IconPhoto size={14} />}
                                            >
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
                                </Group>
                                {previewFileName && (
                                    <Text size="xs" c="dimmed">
                                        Selected: {previewFileName}
                                    </Text>
                                )}
                                <Group gap="xs">
                                    <SwarmButton
                                        tone="info"
                                        emphasis="soft"
                                        size="xs"
                                        leftSection={<IconRefresh size={14} />}
                                        loading={loadingCivitaiImages}
                                        disabled={!model}
                                        onClick={() => void handleRefreshRemotePreviews()}
                                    >
                                        Refresh Remote Previews
                                    </SwarmButton>
                                    {resolvedRemoteSource?.sourceType && (
                                        <Text size="xs" c="dimmed">
                                            Source: {resolvedRemoteSource.sourceType}
                                        </Text>
                                    )}
                                </Group>
                                {(loadingCivitaiImages || hydratingRemotePreviews) && (
                                    <Text size="xs" c="dimmed">Loading cached remote preview options...</Text>
                                )}
                                {remotePreviewStatus && (
                                    <Alert color="blue" variant="light" py={6}>
                                        <Text size="xs">{remotePreviewStatus}</Text>
                                    </Alert>
                                )}
                                {remotePreviewDebugLog.length > 0 && (
                                    <Alert color="gray" variant="light" py={6}>
                                        <Stack gap={4}>
                                            <Text size="xs" fw={600}>Remote Preview Diagnostics</Text>
                                            {remotePreviewDebugLog.slice(-12).map((line, index) => (
                                                <Text
                                                    key={`${line}-${index}`}
                                                    size="xs"
                                                    style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                                >
                                                    {line}
                                                </Text>
                                            ))}
                                        </Stack>
                                    </Alert>
                                )}
                                {civitaiImageError && (
                                    <Text size="xs" c="red">{civitaiImageError}</Text>
                                )}
                                {civitaiPreviewCandidates.length > 0 && (
                                    <Stack gap={6}>
                                        <Text size="xs" c="dimmed">
                                            Cached remote preview options (same source cache as Model Downloader)
                                        </Text>
                                        <Box
                                            style={{
                                                overflowX: 'auto',
                                                overflowY: 'hidden',
                                                width: '100%',
                                                paddingBottom: 4,
                                            }}
                                        >
                                            <Group gap="xs" wrap="nowrap">
                                                {civitaiPreviewCandidates.map((candidate, index) => (
                                                    <Box
                                                        key={`${candidate.id}-${index}`}
                                                        component="button"
                                                        type="button"
                                                        onClick={() => void handleSelectCivitaiPreview(candidate, index)}
                                                        style={{
                                                            border:
                                                                index === selectedCivitaiImageIndex
                                                                    ? '2px solid var(--mantine-color-blue-5)'
                                                                    : '1px solid var(--mantine-color-gray-4)',
                                                            borderRadius: 8,
                                                            padding: 2,
                                                            background: 'transparent',
                                                            cursor: 'pointer',
                                                            lineHeight: 0,
                                                        }}
                                                    >
                                                        {candidate.displayUrl.startsWith('data:image/') ? (
                                                            <img
                                                                src={candidate.displayUrl}
                                                                alt={`CivitAI preview ${index + 1}`}
                                                                style={{
                                                                    width: 58,
                                                                    height: 58,
                                                                    objectFit: 'cover',
                                                                    display: 'block',
                                                                    borderRadius: 6,
                                                                    backgroundColor: 'var(--theme-gray-6)',
                                                                }}
                                                            />
                                                        ) : (
                                                            <Center
                                                                style={{
                                                                    width: 58,
                                                                    height: 58,
                                                                    borderRadius: 6,
                                                                    backgroundColor: 'var(--theme-gray-6)',
                                                                }}
                                                            >
                                                                <Loader size="xs" />
                                                            </Center>
                                                        )}
                                                    </Box>
                                                ))}
                                            </Group>
                                        </Box>
                                    </Stack>
                                )}
                            </Stack>
                        </Stack>
                    </Group>

                    {/* View/Edit Fields */}
                    {editing ? (
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
                            <Collapse in={showAdvancedEdit}>
                                <Stack gap="sm">
                                    <TextInput label="Author" value={author} onChange={e => setAuthor(e.currentTarget.value)} />
                                    <TextInput label="Tags (comma-separated)" value={tags} onChange={e => setTags(e.currentTarget.value)} />
                                    <Group>
                                        <NumberInput label="Width" value={standardWidth} onChange={v => setStandardWidth(Number(v) || 512)} min={64} max={8192} step={64} w={120} />
                                        <NumberInput label="Height" value={standardHeight} onChange={v => setStandardHeight(Number(v) || 512)} min={64} max={8192} step={64} w={120} />
                                    </Group>
                                    <TextInput label="Usage Hint" value={usageHint} onChange={e => setUsageHint(e.currentTarget.value)} />
                                    <TextInput label="License" value={license} onChange={e => setLicense(e.currentTarget.value)} />
                                </Stack>
                            </Collapse>
                            <Group justify="flex-end">
                                <SwarmButton tone="secondary" emphasis="ghost" onClick={() => setEditing(false)}>Cancel</SwarmButton>
                                <SwarmButton tone="brand" loading={saving} onClick={handleSave}>Save</SwarmButton>
                            </Group>
                        </Stack>
                    ) : (
                        <Stack gap="xs">
                            {description && (
                                <Stack gap={4}>
                                    <Text size="sm" fw={600}>Description</Text>
                                    <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                                        {showFullDescription || description.length <= 320
                                            ? description
                                            : `${description.slice(0, 320)}...`}
                                    </Text>
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
                            )}
                            {model.trigger_phrase && (
                                <Text size="sm">
                                    <Text span fw={600} c="var(--theme-gray-1)">Trigger Phrase:</Text>{' '}
                                    <Text span c="var(--theme-accent)" fw={500}>{model.trigger_phrase}</Text>
                                </Text>
                            )}
                            {onAddTriggerToPrompt && triggerKeywords.length > 0 && (
                                <Stack gap={6}>
                                    <Text size="xs" fw={600} c="var(--theme-gray-1)">Trigger Keywords (click to add)</Text>
                                    <Group gap={6}>
                                        {triggerKeywords.map((keyword) => (
                                            <SwarmBadge
                                                key={keyword}
                                                tone="success"
                                                emphasis="soft"
                                                size="sm"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => {
                                                    onAddTriggerToPrompt(keyword);
                                                    notifications.show({
                                                        title: 'Trigger Added',
                                                        message: `Added "${keyword}" to prompt`,
                                                        color: 'green',
                                                    });
                                                }}
                                            >
                                                {keyword}
                                            </SwarmBadge>
                                        ))}
                                    </Group>
                                </Stack>
                            )}
                            <SwarmButton
                                size="xs"
                                tone="secondary"
                                emphasis="ghost"
                                rightSection={showAdvanced ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                                onClick={() => setShowAdvanced((v) => !v)}
                            >
                                {showAdvanced ? 'Hide Advanced Details' : 'Show Advanced Details'}
                            </SwarmButton>
                            <Collapse in={showAdvanced}>
                                <Stack gap={6}>
                                    {model.author && <Text size="sm"><strong>Author:</strong> {model.author}</Text>}
                                    {model.usage_hint && <Text size="sm"><strong>Usage Hint:</strong> {model.usage_hint}</Text>}
                                    {model.license && <Text size="sm"><strong>License:</strong> {model.license}</Text>}
                                    {model.date && <Text size="sm"><strong>Date:</strong> {model.date}</Text>}
                                </Stack>
                            </Collapse>
                            <Group justify="flex-end" mt="sm">
                                <SwarmButton tone="secondary" emphasis="outline" onClick={() => setEditing(true)}>
                                    Edit Metadata
                                </SwarmButton>
                            </Group>
                        </Stack>
                    )}
                </Stack>
            ) : null}
        </Modal>
    );
}
