import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ClientLogCategory =
    | 'generation'
    | 'api'
    | 'ws'
    | 'canvas'
    | 'model'
    | 'store'
    | 'ui'
    | 'system'
    | 'perf';

export interface ClientLogEntry {
    id: string;
    timestamp: number;
    sessionId: string;
    level: ClientLogLevel;
    category: ClientLogCategory;
    message: string;
    metadata?: Record<string, unknown>;
    correlationId?: string;
}

interface ClientLogState {
    entries: ClientLogEntry[];
    sessionId: string;
    paused: boolean;
    _ready: boolean;
    append: (entry: Omit<ClientLogEntry, 'id' | 'timestamp' | 'sessionId'>) => void;
    appendMany: (entries: Omit<ClientLogEntry, 'id' | 'timestamp' | 'sessionId'>[]) => void;
    setPaused: (paused: boolean) => void;
    exportAll: () => Promise<ClientLogEntry[]>;
    clear: () => Promise<void>;
    getStats: () => { total: number; byLevel: Record<string, number>; byCategory: Record<string, number>; oldestTimestamp: number | null };
}

const DB_NAME = 'swarmui-client-logs';
const STORE_NAME = 'client-logs';
const DB_VERSION = 1;
const IN_MEMORY_MAX = 5000;
const BATCH_FLUSH_INTERVAL = 2000;
const BATCH_FLUSH_SIZE = 100;
const RETENTION_DAYS = 30;

function generateLogId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateSessionId(): string {
    if (typeof window === 'undefined') {
        return `ssr_${generateLogId()}`;
    }
    const existing = window.sessionStorage.getItem('swarmui_client_log_session_id');
    if (existing) {
        return existing;
    }
    const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem('swarmui_client_log_session_id', newId);
    return newId;
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not available.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('sessionId', 'sessionId', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

function loadRecentEntries(): Promise<ClientLogEntry[]> {
    return openDatabase().then((db) => new Promise<ClientLogEntry[]>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        transaction.onerror = () => reject(transaction.error ?? new Error('Failed to read logs.'));

        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const entries: ClientLogEntry[] = [];
        const cursorRequest = index.openCursor(null, 'prev');

        cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Cursor failed.'));
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor && entries.length < IN_MEMORY_MAX) {
                entries.push(cursor.value);
                cursor.continue();
            } else {
                resolve(entries.reverse());
            }
        };
    })).catch(() => []);
}

function pruneOldEntries(): Promise<void> {
    const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return openDatabase().then((db) => new Promise<void>((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const range = IDBKeyRange.upperBound(cutoff);
        const cursorRequest = index.openCursor(range);

        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                resolve();
            }
        };
        cursorRequest.onerror = () => resolve();
    })).catch(() => { });
}

let pendingBatch: ClientLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch(): void {
    if (pendingBatch.length === 0) {
        return;
    }

    const batch = pendingBatch;
    pendingBatch = [];

    openDatabase().then((db) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        for (const entry of batch) {
            store.put(entry);
        }
    }).catch(() => { });
}

function scheduleFlush(): void {
    if (flushTimer) {
        return;
    }
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushBatch();
    }, BATCH_FLUSH_INTERVAL);
}

function writeEntry(entry: ClientLogEntry): void {
    pendingBatch.push(entry);
    if (pendingBatch.length >= BATCH_FLUSH_SIZE) {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        flushBatch();
    } else {
        scheduleFlush();
    }
}

export const useClientLogStore = create<ClientLogState>()(
    devtools(
        (set, get) => ({
            entries: [],
            sessionId: getOrCreateSessionId(),
            paused: false,
            _ready: false,

            append: (input) => {
                const state = get();
                if (state.paused) {
                    return;
                }

                const entry: ClientLogEntry = {
                    id: generateLogId(),
                    timestamp: Date.now(),
                    sessionId: state.sessionId,
                    level: input.level,
                    category: input.category,
                    message: input.message,
                    metadata: input.metadata,
                    correlationId: input.correlationId,
                };

                const entries = [...state.entries, entry];
                const trimmed = entries.length > IN_MEMORY_MAX ? entries.slice(-IN_MEMORY_MAX) : entries;

                set({ entries: trimmed });
                writeEntry(entry);
            },

            appendMany: (inputs) => {
                const state = get();
                if (state.paused || inputs.length === 0) {
                    return;
                }

                const newEntries: ClientLogEntry[] = inputs.map((input) => ({
                    id: generateLogId(),
                    timestamp: Date.now(),
                    sessionId: state.sessionId,
                    level: input.level,
                    category: input.category,
                    message: input.message,
                    metadata: input.metadata,
                    correlationId: input.correlationId,
                }));

                const entries = [...state.entries, ...newEntries];
                const trimmed = entries.length > IN_MEMORY_MAX ? entries.slice(-IN_MEMORY_MAX) : entries;

                set({ entries: trimmed });
                for (const entry of newEntries) {
                    writeEntry(entry);
                }
            },

            setPaused: (paused) => {
                set({ paused });
            },

            exportAll: () => {
                return openDatabase().then((db) => new Promise<ClientLogEntry[]>((resolve, reject) => {
                    const transaction = db.transaction(STORE_NAME, 'readonly');
                    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to export logs.'));
                    const store = transaction.objectStore(STORE_NAME);
                    const index = store.index('timestamp');
                    const entries: ClientLogEntry[] = [];
                    const cursorRequest = index.openCursor();

                    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Cursor failed.'));
                    cursorRequest.onsuccess = () => {
                        const cursor = cursorRequest.result;
                        if (cursor) {
                            entries.push(cursor.value);
                            cursor.continue();
                        } else {
                            resolve(entries);
                        }
                    };
                }));
            },

            clear: () => {
                if (flushTimer) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }
                pendingBatch = [];
                set({ entries: [] });

                return openDatabase().then((db) => new Promise<void>((resolve, reject) => {
                    const transaction = db.transaction(STORE_NAME, 'readwrite');
                    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to clear logs.'));
                    const store = transaction.objectStore(STORE_NAME);
                    const clearRequest = store.clear();
                    clearRequest.onerror = () => reject(clearRequest.error ?? new Error('Clear failed.'));
                    clearRequest.onsuccess = () => resolve();
                }));
            },

            getStats: () => {
                const state = get();
                const byLevel: Record<string, number> = {};
                const byCategory: Record<string, number> = {};
                let oldestTimestamp: number | null = null;

                for (const entry of state.entries) {
                    byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
                    byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
                    if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
                        oldestTimestamp = entry.timestamp;
                    }
                }

                return {
                    total: state.entries.length,
                    byLevel,
                    byCategory,
                    oldestTimestamp,
                };
            },
        }),
        { name: 'ClientLogStore' }
    )
);

let initialized = false;

export function initClientLogStore(): void {
    if (initialized) {
        return;
    }
    initialized = true;

    void pruneOldEntries();

    loadRecentEntries().then((entries) => {
        const currentEntries = useClientLogStore.getState().entries;
        const mergedEntries = Array.from(
            new Map([...entries, ...currentEntries].map((entry) => [entry.id, entry])).values()
        ).sort((left, right) => left.timestamp - right.timestamp);
        useClientLogStore.setState({
            entries: mergedEntries.length > IN_MEMORY_MAX ? mergedEntries.slice(-IN_MEMORY_MAX) : mergedEntries,
            _ready: true,
        });
        useClientLogStore.getState().append({
            level: 'info',
            category: 'system',
            message: 'Client logging initialized',
            metadata: { loadedEntries: entries.length },
        });
    });

    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            flushBatch();
        });

        setInterval(() => {
            void pruneOldEntries();
        }, 24 * 60 * 60 * 1000);
    }
}
