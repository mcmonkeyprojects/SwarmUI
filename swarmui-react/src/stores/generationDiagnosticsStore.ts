import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { createIndexedDbStorage } from '../lib/indexedDbStorage';

export type GenerationDiagnosticStatus = 'running' | 'complete' | 'error' | 'interrupted';
export type GenerationDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface GenerationDiagnosticEvent {
    id: string;
    at: number;
    type: string;
    level: GenerationDiagnosticLevel;
    message: string;
    details?: unknown;
}

export interface OmittedGenerationParameter {
    key: string;
    reason: string;
    value?: unknown;
}

export interface GenerationDiagnosticEntry {
    generationId: string;
    requestId: string | null;
    status: GenerationDiagnosticStatus;
    startedAt: number;
    endedAt: number | null;
    model: string | null;
    rawModel?: unknown;
    payloadKeys: string[];
    payloadSummary: Record<string, unknown>;
    rawValueSummary?: Record<string, unknown>;
    omittedParameters: OmittedGenerationParameter[];
    totalSteps: number | null;
    totalBatches: number | null;
    progressEvents: number;
    imagesReceived: number;
    lastProgress: number;
    hasPreview: boolean;
    latestPhase: string | null;
    latestStageId: string | null;
    latestStageLabel: string | null;
    error: string | null;
    errorId: string | null;
    errorData?: unknown;
    events: GenerationDiagnosticEvent[];
}

interface StartGenerationDiagnosticInput {
    generationId: string;
    model?: string | null;
    rawModel?: unknown;
    payloadKeys?: string[];
    payloadSummary?: Record<string, unknown>;
    rawValueSummary?: Record<string, unknown>;
    omittedParameters?: OmittedGenerationParameter[];
    totalSteps?: number | null;
    totalBatches?: number | null;
}

interface AppendGenerationDiagnosticEventInput {
    type: string;
    level?: GenerationDiagnosticLevel;
    message: string;
    details?: unknown;
    at?: number;
}

interface RecordGenerationProgressInput {
    requestId?: string;
    progress: number;
    previewImage?: string | null;
    eventSequence?: number;
    serverElapsedMs?: number;
    stepSource?: string | null;
    nodeIndex?: number | null;
    nodeCount?: number | null;
    currentNode?: string | null;
    currentPercentSource?: string | null;
    stageId?: string | null;
    stageLabel?: string | null;
    currentStep?: number | null;
    totalSteps?: number | null;
}

interface GenerationDiagnosticsState {
    entries: GenerationDiagnosticEntry[];
    startEntry: (input: StartGenerationDiagnosticInput) => void;
    ensureEntry: (input: StartGenerationDiagnosticInput) => void;
    appendEvent: (generationId: string, event: AppendGenerationDiagnosticEventInput) => void;
    setRequestId: (generationId: string, requestId?: string | null) => void;
    recordProgress: (generationId: string, input: RecordGenerationProgressInput) => void;
    recordImage: (generationId: string, input: { requestId?: string; image?: string }) => void;
    markComplete: (generationId: string, input?: { requestId?: string | null }) => void;
    markError: (generationId: string, input: { error: string; errorId?: string | null; errorData?: unknown; requestId?: string | null }) => void;
    markInterrupted: (generationId: string, reason?: string) => void;
    clear: () => void;
}

const MAX_ENTRIES = 30;
const MAX_EVENTS_PER_ENTRY = 80;
const MAX_STRING_LENGTH = 180;
const MAX_OBJECT_KEYS = 24;
const MAX_ARRAY_ITEMS = 8;

function shortId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeString(value: string): string {
    if (value.startsWith('data:')) {
        const mime = value.slice(5).split(';', 1)[0] || 'data';
        return `<${mime} data-url, ${value.length} chars>`;
    }
    const normalized = value.replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
    if (normalized.length <= MAX_STRING_LENGTH) {
        return normalized;
    }
    return `${normalized.slice(0, MAX_STRING_LENGTH)}... (${normalized.length} chars)`;
}

export function summarizeDiagnosticValue(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) {
        return value ?? null;
    }
    if (typeof value === 'string') {
        return summarizeString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeDiagnosticValue(item, depth + 1));
        if (value.length > MAX_ARRAY_ITEMS) {
            items.push(`... (${value.length - MAX_ARRAY_ITEMS} more)`);
        }
        return items;
    }
    if (typeof value === 'object') {
        if (depth >= 3) {
            return '[nested object]';
        }
        const objectValue = value as Record<string, unknown>;
        const entries = Object.entries(objectValue).slice(0, MAX_OBJECT_KEYS);
        const summarized = Object.fromEntries(
            entries.map(([key, innerValue]) => [key, summarizeDiagnosticValue(innerValue, depth + 1)])
        );
        if (Object.keys(objectValue).length > MAX_OBJECT_KEYS) {
            summarized.__truncated__ = `${Object.keys(objectValue).length - MAX_OBJECT_KEYS} more key(s)`;
        }
        return summarized;
    }
    return String(value);
}

function sanitizeRecord(record?: Record<string, unknown>): Record<string, unknown> {
    if (!record) {
        return {};
    }
    return summarizeDiagnosticValue(record) as Record<string, unknown>;
}

function sanitizeOmittedParameters(input?: OmittedGenerationParameter[]): OmittedGenerationParameter[] {
    if (!input || input.length === 0) {
        return [];
    }
    return input.map((item) => ({
        key: item.key,
        reason: item.reason,
        value: summarizeDiagnosticValue(item.value),
    }));
}

function withEvent(entry: GenerationDiagnosticEntry, event: AppendGenerationDiagnosticEventInput): GenerationDiagnosticEntry {
    const nextEvent: GenerationDiagnosticEvent = {
        id: shortId('diag'),
        at: event.at ?? Date.now(),
        type: event.type,
        level: event.level ?? 'info',
        message: event.message,
        details: event.details === undefined ? undefined : summarizeDiagnosticValue(event.details),
    };
    const events = [...entry.events, nextEvent];
    return {
        ...entry,
        events: events.slice(-MAX_EVENTS_PER_ENTRY),
    };
}

function makeEntry(input: StartGenerationDiagnosticInput): GenerationDiagnosticEntry {
    return {
        generationId: input.generationId,
        requestId: null,
        status: 'running',
        startedAt: Date.now(),
        endedAt: null,
        model: input.model ?? null,
        rawModel: summarizeDiagnosticValue(input.rawModel),
        payloadKeys: [...(input.payloadKeys ?? [])].sort(),
        payloadSummary: sanitizeRecord(input.payloadSummary),
        rawValueSummary: input.rawValueSummary ? sanitizeRecord(input.rawValueSummary) : undefined,
        omittedParameters: sanitizeOmittedParameters(input.omittedParameters),
        totalSteps: input.totalSteps ?? null,
        totalBatches: input.totalBatches ?? null,
        progressEvents: 0,
        imagesReceived: 0,
        lastProgress: 0,
        hasPreview: false,
        latestPhase: 'starting',
        latestStageId: null,
        latestStageLabel: null,
        error: null,
        errorId: null,
        errorData: undefined,
        events: [],
    };
}

function updateEntry(
    entries: GenerationDiagnosticEntry[],
    generationId: string,
    updater: (entry: GenerationDiagnosticEntry) => GenerationDiagnosticEntry,
): GenerationDiagnosticEntry[] {
    const index = entries.findIndex((entry) => entry.generationId === generationId);
    if (index === -1) {
        return entries;
    }
    const nextEntries = [...entries];
    nextEntries[index] = updater(nextEntries[index]);
    return nextEntries;
}

function upsertEntry(
    entries: GenerationDiagnosticEntry[],
    input: StartGenerationDiagnosticInput,
    mergeOnly = false,
): GenerationDiagnosticEntry[] {
    const index = entries.findIndex((entry) => entry.generationId === input.generationId);
    if (index !== -1) {
        const nextEntries = [...entries];
        nextEntries[index] = {
            ...nextEntries[index],
            model: input.model ?? nextEntries[index].model,
            rawModel: input.rawModel !== undefined ? summarizeDiagnosticValue(input.rawModel) : nextEntries[index].rawModel,
            payloadKeys: input.payloadKeys ? [...input.payloadKeys].sort() : nextEntries[index].payloadKeys,
            payloadSummary: input.payloadSummary ? sanitizeRecord(input.payloadSummary) : nextEntries[index].payloadSummary,
            rawValueSummary: input.rawValueSummary ? sanitizeRecord(input.rawValueSummary) : nextEntries[index].rawValueSummary,
            omittedParameters: input.omittedParameters ? sanitizeOmittedParameters(input.omittedParameters) : nextEntries[index].omittedParameters,
            totalSteps: input.totalSteps ?? nextEntries[index].totalSteps,
            totalBatches: input.totalBatches ?? nextEntries[index].totalBatches,
        };
        return nextEntries;
    }
    if (mergeOnly) {
        return entries;
    }
    const nextEntries = [makeEntry(input), ...entries];
    return nextEntries.slice(0, MAX_ENTRIES);
}

export const useGenerationDiagnosticsStore = create<GenerationDiagnosticsState>()(
    devtools(
        persist(
            (set) => ({
                entries: [],

                startEntry: (input) => {
                    set((state) => ({
                        entries: upsertEntry(state.entries, input),
                    }));
                },

                ensureEntry: (input) => {
                    set((state) => ({
                        entries: upsertEntry(state.entries, input, true),
                    }));
                },

                appendEvent: (generationId, event) => {
                    set((state) => ({
                        entries: updateEntry(state.entries, generationId, (entry) => withEvent(entry, event)),
                    }));
                },

                setRequestId: (generationId, requestId) => {
                    set((state) => ({
                        entries: updateEntry(state.entries, generationId, (entry) => {
                            if (!requestId || entry.requestId === requestId) {
                                return entry;
                            }
                            return withEvent(
                                {
                                    ...entry,
                                    requestId,
                                },
                                {
                                    type: 'request_id',
                                    message: `Backend assigned request ${requestId}`,
                                    level: 'info',
                                },
                            );
                        }),
                    }));
                },

                recordProgress: (generationId, input) => {
                    set((state) => ({
                        entries: updateEntry(state.entries, generationId, (entry) => {
                            let nextEntry: GenerationDiagnosticEntry = {
                                ...entry,
                                requestId: input.requestId ?? entry.requestId,
                                progressEvents: entry.progressEvents + 1,
                                lastProgress: Math.max(entry.lastProgress, Math.round(input.progress)),
                                hasPreview: entry.hasPreview || !!input.previewImage,
                                latestPhase: 'progress',
                                latestStageId: input.stageId ?? entry.latestStageId,
                                latestStageLabel: input.stageLabel ?? entry.latestStageLabel,
                                totalSteps: input.totalSteps ?? entry.totalSteps,
                            };

                            if (input.requestId && entry.requestId !== input.requestId) {
                                nextEntry = withEvent(nextEntry, {
                                    type: 'request_id',
                                    message: `Backend assigned request ${input.requestId}`,
                                    level: 'info',
                                });
                            }

                            if (!entry.hasPreview && input.previewImage) {
                                nextEntry = withEvent(nextEntry, {
                                    type: 'preview',
                                    message: 'Received first live preview frame',
                                    level: 'info',
                                });
                            }

                            if (input.stageLabel && input.stageLabel !== entry.latestStageLabel) {
                                nextEntry = withEvent(nextEntry, {
                                    type: 'stage',
                                    message: `Entered stage: ${input.stageLabel}`,
                                    level: 'info',
                                    details: {
                                        eventSequence: input.eventSequence,
                                        serverElapsedMs: input.serverElapsedMs,
                                        stepSource: input.stepSource,
                                        nodeIndex: input.nodeIndex,
                                        nodeCount: input.nodeCount,
                                        currentNode: input.currentNode,
                                        currentPercentSource: input.currentPercentSource,
                                        stageId: input.stageId,
                                        currentStep: input.currentStep,
                                        totalSteps: input.totalSteps,
                                        progress: input.progress,
                                    },
                                });
                            } else {
                                const previousBucket = Math.floor(entry.lastProgress / 10);
                                const nextBucket = Math.floor(Math.round(input.progress) / 10);
                                if (nextBucket > previousBucket) {
                                    nextEntry = withEvent(nextEntry, {
                                        type: 'progress',
                                        message: `Progress reached ${Math.round(input.progress)}%`,
                                        level: 'debug',
                                        details: {
                                            eventSequence: input.eventSequence,
                                            serverElapsedMs: input.serverElapsedMs,
                                            stepSource: input.stepSource,
                                            nodeIndex: input.nodeIndex,
                                            nodeCount: input.nodeCount,
                                            currentNode: input.currentNode,
                                            currentPercentSource: input.currentPercentSource,
                                            currentStep: input.currentStep,
                                            totalSteps: input.totalSteps,
                                            stageLabel: input.stageLabel,
                                        },
                                    });
                                }
                            }

                            return nextEntry;
                        }),
                    }));
                },

                recordImage: (generationId, input) => {
                    set((state) => ({
                        entries: updateEntry(state.entries, generationId, (entry) => {
                            let nextEntry: GenerationDiagnosticEntry = {
                                ...entry,
                                requestId: input.requestId ?? entry.requestId,
                                imagesReceived: entry.imagesReceived + 1,
                                latestPhase: 'image',
                            };
                            if (input.requestId && entry.requestId !== input.requestId) {
                                nextEntry = withEvent(nextEntry, {
                                    type: 'request_id',
                                    message: `Backend assigned request ${input.requestId}`,
                                    level: 'info',
                                });
                            }
                            return withEvent(nextEntry, {
                                type: 'image',
                                message: `Received image ${nextEntry.imagesReceived}`,
                                level: 'info',
                                details: input.image ? { image: input.image } : undefined,
                            });
                        }),
                    }));
                },

                markComplete: (generationId, input) => {
                    set((state) => ({
                        entries: updateEntry(state.entries, generationId, (entry) => withEvent({
                            ...entry,
                            requestId: input?.requestId ?? entry.requestId,
                            status: 'complete',
                            endedAt: Date.now(),
                            latestPhase: 'complete',
                            lastProgress: 100,
                            error: null,
                            errorId: null,
                            errorData: null,
                        }, {
                            type: 'complete',
                            message: 'Generation completed successfully',
                            level: 'info',
                        })),
                    }));
                },

                markError: (generationId, input) => {
                    set((state) => ({
                        entries: updateEntry(state.entries, generationId, (entry) => withEvent({
                            ...entry,
                            requestId: input.requestId ?? entry.requestId,
                            status: 'error',
                            endedAt: entry.endedAt ?? Date.now(),
                            latestPhase: 'error',
                            error: input.error,
                            errorId: input.errorId ?? null,
                            errorData: summarizeDiagnosticValue(input.errorData),
                        }, {
                            type: 'error',
                            message: input.error,
                            level: 'error',
                            details: {
                                errorId: input.errorId ?? null,
                                errorData: input.errorData,
                            },
                        })),
                    }));
                },

                markInterrupted: (generationId, reason) => {
                    set((state) => ({
                        entries: updateEntry(state.entries, generationId, (entry) => {
                            if (entry.status !== 'running') {
                                return entry;
                            }
                            return withEvent({
                                ...entry,
                                status: 'interrupted',
                                endedAt: entry.endedAt ?? Date.now(),
                                latestPhase: 'idle',
                            }, {
                                type: 'interrupt',
                                message: reason || 'Generation interrupted',
                                level: 'warn',
                            });
                        }),
                    }));
                },

                clear: () => {
                    set({ entries: [] });
                },
            }),
            {
                name: 'swarmui-generation-diagnostics-v1',
                storage: createJSONStorage(() => createIndexedDbStorage('swarmui-generation-diagnostics')),
                partialize: (state) => ({
                    entries: state.entries.slice(0, MAX_ENTRIES),
                }),
            },
        ),
        { name: 'GenerationDiagnosticsStore' },
    ),
);
