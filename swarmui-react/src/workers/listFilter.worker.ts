/**
 * Web Worker for heavy list filtering and sorting operations.
 * Keeps the main thread responsive when filtering large datasets.
 */

import * as Comlink from 'comlink';

interface FilterOptions<T> {
    items: T[];
    query: string;
    fields: (keyof T)[];
    sortBy?: keyof T;
    sortOrder?: 'asc' | 'desc';
}

interface SortOptions<T> {
    items: T[];
    sortBy: keyof T;
    sortOrder?: 'asc' | 'desc';
}

/**
 * Fuzzy match score - returns how well the query matches the text
 */
function fuzzyScore(text: string, query: string): number {
    if (!query) return 1;

    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact match
    if (textLower === queryLower) return 1;

    // Contains match
    if (textLower.includes(queryLower)) {
        return 0.9 - (text.indexOf(queryLower) / text.length) * 0.1;
    }

    // Word match
    const words = textLower.split(/[\s_-]+/);
    for (const word of words) {
        if (word.startsWith(queryLower)) {
            return 0.7;
        }
    }

    // Character-by-character match
    let queryIndex = 0;
    let consecutiveMatches = 0;
    let maxConsecutive = 0;

    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
        if (textLower[i] === queryLower[queryIndex]) {
            queryIndex++;
            consecutiveMatches++;
            maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
        } else {
            consecutiveMatches = 0;
        }
    }

    if (queryIndex === queryLower.length) {
        return 0.3 + (maxConsecutive / queryLower.length) * 0.2;
    }

    return 0;
}

/**
 * Filter and sort items based on a search query
 */
function filterItems<T extends Record<string, unknown>>(options: FilterOptions<T>): T[] {
    const { items, query, fields, sortBy, sortOrder = 'asc' } = options;

    if (!query.trim()) {
        // No query, just sort if needed
        if (sortBy) {
            return sortItems({ items, sortBy, sortOrder });
        }
        return items;
    }

    // Filter and score items
    const scored = items.map(item => {
        let maxScore = 0;

        for (const field of fields) {
            const value = item[field];
            if (typeof value === 'string') {
                const score = fuzzyScore(value, query);
                maxScore = Math.max(maxScore, score);
            }
        }

        return { item, score: maxScore };
    });

    // Filter out non-matches and sort by score
    const filtered = scored
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item);

    return filtered;
}

/**
 * Sort items by a field
 */
function sortItems<T extends Record<string, unknown>>(options: SortOptions<T>): T[] {
    const { items, sortBy, sortOrder = 'asc' } = options;

    return [...items].sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];

        if (typeof aVal === 'string' && typeof bVal === 'string') {
            const comparison = aVal.localeCompare(bVal);
            return sortOrder === 'asc' ? comparison : -comparison;
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }

        return 0;
    });
}

/**
 * Get unique values from a field across all items
 */
function getUniqueValues<T extends Record<string, unknown>>(
    items: T[],
    field: keyof T
): string[] {
    const unique = new Set<string>();

    for (const item of items) {
        const value = item[field];
        if (typeof value === 'string') {
            unique.add(value);
        }
    }

    return Array.from(unique).sort();
}

/**
 * Group items by a field
 */
function groupByField<T extends Record<string, unknown>>(
    items: T[],
    field: keyof T
): Record<string, T[]> {
    const groups: Record<string, T[]> = {};

    for (const item of items) {
        const key = String(item[field] ?? 'undefined');
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(item);
    }

    return groups;
}

// Expose functions via Comlink
const workerApi = {
    filterItems,
    sortItems,
    getUniqueValues,
    groupByField,
};

Comlink.expose(workerApi);

export type ListFilterWorker = typeof workerApi;
