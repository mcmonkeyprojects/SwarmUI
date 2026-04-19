/**
 * Prompt Cache Store
 * 
 * Zustand store for caching prompts and detecting similar prompts
 * to enable "Quick Variation" mode that reuses computation.
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { createIndexedDbStorage } from '../lib/indexedDbStorage';

// ============================================================================
// Types
// ============================================================================

interface PromptCacheEntry {
    /** The full prompt text */
    prompt: string;
    /** Hash of the prompt for quick lookup */
    hash: string;
    /** Tokenized version for comparison */
    tokens: string[];
    /** Timestamp when cached */
    timestamp: number;
    /** Model used (embeddings are model-specific) */
    model: string;
    /** Negative prompt if any */
    negativePrompt?: string;
}

interface SimilarityResult {
    /** The original cached entry */
    original: PromptCacheEntry;
    /** Similarity score 0-1 */
    similarity: number;
    /** Tokens that changed */
    changedTokens: string[];
    /** Tokens added to current prompt */
    addedTokens: string[];
    /** Tokens removed from original prompt */
    removedTokens: string[];
    /** Human-readable summary */
    summary: string;
}

interface PromptCacheState {
    /** Cached prompt entries by hash */
    entries: Record<string, PromptCacheEntry>;
    /** Maximum cache size */
    maxEntries: number;
    /** Last used prompt hash (for quick variation) */
    lastPromptHash: string | null;
}

interface PromptCacheActions {
    /** Add a prompt to the cache */
    addEntry: (prompt: string, model: string, negativePrompt?: string) => PromptCacheEntry;
    /** Get entry by hash */
    getEntry: (hash: string) => PromptCacheEntry | null;
    /** Find similar prompts */
    findSimilar: (prompt: string, model: string, threshold?: number) => SimilarityResult | null;
    /** Check if prompt is in cache */
    hasPrompt: (prompt: string, model: string) => boolean;
    /** Set the last used prompt */
    setLastPrompt: (hash: string) => void;
    /** Get the last prompt entry */
    getLastPrompt: () => PromptCacheEntry | null;
    /** Clear the cache */
    clear: () => void;
    /** Remove old entries */
    pruneOld: (maxAge: number) => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Simple tokenization - splits on common delimiters
 */
function tokenize(prompt: string): string[] {
    return prompt
        .toLowerCase()
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
}

/**
 * Generate a hash for a prompt+model combination
 */
function generateHash(prompt: string, model: string): string {
    const str = `${prompt}:${model}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Calculate Jaccard similarity between two token sets
 */
function calculateSimilarity(tokens1: string[], tokens2: string[]): number {
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 1;
    return intersection.size / union.size;
}

/**
 * Find differences between two token arrays
 */
function findTokenDiff(original: string[], current: string[]): {
    added: string[];
    removed: string[];
    unchanged: string[];
} {
    const originalSet = new Set(original);
    const currentSet = new Set(current);

    const added = current.filter(t => !originalSet.has(t));
    const removed = original.filter(t => !currentSet.has(t));
    const unchanged = original.filter(t => currentSet.has(t));

    return { added, removed, unchanged };
}

// ============================================================================
// Store
// ============================================================================

export const usePromptCacheStore = create<PromptCacheState & PromptCacheActions>()(
    devtools(
        persist(
            (set, get) => ({
                // State
                entries: {},
                maxEntries: 100,
                lastPromptHash: null,

                // Actions
                addEntry: (prompt, model, negativePrompt) => {
                    const hash = generateHash(prompt, model);
                    const tokens = tokenize(prompt);

                    const entry: PromptCacheEntry = {
                        prompt,
                        hash,
                        tokens,
                        timestamp: Date.now(),
                        model,
                        negativePrompt,
                    };

                    set(state => {
                        const entries = { ...state.entries };

                        // LRU eviction if at capacity
                        const hashes = Object.keys(entries);
                        if (hashes.length >= state.maxEntries) {
                            // Remove oldest entry
                            let oldestHash = hashes[0];
                            let oldestTime = entries[oldestHash].timestamp;

                            for (const h of hashes) {
                                if (entries[h].timestamp < oldestTime) {
                                    oldestTime = entries[h].timestamp;
                                    oldestHash = h;
                                }
                            }
                            delete entries[oldestHash];
                        }

                        entries[hash] = entry;
                        return { entries, lastPromptHash: hash };
                    });

                    return entry;
                },

                getEntry: (hash) => {
                    return get().entries[hash] || null;
                },

                findSimilar: (prompt, model, threshold = 0.5) => {
                    const currentTokens = tokenize(prompt);
                    const entries = Object.values(get().entries);

                    // Filter by same model
                    const sameModelEntries = entries.filter(e => e.model === model);

                    if (sameModelEntries.length === 0) return null;

                    let bestMatch: SimilarityResult | null = null;
                    let bestScore = 0;

                    for (const entry of sameModelEntries) {
                        // Exact match - skip
                        if (entry.prompt === prompt) continue;

                        const similarity = calculateSimilarity(entry.tokens, currentTokens);

                        if (similarity >= threshold && similarity > bestScore) {
                            const diff = findTokenDiff(entry.tokens, currentTokens);

                            // Generate summary
                            let summary = '';
                            if (diff.added.length > 0 && diff.removed.length > 0) {
                                summary = `${diff.added.length} added, ${diff.removed.length} removed`;
                            } else if (diff.added.length > 0) {
                                summary = `+${diff.added.length} tokens`;
                            } else if (diff.removed.length > 0) {
                                summary = `-${diff.removed.length} tokens`;
                            }

                            bestMatch = {
                                original: entry,
                                similarity,
                                changedTokens: [...diff.added, ...diff.removed],
                                addedTokens: diff.added,
                                removedTokens: diff.removed,
                                summary,
                            };
                            bestScore = similarity;
                        }
                    }

                    return bestMatch;
                },

                hasPrompt: (prompt, model) => {
                    const hash = generateHash(prompt, model);
                    return !!get().entries[hash];
                },

                setLastPrompt: (hash) => {
                    set({ lastPromptHash: hash });
                },

                getLastPrompt: () => {
                    const { lastPromptHash, entries } = get();
                    if (!lastPromptHash) return null;
                    return entries[lastPromptHash] || null;
                },

                clear: () => {
                    set({ entries: {}, lastPromptHash: null });
                },

                pruneOld: (maxAge) => {
                    const cutoff = Date.now() - maxAge;
                    set(state => {
                        const entries: Record<string, PromptCacheEntry> = {};
                        for (const [hash, entry] of Object.entries(state.entries)) {
                            if (entry.timestamp >= cutoff) {
                                entries[hash] = entry;
                            }
                        }
                        return { entries };
                    });
                },
            }),
            {
                name: 'swarmui-prompt-cache',
                storage: createJSONStorage(() => createIndexedDbStorage('swarmui-prompt-cache')),
                partialize: (state) => ({
                    entries: state.entries,
                    lastPromptHash: state.lastPromptHash,
                }),
            }
        ),
        { name: 'PromptCacheStore' }
    )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectCacheSize = (state: PromptCacheState) =>
    Object.keys(state.entries).length;

export const selectLastPrompt = (state: PromptCacheState & PromptCacheActions) =>
    state.getLastPrompt();

export default usePromptCacheStore;
